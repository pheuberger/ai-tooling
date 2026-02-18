# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Single-file bash tool (`ralph-bd`). Autonomous coding loop: spawns a fresh headless Claude Code instance per [beads](https://github.com/snarktank/beads) task, with a separate commit agent after each. Based on the [Ralph Loop](https://github.com/snarktank/ralph) pattern.

Runtime deps: `claude`, `bd`, `jq`, `git`

## Key Design

- **Fresh context per bead** — no conversation carries over; avoids context degradation
- **Integrated loop** — each iteration: worker → commit → reviewer → close (or release if blocked)
- **File-forward reviews** — reviewer files "Fix:" beads instead of blocking; they appear in `bd ready` next iteration
- **`--from-plan` mode** — lead agent decomposes plan into label-grouped beads, spec reviewer validates, then the worker loop runs
- **Per-agent model selection** — each agent type (lead, spec, worker, commit, reviewer, summary) has its own model default; `--model` overrides all; `claude_as()` helper dispatches
- **Separate commit agent** — second Claude instance stages/commits with `(bead-id)` in message
- **Untracked file safety** — shelves untracked files before loop, restores after
- **Config precedence**: CLI flags > `.ralphrc` (sourced as bash) > built-in defaults
- `.ralph-rules.md` is injected into the agent prompt by ralph (not loaded by Claude Code)
- **`bd ready` passthrough** — `--label`, `--type`, `--priority`, `--owner` are passed directly to `bd ready` for filtering

## Editing Notes

- `set -euo pipefail` — handle failures explicitly with `|| true`
- Prompt construction uses heredocs — watch quoting/expansion boundaries
