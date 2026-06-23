---
name: unccw
description: "Tear down a git worktree and its tmux session — the inverse of the `ccw` shell function (and of outsource/ralph-fleet/isolated-pr). Remove the worktree, optionally delete the branch, kill the attached tmux session. Use when the user says 'unccw', 'undo ccw', 'remove this worktree', 'kill the tmux session', 'clean up after that agent', or 'undo the outsource'. Do NOT trigger on bare 'ccw' — that CREATES a worktree."
---

# unccw

Undo a worktree + tmux session created by `outsource`, `ralph-fleet`, `isolated-pr`,
or by hand. Removes the worktree, kills the tmux session, and (if asked) deletes the
branch. The inverse of those spawn skills.

This is **destructive and hard to reverse** — uncommitted work in the worktree and an
un-pushed branch are lost. Confirm targets before running, never `--force` without
explicit user OK.

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

If self-targeting:
- Warn the user explicitly: teardown ends this session; they continue from the main repo
  root (or a new session).
- Run the whole teardown from `$MAIN`, not the worktree.
- Order: worktree remove → branch delete → **tmux kill LAST** (killing the session's own
  pane is what ends it; do the recoverable git ops first so nothing is lost if it dies).

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

## Confirm before destroying

Before removing, **check what you're about to lose** and report it:

```bash
git -C "$WT" status --porcelain                    # uncommitted changes?
git -C "$WT" log --oneline @{upstream}.. 2>/dev/null  # un-pushed commits?
```

- Uncommitted changes or un-pushed commits present → surface them, ask before proceeding.
  Don't `--force` to paper over them.
- Clean and pushed (or PR already open) → safe to proceed.

Ask whether to **keep or delete the branch** unless the user already said.

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
# branch delete ONLY when the safety gate above passed AND the user wants it gone:
git branch -D "$BRANCH"
git worktree prune                          # tidy stale admin entries
"$TMUX_BIN" kill-session -t "$SESSION" 2>/dev/null || true   # LAST: may end this session
```

`worktree remove` leaves the branch intact by design — drop it separately only after the
merge gate passes. `kill-session` on a missing session is harmless (`|| true`). Report what
was removed: worktree path, session, and whether the branch was deleted, kept-because-asked,
or **kept-because-unmerged**.

## Notes

- Don't tear down a worktree whose agent is **still running** — check
  `tmux capture-pane -p -t "$SESSION"` if unsure; a live agent means work in flight.
- Multiple worktrees (ralph-fleet lanes) → confirm the set, loop the teardown per lane.
- This skill never touches the current session's own worktree unless that's explicitly the
  target the user named.
