# Claude Code Skills & Hooks

User-level [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills) that live in `claude-home/.claude/skills/` and are symlinked to `~/.claude/skills/` via [GNU Stow](https://www.gnu.org/software/stow/). A hook script in `claude-home/.claude/hooks/` is managed the same way.

These skills are available in any Claude Code session (not just ralph runs) and form the interactive counterpart to ralph's automated loop. Where ralph processes tickets autonomously, these skills are invoked manually via `/skill-name` in a Claude Code conversation.

## Setup

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

## Skills reference

Skills are invoked in Claude Code with `/skill-name` (e.g. `/create-plan`). They are listed below in the order you'd typically use them during a feature lifecycle.

| Skill | When to use |
|-------|-------------|
| `/start-issue` | Beginning work on a Linear issue. Fetches the spec, marks it in progress, checks out the branch, and runs an interactive questioning phase to refine requirements before any code is written. |
| `/research-codebase` | You need to understand how something works before planning. Spawns parallel sub-agents to explore the codebase and produces a timestamped research document in `.claude/research/`. |
| `/create-plan` | After research and requirements are clear. Interactive multi-step process: gathers context, asks questions, explores code, and writes a phased implementation plan to `PLAN.md` in the project root. |
| `/plan-to-tickets` | After a plan is approved. Decomposes it into granular, self-contained tickets (vima issues) with file paths, code snippets, and acceptance criteria. Every ticket gets a shared feature tag. |
| `/review-tickets` | Quality gate before running ralph. Audits tickets for completeness, splits oversized ones, enriches vague descriptions with actual code from the codebase. |
| `/create-issue` | Mid-session, you notice out-of-scope work. Captures it as a Linear issue with a quick refinement loop — keeps you focused on the current task. |

## Typical workflow

```
/start-issue MA-123          # fetch spec, question requirements, write PLAN.md
/create-plan                  # (alternative) write PLAN.md interactively
./ralph-plan                  # refine PLAN.md → PLAN-REFINED.md
/plan-to-tickets              # decompose plan into vima tasks
/review-tickets               # quality-check the tickets
./ralph --tag feat-slug       # let ralph work them autonomously
```

## Hooks

| File | Trigger | What it does |
|------|---------|--------------|
| `on-file-write.sh` | Every file save | Runs [UBS](https://github.com/snarktank/ubs) bug scanner on supported languages (JS/TS, Python, C/C++, Rust, Go, Java, Ruby). Skips silently if `ubs` is not installed. |
