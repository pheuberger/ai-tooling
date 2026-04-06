import { readdir } from 'fs/promises'
import { join } from 'path'
import type { LogFile, Phase, AgentType, FileFormat } from '../types'

// Sort priority within each group
const AGENT_ORDER: Record<string, number> = {
  // iteration group
  worker: 0,
  commit: 1,
  review: 2,
  // plan group
  lead: 0,
  'spec-review': 1,
  // post-run group
  'test-gate': 0,
  'final-security': 1,
  'final-integration': 2,
  'final-patterns': 3,
  'final-plan': 4,
  summary: 5,
}

function groupSortKey(groupKey: string): number {
  if (groupKey === 'plan') return 0
  if (groupKey === 'post-run') return Number.MAX_SAFE_INTEGER - 1
  if (groupKey === 'other') return Number.MAX_SAFE_INTEGER
  const m = groupKey.match(/^iter-(\d+)$/)
  if (m) return parseInt(m[1], 10)
  return Number.MAX_SAFE_INTEGER - 2
}

type ClassifyResult = Omit<LogFile, 'path' | 'filename'> | null

function classifyFilename(filename: string): ClassifyResult {
  let m: RegExpMatchArray | null

  // Commit — must come before generic worker pattern
  m = filename.match(/^iter-(\d+)-(.+)-commit\.log$/)
  if (m) {
    const iterationNumber = parseInt(m[1], 10)
    const ticketId = m[2]
    return {
      phase: 'iteration',
      agentType: 'commit',
      format: 'plain-text',
      groupKey: `iter-${iterationNumber}`,
      ticketId,
      iterationNumber,
      displayLabel: `${ticketId} commit`,
    }
  }

  // Review — must come before generic worker pattern
  m = filename.match(/^iter-(\d+)-(.+)-review\.log$/)
  if (m) {
    const iterationNumber = parseInt(m[1], 10)
    const ticketId = m[2]
    return {
      phase: 'iteration',
      agentType: 'review',
      format: 'stream-json',
      groupKey: `iter-${iterationNumber}`,
      ticketId,
      iterationNumber,
      displayLabel: `${ticketId} review`,
    }
  }

  // Worker — generic iter pattern (commit/review already consumed above)
  m = filename.match(/^iter-(\d+)-(.+)\.log$/)
  if (m) {
    const iterationNumber = parseInt(m[1], 10)
    const ticketId = m[2]
    return {
      phase: 'iteration',
      agentType: 'worker',
      format: 'stream-json',
      groupKey: `iter-${iterationNumber}`,
      ticketId,
      iterationNumber,
      displayLabel: `${ticketId} worker`,
    }
  }

  m = filename.match(/^lead-(\d{6})\.log$/)
  if (m) {
    return {
      phase: 'plan',
      agentType: 'lead',
      format: 'stream-json',
      groupKey: 'plan',
      displayLabel: 'lead',
    }
  }

  m = filename.match(/^spec-review-(\d{6})\.log$/)
  if (m) {
    return {
      phase: 'plan',
      agentType: 'spec-review',
      format: 'stream-json',
      groupKey: 'plan',
      displayLabel: 'spec-review',
    }
  }

  m = filename.match(/^test-gate-(\d{6})\.log$/)
  if (m) {
    return {
      phase: 'post-run',
      agentType: 'test-gate',
      format: 'plain-text',
      groupKey: 'post-run',
      displayLabel: 'test-gate',
    }
  }

  m = filename.match(/^final-review-security-(\d{6})\.log$/)
  if (m) {
    return {
      phase: 'post-run',
      agentType: 'final-security',
      format: 'stream-json',
      groupKey: 'post-run',
      displayLabel: 'final-security',
    }
  }

  m = filename.match(/^final-review-integration-(\d{6})\.log$/)
  if (m) {
    return {
      phase: 'post-run',
      agentType: 'final-integration',
      format: 'stream-json',
      groupKey: 'post-run',
      displayLabel: 'final-integration',
    }
  }

  m = filename.match(/^final-review-patterns-(\d{6})\.log$/)
  if (m) {
    return {
      phase: 'post-run',
      agentType: 'final-patterns',
      format: 'stream-json',
      groupKey: 'post-run',
      displayLabel: 'final-patterns',
    }
  }

  m = filename.match(/^final-review-plan-(\d{6})\.log$/)
  if (m) {
    return {
      phase: 'post-run',
      agentType: 'final-plan',
      format: 'stream-json',
      groupKey: 'post-run',
      displayLabel: 'final-plan',
    }
  }

  m = filename.match(/^summary-(.+)\.md$/)
  if (m) {
    return {
      phase: 'post-run',
      agentType: 'summary',
      format: 'plain-text',
      groupKey: 'post-run',
      displayLabel: 'summary',
    }
  }

  return null
}

export async function discoverLogFiles(logDir: string): Promise<LogFile[]> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(logDir, { withFileTypes: true })
  } catch {
    return []
  }

  const files: LogFile[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (entry.name.startsWith('.')) continue

    const filename = entry.name
    const path = join(logDir, filename)
    const classified = classifyFilename(filename)

    if (classified) {
      files.push({ path, filename, ...classified })
    } else {
      // Unrecognized: sniff first line for stream-json (read only first 1KB)
      try {
        const fd = await import('fs').then(m => m.promises.open(path, 'r'))
        try {
          const buf = Buffer.alloc(1024)
          const { bytesRead } = await fd.read(buf, 0, 1024, 0)
          const firstLine = buf.toString('utf-8', 0, bytesRead).split('\n')[0].trim()
          if (firstLine) {
            const parsed = JSON.parse(firstLine)
            if (parsed && typeof parsed === 'object' && 'type' in parsed) {
              const nameWithoutExt = filename.replace(/\.[^.]+$/, '')
              files.push({
                path,
                filename,
                phase: 'other',
                agentType: nameWithoutExt,
                format: 'stream-json',
                groupKey: 'other',
                displayLabel: filename,
              })
            }
          }
        } finally {
          await fd.close()
        }
      } catch {
        // Silently ignore unrecognized files
      }
    }
  }

  files.sort((a, b) => {
    const gA = groupSortKey(a.groupKey)
    const gB = groupSortKey(b.groupKey)
    if (gA !== gB) return gA - gB

    const aOrder = AGENT_ORDER[a.agentType as string] ?? 99
    const bOrder = AGENT_ORDER[b.agentType as string] ?? 99
    return aOrder - bOrder
  })

  return files
}
