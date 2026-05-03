---
description: "Use when user mentions vima, says 'vima ticket/issue', asks what's ready/blocked in vima, or refers to vima. Vima is a local agent-first ticketing CLI — NOT Linear. When vima is mentioned, do NOT reach for Linear MCP tools. Run `vima help` for command details."
---

# vima

Local file-based agent-first ticketing CLI. Tickets live in `.vima/` at repo root. No web UI, no MCP server — only the `vima` binary on PATH. JSON-by-default output for agent consumption.

## Trigger — vima, NOT Linear

Use vima when:
- User says "vima" anywhere ("vima ticket", "vima ready", "close vima X").
- Repo has `.vima/` and user says "ticket"/"issue"/"ready" without naming Linear.
- `ralph` context — ralph consumes vima tickets exclusively.

**Never call `mcp__linear__*` when the target is vima.** Ambiguous → ask.

## How to use it

Run `vima help` (and `vima help <cmd>`) — that's the source of truth. Don't guess flags.

Two conventions worth knowing up front:
- **Default output is JSON.** `--pretty` is humans-only; never from an agent.
- **`--pluck <field>`** extracts one field. Prefer over `jq` for single-field reads.

That's it. Everything else is in `vima help`.
