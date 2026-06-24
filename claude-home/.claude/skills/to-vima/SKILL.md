---
description: "Break a plan, spec, or PRD into independently-grabbable vima tickets using tracer-bullet vertical slices."
---

# To Vima

Break a plan into independently-grabbable **vima** tickets using vertical slices (tracer bullets).

vima is the local agent-first issue tracker for this repo — NOT Linear. Tickets created here feed `vima ready`, which ralph workers pick up one at a time in fresh, headless context.

## Process

### 1. Gather context

Work from whatever is already in the conversation. If the user passes a plan file (`PLAN-REFINED.md`, `PLAN.md`, or a path argument) or a vima ticket id, read it fully first.

If no argument is given, check the current git branch for a Linear issue id before asking the user. Linear branch names embed the issue id (e.g. `philipp/abc-123-some-title` → `ABC-123`):

```bash
git rev-parse --abbrev-ref HEAD | grep -oiE '[a-z]+-[0-9]+' | head -1
```

If an id is found, read that issue with the Linear MCP `get_issue` tool (and `list_comments` for any added context) and treat its description as the plan to break down. If no id is in the branch name and nothing is in context, ask for a plan or point them at `/create-plan`.

### 2. Explore the codebase

If you haven't already, explore to understand the current state. Ticket titles and bodies should use the project's domain vocabulary, and respect existing patterns in the area you're touching.

Look for opportunities to **prefactor** — "make the change easy, then make the easy change." Prefactoring is its own slice, done first.

### 3. Draft vertical slices

Break the plan into **tracer-bullet** tickets. Each ticket is a thin vertical slice that cuts through ALL layers end-to-end — NOT a horizontal slice of one layer.

<vertical-slice-rules>

- Each slice delivers a narrow but COMPLETE path through every layer it touches (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Any prefactoring is its own slice, sequenced first
- A slice leaves tests passing — behavior changes ship with their test changes in the same ticket. Never file a separate "fix tests broken by ticket X" ticket; a test gate runs after each worker.

</vertical-slice-rules>

### 4. Quiz the user

Present the breakdown as a numbered list. For each slice show:

- **Title** — short, descriptive, domain vocabulary
- **Blocked by** — which other slices (if any) must close first
- **Delivers** — what's demoable/verifiable when it's done

Ask:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split?

Iterate until the user approves. Do NOT create tickets before approval.

### 5. Choose a feature tag

Pick a short, kebab-case tag (e.g. `fiscal-host`, `project-collections`) applied to every ticket in the set.

**The tag MUST be new.** Verify:

```bash
vima list --tag <feature-slug>
```

If anything returns, pick another (e.g. append `-v2`). Reusing a tag mixes unrelated tickets. Every ticket needs at least one tag — untagged tickets are rejected.

### 6. Publish to vima

Create tickets in dependency order (blockers first) so you can wire real ids into `--dep`. vima outputs JSON — pipe through `jq -r '.id'` for the id.

```bash
vima create "<slice title>" \
  --type task --priority 2 \
  --tags <feature-slug> \
  --dep <upstream-ticket-id> \
  --description "$(cat << 'DESC_EOF'
## What to build

<End-to-end behavior of this slice, in domain language. Describe what the
slice does, not a layer-by-layer implementation.>

## Acceptance criteria

- [ ] <demoable/verifiable condition>
- [ ] <demoable/verifiable condition>

## Blocked by

<reference to blocking ticket id, or "None — can start immediately">
DESC_EOF
)" | jq -r '.id'
```

Adjust priority by dependency order — earlier slices higher. Default `--type task --priority 2`.

After creating all tickets, show a summary: ids, titles, tag, and the dependency graph. Do NOT close or modify any parent/source ticket.

## Ticket body rules

The ticket IS the durable spec. Optimize for what survives, not for exhaustive detail.

### Describe behavior, not layers

Bad: "Add a `display_name` column, then a `displayName` param to `UserService.updateProfile`, then a route handler, then tests."
Good: "A user can set a display name (≤50 chars) on their profile; it persists and is returned on read. Over-length input is rejected."

### No stale file paths or code snippets

Avoid specific file paths, line numbers, and code snippets — they go stale fast and a fresh worker re-derives them anyway by exploring. State the *decision*, not the *location*.

**Exception:** if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline just the decision-rich part and note it came from a prototype. Not a working demo — the important bits.

### Acceptance criteria are behavioral

Bad: "Implement the feature."
Good: "Done when: (1) setting a display name persists it and a read returns it, (2) a >50-char name is rejected, (3) a test covers both."

Each criterion is demoable or testable without judgment calls.

### One complete slice per ticket

A slice is too big if it bundles unrelated end-to-end behaviors. It is too small if it's a single layer that isn't independently demoable. When unsure, prefer the slice that a worker can finish and verify in one sitting.

## vima command reference

```bash
vima create "Title" --type task --priority 2 --tags <slug>   # create; prints JSON
vima list --tag <slug>                                       # tickets by tag
vima list --pluck id,title                                   # extract fields
vima ready --tag <slug>                                      # unblocked tickets for feature
vima show <id> --full                                        # full body
vima dep add <a> <b>                                         # a depends on (is blocked by) b
```

`--type`: bug, feature, task, epic, chore. `--priority`: 0=critical … 4=backlog.

## Rules

- **NEVER create tickets without user approval** — show the slice list first (step 4).
- **NEVER write horizontal/layer-only tickets** — every ticket is a complete vertical slice.
- **NEVER inline stale file paths, line numbers, or code snippets** — describe the decision and behavior; the worker explores for locations.
- **ALWAYS apply one consistent, unique kebab-case tag** to every ticket in the set.
- **ALWAYS use `vima dep add`/`--dep` for ordering** — never `--parent` or epic parents; tags group, deps order.
- **ALWAYS leave tests passing within each slice** — behavior change and its tests in the same ticket.
