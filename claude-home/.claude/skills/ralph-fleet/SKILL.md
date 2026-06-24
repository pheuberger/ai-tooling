---
description: "Schedule vima issues across parallel ralph workers (max 3), each in its own git worktree. Takes direct ids, a --tag, or a verbal description; partitions by file area so lanes never collide, tags them workerN, and launches ralph-fleet. Use when the user wants to run multiple vima tickets in parallel, fan out kaizen/fix work across workers, or 'schedule' issues."
---

# ralph-fleet

Partition a set of vima issues across **N ≤ 3** parallel `ralph` lanes and launch them.
Each lane is a normal `ralph --tag workerN` run inside its own git worktree + branch.
The single-lane process (worker → commit → simplify → review → close) is preserved
exactly — this skill only decides *who works on what* and pulls the trigger.

`ralph-fleet` (the orchestrator) and `ralph` are on PATH. Run from the **target repo root**.

## Slack events

Post a Slack note at every important point so the user can follow the fleet without watching
tmux. `NOTIFY_SLACK_WEBHOOK` lives in the repo's `.env.local` as a plain `key=value` (no `export`),
so you must source it with auto-export before it's visible. Do this once at start:
```bash
if [[ -f .env.local ]]; then set -a; source .env.local; set +a; fi
echo "NOTIFY_SLACK_WEBHOOK=${NOTIFY_SLACK_WEBHOOK:+set}${NOTIFY_SLACK_WEBHOOK:-(not set)}"
```
`set -a` exports everything `.env.local` defines, so the no-`export` lines are picked up. If the
var is still unset, skip every Slack step silently (still do the work) and tell the user
notifications are off. Never echo the raw webhook URL.

Each Slack post — fire-and-forget, never wait. **Env vars don't survive between Bash calls** (each
runs in a fresh shell), so re-source `.env.local` in the *same* command as the `curl`:
```bash
[[ -f .env.local ]] && { set -a; source .env.local; set +a; }
if [[ -n "$NOTIFY_SLACK_WEBHOOK" ]]; then
  curl -s -X POST "$NOTIFY_SLACK_WEBHOOK" -H 'Content-type: application/json' \
    -d "{\"text\": $(echo "<message>" | jq -Rs .)}" > /dev/null 2>&1 || true
fi
```

Post at exactly these points (prefix each with the repo name):
- **Launched** — N lanes, ticket count, the critical-path lane.
- **All lanes done** (`FLEET-DONE`) — starting linear apply.
- **🛑 Needs you** — a conflict stopped the apply (lane / commit / files), **or** `FLEET-TIMEOUT`
  left a lane hung. The actionable, must-not-miss events.
- **Finished** — per-lane tickets closed + diffstat, and final apply result.

Keep them short — one line each. Don't post per-ticket or per-poll; that's noise.

## Input → ticket set

Resolve the user's input to a concrete set of **open** tickets:

- **Direct ids** (`pr-abc, pr-def …`) → use as-is. Drop any not `open`.
- **Tag** (`--tag kaizen`, "the kaizen tickets") → `vima ready --tag <tag>` (already open + unblocked).
- **Verbal** ("the host-partner audit-log bugs") → `vima list --status open --full`, match titles/descriptions, present the matched set to the user and confirm before scheduling. Never invent tickets — this skill schedules existing ones.

If the set is empty or has 1 ticket, say so — no fleet needed; suggest `/vima-do <id>`.

## Partition by file area — the core judgment

Goal: **each source file is touched by exactly one lane.** Two lanes editing the same
file = merge conflict at the end. Two tickets touching the same file in the *same* lane
= fine (ralph runs them sequentially).

1. For each ticket, determine its **target files** from the description/acceptance, and
   `grep`/`Glob` the codebase to confirm (don't trust the ticket blindly).
2. Build **connected components**: tickets that share any file go in the same component.
   A component is indivisible — it must live in one lane.
3. **Lane count = min(3, number of components)**. Fewer components than 3 → fewer lanes.
   If one hub file dominates (many tickets touch it), those collapse into one big
   component and cap real parallelism — say so honestly; don't fake 3 lanes.
4. Assign components to lanes, balancing ticket count, keeping each component intact and
   every file in one lane only. The fullest lane is the critical path — report it.

## Tag the lanes

`vima update --tags` **REPLACES** all tags. Always preserve existing tags:

```
# read current tags, then append workerN
existing=$(vima show <id> | jq -r '.tags | join(",")')
vima update <id> --tags "${existing},worker<N>"
```

Filed Fix: tickets inherit the lane tag (reviewer uses `${TICKET_TAGS}`) so they stay in
lane and get worked the same run. New Kaizen: tickets get only `kaizen` → parked for later.

## Launch the lanes

Start the lanes detached:
```
ralph-fleet --no-attach --lanes <N>
```
Pass ralph flags after `--` (e.g. `ralph-fleet --no-attach -- --model claude-opus-4-6`).
The orchestrator auto-detects lanes from `workerN` tags, creates worktrees under the repo's
parent (so they resolve the same `.vima` store), forks branch `ralph/worker<N>` per lane off
the current branch, and starts a single tmux window (`fleet`) with one pane per lane, laid out
side by side so all lanes are visible at a glance (each lane = a `ralph` run; its pane dies when
ralph exits).

Untracked reference docs (`CONTEXT.md`, `docs/adr` by default) are symlinked into every lane —
`git worktree add` carries only TRACKED files, so without this workers couldn't read them. The
links point back at the main repo (live version) and are registered in `.git/info/exclude` so
ralph's untracked-file shelving leaves them in place. Override the set with one or more
`--context-path PATH` after `--`, or disable with `--no-context` (e.g.
`ralph-fleet --no-attach -- --context-path CONTEXT.md --context-path docs/decisions`).

Then wait for every lane to finish. **Do not use `ralph-fleet --wait`** — it auto-squash-merges,
and you apply the lanes yourself (next section). Instead background this poll so the harness
re-invokes you the moment all lanes are done:
```
# Resolve the real tmux BINARY, not the shell alias. The Bash tool sources the
# user's zsh profile, which may define `alias tmux=_zsh_tmux_plugin_run` — that
# plugin fn is undefined non-interactively, so a bare `tmux` errors and the poll
# would exit instantly with a false FLEET-DONE. Find the on-disk binary instead.
TMUX_BIN=""
for p in /usr/bin/tmux /usr/local/bin/tmux /opt/homebrew/bin/tmux /bin/tmux; do
  [ -x "$p" ] && { TMUX_BIN="$p"; break; }
done
[ -z "$TMUX_BIN" ] && TMUX_BIN="$(unalias tmux 2>/dev/null; type -P tmux 2>/dev/null)"
[ -z "$TMUX_BIN" ] && { echo "FLEET-ERROR: no tmux binary found"; exit 1; }
# Guard the ambiguous case: no session at entry means lanes never launched (or
# the resolver is still wrong) — NOT "all done". A true completion is detected
# by running==0 inside the loop, which prints FLEET-DONE.
"$TMUX_BIN" has-session -t ralph-fleet 2>/dev/null || { echo "FLEET-ERROR: ralph-fleet session not found at poll start — lanes never launched"; exit 1; }
elapsed=0; max=21600   # 6h ceiling — backstop against a hung lane
while "$TMUX_BIN" has-session -t ralph-fleet 2>/dev/null; do
  # All lanes are side-by-side panes in the single 'fleet' window, titled laneN.
  # A lane is live when its pane_dead == 0; count those still running.
  running=$("$TMUX_BIN" list-panes -t ralph-fleet:fleet -F '#{pane_title} #{pane_dead}' 2>/dev/null | grep -cE '^lane[0-9]+ 0$')
  [ "$running" -eq 0 ] && { echo "FLEET-DONE"; break; }
  [ "$elapsed" -ge "$max" ] && { echo "FLEET-TIMEOUT: $running lane(s) still running after ${max}s"; break; }
  sleep 600; elapsed=$((elapsed+600))
done
```
Run with `run_in_background: true`. Don't ScheduleWakeup/loop on top of it — this backgrounded
poll is the wait; the harness notifies you when it exits.

On wake, read the marker. `FLEET-DONE` → fire the **All lanes done** Slack event, then apply the
lanes (next section). `FLEET-TIMEOUT` → **don't apply.** Fire the **🛑 Needs you** event, run
`ralph-fleet --status`, report which lanes are still live, and ask the user whether to wait more,
attach (`tmux attach -t ralph-fleet`), or kill and apply what finished. `FLEET-ERROR` → **don't
apply, don't assume done.** The poll never observed a live session: lanes failed to launch or the
session died at startup. Run `ralph-fleet --status`, inspect lane logs, fire **🛑 Needs you**, and
report. **Empty output with no marker is also an error** — never read absence of a marker as done.

Report back immediately after launching, and fire the **Launched** Slack event:
- the partition table (lane → tickets → domain), flagging the critical-path lane
- `tmux attach -t ralph-fleet` to watch live — all lanes side by side in one window (Ctrl-b ←/→ or o to move between panes, Ctrl-b z to zoom one, Ctrl-b d to detach)
- that you'll apply the lanes linearly and report once they finish

## Apply the lane changes linearly

When the poll returns, every lane is done. **You** apply the work onto the base branch — one
lane at a time, in order, preserving each lane's commits — so you keep judgment over anything
that doesn't apply cleanly. Don't hand this to an automated squash merge.

1. `ralph-fleet --status` — each lane's branch, commit count, diffstat vs base. Skip any lane
   with 0 commits beyond base.
2. Put the main repo on `<base>`, clean: `git checkout <base>`. If the tree is dirty or you're
   not on the expected base, **stop and ask** — don't guess.
3. For each lane branch `ralph/worker<N>`, lowest N first:
   - Inspect: `git log --oneline <base>..ralph/worker<N>`.
   - Apply linearly: `git cherry-pick <base>..ralph/worker<N>` (keeps the per-ticket commits).
     A clean fast-forward (`git merge --ff-only ralph/worker<N>`) is fine too.
   - **On any conflict or anything unexpected: STOP.** `git cherry-pick --abort`, fire the
     **🛑 Needs you** Slack event (lane / commit / files), then report and ask the user how to
     proceed. Do **not** auto-resolve, and do **not** touch the remaining lanes until they answer.
     A conflict means the partition leaked (two lanes hit one file) — a human call, not a machine merge.
4. After all lanes land cleanly: `ralph-fleet --cleanup` (removes worktrees, deletes the lane
   branches — it content-verifies each before deleting).

Then fire the **Finished** Slack event and report per lane: tickets closed, diffstat, ralph
summary (`.ralph-logs/fleet/*-summary.md` if present), and final apply result.

## Variants

- **Fully detached** (survives this session ending): `ralph-fleet --auto` runs its own
  `--wait` autopilot that squash-merges and writes the report to
  `.ralph-logs/fleet/<session>-report.md`. Use only when the user wants fire-and-forget and
  is fine with the orchestrator's auto squash-merge instead of the linear apply above.

## Rules

- **Never more than 3 lanes**, even if asked. More worktrees ≠ faster when work is coupled.
- Only schedule **open** tickets. Skip closed/in_progress.
- Confirm the matched set before tagging when input was verbal.
- Tagging is reversible (`vima update <id> --tags kaizen`); launching spawns live coding
  sessions and writes to branches — make sure the partition is right before launching.
- Apply lanes linearly yourself (cherry-pick, lowest N first). **Any conflict → abort and ask;
  never auto-resolve.** Lane branches survive until `--cleanup`, so a stopped apply loses nothing.
- Don't modify `ralph` or `ralph-fleet` from here — this skill drives them, doesn't edit them.
