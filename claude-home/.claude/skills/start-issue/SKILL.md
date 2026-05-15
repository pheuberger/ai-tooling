---
description: "Start work on a Linear issue: fetch spec, mark in progress, grill the user via /grill-me, checkout branch, write plan"
---

# Start Issue

You are beginning work on a Linear issue. Your job is to fetch the issue, understand it deeply via the `/grill-me` skill, and produce a refined plan before any code is written.

## Input

The user provides a Linear issue identifier as an argument (e.g., `ME-123`, `MA-558`, or a full issue ID).

If no argument is provided, ask the user which Linear issue to start.

## Workflow

### 1. Fetch the Issue

Use `mcp__linear-server__get_issue` with the provided identifier to retrieve:
- Title, description, status, assignee, priority
- `branchName` (git branch)
- Any sub-issues or relations (use `includeRelations: true`)

Display a summary to the user:
```
Issue:    XX-123 — <title>
Status:   <current status>
Priority: <priority>
Branch:   <branchName>
```

If the issue description contains images, use `mcp__linear-server__extract_images` to view them.

### 2. Mark as In Progress

Use `mcp__linear-server__update_issue` to set the issue state to "In Progress".

### 3. Grill the User

Invoke the `/grill-me` skill to interrogate the spec. Do **not** enter planning mode.

Frame the grilling around the Linear issue: ambiguities, missing details, architectural fit, dependencies, scope boundaries, error/edge cases, data model, security. Walk down each branch of the decision tree until shared understanding is reached.

Per `/grill-me` rules: if a question can be answered by exploring the codebase, explore instead of asking. For every question asked, provide a recommended answer.

Continue until the user signals they are satisfied.

### 4. Write the Plan

Synthesize everything into `PLAN.md` in the project root:
- Original spec from Linear
- Clarifications from the grilling phase
- Proposed approach
- Files likely to be modified
- Open risks or unknowns

### 5. Checkout Git Branch

Use the `branchName` from the Linear issue:
- If branch exists locally: `git checkout <branchName>`
- If not: `git checkout -b <branchName>`

If Linear has no branch name set, **ask the user** — do not generate one.

### 6. Suggest Next Steps

After `PLAN.md` is written and branch is checked out, suggest:
1. Run `./ralph-plan` to refine `PLAN.md` through multiple critic passes (produces `PLAN-REFINED.md`)
2. Run `/plan-to-tickets` to decompose the refined plan into trackable implementation tasks

## Rules

- **NEVER skip the grilling phase** — `/grill-me` is the core of this command
- **NEVER enter planning mode** — grilling happens in normal mode
- **NEVER create tickets** — that is `/plan-to-tickets`, a separate command
- **NEVER start writing code** — this command is purely about understanding
- Branch names come from Linear — single source of truth
- If the issue is already In Progress, warn but continue
