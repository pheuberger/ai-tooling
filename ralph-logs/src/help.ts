import { BoxRenderable, TextRenderable, TextAttributes } from '@opentui/core'

const OVERLAY_WIDTH = 52
const OVERLAY_HEIGHT = 22

const KEYBINDINGS: Array<[string, string]> = [
  ['j / ↓', 'Scroll down / next item'],
  ['k / ↑', 'Scroll up / prev item'],
  ['Ctrl+d', 'Half page down'],
  ['Ctrl+u', 'Half page up'],
  ['g g', 'Jump to top'],
  ['G', 'Jump to bottom'],
  ['Tab', 'Switch panel focus'],
  ['Enter', 'Open file / toggle block'],
  ['Space', 'Toggle block'],
  ['[ / ]', 'Prev / next file'],
  ['e', 'Expand all blocks'],
  ['c', 'Collapse all blocks'],
  ['?', 'Toggle this help'],
  ['q', 'Quit'],
]

export function createHelpOverlay(renderer: any): {
  toggle(): void
  isVisible(): boolean
} {
  let visible = false
  let overlayBox: BoxRenderable | null = null

  function buildOverlay(): BoxRenderable {
    const ctx = renderer.root.ctx

    const termW: number = renderer.width ?? 80
    const termH: number = renderer.height ?? 24

    const left = Math.max(0, Math.floor((termW - OVERLAY_WIDTH) / 2))
    const top = Math.max(0, Math.floor((termH - OVERLAY_HEIGHT) / 2))

    const box = new BoxRenderable(ctx, {
      position: 'absolute',
      left,
      top,
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT,
      flexDirection: 'column',
      border: true,
      borderStyle: 'rounded',
      borderColor: '#888888',
      backgroundColor: '#1a1a1a',
      paddingX: 1,
      paddingY: 0,
      zIndex: 100,
    })

    // Title
    const titleText = new TextRenderable(ctx, {
      content: 'Keyboard Shortcuts',
      attributes: TextAttributes.BOLD,
      alignSelf: 'center',
    })
    box.add(titleText)

    // Spacer
    const spacer = new TextRenderable(ctx, { content: '' })
    box.add(spacer)

    // Keybinding rows
    for (const [key, desc] of KEYBINDINGS) {
      const rowBox = new BoxRenderable(ctx, {
        flexDirection: 'row',
        width: '100%',
      })

      const keyText = new TextRenderable(ctx, {
        content: key.padEnd(14),
        attributes: TextAttributes.BOLD,
        width: 14,
      })

      const descText = new TextRenderable(ctx, {
        content: desc,
        attributes: TextAttributes.DIM,
      })

      rowBox.add(keyText)
      rowBox.add(descText)
      box.add(rowBox)
    }

    // Footer spacer
    const footerSpacer = new TextRenderable(ctx, { content: '' })
    box.add(footerSpacer)

    // Footer
    const footerText = new TextRenderable(ctx, {
      content: 'Press ? or Esc to close',
      attributes: TextAttributes.DIM,
      alignSelf: 'center',
    })
    box.add(footerText)

    return box
  }

  return {
    toggle() {
      if (!visible) {
        overlayBox = buildOverlay()
        renderer.root.add(overlayBox)
        visible = true
      } else {
        if (overlayBox !== null) {
          renderer.root.remove(overlayBox.id)
          overlayBox = null
        }
        visible = false
      }
    },
    isVisible() {
      return visible
    },
  }
}
