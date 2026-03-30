You are generating a concise summary of changes made during plan refinement.

## Files
- **Original plan**: ${ORIGINAL_FILE}
- **Refined plan**: ${REFINED_FILE}
- **Open questions**: ${QUESTIONS_FILE}

## Instructions
1. Read the original plan and the refined plan.
2. Read the open questions file.
3. Compare the two plans and produce a structured summary. Print it directly to
   stdout (do NOT write it to a file).

## Output format

Print EXACTLY this structure (using markdown). Keep each bullet to 1-2 sentences.
Omit a section if it has no items (but there should almost always be changes).

```
## What changed

### Added
- [new sections, requirements, details, constraints, etc.]

### Removed
- [sections, requirements, or details that were cut]

### Changed
- [existing content that was rewritten, clarified, or corrected — and why]

### Open questions (need your input)
- [list each question from the questions file, one bullet per question]
```

Keep it scannable — no long paragraphs. Focus on substance, not formatting tweaks.
If the questions file is empty, write "None — all questions were resolved during refinement."
