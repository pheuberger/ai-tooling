---
description: "Run /simplify on the working tree, then /commit-all the result. One invocation, two phases."
---

# Simplify and Commit

You are running the `/simplify` skill, then the `/commit-all` skill, back-to-back.

## Workflow

### 1. Simplify

Invoke the `/simplify` skill on the current working tree changes.

Let it review and apply its fixes. Wait for it to finish.

### 2. Commit

Invoke the `/commit-all` skill to commit the resulting working tree (the user's original changes plus any simplifications) as atomic, logically grouped commits.

## Rules

- Run the two phases sequentially. Do not interleave.
- Do not commit between phases — `/commit-all` handles all commits at the end.
- If `/simplify` makes no changes, still proceed to `/commit-all` to commit the user's original work.
- If `/simplify` reports a blocker (e.g., refuses to modify something), surface it to the user before proceeding to commit.
- Do not summarize what `/simplify` did beyond what that skill already reports — `/commit-all`'s diff is the source of truth.
