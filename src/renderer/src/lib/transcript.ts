import type { ChatItem } from '@shared/types'
import { usageLine } from './format'

/**
 * Render a test-thread transcript as plain text the authoring agent can read. The
 * authoring agent runs in its own session and can't see the test run, so when the
 * user references it ("/test → the test did X…"), we serialize the thread into the
 * prompt: tester turns, the skill's replies, the tools it ran, files it touched, any
 * errors, and each run's token/cost/model so the agent can judge efficiency too.
 *
 * The transcript is sent IN FULL and is never truncated — a partial transcript yields
 * a partial diagnosis, which defeats the point of referencing the run at all.
 */
export function formatTestTranscript(items: ChatItem[]): string {
  const lines: string[] = []
  for (const it of items) {
    if (it.usage) {
      // per-run metadata: tokens, cost, turns, and the model that actually ran
      const u = it.usage
      const meta = [usageLine(u)]
      if (u.numTurns != null) meta.push(`${u.numTurns} turns`)
      if (u.model) meta.push(u.model)
      lines.push(`  [run: ${meta.join(' · ')}]`)
      continue
    }
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
  return lines.join('\n').trim()
}
