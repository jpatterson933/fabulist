import type { ChatItem } from '@shared/types'

/** Keep a referenced transcript from ballooning the prompt; the tail is the most relevant. */
const MAX_CHARS = 12_000

/**
 * Render a test-thread transcript as plain text the authoring agent can read. The
 * authoring agent runs in its own session and can't see the test run, so when the
 * user references it ("/ test → the test did X…"), we serialize the thread into the
 * prompt: tester turns, the skill's replies, the tools it ran, files it touched, and
 * any errors. Oversized transcripts keep their tail (most recent turns).
 */
export function formatTestTranscript(items: ChatItem[]): string {
  const lines: string[] = []
  for (const it of items) {
    if (it.usage) continue // token/cost lines aren't useful context
    if (it.role === 'user') {
      if (it.text.trim()) lines.push(`Tester: ${it.text.trim()}`)
      continue
    }
    if (it.edit) {
      lines.push(`  (skill edited ${it.edit.filePath ?? 'a file'})`)
      continue
    }
    if (it.error) {
      lines.push(`  (error: ${it.error})`)
      continue
    }
    for (const note of it.toolNotes ?? []) lines.push(`  · ${note.note}`)
    if (it.text.trim()) lines.push(`Skill: ${it.text.trim()}`)
  }
  const text = lines.join('\n').trim()
  if (text.length <= MAX_CHARS) return text
  return `[earlier turns omitted]\n${text.slice(text.length - MAX_CHARS)}`
}
