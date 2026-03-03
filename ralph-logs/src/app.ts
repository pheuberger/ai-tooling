import { createCliRenderer, BoxRenderable, TextRenderable } from '@opentui/core'
import { SIDEBAR_WIDTH } from './constants.ts'
import { createContent } from './content.ts'
import { createStatusBar } from './statusbar.ts'
import { createSidebar } from './sidebar.ts'
import { discoverLogFiles } from './parser/discovery.ts'
import { parseStreamJson } from './parser/stream-json.ts'
import { parsePlainText } from './parser/plaintext.ts'
import type { LogFile, ParsedLog } from './types.ts'

export async function createApp(logDir: string): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })

  const files = await discoverLogFiles(logDir)

  if (files.length === 0) {
    const rootBox = new BoxRenderable(renderer, {
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    })
    const emptyText = new TextRenderable(renderer, {
      content: `No log files found in ${logDir}`,
    })
    rootBox.add(emptyText)
    renderer.root.add(rootBox)
    return
  }

  const rootBox = new BoxRenderable(renderer, {
    flexDirection: 'column',
    width: '100%',
    height: '100%',
  })

  const mainBox = new BoxRenderable(renderer, {
    flexDirection: 'row',
    flexGrow: 1,
  })

  const sidebarBox = new BoxRenderable(renderer, {
    width: SIDEBAR_WIDTH,
    borderStyle: 'single',
    border: true,
    borderColor: 'white',
  })

  const sidebar = createSidebar(sidebarBox, files)

  const contentBox = new BoxRenderable(renderer, {
    flexGrow: 1,
  })
  const content = createContent(contentBox)

  const statusBarBox = new BoxRenderable(renderer, {
    height: 1,
    width: '100%',
  })
  const statusBar = createStatusBar(statusBarBox)

  mainBox.add(sidebarBox)
  mainBox.add(contentBox)
  rootBox.add(mainBox)
  rootBox.add(statusBarBox)
  renderer.root.add(rootBox)

  // Parse cache
  const cache = new Map<string, ParsedLog>()

  // View state memory: scroll position + collapse states per file
  type FileViewState = { scrollY: number; collapseStates: boolean[] }
  const viewStates = new Map<string, FileViewState>()
  let currentFilePath: string | null = null

  async function loadFile(file: LogFile) {
    // Save current view state before switching away
    if (currentFilePath !== null) {
      viewStates.set(currentFilePath, {
        scrollY: content.getScrollY(),
        collapseStates: content.getCollapseStates(),
      })
    }

    let parsedLog = cache.get(file.path)
    if (!parsedLog) {
      if (file.format === 'stream-json') {
        parsedLog = await parseStreamJson(file.path)
      } else {
        parsedLog = await parsePlainText(file.path)
      }
      cache.set(file.path, parsedLog)
    }
    content.loadBlocks(parsedLog.blocks)
    statusBar.update(file, parsedLog.metadata)

    // Restore or reset view state
    const savedState = viewStates.get(file.path)
    if (savedState) {
      content.setCollapseStates(savedState.collapseStates)
      content.setScrollY(savedState.scrollY)
    } else {
      content.setScrollY(0)
    }

    currentFilePath = file.path
  }

  sidebar.setOnSelect((file) => {
    loadFile(file).catch(() => {})
  })

  // Mark errored files in sidebar by reading last line of each stream-json file
  async function markErrorFiles() {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.format !== 'stream-json') continue
      try {
        const text = await Bun.file(file.path).text()
        const lines = text.split('\n').filter((l: string) => l.trim())
        if (lines.length === 0) continue
        const lastLine = lines[lines.length - 1]
        const parsed = JSON.parse(lastLine)
        if (parsed && parsed.type === 'result' && parsed.subtype === 'error') {
          sidebar.setFileError(i)
        }
      } catch {
        // ignore unreadable or non-JSON files
      }
    }
  }
  markErrorFiles().catch(() => {})

  // Auto-select first file
  const firstFile = sidebar.getSelectedFile()
  if (firstFile) {
    await loadFile(firstFile)
  }

  // Focus tracking: 'sidebar' | 'content', default sidebar
  let focus: 'sidebar' | 'content' = 'sidebar'

  function updateFocusVisual() {
    sidebarBox.borderColor = focus === 'sidebar' ? 'white' : '#555555'
  }

  renderer.keyInput.on('keypress', (key) => {
    if (key.name === 'q') {
      process.exit(0)
    }

    if (key.name === 'tab') {
      focus = focus === 'sidebar' ? 'content' : 'sidebar'
      updateFocusVisual()
      return
    }

    if (key.name === 'j' || key.name === 'down') {
      if (focus === 'sidebar') {
        sidebar.moveSelection(+1)
      } else {
        content.scrollBy(1)
      }
      return
    }

    if (key.name === 'k' || key.name === 'up') {
      if (focus === 'sidebar') {
        sidebar.moveSelection(-1)
      } else {
        content.scrollBy(-1)
      }
      return
    }

    if (key.name === 'd' && key.ctrl) {
      content.scrollByPage(+1)
      return
    }

    if (key.name === 'u' && key.ctrl) {
      content.scrollByPage(-1)
      return
    }

    if (key.name === 'return') {
      if (focus === 'sidebar') {
        const file = sidebar.getSelectedFile()
        if (file) loadFile(file).catch(() => {})
      } else {
        content.toggleTargetedBlock()
      }
      return
    }

    if (key.name === 'space' && focus === 'content') {
      content.toggleTargetedBlock()
      return
    }
  })
}
