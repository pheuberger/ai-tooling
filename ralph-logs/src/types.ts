export type Phase = 'plan' | 'iteration' | 'post-run' | 'other'

export type AgentType =
  | 'lead'
  | 'spec-review'
  | 'worker'
  | 'commit'
  | 'review'
  | 'test-gate'
  | 'final-security'
  | 'final-integration'
  | 'final-patterns'
  | 'final-plan'
  | 'summary'

export type FileFormat = 'stream-json' | 'plain-text'

export type LogFile = {
  path: string
  filename: string
  phase: Phase
  agentType: AgentType | string
  format: FileFormat
  groupKey: string
  beadId?: string
  iterationNumber?: number
  displayLabel: string
}

export type TextBlock = { type: 'text'; text: string }

export type ThinkingBlock = { type: 'thinking'; thinking: string }

export type ToolUseBlock = {
  type: 'tool_use'
  name: string
  input: Record<string, any>
  id: string
}

export type ToolResultBlock = {
  type: 'tool_result'
  toolUseId: string
  content: string
  isError: boolean
}

export type ErrorBlock = { type: 'error'; text: string }

export type ConversationBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ErrorBlock

export type SessionMetadata = {
  model?: string
  durationMs?: number
  totalCostUsd?: number
  subtype?: string
  sessionId?: string
}

export type ParsedLog = {
  blocks: ConversationBlock[]
  metadata: SessionMetadata
}
