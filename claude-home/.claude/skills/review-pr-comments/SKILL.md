---
description: "Triage unresolved GitHub PR review comments: analyze, group, decide, then fix or defer"
model: opus
---

# Review PR Comments

You are triaging all unresolved review comments on the current PR. Your job is to analyze each comment, decide whether it makes sense, present a grouped summary for user approval, and then either implement fixes (via beads) or defer work (via Linear issues).

## Input

No arguments required. The PR number is inferred from the current branch via `gh pr view`.

If `gh pr view` fails (e.g., no PR exists for the current branch), ask the user for the PR number.

## Workflow

### 1. Fetch Unresolved Comments

**IMPORTANT — Shell escaping:** GraphQL queries contain `$` signs that the shell will try to interpolate. You MUST use the temp-file approach below. Do NOT try to inline the query in a single `gh api graphql -f query='...'` command — it will fail.

**Step 1: Get PR metadata**

```bash
PR_NUMBER=$(gh pr view --json number -q '.number')
OWNER=$(gh repo view --json owner -q '.owner.login')
REPO=$(gh repo view --json name -q '.name')
echo "Owner: $OWNER, Repo: $REPO, PR: $PR_NUMBER"
```

**Step 2: Write the GraphQL query to a temp file and execute it**

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

Display a quick status line:
```
PR #<number> — <title>
Found <N> unresolved review threads
```

### 2. Analyze and Group Comments

For each unresolved thread:

1. **Read the comment** carefully — understand what the reviewer is asking for
2. **Read the referenced file and line** — use the `path` and `line` fields to read the actual current code
3. **Assess validity** — Does the comment still apply to the current code? Is the suggestion correct? Is it worth doing?

Group comments that are about the same underlying issue (e.g., two reviewers pointing out the same `any` type problem in different places).

### 3. Present Triage Summary

Present a single, organized summary with three sections. Use this exact format:

```
## PR Comment Triage — PR #<number>

### Need Your Input (<N>)
Comments where I'm not sure whether to accept or reject.

<For each>
**<n>. <Short title>** — `<file:line>`
> <1-2 sentence summary of reviewer's point>
My take: <why you're unsure — what's the tradeoff?>
</For each>

### Recommend Fixing (<N>)
Comments I agree with — these are valid improvements.

<For each>
**<n>. <Short title>** — `<file:line>`
> <1-2 sentence summary of reviewer's point>
Why: <1 sentence on why this is worth fixing>
</For each>

### Recommend Dropping (<N>)
Comments I think we should skip.

<For each>
**<n>. <Short title>** — `<file:line>`
> <1-2 sentence summary of reviewer's point>
Why drop: <1 sentence on why — e.g., already fixed, not applicable, too low impact, wrong>
</For each>
```

**Grouping:** If multiple comments point to the same issue, list them together as one item and note all affected files/lines.

### 4. Get User Decision

Use `AskUserQuestion` to confirm decisions on:
1. The "Need Your Input" items — ask the user what to do with each
2. Whether they agree with your "Recommend Fixing" and "Recommend Dropping" lists

After this step, you should have a clear list of:
- **Fix Now** — items to implement immediately (create beads)
- **Defer** — items to create Linear issues for
- **Drop** — items to skip (will be resolved without changes)

### 5. Execute Decisions

**CRITICAL: ALWAYS reply to a thread before resolving it.** Never silently resolve a comment. Every reviewer — human or bot — should be able to see what was decided and why by reading the thread.

#### Replying to review threads

To reply to a review thread, you need the **comment ID** of the comment you're replying to (from the `comments.nodes` in the GraphQL response — use the numeric ID from the comment URL, e.g., `https://github.com/.../pull/123#discussion_r1234567` → the reply-to ID is the REST comment ID).

The simplest approach: use the `gh` REST API to reply to the first comment in the thread.

```bash
# Get the numeric comment ID from the thread's first comment URL
# e.g., URL ends in #discussion_r1928547890 → comment ID is 1928547890
# Or fetch it via: gh api repos/<owner>/<repo>/pulls/<pr>/comments --jq '.[].id'

gh api repos/<owner>/<repo>/pulls/<pr>/comments \
  --method POST \
  -f body="<reply message>" \
  -F in_reply_to=<comment_id>
```

If the REST reply approach fails, fall back to posting a top-level PR comment referencing the file and line.

#### Resolving threads

Write the mutation file once using a heredoc (same pattern as the query file — do NOT use the Write tool):

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

#### For "Fix Now" items:

For each fix:
1. Implement the change directly (these are typically small, surgical fixes)
2. **Reply** to the thread explaining what was done:
   - `"Fixed in <commit_sha> — <brief description of the change>."`
   - Keep it short but specific so reviewers can verify without digging through diffs
3. **Resolve** the thread

If a fix is large enough to warrant a bead, use `/plan-to-beads` workflow. But most PR review comments are small fixes — prefer direct implementation.

#### For "Defer" items:

For each deferred item:
1. Create a Linear issue using `mcp__linear__save_issue` with:
   - Clear title referencing the PR comment topic
   - Description with the reviewer's comment, file path, and your analysis
   - Appropriate priority (usually 3=Normal or 4=Low)
2. **Reply** to the thread with the Linear issue reference:
   - `"Valid point — tracked in <ISSUE-ID> for follow-up. Deferring from this PR to keep scope focused."`
3. **Resolve** the thread

#### For "Drop" items:

For each dropped item:
1. **Reply** to the thread explaining why it's being skipped:
   - Already handled: `"This is already addressed — <brief explanation of why it's not an issue>."`
   - Not applicable: `"After review, this doesn't apply here because <reason>."`
   - Low impact / disagree: `"Considered this but decided against it — <brief rationale>."`
2. **Resolve** the thread

**Never resolve without replying first.** The reply is the record of what was decided.

### 6. Final Summary

After all actions are complete, show:

```
## Done

### Fixed (<N>)
- <title> — `<file:line>` [resolved]

### Deferred (<N>)
- <title> — <LINEAR_ISSUE_ID> [resolved]

### Dropped (<N>)
- <title> — <reason> [resolved]

All <N> review threads resolved.
```

## Rules

- **ALWAYS read the actual code** before judging a comment — don't assess validity from the comment alone
- **Group duplicates** — multiple bots/reviewers often flag the same thing
- **Don't gold-plate** — implement the minimum fix that addresses the reviewer's concern. Don't refactor surrounding code.
- **Ask when unsure** — it's better to ask the user than to make the wrong call on a fix-vs-drop decision
- **NEVER resolve without replying** — every thread gets a reply explaining what was decided (fixed, deferred with issue link, or dropped with reason) BEFORE it is resolved. Silent resolves are forbidden.
- **Resolve threads after action** — every thread should be resolved by the end, regardless of whether you fixed, deferred, or dropped it
- **Never resolve without user approval** — present the full triage first, get sign-off, then execute
