---
description: "Reviews tickets against an implementation plan to ensure they are 100% self-contained with zero guesswork. Splits oversized tickets and enriches incomplete ones with actual code snippets."
---

# Review Tickets

Quality gate: a ticket passes only if ANY agent can implement it WITHOUT reading other context, exploring the codebase, or making assumptions.

## Workflow

1. **Gather** — Read plan: prefer `PLAN-REFINED.md`, fall back to `PLAN.md` (or whatever the user provided as an argument). Identify the feature tag (ask user if unclear). List tickets: `vima list --tag <tag> --status open`. Verify all carry the tag; fix with: `vima update <id> --tags "$(vima show <id> --pluck tags | jq -r 'join(",")'),<tag>"`.
2. **Audit** — Review each ticket (dependency order: unblocked first) against quality criteria below.
3. **Split** — Decompose oversized tickets per Split Protocol.
4. **Enrich** — Read actual source files, add missing code snippets inline.
5. **Update** — Update fixed body: `vima update <id> --description "$(cat << 'TICKET_EOF'...TICKET_EOF)"`
6. **Report** — Summary table + `vima ready --tag <tag>` to verify final state.

## Split Protocol

1. `vima show <id>` — note Blocked By, Blocks, Tags
2. `vima close <id> --reason "replaced"` — close the oversized ticket
3. Create replacements:
   ```bash
   vima create "Title" --type task --priority 2 --tags <tag> --description "$(cat << 'TICKET_EOF'
   ## Context
   ...
   ## Task
   ...
   TICKET_EOF
   )" | jq -r '.id'
   ```
4. Wire deps: `vima dep add <new> <upstream>` (first arg depends-on second arg). Chain sequential replacements. Point downstream tickets at final replacement.
5. Verify: `vima ready --tag <tag>` — replacements appear, original gone.

## Quality Criteria

### Auto-Fail

- Weasel words: "similar to", "as needed", "appropriate", "etc."
- References files without specifying exact changes
- Mentions functions without signatures
- Acceptance criteria requiring human judgment
- Missing `## Files` or `## Code Changes` sections
- Dependencies reference concepts instead of ticket IDs
- Missing feature tag (fix: `current=$(vima show <id> | jq -r '.tags | join(",")'); vima update <id> --tags "$current,<tag>"`)
- **Ticket would leave tests broken** — if a ticket adds/changes behavior, it must include the corresponding test updates. A separate "fix tests for ticket X" ticket is always wrong; merge the test changes into ticket X. (Exception: tickets that fix pre-existing test failures or add coverage for untested existing code.)

### Must Split

- Has >2 logical concerns
- Title contains "and" connecting distinct deliverables
- Touches >3 files with **different logic per file** (unique changes, different signatures, different patterns)

### Do NOT Split

- **Mechanical/repetitive changes** — the same transformation applied uniformly across many files (e.g., add an import, rename a symbol, update a call site, apply a new pattern). 10 files with the same 2-line change is one ticket.
- **Tightly coupled files** — files that always change together (e.g., component + its styles + its test, or a type definition + all its consumers). Splitting these just creates dependency chains with no benefit.
- **Single concern, many touchpoints** — if every file change serves the same purpose and the ticket has only one logical concern, file count alone is never a reason to split.

### Enrichment Standard

Every ticket must have these sections:
- **Context** — Why (1-2 sentences, include Linear issue ID)
- **Task** — What (one clear sentence)
- **Files** — path, action (create/modify/read), purpose
- **Code Changes** — Actual snippets with line numbers, not prose
- **Dependencies** — ticket ID, title, what it provides
- **Acceptance Criteria** — Runnable commands

| Bad | Good |
|-----|------|
| "Update the service" | "Add `handleX()` to `Svc.ts:89` with signature `(id: string) => Promise<T>`" |
| "Follow the pattern in similar services" | "Follow pattern in `Svc.ts:45-89` (copied below): [actual code]" |
| "Add appropriate error handling" | "Throw `ValidationError` code `INVALID_STATUS` if `e.status !== 'active'`" |

## vima Command Reference

```bash
# Query
vima list --tag <tag> --status open            # All open tickets for feature
vima ready --tag <tag>                         # Unblocked tickets for feature
vima show <id>                                 # Ticket details (deps, tags, body)

# Mutate
vima close <id> --reason "replaced"            # Close ticket (vima has no delete)
vima dep add <a> <b>                           # a depends-on (is blocked by) b
vima undep <a> <b>                             # Remove dep link
vima update <id> --tags "$(vima show <id> --pluck tags | jq -r 'join(",")'),<new-tag>"  # Append a tag
vima update <id> --title "New title"           # Update field

# Multi-line body (create or update) — use --description with command substitution
vima create "Title" --type task --priority 2 --tags <tag> --description "$(cat << 'TICKET_EOF'
body here
TICKET_EOF
)" | jq -r '.id'
vima update <id> --description "$(cat << 'TICKET_EOF'
body here
TICKET_EOF
)"
```

**Do NOT** run `vima dep` alone — it just prints help. Use `vima dep tree <id>` for a single ticket's tree.

## Output

After review, output:

```
## Review Summary
| Ticket ID | Title | Status | Issues | Action |
|-----------|-------|--------|--------|--------|
| proj-1 | Schema | PASS | — | — |
| proj-2 | Service | ENRICHED | Missing snippets | Added code |
| proj-3 | Full flow | SPLIT | Too broad | → proj-3a, proj-3b |
```

Then `vima ready --tag <tag>` to show the final dependency-resolved state.
