# ralph-bd

Autonomous coding loop powered by [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [beads](https://github.com/snarktank/beads). Spawns a fresh Claude Code instance per ready bead — no conversation history carries over between iterations. State lives in the filesystem and git, not in the LLM's memory. This sidesteps context degradation by treating every iteration as a brand-new session.

Based on the [Ralph Loop](https://github.com/snarktank/ralph) pattern.

## Prerequisites

| Tool | Purpose |
|------|---------|
| `claude` | [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) |
| `bd` | [beads](https://github.com/snarktank/beads) issue tracker |
| `jq` | JSON processing |
| `git` | Version control |

| `envsubst` | Template variable substitution (part of `gettext`) |

All five must be on your `PATH`.

## Quick start

```bash
# Process all ready beads in priority order
./ralph-bd

# Process specific beads
./ralph-bd --beads feat-12,feat-13,bug-7

# Only bugs, max 10 iterations
./ralph-bd --type bug --max-iterations 10

# Decompose a plan into beads, then work them all
./ralph-bd --from-plan PLAN.md
```

## How it works

```
┌──────────────────────────────────────────────────────────┐
│  ralph-bd                                                │
│                                                          │
│  1. Pick next ready bead (bd ready / --beads list)       │
│  2. Claim it (bd update → in_progress)                   │
│  3. Build prompt from bead details + rules               │
│  4. Spawn fresh Claude Code worker instance               │
│  5. On failure: retry up to MAX_RETRIES, then skip       │
│  6. On success: spawn commit agent (stages + commits)    │
│  7. Spawn reviewer — files "Fix:" beads for any issues   │
│  8. Close bead (or release if reviewer filed blockers)   │
│  9. Loop back to 1                                       │
│                                                          │
│  Post-run:                                                │
│    a. Test gate (--test-cmd) — files bead on failure     │
│    b. Diff stats                                          │
│    c. 3-4 parallel Opus final reviewers (Security,       │
│       Integration, Patterns, Plan Adherence)              │
│    d. Summary from all work logs                          │
│    e. Cost report                                         │
└──────────────────────────────────────────────────────────┘
```

Each Claude Code instance runs with `--print --dangerously-skip-permissions` (headless, no confirmation prompts). The agent is told:

- Do NOT create git commits (the outer loop handles that)
- Do NOT run bead commands (`bd close`, `bd update`, etc.)
- Focus only on the assigned task
- If genuinely blocked, file a blocker bead and stop
- End output with a `## Learnings` section

After the coding agent finishes, a separate commit agent stages and commits the changes. It reviews the diff and writes a commit message that follows whatever conventions the project has (picked up from `CLAUDE.md` / `AGENTS.md`).

### Untracked file safety

Before starting, ralph shelves any pre-existing untracked files (except `.beads/` and `.ralph-logs/`) to a temp directory. They're restored after the loop finishes. This prevents `git add -A` inside the loop from accidentally committing your scratch files.

### Bead lifecycle

| Step | Who | What happens |
|------|-----|-------------|
| Pick | ralph | Selects next bead from `bd ready` or `--beads` list |
| Claim | ralph | `bd update <id> --status=in_progress` |
| Work | Worker agent | Reads bead details, writes code |
| Commit | Commit agent | `git add -A`, resets `.ralph-logs`, commits with `(bead-id)` in body |
| Review | Reviewer agent | Reads the diff; files "Fix:" beads for any issues found |
| Close | ralph | `bd close <id>` (or release if open blockers exist) |
| Sync | ralph | `bd sync` |

If the coding agent fails after all retries, the bead is released (`bd update → open`) and added to the skip list.

## CLI options

```
./ralph-bd [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--max-iterations N` | `50` | Maximum total loop iterations |
| `--max-retries N` | `3` | Retries per bead on Claude failure |
| `--model MODEL` | per-agent | Force ALL agents to this model (overrides per-agent defaults) |
| `--beads ID[,ID,...]` | — | Process only these beads, in order. Skips `bd ready`. |
| `--respect-deps` | off | With `--beads`: skip beads whose dependencies aren't closed yet. Blocked beads are re-queued at the end of the list. |
| `--from-plan FILE` | — | Decompose a plan file into label-grouped tasks, then work them. See [Plan mode](#plan-mode). |
| `--test-cmd CMD` | — | Run `CMD` as a post-loop test gate. Files a bead and exits 1 on failure. |
| `--type TYPE` | — | Filter `bd ready` by `issue_type` (`feature`, `bug`, `task`) |
| `--priority N` | — | Only pick beads with `priority <= N` (0=critical, 1=high, 2=medium, 3=low, 4=backlog) |
| `--owner NAME` | — | Only pick beads owned by `NAME` |
| `--label LABEL` | — | Filter `bd ready` by label |
| `-h`, `--help` | — | Print usage and exit |

### Examples

```bash
# Run only critical/high priority features
./ralph-bd --type feature --priority 1

# Specific beads with dependency awareness
./ralph-bd --beads auth-1,auth-2,auth-3 --respect-deps

# Decompose a plan into beads and work them
./ralph-bd --from-plan PLAN.md

# Run with a post-loop test gate
./ralph-bd --from-plan PLAN.md --test-cmd 'npm test'

# Force all agents to a single model, limit iterations
./ralph-bd --model claude-sonnet-4-6 --max-iterations 5

# Only beads owned by a specific person
./ralph-bd --owner bitbeckers

# Maximum retries for flaky CI environments
./ralph-bd --max-retries 5
```

## Plan mode

`--from-plan FILE` runs a three-phase pipeline: a lead agent decomposes the plan into beads, a spec reviewer validates them, then the normal worker loop processes them all. Tasks are grouped by a label slug derived from the plan title.

```
┌──────────────────────────────────────────────────────────┐
│  --from-plan PLAN.md                                     │
│                                                          │
│  Phase 1 — Lead agent (opus)                             │
│    Reads plan file, derives a label slug from the title, │
│    decomposes it into small tasks with bd create.        │
│                                                          │
│  Phase 2 — Spec reviewer (opus)                          │
│    Validates each task is self-contained with file        │
│    paths, function names, and binary acceptance criteria. │
│    Fixes or splits tasks that fail validation.           │
│                                                          │
│  Phase 3 — Worker loop (normal iteration)                │
│    Processes all tasks with the plan label via bd ready. │
└──────────────────────────────────────────────────────────┘
```

The plan file should be a markdown file with a title on the first line. Example:

```bash
./ralph-bd --from-plan PLAN.md
```

The plan title is slugified into a label (e.g. "Add user auth" → `add-user-auth`). The lead agent tags each task with this label, and the worker loop picks them up via `bd ready --label <slug>`.

## Configuration files

Both files are optional. Ralph works out of the box without them.

### `.ralphrc`

Per-project configuration file. Place it in the project root (where you run `ralph-bd`). It's sourced as a bash script before CLI arguments are parsed, so **CLI flags override `.ralphrc` values**.

```bash
# .ralphrc — ralph-bd project configuration

# How many total iterations before ralph stops (default: 50)
MAX_ITERATIONS=30

# How many times to retry a bead if Claude exits non-zero (default: 3)
MAX_RETRIES=5

# Per-agent model overrides (defaults shown below)
# WORKER_MODEL="claude-sonnet-4-6"             # coding worker — well-specified tasks
# REVIEWER_MODEL="claude-sonnet-4-6"           # intermittent code reviewer (per-bead)
# FINAL_REVIEW_MODEL="claude-opus-4-6"         # parallel final review personas (post-loop)
# COMMIT_MODEL="claude-haiku-4-5-20251001"     # commit agent — trivial mechanical task
# LEAD_MODEL="claude-opus-4-6"                 # lead agent — plan decomposition
# SPEC_MODEL="claude-opus-4-6"                 # spec reviewer — validates task specs
# SUMMARY_MODEL="claude-haiku-4-5-20251001"    # post-run summary

# Force ALL agents to a single model (overrides per-agent settings above)
# MODEL="claude-sonnet-4-6"

# Filter beads by issue_type (default: "" = all types)
FILTER_TYPE="feature"

# Only process beads with priority <= this value (default: "" = all priorities)
# 0=critical, 1=high, 2=medium, 3=low, 4=backlog
FILTER_PRIORITY=2

# Only process beads owned by this name (default: "" = all owners)
FILTER_OWNER="bitbeckers"

# Filter beads by label (default: "" = all labels)
FILTER_LABEL=""

# Post-loop test command (default: "" = no test gate)
# TEST_CMD="npm test"

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

> **Note:** `BEAD_IDS`, `EXPLICIT_MODE`, `RESPECT_DEPS`, and `PLAN_FILE` are not settable via `.ralphrc` — they only make sense as CLI arguments.

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

## Prompt templates

All agent prompts live in `prompts/*.md` as standalone markdown files. This makes them easy to find, edit, and iterate on without touching the main script.

```
prompts/
  lead.md                      # Plan decomposition (--from-plan)
  spec-review.md               # Spec validation (--from-plan)
  worker.md                    # Main coding agent
  commit.md                    # Commit agent
  review.md                    # Per-bead reviewer
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
    NEW_ID=$(bd create "Blocker: <description>" -t bug -p 1 ${BEAD_LABELS} --silent)
{{#IF PROJECT_RULES}}

## Project Rules
${PROJECT_RULES}
{{/IF PROJECT_RULES}}

## Task
${BEAD_DETAILS}
```

Variable substitution is handled by `envsubst` with an explicit variable list — only named variables are replaced. Literal `$` in agent instructions (like `$(bd create ...)`) are left untouched. No `eval` is used.

### Customizing prompts

Override `PROMPTS_DIR` to point to a custom directory:

```bash
# .ralphrc
PROMPTS_DIR="/path/to/my/prompts"
```

Or edit the files in `prompts/` directly. Each call site in `ralph-bd` exports only the variables that template needs, scoped in a subshell:

```bash
claude_as "$COMMIT_MODEL" -p "$(
  export BEAD_ID="$bead_id"
  render_prompt "$PROMPTS_DIR/commit.md" BEAD_ID
)"
```

## Logs

All output goes to `.ralph-logs/` (configurable via `LOG_DIR`):

| File | Contents |
|------|----------|
| `iter-<N>-<bead-id>.log` | Full Claude Code output for the worker agent |
| `iter-<N>-<bead-id>-commit.log` | Commit agent output |
| `iter-<N>-<bead-id>-review.log` | Reviewer agent output |
| `lead-<HHMMSS>.log` | Lead agent output (`--from-plan` only) |
| `spec-review-<HHMMSS>.log` | Spec reviewer output (`--from-plan` only) |
| `test-gate-<HHMMSS>.log` | Test gate output (`--test-cmd` only) |
| `final-review-security-<HHMMSS>.log` | Security reviewer output |
| `final-review-integration-<HHMMSS>.log` | Integration reviewer output |
| `final-review-patterns-<HHMMSS>.log` | Codebase patterns reviewer output |
| `final-review-plan-<HHMMSS>.log` | Plan adherence reviewer output (when plan context exists) |
| `.skipped` | Bead IDs that failed after all retries |
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
| Reviewer | sonnet | Per-bead check with cumulative diff context — good enough for quick checks |
| Final review | opus | 3-4 parallel personas (Security, Integration, Patterns, Plan Adherence) after all work is done |
| Summary | haiku | Reading logs and writing a debrief |

The Ralph Loop design deliberately front-loads reasoning (lead + spec review produce detailed, self-contained specs), which means workers can run on a faster, cheaper model without sacrificing quality. Intermittent reviews run on Sonnet for cost efficiency; the post-loop final review personas run on Opus as a thorough safety net with cross-persona coverage.

`--model` overrides everything to a single model, useful for testing or when you want uniform behavior. Per-agent models are configurable via `.ralphrc` (e.g. `WORKER_MODEL`, `REVIEWER_MODEL`, `FINAL_REVIEW_MODEL`).

## Tips

- **Start small.** Run with `--beads` on 1-2 beads first to verify the setup works before letting it loose on `bd ready`.
- **Write detailed bead specs.** Each Claude instance starts from scratch. The bead description is all it has. The more context in the bead, the better the output.
- **Use `.ralph-rules.md` for guardrails.** If agents keep doing something you don't want (skipping tests, editing the wrong files), add a rule.
- **Check the logs.** If a bead fails or the commit looks wrong, the answer is in `.ralph-logs/`.
- **Commit conventions are automatic.** Put your preferred commit format in `AGENTS.md` and the commit agent will follow it. No need to configure ralph.

## Claude Code skills

User-level [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills) live in `claude-home/.claude/skills/` and are symlinked to `~/.claude/skills/` via [GNU Stow](https://www.gnu.org/software/stow/). A hook script in `claude-home/.claude/hooks/` is managed the same way.

These skills are available in any Claude Code session (not just ralph-bd runs) and form the interactive counterpart to ralph's automated loop. Where ralph processes beads autonomously, these skills are invoked manually via `/skill-name` in a Claude Code conversation.

### Setup

Skills and hooks are stored in `claude-home/.claude/` and need to be symlinked into `~/.claude/` so Claude Code can find them. [GNU Stow](https://www.gnu.org/software/stow/) manages the symlinks.

```bash
# 1. Install stow
sudo apt install stow        # Debian/Ubuntu
brew install stow             # macOS

# 2. Clone this repo (if you haven't already)
git clone git@github.com:pheuberger/ai-tooling.git
cd ai-tooling

# 3. Stow the claude-home package into your home directory
stow -t ~ claude-home
```

This creates symlinks so that `~/.claude/skills/<name>` points back into this repo. Edits in either location update the same files, and changes are tracked in git.

To remove the symlinks (without deleting the repo files):

```bash
stow -t ~ -D claude-home
```

### Skills reference

Skills are invoked in Claude Code with `/skill-name` (e.g. `/create-plan`). They are listed below in the order you'd typically use them during a feature lifecycle.

| Skill | When to use |
|-------|-------------|
| `/start-issue` | Beginning work on a Linear issue. Fetches the spec, marks it in progress, checks out the branch, and runs an interactive questioning phase to refine requirements before any code is written. |
| `/research-codebase` | You need to understand how something works before planning. Spawns parallel sub-agents to explore the codebase and produces a timestamped research document in `.claude/research/`. |
| `/create-plan` | After research and requirements are clear. Interactive multi-step process: gathers context, asks questions, explores code, and writes a phased implementation plan to `.claude/plans/`. |
| `/plan-to-beads` | After a plan is approved. Decomposes it into granular, self-contained beads (bd issues) with file paths, code snippets, and acceptance criteria. Every bead gets a shared feature label. |
| `/review-beads` | Quality gate before running ralph-bd. Audits beads for completeness, splits oversized ones, enriches vague descriptions with actual code from the codebase. |
| `/create-issue` | Mid-session, you notice out-of-scope work. Captures it as a Linear issue with a quick refinement loop — keeps you focused on the current task. |

### Typical workflow

```
/start-issue MA-123          # fetch spec, question requirements (untested, optional)
/create-plan                  # write phased implementation plan
/plan-to-beads                # decompose plan into bd tasks
/review-beads                 # quality-check the beads
./ralph-bd --label feat-slug  # let ralph work them autonomously
```

### Hooks

| File | Trigger | What it does |
|------|---------|--------------|
| `on-file-write.sh` | Every file save | Runs [UBS](https://github.com/snarktank/ubs) bug scanner on supported languages (JS/TS, Python, C/C++, Rust, Go, Java, Ruby). Skips silently if `ubs` is not installed. |
