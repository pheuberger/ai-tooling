---
description: "Ensure clean working tree, push, and open a GitHub PR with a clear title and reviewer-friendly description"
---

# Create PR

You are opening a pull request for the current branch. Before creating it, you ensure the working tree is clean and the branch is pushed. The PR must have a human-readable title and a description that helps reviewers understand **why** this change exists and **how** to verify it.

## Input

The user may optionally provide:
- A target base branch (default: repo's default branch, usually `main`)
- Specific context about what to emphasize in the description

If no arguments are given, proceed with defaults.

## Workflow

### 1. Ensure clean working tree

Run `git status` to check for uncommitted changes (staged, unstaged, or untracked — excluding planning artifacts like `PLAN*.md`, `SPEC*.md`, etc.).

- **If the working tree is dirty:** Run the `commit-all` skill to commit everything properly before continuing. Wait for it to complete.
- **If the working tree is clean:** Continue.

### 2. Ensure branch is pushed

Run `git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null` to check for an upstream.

Then compare local and remote:
```bash
git fetch origin
git rev-list HEAD...@{u} --count --left-right
```

- **If no upstream or local is ahead:** Push with `git push -u origin HEAD`
- **If up to date:** Continue.

### 3. Gather context

Run these in parallel:
- `git log --oneline main..HEAD` — all commits on this branch
- `git diff main...HEAD --stat` — files changed summary
- `git diff main...HEAD` — full diff (skim for understanding, don't reproduce)
- `gh pr list --head $(git branch --show-current) --state open --json number` — check if PR already exists

**If a PR already exists:** Tell the user and offer to update it instead. Stop here unless they confirm.

### 4. Understand the change

Before writing anything, answer these questions for yourself by reading the commits and diff:
1. **What problem does this solve?** (or what capability does it add?)
2. **What was the approach?** (key design decisions, not a file-by-file list)
3. **What's the riskiest part?** (what could break, what deserves scrutiny)
4. **How should a reviewer verify this works?** (manual steps, automated tests, or both)

### 5. Write the PR title

The title must be:
- **A proper capitalized title** — Title Case, no `feat():` prefixes, no conventional-commit style
- **Human readable** — a non-technical PM should understand the gist
- **Action-oriented** — starts with a verb or describes the outcome
- **Under 70 characters**

**Good examples:**
- "Migrate Platform Publishing from Direct PDS to CGS"
- "Add Membership Gating to Lexicon Publishing"
- "Fix Double-Charge Bug in Subscription Renewal"
- "Replace Legacy Auth Middleware with OAuth2 Flow"

**Bad examples:**
- "refactor(platform): migrate org from direct PDS credentials to CGS" (conventional commit format)
- "MA-1381" (just a ticket number)
- "Various fixes and improvements" (vague)
- "Update files" (meaningless)

### 6. Write the PR description

Default template — keep each section tight and scannable:

```markdown
## Why

[1-3 sentences. The problem or motivation. Link the ticket if one exists. A reviewer who reads nothing else should understand why this PR exists.]

## What Changed

[Bulleted summary of the approach and key design decisions. 3-6 bullets. Use a short prose paragraph instead only if narrative genuinely helps.]

## How to Test

[Concrete steps. Be specific: "go to /admin/lexicons, confirm membership warning shows for non-members" — not "verify the page loads".]
```

**Optional sections — add only when they carry signal:**

- **How to Review** — only if reading order is non-obvious or one area deserves extra scrutiny. 1-3 bullets.
- **Risks / Open Questions** — only if real concerns exist. Never write "none".

**Style:**
- Default to bullets; prose only when a narrative reads better
- Lead with **why**, skip the **what** the diff already shows
- Plain language, specific over comprehensive
- No file lists, no commit-by-commit recap
- Whitespace between sections — let it breathe

### 7. Create the PR

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
<description>
EOF
)"
```

If the branch name contains a Linear issue ID (e.g., `ma-1381`), `gh` will typically auto-link it. Don't manually add issue links unless you have a specific URL.

### 8. Report

Display:
```
PR #<number>: <title>
<URL>
```

## Rules

- **NEVER create a PR with uncommitted changes in the working tree** — commit first, always
- **NEVER use conventional commit format for PR titles** — PRs are for humans, not parsers
- **NEVER list files or commits as the description** — synthesize, don't enumerate
- **NEVER create a duplicate PR** — check first, offer to update if one exists
- **NEVER push to main/master directly** — always PR from a feature branch
- **NEVER force push without asking** — if the push fails, diagnose and ask the user
- **The "Why" section is mandatory** — everything else can be trimmed, but "why" cannot
- **Match the quality bar of the best teams** — Stripe, Linear, Vercel. A reviewer should feel respected, not overwhelmed.
