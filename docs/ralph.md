# ralph

Autonomous coding loop powered by [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [vima](vima). Spawns a fresh Claude Code instance per ready ticket — no conversation history carries over between iterations. State lives in the filesystem and git, not in the LLM's memory. This sidesteps context degradation by treating every iteration as a brand-new session.

Based on the [Ralph Loop](https://github.com/snarktank/ralph) pattern.

## How it works

```
┌──────────────────────────────────────────────────────────┐
│  ralph                                                   │
│                                                          │
│  1. Pick next ready ticket (vima ready / --tickets list) │
│  2. Claim it (vima start → in_progress)                  │
│  3. Build prompt from ticket details + rules             │
│  4. Spawn fresh Claude Code worker instance               │
│  5. On failure: retry up to MAX_RETRIES, then skip       │
│  6. On success: spawn commit agent (stages + commits)    │
│  7. Spawn reviewer — files "Fix:" tickets for any issues │
│  8. Close ticket (or release if reviewer filed blockers) │
│  9. Loop back to 1                                       │
│                                                          │
│  Post-run:                                                │
│    a. Test gate (--test-cmd) — files ticket on failure   │
│    b. Diff stats                                          │
│    c. 3-4 parallel Opus final reviewers (Security,       │
│       Integration, Patterns, Plan Adherence)              │
│    d. Summary from all work logs                          │
│    e. Cost report                                         │
└──────────────────────────────────────────────────────────┘
```

Each Claude Code instance runs with `--print --dangerously-skip-permissions` (headless, no confirmation prompts). The agent is told:

- Do NOT create git commits (the outer loop handles that)
- Do NOT run ticket commands (`vima close`, `vima update`, etc.)
- Focus only on the assigned task
- If genuinely blocked, file a blocker ticket and stop
- End output with a `## Learnings` section

After the coding agent finishes, a separate commit agent stages and commits the changes. It reviews the diff and writes a commit message that follows whatever conventions the project has (picked up from `CLAUDE.md` / `AGENTS.md`).

### Untracked file safety

Before starting, ralph shelves any pre-existing untracked files (except `.vima/` and `.ralph-logs/`) to a temp directory. They're restored after the loop finishes. This prevents `git add -A` inside the loop from accidentally committing your scratch files.

### Worker watchdog

By default, ralph monitors all agent output for activity. If any agent (worker, reviewer, commit, simplify, lead, spec, final review, or summary) produces no output for 15 minutes, the watchdog kills it. For workers, the ticket retries (up to `MAX_RETRIES`) or releases back to `open` status. Other agents fail gracefully — the loop continues.

All agent output streams to log files via `tee` in real time. The watchdog checks each log file's modification time every 30 seconds. Since `--output-format stream-json` streams events continuously during normal operation, a stale log file reliably indicates a stuck process.

Disable with `--no-watchdog` or `WATCHDOG_TIMEOUT=0` in `.ralphrc`. Adjust the timeout with `--watchdog N` (minutes).

### Ticket lifecycle

| Step | Who | What happens |
|------|-----|-------------|
| Pick | ralph | Selects next ticket from `vima ready` or `--tickets` list |
| Claim | ralph | `vima start <id>` |
| Work | Worker agent | Reads ticket details, writes code |
| Commit | Commit agent | `git add -A`, resets `.ralph-logs`, commits with `(ticket-id)` in body |
| Review | Reviewer agent | Reads the diff; files "Fix:" tickets for any issues found |
| Close | ralph | `vima close <id>` (or release if open blockers exist) |

If the coding agent fails after all retries, the ticket is released (`vima update → open`) and added to the skip list.

## CLI options

```
./ralph [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--max-iterations N` | `50` | Maximum total loop iterations |
| `--max-retries N` | `3` | Retries per ticket on Claude failure |
| `--model MODEL` | per-agent | Force ALL agents to this model (overrides per-agent defaults) |
| `--tickets ID[,ID,...]` | — | Process only these tickets, in order. Skips `vima ready`. |
| `--respect-deps` | off | With `--tickets`: skip tickets whose dependencies aren't closed yet. Blocked tickets are re-queued at the end of the list. |
| `--from-plan FILE` | — | Decompose a plan file into tag-grouped tasks, then work them. See [Plan mode](#plan-mode). |
| `--test-cmd CMD` | — | Run `CMD` as a post-loop test gate. Files a ticket and exits 1 on failure. |
| `--watchdog N` | `15` | Kill any agent after N minutes of inactivity. Monitors the log file for writes — if `claude` produces no output for N minutes, the agent is killed. Workers retry (or release after `MAX_RETRIES`); other agents fail gracefully. |
| `--no-watchdog` | — | Disable the inactivity watchdog (`WATCHDOG_TIMEOUT=0`) |
| `--type TYPE` | — | Filter `vima ready` by `issue_type` (`feature`, `bug`, `task`) |
| `--priority N` | — | Only pick tickets with `priority <= N` (0=critical, 1=high, 2=medium, 3=low, 4=backlog) |
| `--owner NAME` | — | Only pick tickets owned by `NAME` |
| `--tag TAG` | — | Filter `vima ready` by tag |
| `-h`, `--help` | — | Print usage and exit |

### Examples

```bash
# Run only critical/high priority features
./ralph --type feature --priority 1

# Specific tickets with dependency awareness
./ralph --tickets auth-1,auth-2,auth-3 --respect-deps

# Decompose a plan into tickets and work them
./ralph --from-plan PLAN.md

# Run with a post-loop test gate
./ralph --from-plan PLAN.md --test-cmd 'npm test'

# Force all agents to a single model, limit iterations
./ralph --model claude-sonnet-4-6 --max-iterations 5

# Only tickets owned by a specific person
./ralph --owner bitbeckers

# Maximum retries for flaky CI environments
./ralph --max-retries 5

# Tighter watchdog (kill after 10 minutes of inactivity)
./ralph --watchdog 10

# Disable watchdog entirely (let workers run as long as they need)
./ralph --no-watchdog
```

## Plan mode

`--from-plan FILE` runs a three-phase pipeline: a lead agent decomposes the plan into tickets, a spec reviewer validates them, then the normal worker loop processes them all. Tasks are grouped by a tag slug derived from the plan title.

```
┌──────────────────────────────────────────────────────────┐
│  --from-plan PLAN.md                                     │
│                                                          │
│  Phase 1 — Lead agent (opus)                             │
│    Reads plan file, derives a tag slug from the title,   │
│    decomposes it into small tasks with vima create.      │
│                                                          │
│  Phase 2 — Spec reviewer (opus)                          │
│    Validates each task is self-contained with file        │
│    paths, function names, and binary acceptance criteria. │
│    Fixes or splits tasks that fail validation.           │
│                                                          │
│  Phase 3 — Worker loop (normal iteration)                │
│    Processes all tasks with the plan tag via vima ready. │
└──────────────────────────────────────────────────────────┘
```

The plan file should be a markdown file with a title on the first line. The plan title is slugified into a tag (e.g. "Add user auth" → `add-user-auth`). The lead agent tags each task with this tag, and the worker loop picks them up via `vima ready --tag <slug>`.

## Configuration

### `.ralphrc`

Per-project configuration file. Place it in the project root (where you run `ralph`). It's sourced as a bash script before CLI arguments are parsed, so **CLI flags override `.ralphrc` values**.

```bash
# .ralphrc — ralph project configuration

# How many total iterations before ralph stops (default: 50)
MAX_ITERATIONS=30

# How many times to retry a ticket if Claude exits non-zero (default: 3)
MAX_RETRIES=5

# Per-agent model overrides (defaults shown below)
# WORKER_MODEL="claude-sonnet-4-6"             # coding worker — well-specified tasks
# REVIEWER_MODEL="claude-sonnet-4-6"           # intermittent code reviewer (per-ticket)
# FINAL_REVIEW_MODEL="claude-opus-4-6"         # parallel final review personas (post-loop)
# COMMIT_MODEL="claude-haiku-4-5-20251001"     # commit agent — trivial mechanical task
# LEAD_MODEL="claude-opus-4-6"                 # lead agent — plan decomposition
# SPEC_MODEL="claude-opus-4-6"                 # spec reviewer — validates task specs
# SUMMARY_MODEL="claude-haiku-4-5-20251001"    # post-run summary

# Force ALL agents to a single model (overrides per-agent settings above)
# MODEL="claude-sonnet-4-6"

# Filter tickets by issue_type (default: "" = all types)
FILTER_TYPE="feature"

# Only process tickets with priority <= this value (default: "" = all priorities)
# 0=critical, 1=high, 2=medium, 3=low, 4=backlog
FILTER_PRIORITY=2

# Only process tickets owned by this name (default: "" = all owners)
FILTER_OWNER="bitbeckers"

# Filter tickets by tag (default: "" = all tags)
FILTER_TAG=""

# Post-loop test command (default: "" = no test gate)
# TEST_CMD="npm test"

# Kill worker after N minutes of inactivity (default: 15, 0=disabled)
# WATCHDOG_TIMEOUT=15

# Where to write logs (default: ".ralph-logs")
LOG_DIR=".ralph-logs"

# Path to project-specific rules file (default: ".ralph-rules.md")
RALPH_RULES_FILE=".ralph-rules.md"
```

You don't need to set every variable — only override what you want to change. Since `.ralphrc` is just bash, you can use conditionals or environment variables:

```bash
# .ralphrc — use opus for workers in CI (cost is less of a concern), sonnet locally
if [[ -n "$CI" ]]; then
  WORKER_MODEL="claude-opus-4-6"
  MAX_RETRIES=5
else
  MAX_RETRIES=3
fi
```

**Precedence order** (highest wins):
1. CLI flags (`--max-retries 5`)
2. `.ralphrc` values
3. Built-in defaults

> **Note:** `TICKET_IDS`, `EXPLICIT_MODE`, `RESPECT_DEPS`, and `PLAN_FILE` are not settable via `.ralphrc` — they only make sense as CLI arguments.

### `.ralph-rules.md`

Project-specific instructions injected into every agent prompt. Use this for rules that are specific to how ralph should work in your project — things that don't belong in `AGENTS.md` or `CLAUDE.md` (which Claude Code loads automatically).

The file contents are inserted as a `## Project Rules` section in the agent prompt, between `## Rules` (ralph's built-in rules) and `## When you are done`. If the file doesn't exist, this section is silently omitted.

Example `.ralph-rules.md`:

```markdown
- Always run `pnpm test` after making changes to verify nothing is broken.
- This project uses a monorepo. Check which package a ticket belongs to before editing files.
- Do NOT modify files in `packages/shared/` — those require a separate review process.
- When adding new API endpoints, also add an integration test in `tests/api/`.
- Use the `logger` util from `src/lib/logger.ts` instead of console.log.
```

The path is configurable via `RALPH_RULES_FILE` in `.ralphrc` if you want a different name or location:

```bash
# .ralphrc
RALPH_RULES_FILE="docs/ralph-instructions.md"
```

## Prompt templates

All agent prompts live in `prompts/*.md` as standalone markdown files. This makes them easy to find, edit, and iterate on without touching the main script.

```
prompts/
  lead.md                      # Plan decomposition (--from-plan)
  spec-review.md               # Spec validation (--from-plan)
  worker.md                    # Main coding agent
  commit.md                    # Commit agent
  review.md                    # Per-ticket reviewer
  final-review-security.md     # Final review: security persona
  final-review-integration.md  # Final review: integration persona
  final-review-patterns.md     # Final review: codebase patterns persona
  final-review-plan.md         # Final review: plan adherence persona
  summary.md                   # Post-run summary
```

### Template format

Templates use `${VAR_NAME}` placeholders (UPPER_SNAKE_CASE) and optional `{{#IF VAR}}`/`{{/IF VAR}}` conditional blocks:

```markdown
You are a coding agent working on a single task.

- If blocked, file a blocker:
    NEW_ID=$(vima create "Blocker: <description>" -t bug -p 1 ${TICKET_TAGS} --silent)
{{#IF PROJECT_RULES}}

## Project Rules
${PROJECT_RULES}
{{/IF PROJECT_RULES}}

## Task
${TICKET_DETAILS}
```

Variable substitution is handled by `envsubst` with an explicit variable list — only named variables are replaced. Literal `$` in agent instructions (like `$(vima create ...)`) are left untouched. No `eval` is used.

### Customizing prompts

Override `PROMPTS_DIR` to point to a custom directory:

```bash
# .ralphrc
PROMPTS_DIR="/path/to/my/prompts"
```

Or edit the files in `prompts/` directly. Each call site in `ralph` exports only the variables that template needs, scoped in a subshell:

```bash
claude_as "$COMMIT_MODEL" -p "$(
  export TICKET_ID="$ticket_id"
  render_prompt "$PROMPTS_DIR/commit.md" TICKET_ID
)"
```

## Logs

All output goes to `.ralph-logs/` (configurable via `LOG_DIR`):

| File | Contents |
|------|----------|
| `iter-<N>-<ticket-id>.log` | Full Claude Code output for the worker agent |
| `iter-<N>-<ticket-id>-commit.log` | Commit agent output |
| `iter-<N>-<ticket-id>-review.log` | Reviewer agent output |
| `lead-<HHMMSS>.log` | Lead agent output (`--from-plan` only) |
| `spec-review-<HHMMSS>.log` | Spec reviewer output (`--from-plan` only) |
| `test-gate-<HHMMSS>.log` | Test gate output (`--test-cmd` only) |
| `final-review-security-<HHMMSS>.log` | Security reviewer output |
| `final-review-integration-<HHMMSS>.log` | Integration reviewer output |
| `final-review-patterns-<HHMMSS>.log` | Codebase patterns reviewer output |
| `final-review-plan-<HHMMSS>.log` | Plan adherence reviewer output (when plan context exists) |
| `.skipped` | Ticket IDs that failed after all retries |
| `summary-<date>.md` | Post-run summary (generated by a final Claude instance) |

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
  Models: worker=claude-sonnet-4-6  reviewer=claude-sonnet-4-6  commit=claude-haiku-4-5-20251001
          final-review=claude-opus-4-6
          summary=claude-haiku-4-5-20251001
─────────────────────────────────────────────────────────────────
```

## How it interacts with Claude Code configuration

Ralph spawns Claude Code instances that inherit your project's configuration:

- **`CLAUDE.md`** — Loaded automatically by Claude Code. Put general project instructions here (coding style, architecture overview, tech stack).
- **`AGENTS.md`** — Loaded automatically by Claude Code. Put codebase conventions, commit message format, and patterns here.
- **`.ralph-rules.md`** — Loaded by ralph and injected into the agent prompt. Put ralph-specific behavioral rules here (e.g., "always run tests", "don't touch package X").

The commit agent also picks up project conventions from `CLAUDE.md` / `AGENTS.md` automatically — there's no hardcoded commit format.

## Model selection

Each agent type has a default model matched to its cognitive demand:

| Agent | Default | Rationale |
|-------|---------|-----------|
| Lead | opus | Architectural reasoning, task boundary decisions — quality here determines everything downstream |
| Spec reviewer | opus | Catches ambiguity and missing context in task specs |
| Worker | sonnet | Tasks are well-specified with file paths and acceptance criteria — Sonnet's sweet spot |
| Commit | haiku | Mechanical: stage files, read diff, write message |
| Reviewer | sonnet | Per-ticket check with cumulative diff context — good enough for quick checks |
| Final review | opus | 3-4 parallel personas (Security, Integration, Patterns, Plan Adherence) after all work is done |
| Summary | haiku | Reading logs and writing a debrief |

The Ralph Loop design deliberately front-loads reasoning (lead + spec review produce detailed, self-contained specs), which means workers can run on a faster, cheaper model without sacrificing quality. Intermittent reviews run on Sonnet for cost efficiency; the post-loop final review personas run on Opus as a thorough safety net with cross-persona coverage.

`--model` overrides everything to a single model, useful for testing or when you want uniform behavior. Per-agent models are configurable via `.ralphrc` (e.g. `WORKER_MODEL`, `REVIEWER_MODEL`, `FINAL_REVIEW_MODEL`).

## Tips

- **Start small.** Run with `--tickets` on 1-2 tickets first to verify the setup works before letting it loose on `vima ready`.
- **Write detailed ticket specs.** Each Claude instance starts from scratch. The ticket description is all it has. The more context in the ticket, the better the output.
- **Use `.ralph-rules.md` for guardrails.** If agents keep doing something you don't want (skipping tests, editing the wrong files), add a rule.
- **Check the logs.** If a ticket fails or the commit looks wrong, the answer is in `.ralph-logs/`.
- **Commit conventions are automatic.** Put your preferred commit format in `AGENTS.md` and the commit agent will follow it. No need to configure ralph.
