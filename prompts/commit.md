Stage and commit the current code changes.

Steps:
1. Run: git add -A && git reset HEAD -- .ralph-logs
2. Run: git diff --cached (to see what you're committing)
3. Write a commit message that focuses on the *why* more than the *what*.
   Follow any commit conventions the project has (check CLAUDE.md, AGENTS.md).
   Include "(${BEAD_ID})" on its own line at the bottom of the commit body.
4. Commit using a heredoc for the message.
5. If the commit fails due to lint-staged or husky, fix the reported issues and retry.
6. Do NOT run bd commands. Do NOT push.
