# ralph-plan

Self-healing plan refinement pipeline. Runs N fresh Claude Code sessions that each find problems AND fix them in the plan, progressively hardening it. Only genuinely ambiguous decisions get surfaced at the end.

## How it works

Three-phase pipeline:

```
┌──────────────────────────────────────────────────────────┐
│  ralph-plan                                              │
│                                                          │
│  Phase 1 — External Sparring (optional)                  │
│    Non-Claude models critique the plan. Claude            │
│    integrates valid feedback, ignores the rest.           │
│    Runs first to catch fundamental issues early.          │
│                                                          │
│  Phase 2 — Critic-Patch Loop (N sequential passes)       │
│    Each pass views the plan through a different lens      │
│    (feasibility, gaps, security, maintainability, scope). │
│    Fixable issues are edited in-place; ambiguous ones     │
│    are logged as open questions.                          │
│                                                          │
│  Phase 3 — Final Polish                                  │
│    One pass to fix contradictions introduced by earlier   │
│    edits, clean up duplicate questions, and normalize     │
│    formatting.                                            │
└──────────────────────────────────────────────────────────┘
```

Each phase spawns fresh Claude Code instances with `--print --dangerously-skip-permissions`. The plan file is edited in-place across passes. A corruption guard reverts any pass that shrinks the plan by more than 30%.

### Outputs

| File | Contents |
|------|----------|
| `PLAN-REFINED.md` | The hardened plan (configurable via `--output`) |
| `PLAN-QUESTIONS.md` | Open questions requiring human judgment (configurable via `--questions`) |

## CLI options

```
./ralph-plan [options] [PLAN_FILE]
```

| Flag | Default | Description |
|------|---------|-------------|
| `PLAN_FILE` (positional) | `PLAN.md` | Path to the plan document |
| `--iterations N` | `5` | Number of critic passes in Phase 2 |
| `--model MODEL` | `claude-opus-4-6` | Override Claude model for all passes |
| `--output FILE` | `PLAN-REFINED.md` | Where to write the refined plan |
| `--questions FILE` | `PLAN-QUESTIONS.md` | Where to write open questions |
| `--context FILE` | — | Additional context files (repeatable) |
| `--sparring-cmd CMD` | — | External model CLI for sparring (repeatable) |
| `--sparring-iterations N` | `1` | Passes per sparring partner |
| `--log-dir DIR` | `.ralph-logs/plan-review` | Log directory |
| `--lenses L1,L2,...` | see below | Override the default lens list |
| `--resume-from N` | — | Skip passes 1..N-1, resume from pass N |
| `--no-codebase` | off | Skip codebase access (plan-only review) |
| `-h`, `--help` | — | Show usage |

### Examples

```bash
# Basic — refine PLAN.md with 5 passes
./ralph-plan

# Custom plan file with more iterations
./ralph-plan my-feature.md --iterations 8

# Add extra context files
./ralph-plan --context API-SPEC.md --context ARCHITECTURE.md

# Spar with an external model (e.g. Gemini via CLI)
./ralph-plan --sparring-cmd 'gemini chat'

# Multiple sparring partners
./ralph-plan \
  --sparring-cmd 'gemini chat' \
  --sparring-cmd 'ollama run llama3'

# Resume from pass 3 after reviewing questions
./ralph-plan --resume-from 3

# Plan-only review (no codebase access)
./ralph-plan --no-codebase

# Use custom lenses
./ralph-plan --lenses feasibility,security-and-risk,scope-and-priorities
```

## Lenses

Each critic pass views the plan through a specific lens. Lenses rotate round-robin across passes (pass 1 uses lens 1, pass 2 uses lens 2, etc.).

### Default lenses

| Lens | Focus |
|------|-------|
| `feasibility` | Technical impossibilities, unrealistic estimates, missing prerequisites, nonexistent dependencies |
| `gaps-and-edge-cases` | Unhandled errors, race conditions, partial failures, missing validation, implicit assumptions |
| `security-and-risk` | Injection vectors, secrets handling, auth gaps, blast radius, supply chain risks |
| `maintainability` | Testability, abstraction quality, coupling, observability, debuggability |
| `scope-and-priorities` | Scope creep, MVP vs nice-to-have, contradictions, gold-plating, premature decisions |

### Custom lenses

Override with `--lenses`:

```bash
./ralph-plan --lenses feasibility,security-and-risk,performance
```

Custom lens names (not in the default set) get generic instructions: *"Focus on {lens}. Identify issues, gaps, and risks related to {lens} in the plan."*

## External sparring

Phase 1 sends the plan to non-Claude models for independent critique, then has Claude integrate the feedback. This runs before the fine-grained critic passes so that fundamental issues are caught early, before detailed lens-specific reviews build on top.

### How it works

1. The plan is rendered into a sparring prompt and piped to the external command's stdin
2. The external model's response is captured (truncated at 50k chars)
3. A Claude integration pass reads the feedback and edits the plan — accepting valid points, ignoring wrong ones
4. The integration pass has codebase access to verify claims

### Configuring sparring partners

Any CLI command that reads from stdin and writes to stdout works:

```bash
# Single partner
./ralph-plan --sparring-cmd 'gemini chat'

# Multiple partners (each gets the same plan)
./ralph-plan \
  --sparring-cmd 'gemini chat' \
  --sparring-cmd 'ollama run llama3' \
  --sparring-cmd 'openai chat'

# Multiple rounds per partner
./ralph-plan --sparring-cmd 'gemini chat' --sparring-iterations 2
```

A per-partner timeout (default 300s) prevents hangs. Partners that fail or time out are skipped.

## Configuration via `.ralphrc`

ralph-plan reads from `.ralphrc` just like ralph. Plan-specific variables use the `PLAN_REVIEW_` prefix:

```bash
# .ralphrc — ralph-plan configuration

PLAN_REVIEW_ITERATIONS=5               # Number of critic passes
PLAN_REVIEW_MODEL=""                   # Override model (default: claude-opus-4-6)
PLAN_REVIEW_OUTPUT="PLAN-REFINED.md"   # Refined plan output path
PLAN_REVIEW_QUESTIONS="PLAN-QUESTIONS.md"  # Questions output path
PLAN_REVIEW_LOG_DIR=".ralph-logs/plan-review"
PLAN_REVIEW_MAX_RETRIES=3             # Retries per failed pass
PLAN_REVIEW_SPARRING_CMD=""           # Single sparring command (use CLI for multiple)
PLAN_REVIEW_SPARRING_ITERATIONS=1     # Passes per sparring partner
PLAN_REVIEW_SPARRING_TIMEOUT=300      # Seconds before killing a sparring partner
```

CLI flags override `.ralphrc` values.

## Logs

All output goes to `.ralph-logs/plan-review/` (configurable via `--log-dir`):

| File | Contents |
|------|----------|
| `pass-<N>-<lens>.log` | Full Claude Code output for critic pass N |
| `snapshot-before-pass-<N>.md` | Plan state before pass N |
| `snapshot-after-pass-<N>.md` | Plan state after pass N (successful passes only) |
| `sparring-<N>-<name>-<round>.log` | Raw output from sparring partner |
| `integrate-<N>-<name>-<round>.log` | Claude's integration pass for sparring feedback |
| `final-polish.log` | Final consistency pass output |

A cost breakdown is printed at the end of the run.

## Resuming

If you stop a run (or want to answer questions and continue), use `--resume-from`:

```bash
# Run 5 passes
./ralph-plan --iterations 8

# Review PLAN-QUESTIONS.md, answer some questions in the plan...

# Resume from pass 6
./ralph-plan --iterations 8 --resume-from 6
```

`--resume-from` requires that `PLAN-REFINED.md` and `PLAN-QUESTIONS.md` already exist (from the previous run).

## Tips

- **Start with fewer iterations.** 3-5 passes is usually enough. Diminishing returns set in quickly. Add more only if questions keep appearing.
- **Answer questions between runs.** Edit `PLAN-REFINED.md` to resolve open questions, then resume. The next pass will pick up your changes.
- **Use `--context` for specs and constraints.** API docs, architecture decision records, or design specs give the critic grounding.
- **Sparring adds diversity, not depth.** One round per external model is usually sufficient. The value is in catching blind spots, not repeated critique.
- **Check snapshots for regression.** If a later pass seems to have made things worse, compare `snapshot-before-pass-N.md` and `snapshot-after-pass-N.md`.

## Prerequisites

| Tool | Purpose |
|------|---------|
| `claude` | [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) |
| `jq` | JSON processing |
| `envsubst` | Template variable substitution (part of `gettext`) |

Note: `vima` and `git` are NOT required for ralph-plan (unlike ralph). ralph-plan only refines plan documents.
