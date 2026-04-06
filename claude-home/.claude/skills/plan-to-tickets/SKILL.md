---
description: "Decompose an approved plan into self-contained tickets with zero guesswork"
---

# Plan to Tickets

You are taking an approved implementation plan and decomposing it into vima tickets. Each ticket must be **100% self-contained** so that any agent picking it up has zero questions and needs zero assumptions.

## Workflow

### 1. Find the Active Plan

Look for `PLAN-REFINED.md` first (output of `ralph-plan`), then fall back to `PLAN.md`. If the user provided a specific file as an argument, use that instead. Read it thoroughly.

If no plan file exists, ask the user to provide one or run `/create-plan` first.

### 2. Explore the Codebase

Before proposing tickets, explore the codebase to understand:
- The files that will be modified
- Existing patterns, functions, and utilities that should be reused
- The current state of code related to the plan
- Test patterns used in similar features

This exploration is critical — tickets need concrete file paths and function references, not vague descriptions.

### 3. Propose Tickets

Break the plan into granular implementation tasks. For each proposed ticket, show:

```
[1] <title>
    Depends on: (none | ticket numbers)
    Files: <file paths>
    Summary: <2-3 sentences>

[2] <title>
    Depends on: [1]
    Files: <file paths>
    Summary: <2-3 sentences>
```

### 4. Refine with User

Present the proposed tickets and ask for feedback:
- Should any tickets be split further?
- Should any be merged?
- Are dependencies correct?
- Missing anything?

Iterate until the user approves.

### 5. Choose a Feature Label

Before creating tickets, choose a short, kebab-case label (e.g., `fiscal-host`, `project-collections`) that will be applied to every ticket in this set.

**The label MUST be new.** Verify it doesn't already exist:
```bash
vima list --tag <feature-slug>
```
If any results are returned, choose a different label (e.g., append a version: `fiscal-host-v2`). Reusing an existing label would mix unrelated tickets together.

### 6. Create Tickets

For each approved ticket, create it using `--description` to pass the multi-line description. **Every ticket must** carry the feature label.

```bash
vima create "Ticket title" --type task --priority 2 --tags <feature-slug> --description "$(cat << 'TICKET_EOF'
## Context
...

## Task
...

## Files
...

## Acceptance Criteria
...
TICKET_EOF
)" | tail -1 | jq -r '.id'
```

Then set dependencies with `vima dep add`.

## Ticket Quality Standard

**Every ticket MUST follow these rules. No exceptions.**

### 100% Self-Contained

A ticket includes ALL context an agent needs to complete the work without reading the plan, without asking questions, and without exploring the codebase to figure out what to do. The ticket IS the spec for that task.

### No Assumptions

Bad: "Update the service to handle the new field"
Good: "In `src/services/user/UserService.ts`, add a `displayName` parameter (type: `string`, max 50 chars) to the `updateProfile` method (line ~45). Pass it through to the database update call on the `users` table. The column `display_name` already exists (added in ticket X)."

### No Guesswork

Bad: "Add validation for the input"
Good: "In `src/routes/api/user.ts`, add validation to the request body using the existing `userUpdateSchema` from `src/lib/schemas/user.ts`. On validation failure, return HTTP 400 with a structured error response using the project's error helper. Test: send a request with `displayName` exceeding 50 chars and verify 400 response."

### Clear Dependencies

Bad: "This needs the database migration to be done first"
Good: "Depends on ticket `proj-abc123` (Add display_name column to users table). This ticket expects the `display_name` column (type: `varchar(50)`, nullable, default null) to exist on the `users` table."

### Acceptance Criteria

Bad: "Implement the feature"
Good: "Done when: (1) POST /api/user with `{ displayName: 'Test' }` updates the `display_name` column in the database, (2) GET /api/user returns the `displayName` field in the response, (3) Sending `displayName` longer than 50 chars returns HTTP 400, (4) Unit test covers all three cases and passes."

### Scoped to One Concern

If a ticket touches multiple files for different reasons, split it. A schema migration is one ticket. The service change is another. The API route change is another. The tests are another (or colocated with the service ticket if tightly coupled).

### Every Ticket Must Leave Tests Passing

Each ticket must leave the codebase in a state where tests pass. If a ticket adds or changes behavior, it must include the corresponding test updates in the same ticket. **Never create a separate ticket to "fix tests broken by ticket X"** — the test changes belong in ticket X. A test gate runs after each ticket's worker, so broken tests will trigger retries and waste cycles.

Separate test tickets are only valid for: (1) fixing pre-existing test failures unrelated to the current plan, or (2) adding coverage for untested existing code.

## Ticket Description Template

Every ticket description MUST follow this structure:

```
## Context
[Why this task exists. Reference the Linear issue ID and broader goal.]

## Task
[Exactly what to do. Specific files, functions, line numbers where known, exact changes.]

## Files
[Every file path that will be read or modified, with what happens to each]
- `src/path/to/file.ts` — modify: add X method
- `src/path/to/other.ts` — read: reference existing Y pattern
- `test/path/to/file.test.ts` — create: tests for X

## Dependencies
[What must be complete before this. What this produces for downstream tickets.]
- Depends on: <ticket-id> (<title>) — needs <specific thing>
- Produces: <what downstream tickets will consume>

## Acceptance Criteria
[Concrete, testable conditions. Not "implement X" but "when Y happens, Z results".]
1. <specific testable condition>
2. <specific testable condition>
3. <specific testable condition>
```

## Rules

- **NEVER create vague tickets** — if you can't fill in the template with specifics, you haven't explored the codebase enough
- **NEVER skip the exploration phase** — tickets need real file paths and real function names
- **NEVER create tickets without user approval** — always show the proposed list first
- **ALWAYS include the Linear issue reference** in each ticket's Context section
- **ALWAYS include the plan file path** in each ticket's Context section for traceability
- Use `vima create --type task --priority 2 --tags <feature-slug>` as the default. Adjust priority based on dependency order (earlier = higher priority)
- **NEVER use `--parent` or create epic parent tickets** — use labels for grouping and `vima dep add` for ordering
- **ALWAYS apply a consistent, unique label** (short kebab-case feature name) to every ticket in the set
- **Every ticket MUST have at least one label** — tickets without labels are rejected
- After creating all tickets, show a summary with ticket IDs, titles, labels, and dependency graph
