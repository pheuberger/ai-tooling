---
description: "Compare PLAN.md and PLAN-REFINED.md (or user-specified files) and explain exactly what changed in plain language, with reasoning for each change."
---

# Compare Plans

Compare two versions of an implementation plan and produce a clear, human-readable summary of every meaningful change — additions, removals, modifications, reorderings — with reasoning where inferable.

## Inputs

- **Original**: first argument or `PLAN.md` (default)
- **Refined**: second argument or `PLAN-REFINED.md` (default)

If neither file exists, tell the user and stop.

## Process

1. **Read both files fully** using the Read tool (no limit/offset).

2. **Diff structurally, not textually.** Don't just run `diff`. Walk both documents section-by-section and identify:
   - **Added sections/phases** — entirely new content
   - **Removed sections/phases** — content that was dropped
   - **Modified sections** — same section, different content (note what specifically changed)
   - **Reordered sections** — phases or steps that moved
   - **Scope changes** — items moved into or out of "What We're NOT Doing"
   - **Success criteria changes** — added, removed, or tightened criteria
   - **Technical approach changes** — different strategy, different files targeted, different APIs used

3. **For each change, explain WHY** if the reason is inferable from context:
   - Does the refined plan address a gap in the original?
   - Does it simplify an over-engineered approach?
   - Does it add missing error handling or edge cases?
   - Does it reflect a scope expansion or reduction?
   - If the reason isn't clear, say so — don't fabricate.

4. **Classify each change by impact**:
   - **🔴 Breaking** — fundamentally changes the approach or scope
   - **🟡 Significant** — meaningfully alters implementation details
   - **🟢 Minor** — clarifications, wording improvements, formatting

## Output Format

```markdown
## Plan Comparison: [Original] → [Refined]

### Summary
[2-3 sentence high-level summary of the overall direction of changes]

### Breaking Changes
- **[Section/Phase]**: [What changed]. *Why: [reason]*

### Significant Changes
- **[Section/Phase]**: [What changed]. *Why: [reason]*

### Minor Changes
- **[Section/Phase]**: [What changed]

### Scope Changes
- **Added to scope**: [items]
- **Removed from scope**: [items]
- **Moved to out-of-scope**: [items]

### Phases Comparison
| Phase | Original | Refined | Change |
|-------|----------|---------|--------|
| 1     | [name]   | [name]  | [delta or "unchanged"] |
| ...   | ...      | ...     | ...    |
```

Omit any section that has no entries (e.g., if there are no breaking changes, skip that heading).

## Guidelines

- Be specific. "Phase 2 changed" is useless. "Phase 2 now targets `auth.ts:45-80` instead of rewriting the entire auth module" is useful.
- Quote brief snippets from both versions when the difference is subtle.
- If the refined plan resolves an open question from the original, call that out explicitly.
- If the refined plan introduces new ambiguity, flag it.
- Keep the tone neutral and informative — this is a changelog, not a review.
