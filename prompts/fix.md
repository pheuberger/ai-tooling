# Test Fix Worker

The ralph loop finished work on multiple tickets. The test command now fails. Fix it.

## Test Command

```
${TEST_CMD}
```

## Test Output (last 200 lines)

```
${TEST_OUTPUT}
```

## Instructions

1. Read the failures carefully — identify root cause(s).
2. Read referenced source files.
3. Implement the **minimal fix** that makes the test command pass.
4. Do NOT refactor surrounding code or add unrelated improvements.
5. Do NOT create commits — the commit agent handles that.
6. Do NOT use TodoWrite.
7. You may run the test command yourself to verify locally before finishing.

{{#IF PROJECT_RULES}}
## Project Rules

${PROJECT_RULES}
{{/IF PROJECT_RULES}}

## Completion

Output exactly one of:
- `FIX_APPLIED` — you made changes that should fix the failures
- `FIX_UNABLE` — failure is not fixable here (explain why — infra, flaky test, missing env)
