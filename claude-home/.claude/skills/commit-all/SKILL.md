---
description: "Commit all working tree changes as multiple atomic, logically grouped commits — excluding planning artifacts and sensitive files"
---

# Commit All

You are committing all outstanding changes in the working tree as a series of atomic, logically grouped commits. Each commit must be self-contained and pass linting/type-checks on its own.

## Workflow

### 1. Inventory

Run these in parallel:
- `git status` — get the full picture of staged, unstaged, and untracked files
- `git diff` — see unstaged content changes
- `git diff --cached` — see already-staged content changes
- `git log --oneline -10` — match existing commit message style

### 2. Classify and exclude

**Never commit — remove from consideration entirely:**
- `PLAN*.md`, `*-PLAN.md`, `SPEC*.md`, `DESIGN*.md`, `TODO*.md`, `NOTES*.md` and similar planning artifacts in the repo root or feature directories
- `.env`, `.env.*`, `credentials.*`, `*.pem`, `*.key`, secrets
- `node_modules/`, `dist/`, `build/`, `.next/`, coverage reports
- OS junk: `.DS_Store`, `Thumbs.db`, `*.swp`

**Ask the user before committing:**
- Any file you're unsure about (unfamiliar config, large generated files, lock file changes without corresponding package.json changes)

### 3. Group into logical commits

Analyze the remaining changes and cluster them into commits. Each commit is a coherent unit of work.

**Grouping rules (in priority order):**

1. **Implementation + its tests = one commit.** A source file change and its corresponding test file always go together. Never split them.
2. **Tightly coupled cross-cutting changes = one commit.** If a type change in `types.ts` is required by changes in `service.ts` + `service.test.ts`, all three go in one commit.
3. **Infrastructure / config changes = separate commit.** Docker, CI, tsconfig, package.json changes get their own commit unless they only make sense alongside a specific feature change.
4. **Refactors = separate commit.** Pure renames, moves, or restructuring that don't change behavior go in their own commit, before the feature commits that depend on them.
5. **Deleted files = with the commit that replaces them.** If `OldService.ts` was deleted because `NewService.ts` replaces it, commit the deletion with the new file. If a file was deleted with no replacement, it gets its own commit or goes with the refactor that made it unnecessary.

**Ordering:** Commit foundational changes first (types, config, refactors), then feature work, then cleanup.

### 4. Partial file staging (when needed)

Sometimes a single file contains changes for multiple logical commits. Use these techniques:

**Patch-based staging (preferred):**
```bash
# Extract the diff for specific lines and stage just those
git diff path/to/file.ts | head -n <end_line> | tail -n <count> > /tmp/partial.patch
git checkout -- path/to/file.ts
git apply /tmp/partial.patch
git add path/to/file.ts
```

**Stash-based staging:**
```bash
# Stage everything you want in commit 1
git add file1.ts file2.ts
git stash push --keep-index  # stash the unstaged remainder
git commit -m "..."
git stash pop                # bring back the rest for commit 2
```

**Reset-based staging (simplest for splitting a file):**
```bash
# Stage the entire file, then unstage specific hunks
git add path/to/file.ts
# Use git diff --cached to verify what's staged
# If too much is staged, reset and use a more targeted approach
```

**In practice:** Splitting a file across commits is rarely worth the complexity. Default to committing the whole file with whichever group it fits best. Only split when a file genuinely contains two unrelated changes (e.g., a bug fix at the top and a new feature at the bottom).

### 5. Create each commit

For each group, in order:

1. `git add <specific files>` — never use `git add .` or `git add -A`
2. `git diff --cached --stat` — verify exactly what's staged
3. Commit with a conventional commit message:
   ```bash
   git commit -m "$(cat <<'EOF'
   type(scope): short description

   Optional body explaining why, not what.
   EOF
   )"
   ```
4. `git status` — confirm clean staging area before next commit

**Conventional commit types:** `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `ci`, `style`

### 6. Final verification

After all commits:
```bash
git log --oneline -<N>  # where N = number of commits you just made
```

Display the result to the user.

## Rules

- **NEVER use `git add .` or `git add -A`** — always name files explicitly
- **NEVER skip the classification step** — planning artifacts must not be committed
- **NEVER commit secrets** — if you see anything that looks like a key or credential, stop and ask
- **NEVER amend existing commits** — always create new commits
- **NEVER use `--no-verify`** — if a hook fails, fix the issue
- **Ask when uncertain** — it's cheaper to ask than to undo a bad commit
- **Match the repo's commit style** — check `git log` and follow the existing convention
- **Each commit must make sense alone** — a reviewer reading just that commit's diff should understand the change without needing context from other commits in the series
