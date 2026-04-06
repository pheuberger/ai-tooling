# ai-tooling

Autonomous coding tools powered by [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [vima](https://github.com/pheuberger/vima). Based on the [Ralph Loop](https://github.com/snarktank/ralph) pattern.

| Tool | What it does |
|------|-------------|
| [`ralph`](docs/ralph.md) | Autonomous coding loop — picks tickets, spawns a fresh Claude Code instance per task, commits, reviews, repeats |
| [`ralph-plan`](docs/ralph-plan.md) | Self-healing plan refinement — N critic passes through rotating lenses, optional external sparring, final polish |
| [Skills](docs/skills.md) | Interactive Claude Code skills for planning, research, and ticket management (`/create-plan`, `/plan-to-tickets`, etc.) |

## Prerequisites

| Tool | Required by | Purpose |
|------|------------|---------|
| [`claude`](https://docs.anthropic.com/en/docs/claude-code) | both | Claude Code CLI |
| [`vima`](https://github.com/pheuberger/vima) | ralph | vima issue tracker |
| `jq` | both | JSON processing |
| `git` | ralph | Version control |
| `envsubst` | both | Template variable substitution (part of `gettext`) |

### Installing vima

```bash
cargo install --git https://github.com/pheuberger/vima --path vima-cli
```

## Quick start

```bash
# --- ralph: autonomous coding loop ---

# Process all ready tickets
./ralph

# Decompose a plan into tickets, then work them
./ralph --from-plan PLAN.md

# Only high-priority features, with a test gate
./ralph --type feature --priority 1 --test-cmd 'npm test'

# --- ralph-plan: plan refinement ---

# Refine PLAN.md through 5 critic passes
./ralph-plan

# More iterations, with external sparring
./ralph-plan --iterations 8 --sparring-cmd 'gemini chat'

# Add context files for grounding
./ralph-plan my-feature.md --context API-SPEC.md
```

## Configuration

Both tools read from `.ralphrc` in the project root (sourced as bash, CLI flags override). See [`.ralphrc.example`](.ralphrc.example) for all options.

Project-specific agent rules go in `.ralph-rules.md` — see [ralph configuration](docs/ralph.md#configuration) for details.

## Documentation

- **[ralph](docs/ralph.md)** — How the loop works, ticket lifecycle, CLI options, configuration, prompt templates, model selection, logs
- **[ralph-plan](docs/ralph-plan.md)** — Three-phase pipeline, lenses, external sparring, resuming, configuration
- **[Skills & Hooks](docs/skills.md)** — Setup via Stow, skill reference, typical workflow, hooks
