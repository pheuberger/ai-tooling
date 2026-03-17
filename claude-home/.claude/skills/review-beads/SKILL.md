---
description: "Reviews beads against an implementation plan to ensure they are 100% self-contained with zero guesswork. Splits oversized beads and enriches incomplete ones with actual code snippets."
---

# Review Beads

Quality gate: a bead passes only if ANY agent can implement it WITHOUT reading other context, exploring the codebase, or making assumptions.

## Workflow

1. **Gather** — Read plan: prefer `PLAN-REFINED.md`, fall back to `PLAN.md` (or whatever the user provided as an argument). Identify the feature label (ask user if unclear). List beads: `bd list --label <label> --status open`. Verify all carry the label; fix with `bd update <id> --add-label <label>`.
2. **Audit** — Review each bead (dependency order: unblocked first) against quality criteria below.
3. **Split** — Decompose oversized beads per Split Protocol.
4. **Enrich** — Read actual source files, add missing code snippets inline.
5. **Update** — Pipe fixed body: `cat << 'EOF' | bd update <id> --body-file -`
6. **Report** — Summary table + `bd ready --label <label>` to verify final state.

## Split Protocol

1. `bd show <id>` — note Blocked By, Blocks, Labels
2. `bd delete <id> --force` — removes all dep links automatically
3. Create replacements (pipe body via stdin):
   ```bash
   cat << 'BEAD_EOF' | bd create "Title" --type task --priority 2 --labels <label> --body-file -
   ## Context
   ...
   ## Task
   ...
   BEAD_EOF
   ```
4. Wire deps: `bd dep add <new> <upstream>` (first arg depends-on second arg). Chain sequential replacements. Point downstream beads at final replacement.
5. Verify: `bd ready --label <label>` — replacements appear, original gone.

## Quality Criteria

### Auto-Fail

- Weasel words: "similar to", "as needed", "appropriate", "etc."
- References files without specifying exact changes
- Mentions functions without signatures
- Acceptance criteria requiring human judgment
- Missing `## Files` or `## Code Changes` sections
- Dependencies reference concepts instead of bead IDs
- Missing feature label (fix: `bd update <id> --add-label <label>`)
- **Bead would leave tests broken** — if a bead adds/changes behavior, it must include the corresponding test updates. A separate "fix tests for bead X" bead is always wrong; merge the test changes into bead X. (Exception: beads that fix pre-existing test failures or add coverage for untested existing code.)

### Must Split

- Has >2 logical concerns
- Title contains "and" connecting distinct deliverables
- Touches >3 files with **different logic per file** (unique changes, different signatures, different patterns)

### Do NOT Split

- **Mechanical/repetitive changes** — the same transformation applied uniformly across many files (e.g., add an import, rename a symbol, update a call site, apply a new pattern). 10 files with the same 2-line change is one bead.
- **Tightly coupled files** — files that always change together (e.g., component + its styles + its test, or a type definition + all its consumers). Splitting these just creates dependency chains with no benefit.
- **Single concern, many touchpoints** — if every file change serves the same purpose and the bead has only one logical concern, file count alone is never a reason to split.

### Enrichment Standard

Every bead must have these sections:
- **Context** — Why (1-2 sentences, include Linear issue ID)
- **Task** — What (one clear sentence)
- **Files** — path, action (create/modify/read), purpose
- **Code Changes** — Actual snippets with line numbers, not prose
- **Dependencies** — bead ID, title, what it provides
- **Acceptance Criteria** — Runnable commands

| Bad | Good |
|-----|------|
| "Update the service" | "Add `handleX()` to `Svc.ts:89` with signature `(id: string) => Promise<T>`" |
| "Follow the pattern in similar services" | "Follow pattern in `Svc.ts:45-89` (copied below): [actual code]" |
| "Add appropriate error handling" | "Throw `ValidationError` code `INVALID_STATUS` if `e.status !== 'active'`" |

## bd Command Reference

```bash
# Query
bd list --label <label> --status open       # All open beads for feature
bd ready --label <label>                    # Unblocked beads for feature
bd show <id>                                # Bead details (deps, labels, body)

# Mutate
bd delete <id> --force                      # Delete (auto-removes dep links)
bd dep add <a> <b>                          # a depends-on (is blocked by) b
bd dep remove <a> <b>                       # Remove dep link
bd update <id> --add-label <label>          # Add label
bd update <id> --title "New title"          # Update field

# Multi-line body (create or update) — MUST use --body-file - with pipe
cat << 'EOF' | bd create "Title" --type task --priority 2 --labels <label> --body-file -
body here
EOF
cat << 'EOF' | bd update <id> --body-file -
body here
EOF
```

**Do NOT** heredoc into bd directly — it ignores stdin without `--body-file -`.
**Do NOT** run `bd dep` alone — it just prints help. Use `bd dep tree <id>` for a single bead's tree.

## Output

After review, output:

```
## Review Summary
| Bead ID | Title | Status | Issues | Action |
|---------|-------|--------|--------|--------|
| proj-1 | Schema | PASS | — | — |
| proj-2 | Service | ENRICHED | Missing snippets | Added code |
| proj-3 | Full flow | SPLIT | Too broad | → proj-3a, proj-3b |
```

Then `bd ready --label <label>` to show the final dependency-resolved state.
