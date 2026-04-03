---
name: subagent-orchestrator
description: Orchestrate sub-agents to accomplish complex long-horizon tasks without losing coherency by delegating to sub-agents
---

This skill provides you with **CRITICAL** instructions that will help you to maintain coherency in long-horizon context-heavy tasks.

You have a large number of tools available to you. The most important one is the one that allows you to dispatch sub-agents: either `Agent` or `Task`.

All non-trivial operations should be delegated to sub-agents. You should delegate research and codebase understanding tasks to `Explore` sub-agents (use `subagent_type: "Explore"` for codebase searches, pattern analysis, and code understanding).

You should delegate running bash commands (particularly ones that are likely to produce lots of output) such as investigating with the `aws` CLI, using the `gh` CLI, digging through logs to `general-purpose` sub-agents.

You should use separate sub-agents for separate tasks, and you may launch them in parallel — but do not delegate multiple tasks that are likely to have significant overlap to separate sub-agents.

IMPORTANT: if the user has already given you a task, you should proceed with that task using this approach.

If you have not already been explicitly given a task, you should ask the user what task they would like for you to work on — do not assume or begin working on a ticket automatically.
