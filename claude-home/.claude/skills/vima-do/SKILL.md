---
description: "Do a vima ticket end-to-end: start, work, /simplify, commit, close. Takes a vima ticket id or asks for one."
---

# vima-do

End-to-end execution of a single vima ticket.

## Input

User supplies a vima ticket **id** (e.g. `abc123`) as argument. If missing, ask:

> Which vima ticket id?

Do not guess. Do not list tickets.

## Workflow

### 1. Start (returns spec)

- `vima start <id>` — sets status `in_progress` **and** returns the full ticket JSON in one call. Read the spec from its `description` field. Do not also run `vima show` — it would re-fetch the same body for no reason.
- If the response is an error, or the ticket is already closed/missing, stop and report.

### 2. Work

Implement the ticket against the spec. Standard engineering loop: read relevant files, edit, run tests/typecheck if available.

No grilling, no plan file. This skill is for tickets that are already specified.

### 3. Simplify + commit

Invoke `/simplify-commit` — runs `/simplify` then `/commit-all` in one shot.

Do **not** put the ticket id in the commit subject. Reference it in the body if useful, but the title stays clean.

### 4. Close

`vima close <id>` once commits land.

Report:
```
Done: <id> — <title>
Commits: <n>
```

## Rules

- Never run `git pull`. On divergence, notify and exit.
- Never close the ticket if simplify/commit failed or working tree still dirty.
- Never create new tickets here — file blockers via `vima add-note` instead.
- If work spans multiple sessions, leave the ticket `in_progress` and report — do not close prematurely.
