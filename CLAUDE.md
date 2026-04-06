# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Single-file bash tool (`ralph`). Autonomous coding loop: spawns a fresh headless Claude Code instance per vima task, with a separate commit agent after each. Based on the [Ralph Loop](https://github.com/snarktank/ralph) pattern.

Runtime deps: `claude`, `vima`, `jq`, `git`

## Key Design

- **Fresh context per ticket** — no conversation carries over; avoids context degradation
- **Integrated loop** — each iteration: worker → commit → reviewer → close (or release if blocked)
- **File-forward reviews** — reviewer files "Fix:" tickets instead of blocking; they appear in `vima ready` next iteration
- **`--from-plan` mode** — lead agent decomposes plan into tag-grouped tickets, spec reviewer validates, then the worker loop runs
- **`--triage` mode** — evaluates open tickets before the worker loop; auto-refines underspecified ones, defers those needing human input (tagged `needs-input`), writes a report for deferred tickets. `--triage-only` stops after triage.
- **Per-agent model selection** — each agent type (lead, spec, worker, commit, reviewer, triage, summary) has its own model default; `--model` overrides all; `claude_as()` helper dispatches
- **Separate commit agent** — second Claude instance stages/commits with `(ticket-id)` in message
- **Untracked file safety** — shelves untracked files before loop, restores after
- **Config precedence**: CLI flags > `.ralphrc` (sourced as bash) > built-in defaults
- `.ralph-rules.md` is injected into the agent prompt by ralph (not loaded by Claude Code)
- **`vima ready` passthrough** — `--tag`, `--type`, `--priority`, `--owner` are passed directly to `vima ready` for filtering

## Editing Notes

- `set -euo pipefail` — handle failures explicitly with `|| true`
- Prompt construction uses heredocs — watch quoting/expansion boundaries
