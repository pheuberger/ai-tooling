---
description: "Create lean Linear issues optimized for human attention: state the problem, explain why it matters, list acceptance criteria, stop. No implementation suggestions, no walls of text."
---

# Lean Issue

Linear is for humans. Long, heavy issues drown the reader. This skill creates issues a teammate can scan in 30 seconds and know:

1. **What's broken or missing** (the problem)
2. **Why it needs fixing** (the motivation)
3. **What "done" looks like** (acceptance criteria)

Nothing else. No implementation plans, no code excerpts, no architecture diagrams, no exhaustive context dumps. Those belong in a PR description or a comment thread once someone picks the issue up.

## When to use

- User asks to "create an issue", "file a ticket", "open a Linear issue".
- User describes a bug, gap, or follow-up they want captured.
- User explicitly invokes `/lean-issue`.

Do NOT use when:
- A spec/plan already exists and just needs filing → use `plan-to-tickets`.
- The work is in-flight and needs a tracking issue with implementation detail → user wants a regular issue, ask first.

## Workflow

### 1. Understand the ask

Get clarity on:
- What is the problem? (one sentence)
- Why does it matter? (impact / motivation)
- What's the scope boundary? (what's in, what's deferred)

If any of those are unclear from the user's message, ask 1–2 targeted questions. Do not interview the user — they came here to file an issue, not to write a spec.

### 2. Search for duplicates

Before creating, run `mcp__linear__list_issues` with relevant keywords. If a strong match exists, surface it and ask whether to update that issue, file a related one, or skip.

### 3. Draft the issue

Use this exact template. Keep each section tight. If a section has nothing useful to say, omit it — empty sections are noise.

```markdown
## Problem

[2–4 sentences. State the gap or bug in plain language. Name the affected
component/flow. Avoid jargon a new teammate wouldn't recognize.]

## Why this matters

[2–5 bullets. Concrete consequences: contract violation, user impact, data
risk, blocked work, inconsistency with sibling features. Each bullet earns
its place — cut filler.]

## Scope

[1–3 sentences. What's in. What's explicitly deferred. Mention sibling tickets
that cover the deferred parts if they exist.]

## Acceptance criteria

[3–6 bullets. Observable outcomes, not steps. "X behaves like Y" not "edit
file Z to do W". A reviewer should be able to check each one.]

## Related

[Optional. Linear IDs with one-line context each. Skip if nothing relevant.]
```

### 4. Hard rules — what NOT to include

- **No implementation suggestions.** No "we should use X library", "add a function in Y", "modify Z service". The person picking it up will design.
- **No code blocks** unless quoting an exact error message or an exact contract (lexicon field, API response shape) the issue is about.
- **No file paths** unless the bug is locked to one specific file. General gestures at "see services/foo" rot.
- **No history dumps.** "We tried X in PR #123, then refactored in #456…" — belongs in a comment, not the body.
- **No "background" preamble.** The Problem section is the background.
- **No checklists of TODO steps.** Acceptance criteria are observable outcomes, not work breakdown.
- **No emoji, no decorative headers, no horizontal rules** beyond the template.

### 5. Length budget

Target: under 250 words for the description. If you blow past 400, you are writing a spec, not an issue. Split into multiple issues or ask the user whether the extra detail is really needed.

### 6. Title

- Imperative or noun phrase, ≤80 chars.
- Names the thing affected and the gap. "Sync markdown-embedded images in project description to org PDS as blobs" — good. "Improve images" — bad. "Fix bug in publish flow where the markdown editor sometimes drops images on save when the user is editing an existing project" — too long, move detail to body.

### 7. Metadata

Ask only what you can't infer:
- **Team** — usually obvious from project context. Ask if not.
- **Project** — pick from the user's working area; if multiple plausible, ask.
- **Priority** — default Medium (3). Only escalate if user signals urgency or it's a production bug.
- **Labels** — pick obvious ones from existing labels (BE, FE, Bug, etc.). Don't invent.
- **Assignee** — leave unassigned unless user names someone.

### 8. Confirm before creating

Show the drafted issue to the user. Get a thumbs-up or edit instructions. Then create with `mcp__linear__save_issue`.

### 9. After creating

One line: ID, URL, project, priority. Done. Do not narrate.

## Example — what good looks like

User: "We don't sync inline markdown images in the project description to PDS."

Good output:

```markdown
## Problem

Project descriptions are rich-text markdown that may contain inline images.
On publish, the description is written as a Leaflet rich-text record on the
org's PDS, but embedded images are not uploaded as PDS blobs — the leaflet
text keeps referring to our app's storage URLs.

## Why this matters

- PDS records should be portable. Today, a third-party ATProto consumer
  cannot resolve inline images without our backend.
- The org's PDS is supposed to own all media for records it publishes.
- Banner, logo, and gallery images already sync as blobs. Inline description
  images are the remaining gap.

## Scope

Project description on publish/update. Out of scope: project updates, org
description, evidence attachments — file separately if needed.

## Acceptance criteria

- Inline images in project description are uploaded as blobs to the org PDS.
- Published leaflet record references PDS blob CIDs, not source URLs.
- Re-publishing unchanged content does not re-upload existing blobs.
- Images added/removed/replaced between publishes reconcile correctly.

## Related

- MA-742 — parent: project publish to PDS
- MA-1601 — gallery blob size decision applies here too
- MA-1715 — sibling sync gap (video URL)
```

## Anti-example — what to avoid

Bad: 800-word issue with five headers, three code blocks copying the current implementation, a "Proposed approach" section listing four candidate libraries, a "Risks" section, a "Migration plan", and a "Testing strategy". That's a design doc. The issue is "X is missing, here's why we need it, here's how we'll know it's done."

## Rules summary

- Problem → Why → Scope → AC → (optional) Related. Stop.
- Under 250 words. Hard cap 400.
- No implementation suggestions, no file paths, no code dumps.
- Always search for duplicates first.
- Always show draft before creating.
- Default priority Medium.
