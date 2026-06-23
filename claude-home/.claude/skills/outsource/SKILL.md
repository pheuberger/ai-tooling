---
description: "Spawn an attachable Claude Code agent in its own tmux session + git worktree to take a task all the way to a PR (work → /simplify → atomic commits → gh pr create), then shepherd it: poll for done/blocked/stalled, intervene when stuck, report the PR. Use when the user wants to hand a self-contained task to a background tmux agent and have this session babysit it to a finished PR — phrasings like 'spin up an agent to do X and watch it', 'shepherd an agent through this', 'run this in a tmux session and shepherd it to a PR'."
---

# outsource

Hand one self-contained task to a fresh **Claude Code agent running in its own tmux
session and git worktree**, and shepherd it from task → PR. The agent does the whole
pipeline itself — implement → `/simplify` → atomic commits → push → `gh pr create`.
This session is the **shepherd**: it launches the agent, polls for completion, detects
stalls/blocks, intervenes when stuck, and reports the finished PR.

The agent's session is **attachable** (`tmux attach`) so the user can watch or steer it
live. The worktree is isolated, so the current worktree/branch is never touched — safe to
run mid-work in any session.

`tmux`, `claude`, `git`, and `gh` are on PATH. Run from the **target repo root**.

## Input

The user supplies the **task** to perform. They may also give:
- **Base branch** (default `main`).
- **Branch name** (e.g. from Linear/Jira). If absent, derive `user/short-slug`.
- **Ticket id** to reference for auto-close (`Closes ABC-123` in the PR body).

## Before launching — resolve ambiguity, don't guess

Settle these in ≤1 short exchange, then go:

1. **Base branch.** Default `main`; branch off an unmerged branch only if the task depends
   on code that lives there. State your choice; ask only if genuinely unclear.
2. **Branch name.** Use the user's verbatim if given, else derive `user/slug`.
3. **Scope.** The task must be concrete enough for the agent to run end-to-end without
   checking back — it has no human in its loop. If it's underspecified, ask the one
   blocking question now. A vague task = a stalled agent.

Do **not** launch until base + branch + scope are settled.

## 1. Create the worktree

Branch off the chosen base in a sibling worktree (keeps the same repo, leaves the current
tree untouched):

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_NAME="$(basename "$REPO_ROOT")"
BASE="main"                          # ← the resolved base
BRANCH="user/short-slug"             # ← the resolved branch
SLUG="$(printf '%s' "$BRANCH" | tr '/_' '--' | tr -cd 'a-zA-Z0-9-')"
WT="$REPO_ROOT/../${REPO_NAME}-outsource-${SLUG}"
SESSION="outsource-${SLUG}"

git fetch origin "$BASE" --quiet || true
git worktree add -b "$BRANCH" "$WT" "origin/$BASE"
```

If `git worktree add` fails (branch exists, path taken), stop and report — don't force it.

Keep the shepherd's bookkeeping out of the commits — exclude it locally (not committed):

```bash
mkdir -p "$WT/.outsource"
printf '.outsource/\n' >> "$(git -C "$WT" rev-parse --git-path info/exclude)"
```

## 2. Write the task brief

The agent reads this file as its entire prompt, so it must be self-contained — the agent
shares **none** of this session's context. Write it to `.outsource/task.md` in the worktree:

```bash
cat > "$WT/.outsource/task.md" <<'BRIEF'
You are an autonomous coding agent in your OWN isolated git worktree. There is no human
in your loop — run the task end-to-end and do not ask questions. Your cwd is the worktree
root; you are already on the correct branch.

## Task
<the full, concrete task — paste the user's task verbatim, expanded if needed>

## Pipeline — do all of these, in order
1. Implement the task. Read the relevant files first; match the surrounding code style.
2. Verify: run the project's fast check (typecheck/lint/relevant tests). Use the cheapest
   check that proves the change is sound. Fix what you broke.
3. Run `/simplify` on your changes and apply its cleanups.
4. Commit as atomic, logically-grouped, conventional commits. Do NOT stage `.outsource/`.
5. Push the branch and open a PR: `gh pr create --base <BASE>` with a human-readable title
   and a body explaining WHY + HOW TO VERIFY.<closes-line>

## When you finish — write your status (this is how the shepherd knows you're done)
- Success: write the PR URL, then DONE, atomically:
    printf 'DONE\n%s\n' "<pr-url>" > .outsource/status.tmp && mv .outsource/status.tmp .outsource/status
- Blocked / need a human decision you cannot make safely: write why and stop:
    printf 'BLOCKED\n%s\n' "<one-line reason>" > .outsource/status.tmp && mv .outsource/status.tmp .outsource/status

## Rules
- NEVER run `git pull`. On divergence, write BLOCKED and stop.
- Stay inside this worktree. Never touch other worktrees or branches.
- If verification can't pass, write BLOCKED with the failing output — do not force a green PR.
BRIEF
```

Substitute `<BASE>`, the task, and `<closes-line>` (`\n   Include \`Closes <TICKET>\` in the body.` if a ticket was given, else empty) before writing.

## 3. Launch the tmux agent

Resolve the real tmux **binary**, not the zsh alias (the Bash tool sources the user's zsh
profile, which may alias `tmux` to a plugin fn that's undefined non-interactively):

```bash
TMUX_BIN=""
for p in /usr/bin/tmux /usr/local/bin/tmux /opt/homebrew/bin/tmux /bin/tmux; do
  [ -x "$p" ] && { TMUX_BIN="$p"; break; }
done
[ -z "$TMUX_BIN" ] && TMUX_BIN="$(unalias tmux 2>/dev/null; type -P tmux 2>/dev/null)"
[ -z "$TMUX_BIN" ] && { echo "OUTSOURCE-ERROR: no tmux binary found"; exit 1; }

# Interactive + attachable, runs autonomously (skip-permissions; the worktree is isolated).
# Single-quote the command so $(cat) expands in tmux's shell at the worktree cwd, not here.
"$TMUX_BIN" new-session -d -s "$SESSION" -c "$WT" \
  'claude --dangerously-skip-permissions "$(cat .outsource/task.md)"'
"$TMUX_BIN" has-session -t "$SESSION" 2>/dev/null \
  && echo "LAUNCHED $SESSION" || echo "OUTSOURCE-ERROR: session failed to start"
```

Report to the user immediately: branch, worktree path, and `tmux attach -t <SESSION>` to
watch live (Ctrl-b d to detach). Say you'll shepherd it and report when the PR lands.

## 4. Shepherd — poll in the background

The agent sits idle in an interactive prompt after finishing its turn, so the session does
NOT die on completion — the **status file** is the source of truth. Background this poll so
the harness re-invokes you the moment it exits. Run with `run_in_background: true`. Don't
ScheduleWakeup/loop on top of it — this poll is the wait.

```bash
STATUS="$WT/.outsource/status"
elapsed=0; max=7200; interval=120          # 2h ceiling, poll every 2 min
stall=0; stall_max=5                       # ~10 min of an unchanged screen = stalled
prev_hash=""
while :; do
  if [ -f "$STATUS" ]; then
    head -n1 "$STATUS" | grep -q '^DONE$'    && { echo "OUTSOURCE-DONE"; break; }
    head -n1 "$STATUS" | grep -q '^BLOCKED$' && { echo "OUTSOURCE-BLOCKED"; break; }
  fi
  "$TMUX_BIN" has-session -t "$SESSION" 2>/dev/null || { echo "OUTSOURCE-CRASHED"; break; }
  cur_hash="$("$TMUX_BIN" capture-pane -p -t "$SESSION" 2>/dev/null | md5sum | cut -d' ' -f1)"
  if [ "$cur_hash" = "$prev_hash" ]; then stall=$((stall+1)); else stall=0; fi
  prev_hash="$cur_hash"
  [ "$stall" -ge "$stall_max" ] && { echo "OUTSOURCE-STALLED"; break; }
  [ "$elapsed" -ge "$max" ]     && { echo "OUTSOURCE-TIMEOUT"; break; }
  sleep "$interval"; elapsed=$((elapsed+interval))
done
```

## 5. On wake — handle the outcome

Read the marker the poll printed. **Never** treat empty/absent output as done.

- **`OUTSOURCE-DONE`** → read line 2 of `.outsource/status` for the PR URL. Confirm with
  `gh pr view <url>` (or `gh pr list --head <BRANCH>`). Report PR URL + base + diffstat
  (`git -C "$WT" diff --stat "origin/$BASE"...HEAD`). Then **Land & clean up**.
- **`OUTSOURCE-BLOCKED`** → read line 2 for the reason. Report it verbatim and ask the user
  how to proceed. The worktree + branch survive, so nothing is lost. Don't auto-resolve a
  decision the agent flagged as needing a human.
- **`OUTSOURCE-STALLED`** → the screen hasn't changed for ~10 min with no status. The agent
  is likely waiting on input or wedged. `tmux capture-pane -p -t <SESSION>` to see the last
  screen. If it's sitting on a question, you may answer it with
  `tmux send-keys -t <SESSION> '<answer>' Enter` **only if the answer is unambiguous from
  the original scope** — otherwise surface the screen to the user and ask. Then resume the
  poll (re-run step 4).
- **`OUTSOURCE-CRASHED`** → the tmux session died with no status: claude exited/errored
  before finishing. Inspect `git -C "$WT" status` and `git -C "$WT" log --oneline origin/$BASE..HEAD`
  for partial work. Report what happened and ask before retrying.
- **`OUTSOURCE-TIMEOUT`** → 2h elapsed, still running. Don't kill it. Report, show the last
  pane, and ask whether to keep waiting (re-run step 4), attach, or stop.
- **`OUTSOURCE-ERROR`** / empty output → launch never succeeded. Report; do not assume done.

## 6. Land & clean up

Only after a PR is confirmed and the user is done with the worktree:

```bash
git worktree remove "$WT"        # add --force only if the user confirms discarding leftovers
"$TMUX_BIN" kill-session -t "$SESSION" 2>/dev/null || true
```

Leave the branch (the PR needs it). Tell the user the PR auto-closes its ticket on merge if
a `Closes` line was set. Don't delete the worktree while the agent is still running or if
the user might want to inspect it.

## Rules

- **Never** run `git checkout`/`switch`/stash or any working-tree mutation in **this**
  (parent) session. All work happens inside the agent's worktree only.
- **Never** `git pull` — neither here nor in the brief. On divergence: notify and stop.
- One skill invocation = one agent = one task = one PR. For several unrelated tasks, invoke
  once per task (separate worktrees, sessions, PRs).
- The agent runs `--dangerously-skip-permissions` — acceptable because it's confined to an
  isolated worktree. Don't widen that beyond the worktree.
- The status file is the source of truth for completion; pane-scraping is only the
  stall/crash backstop. Don't declare done off pane text.
- Don't force a green PR. A failed verification surfaces as `BLOCKED`, not a merged-looking PR.
