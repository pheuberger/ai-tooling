# Commit PR Comment Fix

Stage and commit the current changes. These address review comments on PR #${PR_NUMBER}.

## Instructions

1. Stage all changes:
   ```bash
   git add -A && git reset HEAD -- .ralph-logs
   ```
2. Write a concise commit message that describes *what* was fixed and *why* (the review comment).
   - First line: imperative summary (e.g., "Add null check for optional user name")
   - Keep it under 72 characters
   - Use a heredoc for the message
3. Include `(pr-review)` on its own line at the bottom of the commit message

Do NOT push. Do NOT run any other git commands. Do NOT use TodoWrite.
