---
description: "Start work on a Linear issue: fetch spec, mark in progress, enter planning mode, refine with questions, checkout branch"
---

# Start Issue

You are beginning work on a Linear issue. Your job is to fetch the issue, understand it deeply through questioning, and produce a refined plan before any code is written.

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

### 3. Enter Planning Mode

Call `EnterPlanMode` to begin spec refinement.

### 4. Interrogate the Spec

This is the core of the command. Read the Linear issue description as a spec and ask the user **non-trivial, non-obvious questions** about it.

**What to ask about:**
- Ambiguities — anything that could be interpreted multiple ways
- Missing details — inputs, outputs, error states, edge cases not addressed
- Architectural implications — how does this fit with existing code? What needs to change?
- Dependencies — what existing code does this build on? What might break?
- Scope boundaries — what is explicitly NOT part of this work?
- User experience — what happens when things go wrong? Loading states? Empty states?
- Data model — does this require schema changes? New fields? Migrations?
- Security — authentication, authorization, input validation implications

**How to ask:**
- Ask 2-4 questions at a time using `AskUserQuestion`
- After each round of answers, ask follow-up questions based on what you learned
- Keep going until the user tells you to stop
- Do NOT ask obvious questions that are clearly answered in the spec
- Do NOT ask trivial questions — every question should surface something the user hasn't explicitly thought through

### 5. Write the Plan

Once the user is satisfied with the questioning, synthesize everything into a plan file:
- The original spec from Linear
- All clarifications from the questioning phase
- Proposed approach
- Files likely to be modified
- Open risks or unknowns

### 6. Checkout Git Branch

Use the `branchName` from the Linear issue:
- If the branch already exists locally: `git checkout <branchName>`
- If not: `git checkout -b <branchName>`

If Linear has no branch name set, **ask the user** — do not generate one.

### 7. Exit Planning Mode

Call `ExitPlanMode` for the user to approve the plan.

After approval, suggest running `/plan-to-beads` to decompose the plan into trackable implementation tasks.

## Rules

- **NEVER skip the questioning phase** — this is the entire point of the command
- **NEVER create beads** — that is `/plan-to-beads`, a separate command
- **NEVER start writing code** — this command is purely about understanding
- Branch names come from Linear — single source of truth
- If the issue is already In Progress, warn but continue
