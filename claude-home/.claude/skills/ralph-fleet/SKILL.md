---
description: "Schedule vima issues across parallel ralph workers (max 3), each in its own git worktree. Takes direct ids, a --tag, or a verbal description; partitions by file area so lanes never collide, tags them workerN, and launches ralph-fleet. Use when the user wants to run multiple vima tickets in parallel, fan out kaizen/fix work across workers, or 'schedule' issues."
---

# ralph-fleet

Partition a set of vima issues across **N ≤ 3** parallel `ralph` lanes and launch them.
Each lane is a normal `ralph --tag workerN` run inside its own git worktree + branch.
The single-lane process (worker → commit → simplify → review → close) is preserved
exactly — this skill only decides *who works on what* and pulls the trigger.

`ralph-fleet` (the orchestrator) and `ralph` are on PATH. Run from the **target repo root**.

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

## Launch

Two steps. First start the lanes detached:
```
ralph-fleet --no-attach --lanes <N>
```
Pass ralph flags after `--` (e.g. `ralph-fleet --no-attach -- --model claude-opus-4-6`).
The orchestrator auto-detects lanes from `workerN` tags, creates worktrees under the repo's
parent (so they resolve the same `.vima` store), forks branches off the current branch,
and starts one tmux window per lane (each lane = a `ralph` run; its pane dies when ralph exits).

Then start the autopilot **as a backgrounded Bash call** so its output is captured back
into this session:
```
ralph-fleet --wait --lanes <N> --poll 600
```
Run this with `run_in_background: true`. `--wait` polls every 10 min until all lane panes
die, then **squash-merges** each lane into the base branch, tears down the worktrees, kills
the tmux session, and prints a consolidated per-lane report (tickets, diffstat, ralph
summary, exit status, merge result) to stdout. Because it's a backgrounded Bash, the harness
re-invokes you when it finishes — surface that report to the user then.

Don't poll it yourself with ScheduleWakeup/loop — the backgrounded `--wait` is the wait; the
harness notifies you on completion.

Report back immediately after launching:
- the partition table (lane → tickets → domain), flagging the critical-path lane
- `tmux attach -t ralph-fleet` to watch live (Ctrl-b n/p switch lanes, Ctrl-b d detach)
- that the squash-merge + teardown + report will land here automatically when lanes finish

## Variants

- **Fully detached** (survives this session ending): launch with `ralph-fleet --auto` instead
  of the two-step flow. It spawns its own `--wait` autopilot in the background and writes the
  report to `.ralph-logs/fleet/<session>-report.md`. Use when the user wants fire-and-forget
  and doesn't need the report in-session.
- **Full history instead of squash**: add `--strategy no-ff` (merge commit + every per-ticket
  commit) to `--wait`/`--auto`/`--merge`.
- **Manual finish**: skip `--wait`; later run `git checkout <base> && ralph-fleet --merge`
  then `ralph-fleet --cleanup`.

## Rules

- **Never more than 3 lanes**, even if asked. More worktrees ≠ faster when work is coupled.
- Only schedule **open** tickets. Skip closed/in_progress.
- Confirm the matched set before tagging when input was verbal.
- Tagging is reversible (`vima update <id> --tags kaizen`); launching spawns live coding
  sessions and writes to branches — make sure the partition is right before launching.
- Don't modify `ralph` or `ralph-fleet` from here — this skill drives them, doesn't edit them.
