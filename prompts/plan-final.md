You are doing a final consistency pass on a plan that has been refined
through ${TOTAL_PASSES} review iterations.

## Files
- **Plan**: ${REFINED_FILE}
- **Open questions**: ${QUESTIONS_FILE}

## Instructions
1. Read the plan end-to-end. Fix:
   - Internal contradictions (edits from different passes may conflict)
   - **Prose vs code mismatches** — for every code example or snippet, verify it
     implements what the surrounding prose describes. If they disagree, determine
     which is correct from context and fix the other. This is the highest-priority check.
   - Inconsistent terminology
   - Formatting issues
   - Redundant sections
2. Read ${QUESTIONS_FILE}. Clean up:
   - Remove duplicates
   - Remove questions that the plan now answers
   - Group related questions
   - Format as clean markdown with numbered items and severity tags
3. Write the cleaned questions to ${QUESTIONS_FILE} (overwrite).

Output: "Refinement complete. [N] open questions remain."
