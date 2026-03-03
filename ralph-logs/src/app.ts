import { createCliRenderer, BoxRenderable, TextRenderable, TextAttributes } from '@opentui/core'
import { SIDEBAR_WIDTH } from './constants.ts'
import { createContent } from './content.ts'
import { createStatusBar } from './statusbar.ts'
import { createSidebar } from './sidebar.ts'
import type { LogFile } from './types.ts'

export async function createApp() {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })

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
  })

  const testFiles: LogFile[] = [
    {
      path: 'a',
      filename: 'a',
      phase: 'plan',
      agentType: 'lead',
      format: 'stream-json',
      groupKey: 'plan',
      displayLabel: 'lead',
    },
    {
      path: 'b',
      filename: 'b',
      phase: 'iteration',
      agentType: 'worker',
      format: 'stream-json',
      groupKey: 'iter-1',
      beadId: 'auth-1',
      iterationNumber: 1,
      displayLabel: 'auth-1 worker',
    },
  ]
  const sidebar = createSidebar(sidebarBox, testFiles)

  const contentBox = new BoxRenderable(renderer, {
    flexGrow: 1,
  })

  const content = createContent(contentBox)
  content.loadBlocks([
    { type: 'text', text: 'Before tool' },
    { type: 'tool_use', name: 'Read', input: { file_path: 'src/auth.ts' }, id: 't1' },
    { type: 'tool_result', toolUseId: 't1', content: 'line1\nline2\nline3', isError: false },
    { type: 'tool_use', name: 'Bash', input: { command: 'npm test' }, id: 't2' },
    { type: 'tool_result', toolUseId: 't2', content: Array(20).fill('output line').join('\n'), isError: false },
    { type: 'tool_use', name: 'Edit', input: { file_path: 'src/index.ts' }, id: 't3' },
    { type: 'tool_result', toolUseId: 't3', content: 'Error: file not found', isError: true },
  ])

  setTimeout(() => {
    content.scrollBy(3)
  }, 1000)

  mainBox.add(sidebarBox)
  mainBox.add(contentBox)

  const statusBarBox = new BoxRenderable(renderer, {
    height: 1,
    width: '100%',
  })
  const statusBar = createStatusBar(statusBarBox)
  statusBar.update(
    {
      path: '',
      filename: '',
      phase: 'iteration',
      agentType: 'worker',
      format: 'stream-json',
      groupKey: 'auth-1',
      beadId: 'auth-1',
      iterationNumber: 1,
      displayLabel: 'auth-1 worker',
    },
    {
      model: 'opus-4',
      durationMs: 154000,
      totalCostUsd: 0.12,
      subtype: 'success',
    },
  )

  rootBox.add(mainBox)
  rootBox.add(statusBarBox)
  renderer.root.add(rootBox)

  return { renderer, sidebarBox, contentBox, statusBarBox, content, sidebar }
}
