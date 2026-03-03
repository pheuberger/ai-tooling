export function stripAnsi(text: string): string {
  return text.replace(
    /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][AB012]|\x1b[=>]/g,
    ''
  )
}
