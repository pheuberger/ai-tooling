---
description: "Do a side task in a fresh git worktree off main and open a PR, without ever touching the current worktree or branch. Use when the user is mid-work in a PR/worktree and wants an unrelated change made + shipped in parallel — phrasings like 'can't checkout another branch here', 'open a new worktree and do X there', 'do this on the side', 'ship this without interrupting my current work'."
---

# Isolated PR

The user is actively working in their current worktree (often mid-PR) and **cannot** check out another branch here. They want a separate, unrelated change made and shipped to a PR **in parallel**, with their current worktree left completely untouched.

You accomplish this by spawning a single subagent with its own isolated git worktree. Your session never changes branches, never touches the working tree, never blocks the user.

## Input

The user provides the task to perform (e.g. "remove the cart_hash fallback from the Stripe webhook handlers"). They may also provide:
- A target base branch (default: `main`)
- A branch name (e.g. from Linear/Jira). If absent, derive a sensible `user/short-description` name.
- A ticket id to reference for auto-close (`Closes ABC-123` in the PR body)

## Before launching — resolve ambiguity, don't guess

Settle these in ≤1 short exchange, then go:

1. **Base branch.** Default `main`. But if the task depends on code that lives only in an unmerged branch, branch off that instead. State your choice and why; only ask if genuinely unclear.
2. **Branch name.** Use the user's provided name verbatim (Linear/Jira give exact names). Else derive `user/slug`.
3. **Scope.** Make sure the task is concrete enough to execute end-to-end without checking back. If not, ask the one blocking question.

Do **not** start the agent until base + branch are settled.

## Workflow

Spawn **one** subagent via the `Agent` tool with `isolation: "worktree"`. The worktree is auto-removed when the agent finishes (or if it made no changes). Hand it a complete brief so it runs end-to-end:

1. **Branch** off the chosen base (`git fetch` first, branch from `origin/<base>`) with the chosen branch name.
2. **Make the change** — exactly the scoped task, nothing more.
3. **Verify** — run the project's fast check (typecheck/lint/relevant tests). Use the cheapest check that proves the change is sound. If the repo has a known fast path (e.g. `typecheck:fast`), use it.
4. **Confirm clean** — grep/inspect to prove the intended change landed and nothing stray was left (e.g. the removed symbol no longer appears).
5. **Commit** with a clear conventional message.
6. **Push** and **open a PR** (`gh pr create`) with base = chosen base, a human-readable title, and a body explaining **why** + **how to verify**. Include `Closes <TICKET>` if a ticket was given.
7. **Return** the PR URL, branch name, verification result, and a one-line diff summary.

Tell the agent explicitly: it has its own isolated worktree, so it must **not** assume any state from the parent session, and it operates only within its worktree.

## After the agent returns

Report back tightly:
- PR URL + base
- Branch name
- Verification outcome (clean / failures)
- Diff summary (files, +/−)
- Anything left for the user (e.g. "merge → ticket auto-closes")

Confirm the user's worktree was never touched.

## Guardrails

- **Never** run `git checkout`, `git switch`, branch changes, stash, or any working-tree mutation in the **parent** session. All of that happens inside the agent's isolated worktree only.
- One agent, one task. If the user batches multiple unrelated changes, spawn one isolated agent per change (separate worktrees, separate PRs) unless they ask to bundle.
- If the verification step fails, the agent should report the failure with output rather than force a green PR. Surface it; don't paper over it.
- Don't push to or open a PR against a protected base directly — always via the new branch.
