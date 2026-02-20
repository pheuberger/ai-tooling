---
description: "Reviews beads against an implementation plan to ensure they are 100% self-contained with zero guesswork. Splits oversized beads and enriches incomplete ones with actual code snippets."
---

# Review Beads

Quality gate for beads. A bead passes review only if ANY agent can implement it WITHOUT reading other context, exploring the codebase, or making assumptions.

## What to Review

**Review:** All open beads with the feature label.

**Order:** Review in dependency order — start with beads that have no open `blockedBy`, then work downstream.

## Workflow

1. **Gather**:
   - Read active plan from `.claude/plans/`
   - Identify the feature label: search `bd list --status open` for beads matching the feature, or ask the user for the label
   - List beads: `bd list --label <feature-slug> --status open`
   - Verify all beads carry the label; if any are missing it, add with `bd update <id> --add-label <feature-slug>`
2. **Audit** — Check each bead against quality criteria (including organization checks)
3. **Split** — Decompose oversized beads, delete originals (see Split Protocol)
4. **Enrich** — Add missing code snippets by reading the actual codebase
5. **Update** — Run `bd update <id>` for each fixed bead
6. **Report** — Output summary table with pass/fail/split status

## Split Protocol

When splitting a bead into smaller pieces:

1. **Note the original's dependencies and label** before deleting:
   ```bash
   bd show <original-id>  # Note "Blocked By", "Blocks", and "Labels" sections
   ```
2. **Delete the original** (auto-removes all dependency links):
   ```bash
   bd delete <original-id> --force
   ```
3. **Create replacement beads** with the same feature label:
   ```bash
   bd create --labels <feature-slug>  # Same label as original
   ```
4. **Wire dependencies**:
   - First replacement gets original's upstream deps: `bd dep add <first-new> <upstream-id>`
   - Chain replacements if sequential: `bd dep add <new-2> <new-1>`
   - Downstream beads depend on final replacement: `bd dep add <downstream-id> <final-new>`
5. **Verify** with `bd ready` — replacements should appear, original gone

## Quality Criteria

### Organization (Structure Violations)

- **No label**: Every bead must carry a consistent feature label (short kebab-case, e.g., `fiscal-host`). If missing, add the label with `bd update <id> --add-label <feature-slug>`.
- **Reused label**: The label must be unique to this feature set. Run `bd list --label <label>` — all returned beads should belong to the same feature. If unrelated beads share the label, flag it as a conflict.

### Auto-Fail (Red Flags)

- Contains weasel words: "similar to", "as needed", "appropriate", "etc."
- References files without specifying exact changes
- Mentions functions without signatures
- Has acceptance criteria requiring human judgment
- Missing `## Files` or `## Code Changes` sections
- Dependencies reference concepts instead of bead IDs

### Must Split (Size Violations)

- Touches >3 files for different reasons
- Has >2 logical concerns ("create schema AND service AND tests")
- Title contains "and" connecting distinct deliverables
- Acceptance criteria span multiple unrelated features

**One bead = one concern.** When splitting is needed, follow the **Split Protocol** above.

## Enriching Beads

For incomplete beads:

1. **Read the actual source files** referenced in the bead
2. **Extract exact code** the agent will need — copy patterns inline
3. **Generate implementation snippets** — actual code, not prose
4. **Specify line numbers** — `file.ts:45-67` format
5. **Write runnable acceptance criteria** — concrete test commands

### Required Sections

Every enriched bead must have these sections:

- **Context** — Why this exists (1-2 sentences, include Linear issue ID)
- **Task** — What to do (one clear sentence)
- **Files** — Table: path, action (create/modify/read), purpose
- **Code Changes** — Actual snippets with line numbers, not prose descriptions
- **Dependencies** — Table: bead ID, title, what it provides
- **Acceptance Criteria** — Runnable commands (build, test, lint)

## Anti-Patterns and Fixes

| Bad | Good |
|-----|------|
| "Update the service to handle the new case" | "Add `handleInvitation()` to `InvitationService.ts:89` with signature `(orgId: string, targetId: string) => Promise<Invitation>`" |
| "Follow the pattern used in similar services" | "Follow pattern in `InvitationService.ts:45-89` (copied below): [actual code]" |
| "Add appropriate error handling" | "Throw `ValidationError` with code `INVALID_STATUS` if `entity.status !== 'active'`" |
| "Test that it works correctly" | "Run `<project test command> src/services/Feature.test.ts` — passes with 4 tests" |

## Commands

```bash
bd ready              # List open, unblocked beads
bd show <id>          # View bead details
bd update <id>        # Update bead description
bd delete <id> --force  # Delete a bead (auto-removes dependency links)
bd dep                # Visualize dependency graph
bd dep add <a> <b>    # a depends on b
bd dep rm <a> <b>     # Remove dependency
```

## Output

After review, output:

```
## Review Summary

| Bead ID | Title | Status | Issues | Action |
|---------|-------|--------|--------|--------|
| proj-52.1 | DB Schema | PASS | — | — |
| proj-52.2 | Service Layer | ENRICHED | Missing snippets | Added implementation |
| proj-52.3 | Full flow | SPLIT | Too broad | Deleted, created 52.3.1, 52.3.2, 52.3.3 |
| proj-52.4 | Email Handler | BLOCKED | Missing plan section | Flagged |
```

Then run `bd dep` to show the final dependency graph.
