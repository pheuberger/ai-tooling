# ralph-bd.sh

Autonomous coding loop powered by [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [beads](https://github.com/snarktank/beads). Spawns a fresh Claude Code instance per ready bead — no conversation history carries over between iterations. State lives in the filesystem and git, not in the LLM's memory. This sidesteps context degradation by treating every iteration as a brand-new session.

Based on the [Ralph Loop](https://github.com/snarktank/ralph) pattern.

## Prerequisites

| Tool | Purpose |
|------|---------|
| `claude` | [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) |
| `bd` | [beads](https://github.com/snarktank/beads) issue tracker |
| `jq` | JSON processing |
| `git` | Version control |

All four must be on your `PATH`.

## Quick start

```bash
# Process all ready beads in priority order
./ralph-bd.sh

# Process specific beads
./ralph-bd.sh --beads feat-12,feat-13,bug-7

# Only bugs, max 10 iterations
./ralph-bd.sh --type bug --max-iterations 10
```

## How it works

```
┌─────────────────────────────────────────────────────┐
│  ralph-bd.sh                                        │
│                                                     │
│  1. Pick next ready bead (bd ready / --beads list)  │
│  2. Claim it (bd update → in_progress)              │
│  3. Build prompt from bead details + rules          │
│  4. Spawn fresh Claude Code instance                │
│  5. On success: spawn commit agent, close bead      │
│  6. On failure: retry up to MAX_RETRIES, then skip  │
│  7. Loop back to 1                                  │
│                                                     │
│  Post-run: generate summary from all work logs      │
└─────────────────────────────────────────────────────┘
```

Each Claude Code instance runs with `--print --dangerously-skip-permissions` (headless, no confirmation prompts). The agent is told:

- Do NOT create git commits (the outer loop handles that)
- Do NOT run bead commands (`bd close`, `bd update`, etc.)
- Focus only on the assigned task
- End output with a `## Learnings` section

After the coding agent finishes, a separate commit agent stages and commits the changes. It reviews the diff and writes a commit message that follows whatever conventions the project has (picked up from `CLAUDE.md` / `AGENTS.md`).

### Untracked file safety

Before starting, ralph shelves any pre-existing untracked files (except `.beads/` and `.ralph-logs/`) to a temp directory. They're restored after the loop finishes. This prevents `git add -A` inside the loop from accidentally committing your scratch files.

### Bead lifecycle

| Step | Who | What happens |
|------|-----|-------------|
| Pick | ralph | Selects next bead from `bd ready` or `--beads` list |
| Claim | ralph | `bd update <id> --status=in_progress` |
| Work | Claude agent | Reads bead details, writes code |
| Commit | Commit agent | `git add -A`, resets `.beads`/`.ralph-logs`, commits |
| Close | ralph | `bd close <id>` |
| Sync | ralph | `bd sync` |

If the coding agent fails after all retries, the bead is released (`bd update → open`) and added to the skip list.

## CLI options

```
./ralph-bd.sh [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--max-iterations N` | `50` | Maximum total loop iterations |
| `--max-retries N` | `3` | Retries per bead on Claude failure |
| `--model MODEL` | CLI default | Claude model override (e.g. `claude-sonnet-4-5-20250929`) |
| `--beads ID[,ID,...]` | — | Process only these beads, in order. Skips `bd ready`. |
| `--respect-deps` | off | With `--beads`: skip beads whose dependencies aren't closed yet. Blocked beads are re-queued at the end of the list. |
| `--type TYPE` | — | Filter `bd ready` by `issue_type` (`feature`, `bug`, `task`) |
| `--priority N` | — | Only pick beads with `priority <= N` (0=critical, 1=high, 2=medium, 3=low, 4=backlog) |
| `-h`, `--help` | — | Print usage and exit |

### Examples

```bash
# Run only critical/high priority features
./ralph-bd.sh --type feature --priority 1

# Specific beads with dependency awareness
./ralph-bd.sh --beads auth-1,auth-2,auth-3 --respect-deps

# Use a specific model, limit iterations
./ralph-bd.sh --model claude-sonnet-4-5-20250929 --max-iterations 5

# Maximum retries for flaky CI environments
./ralph-bd.sh --max-retries 5
```

## Configuration files

Both files are optional. Ralph works out of the box without them.

### `.ralphrc`

Per-project configuration file. Place it in the project root (where you run `ralph-bd.sh`). It's sourced as a bash script before CLI arguments are parsed, so **CLI flags override `.ralphrc` values**.

```bash
# .ralphrc — ralph-bd.sh project configuration

# How many total iterations before ralph stops (default: 50)
MAX_ITERATIONS=30

# How many times to retry a bead if Claude exits non-zero (default: 3)
MAX_RETRIES=5

# Claude model to use (default: "" = CLI default)
MODEL="claude-sonnet-4-5-20250929"

# Filter beads by issue_type (default: "" = all types)
FILTER_TYPE="feature"

# Only process beads with priority <= this value (default: "" = all priorities)
# 0=critical, 1=high, 2=medium, 3=low, 4=backlog
FILTER_PRIORITY=2

# Where to write logs (default: ".ralph-logs")
LOG_DIR=".ralph-logs"

# Path to project-specific rules file (default: ".ralph-rules.md")
RALPH_RULES_FILE=".ralph-rules.md"
```

You don't need to set every variable — only override what you want to change. Since `.ralphrc` is just bash, you can use conditionals or environment variables:

```bash
# .ralphrc — use sonnet locally, opus in CI
if [[ -n "$CI" ]]; then
  MODEL="claude-opus-4-6"
  MAX_RETRIES=5
else
  MODEL="claude-sonnet-4-5-20250929"
  MAX_RETRIES=3
fi
```

**Precedence order** (highest wins):
1. CLI flags (`--max-retries 5`)
2. `.ralphrc` values
3. Built-in defaults

> **Note:** `BEAD_IDS`, `EXPLICIT_MODE`, and `RESPECT_DEPS` are not settable via `.ralphrc` — they only make sense as CLI arguments.

### `.ralph-rules.md`

Project-specific instructions injected into every agent prompt. Use this for rules that are specific to how ralph should work in your project — things that don't belong in `AGENTS.md` or `CLAUDE.md` (which Claude Code loads automatically).

The file contents are inserted as a `## Project Rules` section in the agent prompt, between `## Rules` (ralph's built-in rules) and `## When you are done`. If the file doesn't exist, this section is silently omitted.

Example `.ralph-rules.md`:

```markdown
- Always run `pnpm test` after making changes to verify nothing is broken.
- This project uses a monorepo. Check which package a bead belongs to before editing files.
- Do NOT modify files in `packages/shared/` — those require a separate review process.
- When adding new API endpoints, also add an integration test in `tests/api/`.
- Use the `logger` util from `src/lib/logger.ts` instead of console.log.
```

The path is configurable via `RALPH_RULES_FILE` in `.ralphrc` if you want a different name or location:

```bash
# .ralphrc
RALPH_RULES_FILE="docs/ralph-instructions.md"
```

## Logs

All output goes to `.ralph-logs/` (configurable via `LOG_DIR`):

| File | Contents |
|------|----------|
| `iter-<N>-<bead-id>.log` | Full Claude Code output for the coding agent |
| `iter-<N>-<bead-id>-commit.log` | Commit agent output |
| `.skipped` | Bead IDs that failed after all retries |
| `summary.md` | Post-run summary (generated by a final Claude instance) |

Add `.ralph-logs` to your `.gitignore`:

```
# .gitignore
.ralph-logs/
```

## Startup banner

When ralph starts, it prints its configuration. With `.ralphrc` and `.ralph-rules.md` present:

```
Ralph Loop starting (max_iterations=30, max_retries=5)
  Config: .ralphrc loaded
  Rules: .ralph-rules.md loaded
  Filter type: feature
  Filter priority: <= 2
=================================================================
```

## How it interacts with Claude Code configuration

Ralph spawns Claude Code instances that inherit your project's configuration:

- **`CLAUDE.md`** — Loaded automatically by Claude Code. Put general project instructions here (coding style, architecture overview, tech stack).
- **`AGENTS.md`** — Loaded automatically by Claude Code. Put codebase conventions, commit message format, and patterns here.
- **`.ralph-rules.md`** — Loaded by ralph and injected into the agent prompt. Put ralph-specific behavioral rules here (e.g., "always run tests", "don't touch package X").

The commit agent also picks up project conventions from `CLAUDE.md` / `AGENTS.md` automatically — there's no hardcoded commit format.

## Tips

- **Start small.** Run with `--beads` on 1-2 beads first to verify the setup works before letting it loose on `bd ready`.
- **Write detailed bead specs.** Each Claude instance starts from scratch. The bead description is all it has. The more context in the bead, the better the output.
- **Use `.ralph-rules.md` for guardrails.** If agents keep doing something you don't want (skipping tests, editing the wrong files), add a rule.
- **Check the logs.** If a bead fails or the commit looks wrong, the answer is in `.ralph-logs/`.
- **Commit conventions are automatic.** Put your preferred commit format in `AGENTS.md` and the commit agent will follow it. No need to configure ralph.
