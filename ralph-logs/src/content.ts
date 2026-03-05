import { BoxRenderable, TextRenderable, ScrollBoxRenderable, TextAttributes } from '@opentui/core'
import type { ConversationBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock } from './types.ts'
import { AUTO_EXPAND_THRESHOLD, TOOL_OUTPUT_CAP, BASH_DETAIL_TRUNCATE } from './constants.ts'
import type { TerminalPalette } from './theme.ts'

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

export function createContent(parentBox: any, palette: TerminalPalette) {
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

  function addSpacer() {
    const spacer = new TextRenderable(ctx, { content: '' })
    scrollBox.add(spacer)
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

    const chevron = (resultBlock === null)
      ? '  '
      : state.collapsed ? '▸ ' : '▾ '

    // Header line: ▸ ToolName detail
    const headerBox = new BoxRenderable(ctx, {
      flexDirection: 'row',
      width: '100%',
    })

    const chevronText = new TextRenderable(ctx, {
      content: chevron,
      fg: palette.dimFg,
      bg: isTargeted ? palette.fg : undefined,
      attributes: isTargeted ? TextAttributes.INVERSE : 0,
    })
    headerBox.add(chevronText)

    const nameText = new TextRenderable(ctx, {
      content: useBlock.name,
      fg: isTargeted ? palette.bg : palette.fg,
      bg: isTargeted ? palette.fg : undefined,
      attributes: TextAttributes.BOLD,
    })
    headerBox.add(nameText)

    if (detail) {
      const space = new TextRenderable(ctx, {
        content: ' ',
        fg: isTargeted ? palette.bg : palette.fg,
        bg: isTargeted ? palette.fg : undefined,
      })
      headerBox.add(space)

      const detailText = new TextRenderable(ctx, {
        content: detail,
        fg: isTargeted ? palette.bg : palette.dimFg,
        bg: isTargeted ? palette.fg : undefined,
      })
      headerBox.add(detailText)
    }

    if (resultBlock !== null && state.collapsed) {
      const countText = new TextRenderable(ctx, {
        content: `  ${lineCount} lines`,
        fg: isTargeted ? palette.bg : palette.dimFg,
        bg: isTargeted ? palette.fg : undefined,
      })
      headerBox.add(countText)
    }

    container.add(headerBox)

    if (resultBlock === null) {
      return
    }

    if (!state.collapsed) {
      // Expanded view: content lines
      const content = resultBlock.content
      const lines = content.split('\n')
      const displayLines = lines.length > TOOL_OUTPUT_CAP ? lines.slice(0, TOOL_OUTPUT_CAP) : lines

      for (const line of displayLines) {
        const lineRow = new BoxRenderable(ctx, { flexDirection: 'row' })
        const borderChar = new TextRenderable(ctx, {
          content: '  │ ',
          fg: palette.dimFg,
        })
        const lineContent = new TextRenderable(ctx, {
          content: line,
          fg: resultBlock.isError ? '#d75f5f' : palette.fg,
        })
        lineRow.add(borderChar)
        lineRow.add(lineContent)
        container.add(lineRow)
      }

      if (lines.length > TOOL_OUTPUT_CAP) {
        const truncMsg = new TextRenderable(ctx, {
          content: `  … truncated (${lines.length} total lines)`,
          fg: palette.dimFg,
        })
        container.add(truncMsg)
      }
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
    const chevron = state.collapsed ? '▸ ' : '▾ '

    // Header line: ▸ Thinking
    const headerBox = new BoxRenderable(ctx, {
      flexDirection: 'row',
      width: '100%',
    })

    const chevronText = new TextRenderable(ctx, {
      content: chevron,
      fg: palette.dimFg,
      bg: isTargeted ? palette.fg : undefined,
      attributes: isTargeted ? TextAttributes.INVERSE : 0,
    })
    headerBox.add(chevronText)

    const labelText = new TextRenderable(ctx, {
      content: 'Thinking',
      fg: isTargeted ? palette.bg : palette.dimFg,
      bg: isTargeted ? palette.fg : undefined,
      attributes: TextAttributes.ITALIC,
    })
    headerBox.add(labelText)

    if (state.collapsed) {
      const countText = new TextRenderable(ctx, {
        content: `  ${lineCount} lines`,
        fg: isTargeted ? palette.bg : palette.dimFg,
        bg: isTargeted ? palette.fg : undefined,
      })
      headerBox.add(countText)
    }

    container.add(headerBox)

    if (!state.collapsed) {
      const lines = thinkingBlock.thinking.split('\n')
      const displayLines = lines.length > TOOL_OUTPUT_CAP ? lines.slice(0, TOOL_OUTPUT_CAP) : lines

      for (const line of displayLines) {
        const lineRow = new BoxRenderable(ctx, { flexDirection: 'row' })
        const borderChar = new TextRenderable(ctx, {
          content: '  │ ',
          fg: palette.dimFg,
        })
        const lineContent = new TextRenderable(ctx, {
          content: line,
          fg: palette.dimFg,
          attributes: TextAttributes.ITALIC,
        })
        lineRow.add(borderChar)
        lineRow.add(lineContent)
        container.add(lineRow)
      }

      if (lines.length > TOOL_OUTPUT_CAP) {
        const truncMsg = new TextRenderable(ctx, {
          content: `  … truncated (${lines.length} total lines)`,
          fg: palette.dimFg,
        })
        container.add(truncMsg)
      }
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
        fg: palette.dimFg,
        alignSelf: 'center',
      })
      scrollBox.add(emptyText)
      return
    }

    // Add top spacing
    addSpacer()

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]

      if (block.type === 'text') {
        if (!block.text) continue
        const textNode = new TextRenderable(ctx, {
          content: block.text,
          fg: palette.fg,
          wrapMode: 'word',
        })
        scrollBox.add(textNode)
        addSpacer()
      } else if (block.type === 'error') {
        const errorBox = new BoxRenderable(ctx, {
          flexDirection: 'row',
          width: '100%',
        })
        const errorPrefix = new TextRenderable(ctx, {
          content: '✗ ',
          fg: '#d75f5f',
          attributes: TextAttributes.BOLD,
        })
        const errorText = new TextRenderable(ctx, {
          content: block.text,
          fg: '#d75f5f',
          wrapMode: 'word',
        })
        errorBox.add(errorPrefix)
        errorBox.add(errorText)
        scrollBox.add(errorBox)
        addSpacer()
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
        addSpacer()
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
        addSpacer()
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
