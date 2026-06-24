---
name: unccw
description: "Tear down a git worktree and its tmux session — the inverse of the `ccw` shell function (and of outsource/ralph-fleet/isolated-pr). Remove the worktree, optionally delete the branch, kill the attached tmux session. Use when the user says 'unccw', 'undo ccw', 'remove this worktree', 'kill the tmux session', 'clean up after that agent', or 'undo the outsource'. Do NOT trigger on bare 'ccw' — that CREATES a worktree."
---

# unccw

Undo a worktree + tmux session created by `outsource`, `ralph-fleet`, `isolated-pr`,
or by hand. Removes the worktree, kills the tmux session, and deletes the branch once it's
safely merged. The inverse of those spawn skills.

This is **destructive and hard to reverse**, but it runs **without questions** in the
normal case. You'll typically invoke it from inside the very worktree/branch that's meant
to disappear — self-targeting and teardown are *expected*, not something to confirm.
Resolve targets yourself and proceed. Stop to ask the user only when there's genuinely
unrecoverable work at stake (the gates below pinpoint exactly when); never `--force`
without explicit OK.

## Inputs

The user gives a worktree path, a tmux session name, a branch, or nothing (clean up the
*current* one). Resolve all four from whatever you're given:

```bash
# From a worktree path → branch + any matching session
git -C "$WT" rev-parse --abbrev-ref HEAD           # branch
git worktree list                                  # all worktrees + their branches
```

Never run cleanup from **inside** the worktree being removed — `git worktree remove`
refuses. cd to the main repo root first (the non-worktree checkout).

### Self-targeting check (do this FIRST)

The session running this skill may itself live inside the target worktree. Removing it
yanks the session's cwd out from under it — the session dies mid-command. Detect before
touching anything:

```bash
SELF="$(pwd)"
case "$SELF" in
  "$WT"|"$WT"/*) echo "WARNING: this session runs inside the target worktree" ;;
esac
```

Self-targeting is the **normal, expected** case here — don't stop to confirm it. Just
handle it safely:
- Run the whole teardown from `$MAIN`, not the worktree.
- Order: worktree remove → branch delete → **tmux kill LAST** (killing the session's own
  pane is what ends it; do the recoverable git ops first so nothing is lost if it dies).
- Note in the final report that this session ends and they continue from the main repo root.

## Resolve the tmux binary

The Bash tool sources the user's zsh profile, which may alias `tmux` to an undefined
plugin fn non-interactively. Resolve the real binary:

```bash
TMUX_BIN=""
for p in /usr/bin/tmux /usr/local/bin/tmux /opt/homebrew/bin/tmux /bin/tmux; do
  [ -x "$p" ] && { TMUX_BIN="$p"; break; }
done
[ -z "$TMUX_BIN" ] && TMUX_BIN="$(unalias tmux 2>/dev/null; type -P tmux 2>/dev/null)"
```

## Check what you'd lose (only stop if it's unrecoverable)

Before removing, check the worktree state:

```bash
git -C "$WT" status --porcelain                    # uncommitted / untracked changes?
git -C "$WT" log --oneline @{upstream}.. 2>/dev/null  # un-pushed commits?
```

- **Clean** (committed, or clean + pushed, or PR open) → proceed silently. No question.
- **Un-pushed commits, clean tree** → the branch-delete gate below keeps the branch when
  it's unmerged, so those commits survive on the branch. Proceed; no question.
- **Uncommitted or untracked changes** → the one unrecoverable case. `git worktree remove`
  refuses without `--force`. Surface exactly what's dirty and ask: force-remove (lose it)
  or abort. Never `--force` silently. This is the *only* state that warrants a question.

The keep-or-delete-branch decision is **not** a question — derive it from the merge gate
below.

## Branch-delete safety gate

**Never delete a branch unless its work is merged into the remote base.** Un-merged work
is unrecoverable once the branch and worktree are gone. Verify merge status first:

```bash
git -C "$MAIN" fetch origin                          # refresh remote refs
BASE="${BASE:-main}"                                  # the integration branch
# Is every commit on the branch already in origin/BASE?
if git merge-base --is-ancestor "$BRANCH" "origin/$BASE"; then
  MERGED=yes
else
  # Squash-merged PRs leave no ancestor link — fall back to PR state.
  gh pr view "$BRANCH" --json state,mergedAt 2>/dev/null   # state MERGED → merged
  MERGED=maybe
fi
```

- `is-ancestor` true, **or** `gh pr view` shows `MERGED` → safe, delete the branch.
- Neither → **keep the branch**, tell the user it's unmerged, do not delete (even with
  `git branch -D`). Removing the worktree is still fine; the branch survives so the work
  is recoverable.

## Tear down

From the main repo root, outside the worktree:

```bash
git worktree remove "$WT"                  # add --force ONLY with explicit user OK
# branch delete is automatic once the merge gate above passed — teardown is the point,
# no need to ask. If the gate kept the branch (unmerged), skip this and report it.
git branch -D "$BRANCH"
git worktree prune                          # tidy stale admin entries
"$TMUX_BIN" kill-session -t "$SESSION" 2>/dev/null || true   # LAST: may end this session
```

`worktree remove` leaves the branch intact by design — drop it separately only after the
merge gate passes. `kill-session` on a missing session is harmless (`|| true`). Report what
was removed: worktree path, session, and whether the branch was deleted or
**kept-because-unmerged**.

## Notes

- Don't tear down a worktree whose agent is **still running** — check
  `tmux capture-pane -p -t "$SESSION"` if unsure; a live agent means work in flight.
- Multiple worktrees (ralph-fleet lanes) → identify the set and loop the teardown per lane;
  each lane runs the same gates, no per-lane questions.
- This skill never touches the current session's own worktree unless that's explicitly the
  target the user named.
