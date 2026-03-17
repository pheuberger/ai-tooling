import { BoxRenderable, TextRenderable, ScrollBoxRenderable, TextAttributes } from '@opentui/core'
import type { LogFile } from './types.ts'
import { SIDEBAR_WIDTH } from './constants.ts'
import type { TerminalPalette } from './theme.ts'

function getGroupHeader(groupKey: string): string {
  if (groupKey === 'plan') return 'Plan'
  if (groupKey.startsWith('iter-')) {
    const n = groupKey.slice(5)
    return `Iteration ${n}`
  }
  if (groupKey === 'post-run') return 'Post-run'
  return 'Other'
}

function truncateLabel(label: string, prefixLen = 0): string {
  const maxLen = SIDEBAR_WIDTH - 4 - prefixLen  // account for border + indent
  if (label.length > maxLen) {
    return label.slice(0, maxLen - 1) + '…'
  }
  return label
}

export function createSidebar(
  parentBox: any,
  files: LogFile[],
  palette: TerminalPalette,
): {
  getSelectedFile(): LogFile | null
  getSelectedIndex(): number
  moveSelection(delta: number): void
  moveToIterGroup(delta: number): void
  setOnSelect(cb: (file: LogFile) => void): void
  setFileError(fileIndex: number): void
} {
  const ctx = parentBox.ctx

  let selectedIndex = files.length > 0 ? 0 : -1
  let onSelectCallback: ((file: LogFile) => void) | null = null
  const erroredFiles = new Set<number>()

  // Build group structure (maintaining insertion order)
  const groupOrder: string[] = []
  const groupMap = new Map<string, LogFile[]>()

  for (const file of files) {
    if (!groupMap.has(file.groupKey)) {
      groupOrder.push(file.groupKey)
      groupMap.set(file.groupKey, [])
    }
    groupMap.get(file.groupKey)!.push(file)
  }

  // Clear parentBox children and add ScrollBox
  const clearParent = () => {
    const children = [...parentBox.getChildren()]
    for (const child of children) {
      parentBox.remove(child.id)
    }
  }

  clearParent()

  const scrollBox = new ScrollBoxRenderable(ctx, {
    scrollY: true,
    flexGrow: 1,
  })
  parentBox.add(scrollBox)

  // Track y-position of each flat file index for scrolling
  const entryPositions: number[] = []

  function render() {
    const children = [...scrollBox.getChildren()]
    for (const child of children) {
      scrollBox.remove(child.id)
    }

    entryPositions.length = 0
    let currentY = 0
    let flatFileIndex = 0
    let isFirstGroup = true

    for (const groupKey of groupOrder) {
      const groupFiles = groupMap.get(groupKey)!
      if (groupFiles.length === 0) continue

      // Blank line between groups (except before first)
      if (!isFirstGroup) {
        const groupSpacer = new TextRenderable(ctx, { content: '' })
        scrollBox.add(groupSpacer)
        currentY++
      }
      isFirstGroup = false

      const header = new TextRenderable(ctx, {
        content: ` ${getGroupHeader(groupKey)}`,
        fg: palette.dimFg,
        attributes: TextAttributes.BOLD,
      })
      scrollBox.add(header)
      currentY++

      for (const file of groupFiles) {
        const isError = erroredFiles.has(flatFileIndex)
        const isSelected = flatFileIndex === selectedIndex

        if (isError) {
          const label = truncateLabel(file.displayLabel, 4)
          const rowBox = new BoxRenderable(ctx, { flexDirection: 'row', width: '100%' })
          const indent = new TextRenderable(ctx, {
            content: '  ',
            fg: isSelected ? palette.bg : palette.fg,
            bg: isSelected ? palette.fg : undefined,
          })
          const errorMark = new TextRenderable(ctx, {
            content: '✗ ',
            fg: '#d75f5f',
            bg: isSelected ? palette.fg : undefined,
          })
          const labelText = new TextRenderable(ctx, {
            content: label,
            fg: isSelected ? palette.bg : palette.fg,
            bg: isSelected ? palette.fg : undefined,
          })
          rowBox.add(indent)
          rowBox.add(errorMark)
          rowBox.add(labelText)
          scrollBox.add(rowBox)
        } else {
          const label = truncateLabel(file.displayLabel, 2)
          const rowBox = new BoxRenderable(ctx, { flexDirection: 'row', width: '100%' })
          const indent = new TextRenderable(ctx, {
            content: '  ',
            fg: isSelected ? palette.bg : palette.fg,
            bg: isSelected ? palette.fg : undefined,
          })
          const labelText = new TextRenderable(ctx, {
            content: label,
            fg: isSelected ? palette.bg : palette.fg,
            bg: isSelected ? palette.fg : undefined,
          })
          rowBox.add(indent)
          rowBox.add(labelText)
          scrollBox.add(rowBox)
        }

        entryPositions[flatFileIndex] = currentY
        currentY++
        flatFileIndex++
      }
    }
  }

  render()

  return {
    getSelectedFile() {
      if (selectedIndex < 0 || selectedIndex >= files.length) return null
      return files[selectedIndex]
    },
    getSelectedIndex() {
      return selectedIndex
    },
    moveSelection(delta: number) {
      if (files.length === 0) return
      const newIndex = Math.max(0, Math.min(files.length - 1, selectedIndex + delta))
      if (newIndex === selectedIndex) return
      selectedIndex = newIndex
      render()
      if (selectedIndex >= 0 && selectedIndex < entryPositions.length) {
        scrollBox.scrollTo(entryPositions[selectedIndex])
      }
      if (onSelectCallback) {
        onSelectCallback(files[selectedIndex])
      }
    },
    moveToIterGroup(delta: number) {
      if (files.length === 0 || selectedIndex < 0) return
      const currentGroup = files[selectedIndex].groupKey
      if (delta > 0) {
        // Find first file in the next iteration group
        for (let i = selectedIndex + 1; i < files.length; i++) {
          if (files[i].groupKey !== currentGroup && files[i].groupKey.startsWith('iter-')) {
            selectedIndex = i
            render()
            if (selectedIndex < entryPositions.length) scrollBox.scrollTo(entryPositions[selectedIndex])
            if (onSelectCallback) onSelectCallback(files[selectedIndex])
            return
          }
        }
      } else {
        // Find first file of the previous iteration group
        // First, find the start of the current group
        let groupStart = selectedIndex
        while (groupStart > 0 && files[groupStart - 1].groupKey === currentGroup) groupStart--
        // Now search backward from there for an iter- group
        for (let i = groupStart - 1; i >= 0; i--) {
          if (files[i].groupKey.startsWith('iter-')) {
            // Jump to first file in that group
            let start = i
            while (start > 0 && files[start - 1].groupKey === files[i].groupKey) start--
            selectedIndex = start
            render()
            if (selectedIndex < entryPositions.length) scrollBox.scrollTo(entryPositions[selectedIndex])
            if (onSelectCallback) onSelectCallback(files[selectedIndex])
            return
          }
        }
      }
    },
    setOnSelect(cb: (file: LogFile) => void) {
      onSelectCallback = cb
    },
    setFileError(fileIndex: number) {
      erroredFiles.add(fileIndex)
      render()
    },
  }
}
