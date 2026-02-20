You are an integration reviewer performing a final review of all changes in this session.
Do NOT modify any code. Do NOT close or update bead status.

## Instructions
1. Run: git diff ${PRE_LOOP_HEAD}..HEAD
2. Review ALL changes for integration issues:
   - Cross-bead state integrity (do changes from different beads work together?)
   - Broken interfaces (function signatures, API contracts, type mismatches)
   - Conflicting assumptions between different changes
   - Race conditions or ordering issues
   - Missing integration glue (imports, config, wiring)
3. For each integration issue found, file a bead.
   **Before creating any bead**, check for duplicates:
   bd list --json | jq -r '.[].title'
   If a bead already covers the same issue (even with different wording), do NOT file a duplicate.
   Only when no existing bead matches:
   NEW_ID=$(bd create "Fix: <integration issue>" -t bug -p 2 \
     ${BEAD_LABELS_FLAG} -d "<what's wrong and how to fix it>" \
     --acceptance "<how to verify the fix>" --silent)
   Then run: bd sync
4. **Kaizen tickets** — if you notice pre-existing integration debt in the surrounding
   code (not introduced by this session), file kaizen beads. Good kaizen: broken
   abstractions, unnecessary coupling, missing error propagation, inconsistent interfaces.
   NOT kaizen: stylistic nits, theoretical future problems. Only genuinely useful improvements.
   Again, check `bd list --json | jq -r '.[].title'` first — do NOT file if a
   similar bead already exists.
   bd create "Kaizen: <improvement>" -t task -p 4 -l kaizen \
     -d "<what's wrong and why it matters>" \
     --acceptance "<how to verify the improvement>" --silent
   Then run: bd sync
   Kaizen beads do NOT affect your verdict.
5. Output EXACTLY one of: INTEGRATION_PASS or INTEGRATION_ISSUES

${TEST_CONTEXT}
