import { stripAnsi } from '../sanitize.ts'
import type { ParsedLog } from '../types.ts'

export async function parsePlainText(filePath: string): Promise<ParsedLog> {
  const content = await Bun.file(filePath).text()
  if (!content) {
    return { blocks: [{ type: 'text', text: '(empty)' }], metadata: {} }
  }
  return { blocks: [{ type: 'text', text: stripAnsi(content) }], metadata: {} }
}
