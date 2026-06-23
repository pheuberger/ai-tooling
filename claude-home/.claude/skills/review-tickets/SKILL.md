---
description: "Reviews vima tickets against a plan to ensure each is a complete, independently-grabbable vertical slice. Splits horizontal/oversized tickets and sharpens vague ones."
---

# Review Tickets

Quality gate for a set of `/to-vima` tickets: a ticket passes only if it is a **complete vertical slice** a fresh worker can grab, implement end-to-end, and verify on its own.

This is the tracer-bullet counterpart to `/to-vima` — same philosophy. It checks that slices cut through all layers, NOT that they list file paths and code snippets.

## Workflow

1. **Gather** — Read the plan: prefer `PLAN-REFINED.md`, fall back to `PLAN.md` (or the user's argument). Identify the feature tag (ask if unclear). List tickets: `vima list --tag <tag> --status open`. Verify all carry the tag; fix with `vima update <id> --tags "$(vima show <id> --pluck tags | jq -r 'join(",")'),<tag>"`.
2. **Audit** — Review each ticket (dependency order, unblocked first) against the criteria below.
3. **Reslice** — Decompose horizontal or oversized tickets into vertical slices (Reslice Protocol).
4. **Sharpen** — Rewrite vague behavior into demoable behavior, in domain language. Do NOT add file paths or code snippets.
5. **Update** — `vima update <id> --description "$(cat << 'TICKET_EOF' ... TICKET_EOF)"`
6. **Report** — Summary table + `vima ready --tag <tag>` to confirm final state.

## Quality Criteria

### Auto-Fail

- **Horizontal slice** — the ticket is one layer only (schema-only, UI-only) and isn't independently demoable.
- **Not demoable/verifiable** — no way to show the slice works on its own.
- Weasel words: "similar to", "as needed", "appropriate", "etc."
- Acceptance criteria requiring human judgment, or absent entirely.
- **Stale specifics** — hardcoded file paths, line numbers, or code snippets baked into the body (they go stale; the worker re-derives them). Exception: a decision-encoding snippet from a prototype (state machine, schema, type shape), trimmed to the decision.
- Dependencies reference concepts instead of ticket ids.
- Missing feature tag (fix: append it via `vima update`).
- **Ticket would leave tests broken** — a behavior change must include its test changes in the same ticket. A separate "fix tests for ticket X" ticket is always wrong; merge it into X. (Exception: tickets fixing pre-existing failures or adding coverage for untested existing code.)

### Must Reslice

- Bundles two or more unrelated end-to-end behaviors.
- Title connects distinct deliverables with "and".
- It's a stack of horizontal layers that only become demoable together — recut as vertical slices, each demoable alone.

### Do NOT Reslice

- **One coherent slice, many touchpoints** — a single end-to-end behavior that happens to touch several files is one ticket. File count alone is never a reason to split.
- **Tightly coupled changes** — things that always change together (a behavior + its test, a type + its consumers) stay in one slice.
- **Mechanical repetition** — the same uniform transformation across many files is one ticket.

### Sharpen Standard

Every ticket body should read as a durable spec of behavior:

| Bad | Good |
|-----|------|
| "Update the service" | "A user can set a display name (≤50 chars); it persists and is returned on read." |
| "Follow the pattern in similar services" | (drop it — the worker finds the pattern by exploring) |
| "Add appropriate error handling" | "Over-length input is rejected with a validation error." |
| "Add `handleX()` to `Svc.ts:89`" | "The service exposes X behavior; locations are the worker's to find." |

Target body shape (lean — see `/to-vima`):

- **What to build** — end-to-end behavior, domain language, no stale paths
- **Acceptance criteria** — demoable/testable conditions
- **Blocked by** — ticket id(s), or "None"

## Reslice Protocol

1. `vima show <id>` — note Blocked By, Blocks, Tags.
2. `vima close <id> --reason "resliced"` — vima has no delete.
3. Create replacement slices:
   ```bash
   vima create "Slice title" --type task --priority 2 --tags <tag> --description "$(cat << 'TICKET_EOF'
   ## What to build
   ...
   ## Acceptance criteria
   - [ ] ...
   ## Blocked by
   ...
   TICKET_EOF
   )" | jq -r '.id'
   ```
4. Wire deps: `vima dep add <new> <upstream>` (first arg depends on second). Chain sequential replacements; point downstream tickets at the final replacement.
5. Verify: `vima ready --tag <tag>` — replacements appear, original gone.

## vima Command Reference

```bash
vima list --tag <tag> --status open                 # all open tickets for feature
vima ready --tag <tag>                               # unblocked tickets for feature
vima show <id> --full                                # full body (deps, tags, description)
vima close <id> --reason "resliced"                  # close (no delete)
vima dep add <a> <b>                                 # a depends on (is blocked by) b
vima undep <a> <b>                                   # remove dep link
vima update <id> --title "New title"                 # update a field
vima update <id> --description "$(cat << 'TICKET_EOF'
body
TICKET_EOF
)"
```

`vima dep tree <id>` shows one ticket's dependency tree. Don't run bare `vima dep` — it just prints help.

## Output

```
## Review Summary
| Ticket ID | Title | Status   | Issue              | Action          |
|-----------|-------|----------|--------------------|-----------------|
| proj-1    | ...   | PASS     | —                  | —               |
| proj-2    | ...   | SHARPENED | vague behavior    | rewrote body    |
| proj-3    | ...   | RESLICED | horizontal layers  | → proj-3a, 3b   |
```

Then `vima ready --tag <tag>` to show the final dependency-resolved state.
