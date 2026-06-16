/**
 * The `/token` the caret sits inside, if any — `start` is its offset into the text.
 * Shared by every composer with a "/" menu (document skills, studio authoring, skill test).
 */
export function slashTokenAt(text: string, caret: number): { start: number; query: string } | null {
  const m = text.slice(0, caret).match(/(?:^|\s)(\/[a-z0-9-]*)$/i)
  if (!m) return null
  return { start: caret - m[1].length, query: m[1].slice(1) }
}

/**
 * Remove the `/token` that begins at `start` (the token = "/" then `[a-z0-9-]*`).
 * Scans the token's extent from `start` rather than trusting a textarea caret, which
 * is stale once focus has moved into a menu's own input.
 */
export function removeSlashToken(text: string, start: number): string {
  let end = start + 1
  while (end < text.length && /[a-z0-9-]/i.test(text[end])) end++
  return text.slice(0, start) + text.slice(end)
}
