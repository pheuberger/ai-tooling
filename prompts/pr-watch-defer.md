# Create Linear Issue for Deferred PR Comment

A review comment on PR #${PR_NUMBER} has been triaged as "defer" — it's a valid point but out of scope for this PR.

## Context

- **PR title:** ${PR_TITLE}
- **PR URL:** ${PR_URL}
- **Repository:** ${REPO_FULL}

## Comment Details

**Group:** ${GROUP_ID}
**Reason for deferral:** ${REASON}

**Threads:**
```json
${THREADS_JSON}
```

## Instructions

Create a Linear issue using the `mcp__linear__save_issue` tool:

- **Title:** Clear, actionable title referencing the concern (e.g., "Refactor auth to use middleware pattern")
- **Description:** Include:
  - Link to the PR: ${PR_URL}
  - The reviewer's comment(s) — quote them
  - File paths and line numbers
  - Your analysis of why this is valid but out of scope
- **Team:** ${LINEAR_TEAM}
- **Priority:** 3 (Normal) — unless the comment suggests urgency, then use 2 (High)

Output the issue identifier (e.g., `TEAM-123`) on the last line, prefixed with `ISSUE_ID:`. Example:
```
ISSUE_ID: ENG-456
```
