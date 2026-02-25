You are doing a final consistency pass on a plan that has been refined
through ${TOTAL_PASSES} review iterations.

## Files
- **Plan**: ${REFINED_FILE}
- **Open questions**: ${QUESTIONS_FILE}

## Instructions
1. Read the plan end-to-end. Fix:
   - Internal contradictions (edits from different passes may conflict)
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
