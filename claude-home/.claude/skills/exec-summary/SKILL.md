---
description: "Produce a concise executive summary of planned work — from the current session, a planning artifact (PLAN.md, spec), or a Linear/vima issue. Strips detail; keeps only business-logic and architecture changes, then closes with implications. For stakeholders, not builders. Use when the user says 'exec summary', 'executive summary', 'TL;DR this plan', 'summarize for a stakeholder', or invokes /exec-summary."
---

# Executive Summary

Summarize planned work for a decision-maker who's strapped for time or overwhelmed. Cover only **business-logic changes** (what the system does differently that a user/customer/business notices) and **architecture changes** (structural shifts affecting cost, risk, scale, future work) — then close with **implications** (the so-what: risk, cost, unlock, dependency, migration). Be concise — no length cap, but every sentence earns its place.

Source: whatever the user points at — this session, an artifact (read `PLAN.md`/spec), or a ticket (`mcp__linear__get_issue` / `vima show <id>`). If ambiguous, ask one question; else just write it.

Leave out: file/function names, line numbers, code, task breakdowns, ticket IDs, library choices (unless the choice *is* the architecture decision), hedging, preamble. Lead with the change, not the context. Stop at implications.
