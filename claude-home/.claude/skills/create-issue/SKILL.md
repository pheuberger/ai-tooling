---
description: "Capture out-of-scope work: refine high-level spec and push to Linear as a new issue"
---

# Create Issue

You are capturing work that emerged during execution but doesn't fit the current scope. Your job is to refine the idea into a clear Linear issue so it can be picked up later.

## Input

The user provides a brief description of the work they want to capture. This could be:
- A bug they noticed while working on something else
- A refactoring opportunity
- A follow-up feature idea
- Technical debt to address
- A prerequisite that was discovered mid-implementation

If no description is provided, ask the user what they want to capture.

## Workflow

### 1. Understand the Request

Start by understanding what the user wants to capture:
- What is the work?
- Why did it emerge? (What were you working on when you noticed this?)
- Why doesn't it fit current scope?

### 2. High-Level Refinement

Ask 2-3 clarifying questions using `AskUserQuestion` to refine the idea:

**What to clarify:**
- **Impact** — Is this blocking anything? Does it affect users?
- **Scope** — What's the minimum viable version? What's nice-to-have?
- **Context** — Any relevant files, error messages, or observations?
- **Priority** — Urgent (blocking), high (this sprint), medium (backlog), or low (someday)?

Keep it brief — this is high-level refinement, not a full spec. 1-2 rounds of questions max.

### 3. Draft the Issue

Create a draft Linear issue with:

```
Title: <concise, actionable title>

## Background
[1-2 sentences on how this was discovered]

## Problem / Opportunity
[What needs to change and why]

## Proposed Approach (if known)
[High-level direction, not implementation details]
[Optional — omit if unclear]

## Notes
[Any relevant context: file paths, error messages, related issues]

---
Created via /create-issue during work on: <current branch or context>
```

Show the draft to the user for approval.

### 4. Determine Team and Labels

Ask the user which Linear team this belongs to (if not obvious from context).

Ask which label(s) to apply (e.g., feature area, component). Labels are how issues are organized — not parent/child relationships.

### 5. Create in Linear

Use `mcp__linear__create_issue` with:
- `teamId`: The team's ID
- `title`: From the draft
- `description`: From the draft (markdown)
- `priority`: Map user's answer: 1=urgent, 2=high, 3=medium, 4=low

**Labels:** The `mcp-linear` MCP server does not expose a labels parameter on `mcp__linear__create_issue` or `mcp__linear__update_issue`. Instead, append a `Labels: <label1>, <label2>` line to the bottom of the issue description so the label intent is captured. Then tell the user to apply the label(s) in Linear manually.

Display the created issue:
```
Created: XX-XXX — <title>
Priority: <priority>
Link: <issue URL>
⚠ Labels must be applied manually in Linear: <labels>
```

### 6. Offer Next Steps

After creation, offer:
- "Add more context to the issue?" — if they have additional notes
- "Return to current work" — default, just acknowledge and continue

## Rules

- **Keep it fast** — This is a quick capture, not a planning session. 2-3 minutes max.
- **Don't over-specify** — High-level is intentional. Details come when the issue is picked up.
- **Don't start working on it** — The whole point is to defer this to stay focused on current scope.
- **Always link context** — Note what you were working on when this emerged.
- **Default to medium priority** — Unless the user explicitly says urgent/high.
- **Don't create beads** — This creates a Linear issue only. Beads come later via `/start-issue`.

## Examples

**User**: "While fixing the auth bug, I noticed the password validation is duplicated in three places. We should extract it to a shared util."

**You**:
1. Ask: "Is this causing any bugs currently, or purely a refactoring opportunity? And roughly how urgent — should this be done soon or can it wait?"
2. Draft issue titled "Consolidate password validation into shared utility"
3. Create in Linear with priority 3 (medium), note it was discovered during auth bug work

**User**: "We need to add support for WebP images but that's out of scope for this PR."

**You**:
1. Ask: "Is there a specific place where WebP support is needed, or is this a general enhancement? Any user-facing impact if we don't have it?"
2. Draft issue titled "Add WebP image format support"
3. Create in Linear, link to current feature if relevant
