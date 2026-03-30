import { createCliRenderer, BoxRenderable, TextRenderable } from '@opentui/core'
import { SIDEBAR_WIDTH, FOLLOW_POLL_INTERVAL, DIR_POLL_INTERVAL } from './constants.ts'
import { createContent } from './content.ts'
import { createStatusBar } from './statusbar.ts'
import { createSidebar } from './sidebar.ts'
import { createHelpOverlay } from './help.ts'
import { discoverLogFiles } from './parser/discovery.ts'
import { parseStreamJson } from './parser/stream-json.ts'
import { parsePlainText } from './parser/plaintext.ts'
import { detectPalette } from './theme.ts'
import { statSync } from 'fs'
import type { LogFile, ParsedLog } from './types.ts'

export async function createApp(logDir: string): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })

  // Detect the user's terminal colors (OSC query → ANSI palette → theme mode → fallback)
  const palette = await detectPalette(renderer)
  renderer.setBackgroundColor(palette.bg)

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
      fg: palette.fg,
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
    borderColor: palette.borderFocused,
  })

  const sidebar = createSidebar(sidebarBox, files, palette)

  const contentBox = new BoxRenderable(renderer, {
    flexGrow: 1,
    paddingX: 1,
  })
  const content = createContent(contentBox, palette)

  const statusBarBox = new BoxRenderable(renderer, {
    height: 1,
    width: '100%',
  })
  const statusBar = createStatusBar(statusBarBox, palette)

  mainBox.add(sidebarBox)
  mainBox.add(contentBox)
  rootBox.add(mainBox)
  rootBox.add(statusBarBox)
  renderer.root.add(rootBox)

  // Parse cache (LRU, keeps last 5 files)
  const LRU_MAX = 5
  const cache = new Map<string, ParsedLog>()
  function cacheSet(key: string, value: ParsedLog) {
    cache.delete(key) // move to end
    cache.set(key, value)
    if (cache.size > LRU_MAX) {
      cache.delete(cache.keys().next().value!)
    }
  }

  // View state memory: scroll position + collapse states per file
  type FileViewState = { scrollY: number; collapseStates: boolean[] }
  const viewStates = new Map<string, FileViewState>()
  let currentFilePath: string | null = null
  let currentFileMtime = 0
  let currentFileSize = 0

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
      cacheSet(file.path, parsedLog)
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
    try {
      const st = statSync(file.path)
      currentFileMtime = st.mtimeMs
      currentFileSize = st.size
    } catch { /* ignore */ }
  }

  sidebar.setOnSelect((file) => {
    loadFile(file).catch(() => {})
  })

  // Mark errored files in sidebar by reading last line of each stream-json file
  async function markErrorFiles() {
    const sidebarFiles = sidebar.getFiles()
    const { promises: fsp, statSync: fstatSync } = await import('fs')
    for (let i = 0; i < sidebarFiles.length; i++) {
      const file = sidebarFiles[i]
      if (file.format !== 'stream-json') continue
      try {
        // Read only the last 4KB to find the final line
        const TAIL_SIZE = 4096
        const stat = fstatSync(file.path)
        const fd = await fsp.open(file.path, 'r')
        try {
          const readSize = Math.min(TAIL_SIZE, stat.size)
          const buf = Buffer.alloc(readSize)
          await fd.read(buf, 0, readSize, Math.max(0, stat.size - readSize))
          const tail = buf.toString('utf-8')
          const lines = tail.split('\n').filter((l: string) => l.trim())
          if (lines.length === 0) continue
          const lastLine = lines[lines.length - 1]
          const parsed = JSON.parse(lastLine)
          if (parsed && parsed.type === 'result' && parsed.subtype === 'error') {
            sidebar.setFileError(i)
          }
        } finally {
          await fd.close()
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

  // Reload the currently viewed file (preserving scroll/collapse state)
  async function reloadCurrentFile(file: LogFile) {
    const savedScrollY = content.getScrollY()
    const savedCollapse = content.getCollapseStates()
    const wasAtBottom = content.isAtBottom()

    cache.delete(file.path)
    let parsedLog: ParsedLog
    if (file.format === 'stream-json') {
      parsedLog = await parseStreamJson(file.path)
    } else {
      parsedLog = await parsePlainText(file.path)
    }
    cacheSet(file.path, parsedLog)

    content.loadBlocks(parsedLog.blocks)
    content.setCollapseStates(savedCollapse)
    if (wasAtBottom) {
      content.scrollToBottom()
    } else {
      content.setScrollY(savedScrollY)
    }
    statusBar.update(file, parsedLog.metadata)
  }

  // Re-discover log files and update sidebar if changed
  async function refreshDirectory() {
    const newFiles = await discoverLogFiles(logDir)
    const oldFiles = sidebar.getFiles()
    const oldPaths = oldFiles.map((f) => f.path).join('\0')
    const newPaths = newFiles.map((f) => f.path).join('\0')
    if (oldPaths === newPaths) return
    sidebar.updateFiles(newFiles)
    markErrorFiles().catch(() => {})
    // If the currently viewed file was removed, load whatever is now selected
    if (currentFilePath && !newFiles.some((f) => f.path === currentFilePath)) {
      const sel = sidebar.getSelectedFile()
      if (sel) await loadFile(sel)
    }
  }

  // Poll loops for auto-refresh
  let reloadInFlight = false
  setInterval(() => {
    if (!currentFilePath || reloadInFlight) return
    try {
      const st = statSync(currentFilePath)
      if (st.mtimeMs === currentFileMtime && st.size === currentFileSize) return
      currentFileMtime = st.mtimeMs
      currentFileSize = st.size
    } catch { return }
    cache.delete(currentFilePath)
    const file = sidebar.getSelectedFile()
    if (file && file.path === currentFilePath) {
      reloadInFlight = true
      reloadCurrentFile(file)
        .catch(() => {})
        .finally(() => { reloadInFlight = false })
    }
  }, FOLLOW_POLL_INTERVAL)

  setInterval(() => {
    refreshDirectory().catch(() => {})
  }, DIR_POLL_INTERVAL)

  // Focus tracking: 'sidebar' | 'content', default sidebar
  let focus: 'sidebar' | 'content' = 'sidebar'

  function updateFocusVisual() {
    sidebarBox.borderColor = focus === 'sidebar' ? palette.borderFocused : palette.borderBlurred
  }

  const helpOverlay = createHelpOverlay(renderer, palette)

  // 'gg' sequence state
  let pendingG = false
  let pendingGTimer: ReturnType<typeof setTimeout> | null = null

  function clearPendingG() {
    pendingG = false
    if (pendingGTimer !== null) {
      clearTimeout(pendingGTimer)
      pendingGTimer = null
    }
  }

  function triggerSelectFile(delta: number) {
    sidebar.moveSelection(delta)
    // onSelect callback is already triggered inside moveSelection
  }

  renderer.keyInput.on('keypress', (key) => {
    // Help overlay: when visible only allow ? and Escape
    if (helpOverlay.isVisible()) {
      if (key.name === '?' || (key.sequence === '?' )) {
        helpOverlay.toggle()
      } else if (key.name === 'escape') {
        helpOverlay.toggle()
      }
      return
    }

    if (key.name === 'q') {
      process.exit(0)
    }

    if (key.name === '?') {
      helpOverlay.toggle()
      return
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

    // gg → scroll to top
    if (key.name === 'g' && !key.shift && !key.ctrl) {
      if (pendingG) {
        clearPendingG()
        content.scrollToTop()
      } else {
        pendingG = true
        pendingGTimer = setTimeout(() => {
          pendingG = false
          pendingGTimer = null
        }, 500)
      }
      return
    }

    // Clear pending g if any other key pressed
    if (pendingG) {
      clearPendingG()
    }

    // G → scroll to bottom
    if (key.name === 'G' || (key.name === 'g' && key.shift)) {
      content.scrollToBottom()
      return
    }

    // [ / ] → prev/next iteration group (works from either panel)
    if (key.name === '[' || key.sequence === '[') {
      sidebar.moveToIterGroup(-1)
      return
    }

    if (key.name === ']' || key.sequence === ']') {
      sidebar.moveToIterGroup(+1)
      return
    }

    // h / l → prev/next iteration group (works from either panel)
    if (key.name === 'h' || key.name === 'left') {
      sidebar.moveToIterGroup(-1)
      return
    }

    if (key.name === 'l' || key.name === 'right') {
      sidebar.moveToIterGroup(+1)
      return
    }

    // e → expand all
    if (key.name === 'e') {
      content.expandAll()
      return
    }

    // c → collapse all
    if (key.name === 'c') {
      content.collapseAll()
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
