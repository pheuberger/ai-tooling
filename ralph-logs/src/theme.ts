/** Terminal-detected palette colors, resolved at startup */
export type TerminalPalette = {
  fg: string       // terminal's default foreground (hex)
  bg: string       // terminal's default background (hex)
  dimFg: string    // derived: dimmed foreground
  borderFocused: string
  borderBlurred: string
}

/** Blend a hex color toward a target by amount (0-1) */
function blendToward(hex: string, target: string, amount: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
  const [r1, g1, b1] = parse(hex)
  const [r2, g2, b2] = parse(target)
  const r = Math.round(r1 + (r2 - r1) * amount)
  const g = Math.round(g1 + (g2 - g1) * amount)
  const b = Math.round(b1 + (b2 - b1) * amount)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/** Normalize a detected color to 6-digit hex. Handles #rgb, #rrggbb, #rrrrggggbbbb */
function normalizeHex(raw: string): string {
  let s = raw.startsWith('#') ? raw.slice(1) : raw
  if (s.length === 3) {
    s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
  } else if (s.length === 12) {
    // 48-bit color: take high byte of each channel
    s = s.slice(0, 2) + s.slice(4, 6) + s.slice(8, 10)
  } else if (s.length !== 6) {
    return '#888888' // shouldn't happen, safe fallback
  }
  return '#' + s
}

export function buildPalette(detectedFg: string | null, detectedBg: string | null): TerminalPalette {
  const fg = detectedFg ? normalizeHex(detectedFg) : '#d4d4d4'
  const bg = detectedBg ? normalizeHex(detectedBg) : '#1e1e1e'
  return {
    fg,
    bg,
    dimFg: blendToward(fg, bg, 0.5),
    borderFocused: blendToward(fg, bg, 0.3),
    borderBlurred: blendToward(fg, bg, 0.7),
  }
}

/** Try to detect terminal colors from the renderer, with multiple fallbacks */
export async function detectPalette(renderer: any): Promise<TerminalPalette> {
  // 1. Check env var overrides first
  const envFg = process.env.RALPH_FG
  const envBg = process.env.RALPH_BG
  if (envFg && envBg) {
    return buildPalette(envFg, envBg)
  }

  // 2. Try OSC palette detection
  let detectedFg: string | null = null
  let detectedBg: string | null = null
  try {
    const colors = await renderer.getPalette({ timeout: 2000 })
    detectedFg = colors.defaultForeground
    detectedBg = colors.defaultBackground
    // If default colors are null, try ANSI palette entries
    if (!detectedFg && colors.palette?.[7]) detectedFg = colors.palette[7]
    if (!detectedBg && colors.palette?.[0]) detectedBg = colors.palette[0]
  } catch {
    // palette detection unsupported or timed out
  }

  // Apply env overrides on top if only one was set
  if (envFg) detectedFg = envFg
  if (envBg) detectedBg = envBg

  if (!detectedFg || !detectedBg) {
    // 3. Fall back to theme mode detection
    try {
      const mode = renderer.themeMode
      if (mode === 'light') {
        if (!detectedFg) detectedFg = '#333333'
        if (!detectedBg) detectedBg = '#ffffff'
      }
    } catch {
      // themeMode not available
    }
  }

  return buildPalette(detectedFg, detectedBg)
}
