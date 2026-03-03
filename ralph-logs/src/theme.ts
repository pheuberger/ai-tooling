type Style = {
  fg?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  inverse?: boolean
}

export const darkTheme = {
  toolHeader: { fg: 'cyan' } satisfies Style,
  toolHeaderBold: { fg: 'cyan', bold: true } satisfies Style,
  toolDetail: { dim: true } satisfies Style,
  toolBorder: { dim: true } satisfies Style,
  error: { fg: 'red' } satisfies Style,
  success: { fg: 'green' } satisfies Style,
  sidebarGroupHeader: { bold: true } satisfies Style,
  sidebarSelected: { inverse: true } satisfies Style,
  sidebarError: { fg: 'red' } satisfies Style,
  statusBar: { inverse: true } satisfies Style,
  statusBarHints: { dim: true } satisfies Style,
  collapsedLineCount: { fg: 'yellow' } satisfies Style,
  thinkingText: { dim: true, italic: true } satisfies Style,
  thinkingHeader: { dim: true } satisfies Style,
}

export const syntaxStyle = {
  keyword: { fg: 'magenta', bold: true } satisfies Style,
  string: { fg: 'green' } satisfies Style,
  comment: { fg: undefined, dim: true, italic: true } satisfies Style,
  number: { fg: 'yellow' } satisfies Style,
  function: { fg: 'blue' } satisfies Style,
  type: { fg: 'cyan' } satisfies Style,
  operator: {} satisfies Style,
  punctuation: { dim: true } satisfies Style,
}
