import { createApp } from './app.ts'
import { statSync } from 'fs'

const VERSION = 'ralph-logs 0.1.0'

const HELP = `Usage: ralph-logs [options] [LOG_DIR]

Browse and read ralph-bd session logs in a TUI viewer.

Arguments:
  LOG_DIR                Path to a ralph log directory (default: .ralph-logs)

Options:
  -f, --follow           Live-tail mode (not yet implemented)
  --theme dark|light     Color theme (default: dark)
  -h, --help             Print this help message
  --version              Print version`

const args = (typeof Bun !== 'undefined' ? Bun.argv : process.argv).slice(2)

let logDir: string | null = null

let i = 0
while (i < args.length) {
  const arg = args[i]

  if (arg === '-h' || arg === '--help') {
    console.log(HELP)
    process.exit(0)
  }

  if (arg === '--version') {
    console.log(VERSION)
    process.exit(0)
  }

  if (arg === '-f' || arg === '--follow') {
    console.error('--follow is not yet implemented')
    i++
    continue
  }

  if (arg === '--theme') {
    const val = args[i + 1]
    if (!val || val.startsWith('-')) {
      console.error('Error: --theme requires a value (dark|light)')
      process.exit(1)
    }
    if (val === 'light') {
      console.error('Light theme not yet implemented, using dark')
    }
    i += 2
    continue
  }

  if (arg.startsWith('--theme=')) {
    const val = arg.slice('--theme='.length)
    if (val === 'light') {
      console.error('Light theme not yet implemented, using dark')
    }
    i++
    continue
  }

  if (arg.startsWith('-')) {
    console.error(`Unknown option: ${arg}`)
    process.exit(1)
  }

  // Positional argument
  if (logDir === null) {
    logDir = arg
  }
  i++
}

const resolvedDir = logDir ?? '.ralph-logs'

try {
  const stat = statSync(resolvedDir)
  if (!stat.isDirectory()) {
    console.error(`Error: ${resolvedDir} is not a directory`)
    process.exit(1)
  }
} catch {
  console.error(`Error: directory ${resolvedDir} does not exist`)
  process.exit(1)
}

await createApp(resolvedDir)
