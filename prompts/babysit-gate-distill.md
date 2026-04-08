# Quality Gate Failure Analysis

A quality gate command failed after a worker applied code changes. Analyze the output and produce a concise, actionable summary for the fixing agent.

## Gate Command

`${TEST_CMD}`

## Output (last 500 lines)

```
${TEST_OUTPUT}
```

## Instructions

Produce a structured summary:

1. **What failed**: List each distinct failure (test name, file:line, error type)
2. **Root cause**: Why each failure occurred (type mismatch, missing import, logic error, etc.)
3. **Fix**: Specific, actionable fix for each failure

Be concise. Omit passing tests, success output, and boilerplate. Focus only on what the fixing agent needs to know.

{{#IF ATTEMPT}}
This is attempt ${ATTEMPT}. If you see the same failures repeating, emphasize what was likely missed in the previous fix.
{{/IF ATTEMPT}}
