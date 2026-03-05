import { BoxRenderable, TextRenderable, TextAttributes } from '@opentui/core'
import type { LogFile, SessionMetadata } from './types.ts'
import type { TerminalPalette } from './theme.ts'

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return 'unknown'
  if (ms >= 60000) {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }
  return `${Math.floor(ms / 1000)}s`
}

export function createStatusBar(parentBox: any, palette: TerminalPalette): {
  update(file: LogFile, metadata: SessionMetadata): void
  clear(): void
} {
  const ctx = parentBox.ctx

  const rowBox = new BoxRenderable(ctx, {
    flexDirection: 'row',
    height: 1,
    width: '100%',
  })
  parentBox.add(rowBox)

  function clearChildren() {
    const children = [...rowBox.getChildren()]
    for (const child of children) {
      rowBox.remove(child.id)
    }
  }

  function update(file: LogFile, metadata: SessionMetadata) {
    clearChildren()

    // Error indicator at the very start
    if (metadata.subtype === 'error') {
      const errorMark = new TextRenderable(ctx, {
        content: '✗ ',
        fg: '#d75f5f',
        bg: palette.fg,
      })
      rowBox.add(errorMark)
    }

    // Build left side parts
    const parts: string[] = []

    // 1. File identity
    if (file.beadId) {
      parts.push(`${file.beadId} ${file.agentType}`)
    } else {
      parts.push(file.agentType)
    }

    // 2. Iteration
    if (file.iterationNumber !== undefined) {
      parts.push(`iter ${file.iterationNumber}`)
    }

    // 3. Model
    parts.push(metadata.model ?? 'unknown')

    // 4. Duration
    parts.push(formatDuration(metadata.durationMs))

    // 5. Cost
    parts.push(
      metadata.totalCostUsd !== undefined
        ? `$${metadata.totalCostUsd.toFixed(2)}`
        : 'unknown',
    )

    const leftText = new TextRenderable(ctx, {
      content: ' ' + parts.join('  ·  '),
      fg: palette.bg,
      bg: palette.fg,
      flexGrow: 1,
    })
    rowBox.add(leftText)

    const hintsText = new TextRenderable(ctx, {
      content: ' j/k ↑↓  ? ',
      fg: palette.dimFg,
      bg: palette.fg,
    })
    rowBox.add(hintsText)
  }

  function clear() {
    clearChildren()
    const emptyText = new TextRenderable(ctx, {
      content: '',
      fg: palette.bg,
      bg: palette.fg,
      flexGrow: 1,
    })
    rowBox.add(emptyText)
  }

  // Initialize with empty state
  clear()

  return { update, clear }
}
