Read each of the following log files. They are outputs from autonomous coding
agents that each worked on a single task.

Log files: ${LOG_LIST}

Write a concise run summary to stdout. Start with a line: "Generated: ${GENERATED_TS}"
Then include these sections:

## Completed
One-line per bead: what was done.

## Learnings & Surprises
Extract anything from the agents' "## Learnings" sections (or from the body
of their output) that was unexpected — spec inaccuracies, pivots, edge cases,
dependency quirks, code structure that differed from expectations.
Group related items. Skip anything that was "None — task matched spec."

## Skipped / Failed
List any beads that failed (if the skip file at ${SKIP_FILE} is non-empty,
read it). Briefly note what went wrong if visible in the logs.

Keep it tight — this is a debrief, not a novel.
