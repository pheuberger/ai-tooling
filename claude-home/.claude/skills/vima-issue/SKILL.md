---
description: "Capture a problem as a vima ticket for fresh-context handoff mid-conversation. States the problem only — no solutions, no file paths, no AC. No codebase scanning."
---

# vima-issue

Hand a decayed-context problem to a fresh agent. Ticket states the gap; fresh agent designs.

## Rules

- No codebase scanning, no duplicate search, no subagents. Draft from conversation memory.
- **No solutions.** No libraries, approaches, file paths (unless bug locked to one file), step lists, implementation verbs (refactor / wire up / extract).
- Allowed: symptom, gap, impact, constraints the fresh agent shouldn't re-derive, approaches the user explicitly ruled out + why.
- No AC unless user asks — fresh agent defines with user.
- Body ≤200 words.

## Template

```markdown
## Problem
[2–4 sentences. Symptom/gap. Name affected component.]

## Why it matters
[2–5 bullets. Concrete impact.]

## Constraints
[Optional. Facts to skip re-deriving. Not solutions.]

## Out of scope
[Optional. Deferred + why.]
```

Title ≤80 chars, names thing + gap.

## Flow

1. Draft title + body from conversation. Show to user. Wait for ok.
2. Create:
   ```bash
   vima create "<title>" --type <bug|feature|task|chore> --description - <<'EOF'
   <body>
   EOF
   ```
   Ask `--type` only if ambiguous.
3. Report: `Filed: <id> — <title>`. Stop.
