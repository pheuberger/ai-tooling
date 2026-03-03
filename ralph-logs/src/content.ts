import { BoxRenderable, TextRenderable, ScrollBoxRenderable, TextAttributes } from '@opentui/core'
import type { ConversationBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock } from './types.ts'
import { AUTO_EXPAND_THRESHOLD, TOOL_OUTPUT_CAP, BASH_DETAIL_TRUNCATE } from './constants.ts'
import { darkTheme } from './theme.ts'

type CollapsibleState = { collapsed: boolean; blockIndex: number }

function getToolDetail(block: ToolUseBlock): string {
  switch (block.name) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return (block.input.file_path as string) ?? ''
    case 'Bash': {
      const cmd = (block.input.command as string) ?? ''
      return cmd.length > BASH_DETAIL_TRUNCATE ? cmd.slice(0, BASH_DETAIL_TRUNCATE) + '…' : cmd
    }
    case 'Grep':
      return ((block.input.pattern as string) ?? '') + ' ' + ((block.input.path as string) ?? '')
    case 'Glob':
      return (block.input.pattern as string) ?? ''
    case 'Agent':
      return (block.input.description as string) ?? ''
    default:
      return ''
  }
}

export function createContent(parentBox: any) {
  const ctx = parentBox.ctx

  const scrollBox = new ScrollBoxRenderable(ctx, {
    scrollY: true,
    flexGrow: 1,
  })
  parentBox.add(scrollBox)

  // Collapsible block state: one entry per tool block rendered
  const collapsibleStates: CollapsibleState[] = []
  // Index into collapsibleStates of the currently targeted block
  let targetedIndex = 0

  // References to each tool block's container box so we can re-render on toggle
  type ToolBlockRenderInfo = {
    stateIndex: number
    useBlock: ToolUseBlock
    resultBlock: ToolResultBlock | null
    container: any
    lineCount: number
  }
  const toolBlockRenderInfos: ToolBlockRenderInfo[] = []

  type ThinkingBlockRenderInfo = {
    stateIndex: number
    thinkingBlock: ThinkingBlock
    container: any
    lineCount: number
  }
  const thinkingBlockRenderInfos: ThinkingBlockRenderInfo[] = []

  function clearChildren() {
    const children = [...scrollBox.getChildren()]
    for (const child of children) {
      scrollBox.remove(child.id)
    }
  }

  function renderToolBlockContent(
    container: any,
    useBlock: ToolUseBlock,
    resultBlock: ToolResultBlock | null,
    stateIndex: number,
    lineCount: number,
  ) {
    // Clear existing children
    const existing = [...container.getChildren()]
    for (const child of existing) {
      container.remove(child.id)
    }

    const isCollapsible = resultBlock !== null
    const isTargeted = isCollapsible && stateIndex === targetedIndex
    const state = collapsibleStates[stateIndex]
    const detail = getToolDetail(useBlock)

    // Header line: ─── ToolName detail ───
    const headerBox = new BoxRenderable(ctx, {
      flexDirection: 'row',
      width: '100%',
    })

    const prefix = new TextRenderable(ctx, {
      content: '─── ',
      fg: darkTheme.toolHeader.fg,
      attributes: isTargeted ? TextAttributes.INVERSE : 0,
    })
    headerBox.add(prefix)

    const nameText = new TextRenderable(ctx, {
      content: useBlock.name,
      fg: darkTheme.toolHeaderBold.fg,
      attributes: (isTargeted ? TextAttributes.INVERSE : 0) | TextAttributes.BOLD,
    })
    headerBox.add(nameText)

    if (detail) {
      const space = new TextRenderable(ctx, {
        content: ' ',
        attributes: isTargeted ? TextAttributes.INVERSE : 0,
      })
      headerBox.add(space)

      const detailText = new TextRenderable(ctx, {
        content: detail,
        attributes: (isTargeted ? TextAttributes.INVERSE : 0) | TextAttributes.DIM,
      })
      headerBox.add(detailText)
    }

    const suffix = new TextRenderable(ctx, {
      content: ' ───',
      fg: darkTheme.toolHeader.fg,
      attributes: isTargeted ? TextAttributes.INVERSE : 0,
    })
    headerBox.add(suffix)

    container.add(headerBox)

    if (resultBlock === null) {
      // No result — not collapsible
      const noResult = new TextRenderable(ctx, {
        content: '(no result)',
        attributes: TextAttributes.DIM,
      })
      container.add(noResult)
      return
    }

    if (state.collapsed) {
      // Collapsed view: ▸ (N lines)
      const collapsedLine = new TextRenderable(ctx, {
        content: `▸ (${lineCount} lines)`,
        fg: darkTheme.collapsedLineCount.fg,
      })
      container.add(collapsedLine)
    } else {
      // Expanded view: toggle indicator + content lines + footer
      const toggleLine = new TextRenderable(ctx, {
        content: `▾ (${lineCount} lines)`,
        fg: darkTheme.collapsedLineCount.fg,
      })
      container.add(toggleLine)

      const content = resultBlock.content
      const lines = content.split('\n')
      const displayLines = lines.length > TOOL_OUTPUT_CAP ? lines.slice(0, TOOL_OUTPUT_CAP) : lines

      for (const line of displayLines) {
        const lineRow = new BoxRenderable(ctx, { flexDirection: 'row' })
        const borderChar = new TextRenderable(ctx, {
          content: '│ ',
          attributes: TextAttributes.DIM,
        })
        const lineContent = new TextRenderable(ctx, {
          content: line,
          fg: resultBlock.isError ? darkTheme.error.fg : undefined,
        })
        lineRow.add(borderChar)
        lineRow.add(lineContent)
        container.add(lineRow)
      }

      if (lines.length > TOOL_OUTPUT_CAP) {
        const truncMsg = new TextRenderable(ctx, {
          content: `... truncated (${lines.length} total lines)`,
          attributes: TextAttributes.DIM,
        })
        container.add(truncMsg)
      }

      // Footer separator
      const footer = new TextRenderable(ctx, {
        content: '──────────────────────────────',
        attributes: TextAttributes.DIM,
      })
      container.add(footer)
    }
  }

  function renderThinkingBlockContent(
    container: any,
    thinkingBlock: ThinkingBlock,
    stateIndex: number,
    lineCount: number,
  ) {
    const existing = [...container.getChildren()]
    for (const child of existing) {
      container.remove(child.id)
    }

    const isTargeted = stateIndex === targetedIndex
    const state = collapsibleStates[stateIndex]

    // Header line: ─── Thinking ───
    const headerBox = new BoxRenderable(ctx, {
      flexDirection: 'row',
      width: '100%',
    })
    const headerText = new TextRenderable(ctx, {
      content: '─── Thinking ───',
      attributes: TextAttributes.DIM | (isTargeted ? TextAttributes.INVERSE : 0),
    })
    headerBox.add(headerText)
    container.add(headerBox)

    if (state.collapsed) {
      // Collapsed view: ▸ (N lines)
      const collapsedLine = new TextRenderable(ctx, {
        content: `▸ (${lineCount} lines)`,
        fg: darkTheme.collapsedLineCount.fg,
      })
      container.add(collapsedLine)
    } else {
      // Expanded view: ▾ (N lines) + content + footer
      const toggleLine = new TextRenderable(ctx, {
        content: `▾ (${lineCount} lines)`,
        fg: darkTheme.collapsedLineCount.fg,
      })
      container.add(toggleLine)

      const lines = thinkingBlock.thinking.split('\n')
      const displayLines = lines.length > TOOL_OUTPUT_CAP ? lines.slice(0, TOOL_OUTPUT_CAP) : lines

      for (const line of displayLines) {
        const lineRow = new BoxRenderable(ctx, { flexDirection: 'row' })
        const borderChar = new TextRenderable(ctx, {
          content: '│ ',
          attributes: TextAttributes.DIM,
        })
        const lineContent = new TextRenderable(ctx, {
          content: line,
          attributes: TextAttributes.DIM | TextAttributes.ITALIC,
        })
        lineRow.add(borderChar)
        lineRow.add(lineContent)
        container.add(lineRow)
      }

      if (lines.length > TOOL_OUTPUT_CAP) {
        const truncMsg = new TextRenderable(ctx, {
          content: `... truncated (${lines.length} total lines)`,
          attributes: TextAttributes.DIM,
        })
        container.add(truncMsg)
      }

      // Footer separator
      const footer = new TextRenderable(ctx, {
        content: '──────────────────────────────',
        attributes: TextAttributes.DIM,
      })
      container.add(footer)
    }
  }

  function loadBlocks(blocks: ConversationBlock[]) {
    clearChildren()
    collapsibleStates.length = 0
    toolBlockRenderInfos.length = 0
    thinkingBlockRenderInfos.length = 0
    targetedIndex = 0

    if (blocks.length === 0) {
      const emptyText = new TextRenderable(ctx, {
        content: '(empty)',
        alignSelf: 'center',
      })
      scrollBox.add(emptyText)
      return
    }

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]

      if (block.type === 'text') {
        if (!block.text) continue
        const textNode = new TextRenderable(ctx, {
          content: block.text,
          wrapMode: 'word',
        })
        scrollBox.add(textNode)
      } else if (block.type === 'error') {
        const errorBox = new BoxRenderable(ctx, {
          borderStyle: 'single',
          border: true,
          borderColor: '#ff0000',
        })
        const errorText = new TextRenderable(ctx, {
          content: block.text,
          fg: '#ff0000',
          wrapMode: 'word',
        })
        errorBox.add(errorText)
        scrollBox.add(errorBox)
      } else if (block.type === 'tool_use') {
        // Find matching ToolResultBlock by scanning forward
        let resultBlock: ToolResultBlock | null = null
        for (let j = i + 1; j < blocks.length; j++) {
          const candidate = blocks[j]
          if (candidate.type === 'tool_result' && candidate.toolUseId === block.id) {
            resultBlock = candidate
            break
          }
        }

        // Determine initial collapsed state
        let collapsed = false
        if (resultBlock !== null) {
          const lineCount = resultBlock.content.split('\n').length
          if (resultBlock.isError) {
            collapsed = false
          } else if (lineCount <= AUTO_EXPAND_THRESHOLD) {
            collapsed = false
          } else {
            collapsed = true
          }
        }

        const stateIndex = collapsibleStates.length
        if (resultBlock !== null) {
          collapsibleStates.push({ collapsed, blockIndex: i })
        }

        const lineCount = resultBlock ? resultBlock.content.split('\n').length : 0

        const container = new BoxRenderable(ctx, {
          flexDirection: 'column',
          width: '100%',
        })

        renderToolBlockContent(container, block, resultBlock, stateIndex, lineCount)
        scrollBox.add(container)

        if (resultBlock !== null) {
          toolBlockRenderInfos.push({
            stateIndex,
            useBlock: block,
            resultBlock,
            container,
            lineCount,
          })
        }
      } else if (block.type === 'tool_result') {
        // handled above via forward scan from tool_use
      } else if (block.type === 'thinking') {
        const lineCount = block.thinking.split('\n').length
        const collapsed = lineCount > AUTO_EXPAND_THRESHOLD

        const stateIndex = collapsibleStates.length
        collapsibleStates.push({ collapsed, blockIndex: i })

        const container = new BoxRenderable(ctx, {
          flexDirection: 'column',
          width: '100%',
        })

        renderThinkingBlockContent(container, block, stateIndex, lineCount)
        scrollBox.add(container)

        thinkingBlockRenderInfos.push({
          stateIndex,
          thinkingBlock: block,
          container,
          lineCount,
        })
      }
    }
  }

  function rerenderAllHeaders() {
    for (const info of toolBlockRenderInfos) {
      renderToolBlockContent(
        info.container,
        info.useBlock,
        info.resultBlock,
        info.stateIndex,
        info.lineCount,
      )
    }
    for (const info of thinkingBlockRenderInfos) {
      renderThinkingBlockContent(info.container, info.thinkingBlock, info.stateIndex, info.lineCount)
    }
  }

  return {
    loadBlocks,
    scrollBy(lines: number) {
      scrollBox.scrollBy(lines)
    },
    scrollByPage(direction: number) {
      scrollBox.scrollBy(direction * 0.5, 'viewport')
    },
    scrollToTop() {
      scrollBox.scrollTo(0)
    },
    scrollToBottom() {
      scrollBox.scrollTo(Number.MAX_SAFE_INTEGER)
    },
    getScrollY(): number {
      return scrollBox.scrollTop
    },
    setScrollY(y: number) {
      scrollBox.scrollTo(y)
    },
    getCollapseStates(): boolean[] {
      return collapsibleStates.map((s) => s.collapsed)
    },
    setCollapseStates(states: boolean[]) {
      for (let i = 0; i < Math.min(states.length, collapsibleStates.length); i++) {
        collapsibleStates[i].collapsed = states[i]
      }
      rerenderAllHeaders()
    },
    clear() {
      clearChildren()
    },
    toggleTargetedBlock() {
      if (collapsibleStates.length === 0) return
      const state = collapsibleStates[targetedIndex]
      if (!state) return
      state.collapsed = !state.collapsed
      const toolInfo = toolBlockRenderInfos.find((r) => r.stateIndex === targetedIndex)
      if (toolInfo) {
        renderToolBlockContent(
          toolInfo.container,
          toolInfo.useBlock,
          toolInfo.resultBlock,
          toolInfo.stateIndex,
          toolInfo.lineCount,
        )
        return
      }
      const thinkingInfo = thinkingBlockRenderInfos.find((r) => r.stateIndex === targetedIndex)
      if (thinkingInfo) {
        renderThinkingBlockContent(
          thinkingInfo.container,
          thinkingInfo.thinkingBlock,
          thinkingInfo.stateIndex,
          thinkingInfo.lineCount,
        )
      }
    },
    expandAll() {
      for (const state of collapsibleStates) {
        state.collapsed = false
      }
      rerenderAllHeaders()
    },
    collapseAll() {
      for (const state of collapsibleStates) {
        state.collapsed = true
      }
      rerenderAllHeaders()
    },
  }
}
