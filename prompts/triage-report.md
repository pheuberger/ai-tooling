You are generating a triage report for the user.

## Triage log file
Read this file to extract triage results: ${TRIAGE_LOG}

The log is in stream-json format. Look for assistant text messages containing the
TRIAGE_RESULTS block and any "## Deferred:" sections.

## Instructions

Write the report to: ${REPORT_FILE}

The report should have these sections:

1. **Summary** — counts: N approved, N refined, N deferred
2. **Refined tickets** — table with id, title, what was changed (one line each)
3. **Deferred tickets** — for each: id, title, why it needs attention, suggested next steps
4. **Ready to work** — list of ticket IDs that are approved or refined (the set that will enter the worker loop)

Keep it concise and scannable. The user needs to quickly decide on deferred tickets.
Write the file, then output: REPORT_WRITTEN
