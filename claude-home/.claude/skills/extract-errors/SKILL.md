---
description: "Extract errors from raw tool output (tests, builds, lint, type-check, CI) via Haiku subagent. Verbatim messages, file paths, line numbers. No analysis, no fixes. Use when user pastes failing output and asks to extract/list errors, or invokes /extract-errors."
---

# Extract Errors

One job: noisy output → clean error list. Verbatim. No analysis.

## When

- User pastes failing test/build/lint/CI output, asks to extract or list errors.
- User invokes `/extract-errors`.

Skip if user wants the bug **fixed** (extract separately first if needed) or output is already short.

## Rules

1. **Delegate to Haiku.** One `Agent` call, `subagent_type: "general-purpose"`, `model: "haiku"`. Don't process raw output in main context.
2. **No analysis.** No root-cause guesses, fix suggestions, severity, commentary.
3. **Preserve detail.** Messages, paths, line:col, expected/received, user-code stack frames, exit codes — verbatim.
4. **Drop noise.** Separators, progress bars, timing, color codes, banners, `[N/M]` counters.
5. **Return subagent output unchanged.** No wrapping summary.

## Subagent prompt

```
Extract errors from output. Verbatim. No analysis, fixes, severity, or commentary.

Per failure, include when present:
- Test/target name or error type
- File path + line:col
- Error message exactly as written
- Expected/received if shown
- Stack frame closest to user code (skip framework internals)

Drop: separators, progress bars, timing, color codes, banners, counters, summary tables.

Format: one block per error, blank line between. No preamble or closing. Zero errors → output "No errors found."

Input:
<<<
{{RAW_OUTPUT or file:PATH}}
>>>
```

If command must run first, capture via `2>&1 | tee /tmp/extract-XXXX.log`, pass path.
