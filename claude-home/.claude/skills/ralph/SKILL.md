---
description: "Run a SINGLE ralph loop in a new tmux window of the current session, then watch it to completion: background-poll on a long interval (no context burn), and on exit verify it actually finished — exit status, leftover ready tickets, run summary. Use when the user wants to kick off one ralph run in the background and have this session keep an eye on it, e.g. 'run ralph and watch it', 'start ralph in a tmux window and check on it'. For PARALLEL multi-lane runs use ralph-fleet instead."
---

# ralph

Launch **one** `ralph` run in a **new window of the current tmux session**, background a
poll that the harness wakes you from when the run exits, then verify it finished cleanly.
This is the single-lane counterpart to `ralph-fleet` — no worktrees, no partitioning, no
merge. Just: start ralph in a window, watch, confirm.

`ralph` is on PATH. Run from the **target repo root**. Must be invoked from inside tmux
(the Bash tool already is).

## 1. Resolve what ralph runs

Pass the user's intent straight through to `ralph`'s own flags — don't reinvent them:
- bare → `ralph` works the full `vima ready` queue.
- a tag/type/priority/owner filter → `--tag X` / `--type bug` / `--priority N` / `--owner NAME`.
- specific tickets → `--tickets id1,id2` (add `--respect-deps` if order matters).
- a plan file → `--from-plan FILE`.

If the user gave no hint and `vima ready --count` is 0, say so — nothing to run.

## 2. Launch in a new window

`--clear-logs` is REQUIRED: unattended, ralph's interactive log-clear prompt (reads
`</dev/tty`) would block the window forever. Run ralph AS the window command so the pane
dies when ralph exits — that pane-death is how the poll detects completion. `remain-on-exit`
keeps the dead pane (and its exit status) readable afterward.

Capture the window-id `@N` — the only stable handle (the session has other windows):
```
RALPH_ARGS="--clear-logs <user flags here>"     # e.g. --clear-logs --tag kaizen
WIN_ID=$(tmux new-window -d -P -F '#{window_id}' -n ralph "ralph ${RALPH_ARGS}")
tmux set-option -w -t "$WIN_ID" remain-on-exit on
echo "RALPH-WINDOW-ID=$WIN_ID"
```
Don't switch the user to it. Tell them: `tmux select-window -t <WIN_ID>` to watch live,
Ctrl-b p to come back.

## 3. Background-poll until it exits

Background this so the harness re-invokes you the moment ralph finishes. **Inline the captured
`@N`** for `<WIN_ID>` — env vars don't survive between Bash calls. Long interval (10 min) so it
costs no context to wait:
```
WIN_ID='<WIN_ID>'   # the @N captured above
# Resolve the real tmux BINARY, not the shell alias. The Bash tool sources the user's zsh
# profile, which may define `alias tmux=_zsh_tmux_plugin_run` — that plugin fn is undefined
# non-interactively, so a bare `tmux` errors and the poll exits instantly with a false DONE.
TMUX_BIN=""
for p in /usr/bin/tmux /usr/local/bin/tmux /opt/homebrew/bin/tmux /bin/tmux; do
  [ -x "$p" ] && { TMUX_BIN="$p"; break; }
done
[ -z "$TMUX_BIN" ] && TMUX_BIN="$(unalias tmux 2>/dev/null; type -P tmux 2>/dev/null)"
[ -z "$TMUX_BIN" ] && { echo "RALPH-ERROR: no tmux binary found"; exit 1; }
[ -z "$WIN_ID" ] && { echo "RALPH-ERROR: no window-id captured — ralph never launched"; exit 1; }
# No window at entry = never launched, NOT done. Real completion = pane_dead inside the loop.
"$TMUX_BIN" list-panes -t "$WIN_ID" >/dev/null 2>&1 || { echo "RALPH-ERROR: window $WIN_ID not found — ralph never launched"; exit 1; }
elapsed=0; max=21600   # 6h ceiling — backstop against a hung run
while "$TMUX_BIN" list-panes -t "$WIN_ID" >/dev/null 2>&1; do
  # remain-on-exit keeps the window alive after ralph exits; the pane goes dead.
  dead=$("$TMUX_BIN" list-panes -t "$WIN_ID" -F '#{pane_dead}' 2>/dev/null | head -1)
  [ "$dead" = "1" ] && { echo "RALPH-DONE"; break; }
  [ "$elapsed" -ge "$max" ] && { echo "RALPH-TIMEOUT: still running after ${max}s"; break; }
  sleep 600; elapsed=$((elapsed+600))
done
```
Run with `run_in_background: true`. Don't ScheduleWakeup/loop on top — this poll IS the wait.
**Empty output with no marker is an error** — never read absence of a marker as done.

## 4. On wake — verify it checks out

`RALPH-DONE` → confirm the run actually succeeded, don't just assume:
1. **Exit status** — `tmux display-message -p -t "$WIN_ID" '#{pane_dead_status}'`. Non-zero ⇒
   ralph errored; capture the scrollback (`tmux capture-pane -p -S - -t "$WIN_ID"`) and report why.
2. **Leftover work** — `vima ready --count` (plus any filter you launched with). Non-zero ⇒ the
   run ended early / tickets failed or got deferred; list what's still open.
3. **Summary** — read the newest `.ralph-logs/summary-*.md`; relay closed tickets + outcome.

Report a one-line verdict: ✅ clean (exit 0, 0 ready left) or ⚠️ with exactly what's off. Then
close the window: `tmux kill-window -t "$WIN_ID"` (only after you've captured what you need).

`RALPH-TIMEOUT` → don't assume done. Show `vima ready --count`, tail the scrollback, ask the user
whether to keep waiting, switch to the window, or kill it. `RALPH-ERROR` → ralph never launched;
report and stop.

## Boundaries

- **One** ralph run only. Two or more parallel runs against the same repo collide on the working
  tree and the shared `.vima` store — for that use `/ralph-fleet` (isolated worktrees + merge).
- Don't edit `ralph`; this skill only drives it.
