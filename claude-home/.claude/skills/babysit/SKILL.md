---
description: "Autonomously shepherd a PR to production: fix review comments, fix CI failures, push changes, notify only when stuck"
model: opus
---

# Shepherd PR to Production

You are autonomously shepherding the current PR to a merge-ready state. You handle review comments, CI failures, and pushing without human intervention. You only notify humans via Slack when you genuinely cannot proceed — and even then, you do NOT block. Fire the notification and move on to the next item.

## Input

No arguments required. The PR number is inferred from the current branch via `gh pr view`.

If `gh pr view` fails (e.g., no PR exists for the current branch), notify via Slack (if configured) and exit.

## Workflow

### 1. Preflight

**Step 1: Get PR metadata**

```bash
PR_NUMBER=$(gh pr view --json number -q '.number')
OWNER=$(gh repo view --json owner -q '.owner.login')
REPO=$(gh repo view --json name -q '.name')
PR_TITLE=$(gh pr view --json title -q '.title')
PR_URL=$(gh pr view --json url -q '.url')
PR_HEAD=$(gh pr view --json headRefName -q '.headRefName')
PR_BASE=$(gh pr view --json baseRefName -q '.baseRefName')
echo "PR #$PR_NUMBER — $PR_TITLE"
echo "Owner: $OWNER, Repo: $REPO, Branch: $PR_HEAD → $PR_BASE"
```

**Step 2: Check Slack webhook**

```bash
echo "NOTIFY_SLACK_WEBHOOK=${NOTIFY_SLACK_WEBHOOK:-(not set)}"
```

If `NOTIFY_SLACK_WEBHOOK` is not set, log a warning but continue — notifications will simply be skipped.

**Step 3: Sync with remote**

```bash
git pull --rebase
```

If rebase conflicts occur, abort the rebase, notify via Slack, and exit.

### 2. Handle Review Comments

**IMPORTANT — Shell escaping:** GraphQL queries contain `$` signs that the shell will try to interpolate. You MUST use the temp-file approach below. Do NOT try to inline the query in a single `gh api graphql -f query='...'` command — it will fail.

**Step 1: Write the GraphQL query to a temp file and execute it**

Use a **single Bash command** with a single-quoted heredoc delimiter (`'GRAPHQL'`) to write the file, then execute the query. The single-quoted delimiter prevents `$` expansion in the heredoc body.

```bash
cat <<'GRAPHQL' > /tmp/pr_review_threads.graphql
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      title
      url
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 20) {
            nodes {
              body
              author { login }
              path
              line
              createdAt
              url
            }
          }
        }
      }
    }
  }
}
GRAPHQL

gh api graphql \
  -F owner="$OWNER" \
  -F repo="$REPO" \
  -F pr="$PR_NUMBER" \
  -F query=@/tmp/pr_review_threads.graphql
```

**Do NOT use the Write tool** for temp GraphQL files — it may be blocked by hooks. The heredoc approach keeps everything in a single Bash call and avoids shell interpolation issues.

Filter to only `isResolved: false` threads. Include `isOutdated` threads too (the code may have changed but the comment may still be valid).

If there are **zero** unresolved threads, skip to Phase 3 (CI Checks).

**Step 2: Analyze each thread**

For each unresolved thread:

1. **Read the comment** — understand what the reviewer is asking for
2. **Read the referenced file and line** — use the `path` and `line` fields to read the actual current code
3. **Assess validity** — does the comment still apply? Is the suggestion correct?

Group comments about the same underlying issue.

**Step 3: Autonomous triage**

Categorize each thread/group into exactly one bucket — **no human approval step**:

| Decision | When | Action |
|----------|------|--------|
| **Fix** | Valid comment, clear fix | Implement it directly |
| **Defer** | Valid but out of scope for this PR | Create Linear issue, reply with issue ID |
| **Drop** | Invalid, already addressed, or not applicable | Reply with reasoning |
| **Escalate** | Genuinely cannot decide (see criteria below) | Reply "Flagging for human review", notify via Slack, do NOT resolve, move on |

**Escalation criteria (strictly necessary):**
- Product direction/intent questions unanswerable from code alone
- Security/compliance decisions requiring human sign-off
- Contradictory reviewer feedback that cannot be resolved from context
- References to external context (meetings, designs) the agent has no access to

Everything else should be Fix, Defer, or Drop. Bias heavily toward autonomous action.

**Step 4: Execute decisions**

**CRITICAL: ALWAYS reply to a thread before resolving it.** Never silently resolve a comment.

#### Replying to review threads

Get the numeric comment ID from the thread's first comment URL (e.g., `...#discussion_r1234567` → ID is `1234567`), then:

```bash
gh api repos/<owner>/<repo>/pulls/<pr>/comments \
  --method POST \
  -f body="<reply message>" \
  -F in_reply_to=<comment_id>
```

#### Resolving threads

Write the mutation file once using a heredoc (same pattern — do NOT use the Write tool):

```bash
cat <<'GRAPHQL' > /tmp/resolve_thread.graphql
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { isResolved }
  }
}
GRAPHQL
```

Then for each thread:
```bash
gh api graphql -F query=@/tmp/resolve_thread.graphql -f threadId="<thread_id>"
```

#### For "Fix" items:
1. Implement the change directly (small, surgical fixes)
2. Reply: `"Fixed in <commit_sha> — <brief description>."`
3. Resolve the thread

#### For "Defer" items:
1. Create a Linear issue using `mcp__linear__save_issue`
2. Reply: `"Valid point — tracked in <ISSUE-ID> for follow-up. Deferring from this PR to keep scope focused."`
3. Resolve the thread

#### For "Drop" items:
1. Reply with reasoning (already handled, not applicable, etc.)
2. Resolve the thread

#### For "Escalate" items:
1. Reply: `"Flagging for human review — <reason>."`
2. **Do NOT resolve** — leave for human
3. Fire Slack notification (see below) and **continue to next item**

### 3. Commit and Push

After all review comment fixes are implemented:

1. Stage files explicitly — **never use `git add .` or `git add -A`**
2. Commit with conventional commit messages using heredoc format
3. **Never use `--no-verify`** — if a hook fails, fix the issue
4. Never commit planning artifacts (`PLAN*.md`, etc.) or secrets

Push with retry:
```bash
git push
```
If push fails, `git pull --rebase` and retry (up to 3 times). If still failing, notify via Slack and exit.

### 4. CI Checks

After pushing, wait for CI checks to complete:

```bash
# Poll until all checks reach a terminal state (timeout: 10 min)
# Check status via:
gh pr view $PR_NUMBER --json statusCheckRollup --jq \
  '[.statusCheckRollup[] | select(.status != "COMPLETED")] | length'
```

If all checks pass, skip to Phase 5.

If checks fail:

1. **Fetch failing check details:**
   ```bash
   gh pr view $PR_NUMBER --json statusCheckRollup --jq \
     '[.statusCheckRollup[] | select(.conclusion == "FAILURE") | {name: .name, detailsUrl: .detailsUrl}]'
   ```

2. **Fetch logs** for each failing check:
   ```bash
   # Get check run annotations
   gh api repos/$OWNER/$REPO/commits/$(git rev-parse HEAD)/check-runs \
     --jq '.check_runs[] | select(.conclusion == "failure") | {name, id}'

   gh api repos/$OWNER/$REPO/check-runs/<ID>/annotations \
     --jq '.[] | "\(.path):\(.start_line) — \(.annotation_level): \(.message)"'

   # Get workflow run logs
   gh run list --branch $PR_HEAD --status failure --limit 1 --json databaseId --jq '.[0].databaseId'
   gh run view <RUN_ID> --log-failed 2>/dev/null | tail -100
   ```

3. **Diagnose and fix** each failure:
   - **Lint/type errors** — read the file, fix the issue
   - **Test failures** — read the test and code under test, fix the bug or update the test
   - **Build failures** — read the error, fix the cause
   - **Infra/flaky failures** (timeout, network, OOM) — cannot fix, notify via Slack

4. After fixing: commit, push, wait for CI again
5. **Cap: 3 CI fix cycles.** After that, notify with remaining failures and stop.

### 5. Final Status

After all work is done:

1. Check PR state:
   ```bash
   gh pr view $PR_NUMBER --json reviewDecision,statusCheckRollup,mergeStateStatus
   ```

2. Output a structured summary:
   ```
   ## Shepherd Summary — PR #<number>

   ### Review Comments
   - Fixed: <N>
   - Deferred: <N> (with Linear issue IDs)
   - Dropped: <N>
   - Escalated: <N> (notified via Slack)

   ### CI Checks
   - Fixed: <N> failures across <M> cycles
   - Still failing: <N> (notified via Slack)

   ### Push Status
   - Pushed to origin/<branch>
   - Latest SHA: <sha>

   ### PR State
   - Review: <APPROVED/CHANGES_REQUESTED/PENDING>
   - Checks: <passing/failing>
   - Mergeable: <yes/no>
   ```

3. If PR is fully mergeable (approved + checks passing + no unresolved threads): notify via Slack: `"PR #N is ready to merge: <URL>"`
4. If blockers remain: fire a single Slack notification summarizing all blockers

### Slack Notifications

Use this pattern whenever sending a Slack notification:

```bash
if [[ -n "$NOTIFY_SLACK_WEBHOOK" ]]; then
  local slack_text="<message>"
  curl -s -X POST "$NOTIFY_SLACK_WEBHOOK" \
    -H 'Content-type: application/json' \
    -d "{\"text\": $(echo "$slack_text" | jq -Rs .)}" > /dev/null 2>&1 || true
fi
```

Notifications are **fire-and-forget** — never wait for a response.

## Rules

- **ALWAYS read the actual code** before judging a comment — don't assess validity from the comment alone
- **Group duplicates** — multiple bots/reviewers often flag the same thing
- **Don't gold-plate** — implement the minimum fix that addresses the concern. Don't refactor surrounding code.
- **NEVER resolve without replying** — every thread gets a reply explaining what was decided before it is resolved
- **Resolve threads after action** — every thread should be resolved by the end (except escalated ones)
- **Never block on human input** — if you can't decide, escalate via Slack and move on
- **Never force-push** — always use regular `git push`
- **Never use `--no-verify`** — fix hook failures instead of bypassing them
- **Cap CI fix cycles at 3** — don't loop forever on unfixable failures
