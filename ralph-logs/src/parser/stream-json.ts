import { stripAnsi } from '../sanitize.ts'
import { MAX_JSON_LINE_SIZE } from '../constants.ts'
import type { ParsedLog, ConversationBlock, SessionMetadata } from '../types.ts'

function shortenModel(model: string): string {
  if (model === 'claude-opus-4-6') return 'opus-4'
  if (model === 'claude-sonnet-4-6') return 'sonnet-4'
  if (model === 'claude-haiku-4-5-20251001') return 'haiku-4.5'
  return model
}

export async function parseStreamJson(filePath: string): Promise<ParsedLog> {
  const text = await Bun.file(filePath).text()
  const lines = text.split('\n')
  const blocks: ConversationBlock[] = []
  const metadata: SessionMetadata = {}

  for (const line of lines) {
    if (!line.trim()) continue

    if (new TextEncoder().encode(line).length > MAX_JSON_LINE_SIZE) {
      blocks.push({ type: 'text', text: '(content too large to display)' })
      continue
    }

    let obj: any
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }

    if (obj.type === 'system' && obj.subtype === 'init') {
      if (obj.model) metadata.model = shortenModel(obj.model)
      if (obj.session_id) metadata.sessionId = obj.session_id
    } else if (obj.type === 'assistant') {
      const content = obj.message?.content
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'text') {
            blocks.push({ type: 'text', text: stripAnsi(item.text) })
          } else if (item.type === 'thinking') {
            blocks.push({ type: 'thinking', thinking: item.thinking })
          } else if (item.type === 'tool_use') {
            blocks.push({ type: 'tool_use', name: item.name, input: item.input, id: item.id })
          }
        }
      }
    } else if (obj.type === 'user') {
      const content = obj.message?.content
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'tool_result') {
            let normalized: string
            if (Array.isArray(item.content)) {
              normalized = item.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('\n')
            } else if (typeof item.content === 'string') {
              normalized = item.content
            } else {
              normalized = ''
            }
            normalized = stripAnsi(normalized)
            blocks.push({
              type: 'tool_result',
              toolUseId: item.tool_use_id,
              content: normalized,
              isError: item.is_error === true,
            })
          }
        }
      }
    } else if (obj.type === 'result') {
      if (obj.duration_ms != null) metadata.durationMs = obj.duration_ms
      if (obj.total_cost_usd != null) metadata.totalCostUsd = obj.total_cost_usd
      if (obj.subtype != null) metadata.subtype = obj.subtype
    }
  }

  return { blocks, metadata }
}
