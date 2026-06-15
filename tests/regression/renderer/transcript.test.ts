import { describe, expect, it } from 'vitest'
import { formatTestTranscript } from '@/lib/transcript'
import type { ChatItem } from '@shared/types'

// formatTestTranscript serializes a test thread for the authoring agent (which
// can't see the test session) — tester turns, the skill's replies, the tools it
// ran, files it edited, and errors. Usage lines are dropped.

describe('formatTestTranscript', () => {
  it('labels tester vs skill turns and lists tools, edits, and errors', () => {
    const items: ChatItem[] = [
      { id: '1', role: 'user', text: 'write a subject line', at: 0 },
      {
        id: '2',
        role: 'assistant',
        text: 'Done — here it is.',
        at: 0,
        toolNotes: [{ toolId: 't1', note: 'Reading style-guide.md', done: true, ok: true }]
      },
      { id: '3', role: 'assistant', text: '', at: 0, edit: { tool: 'Write', filePath: 'out.md', before: '', after: 'x' } },
      { id: '4', role: 'assistant', text: '', at: 0, error: 'boom' },
      { id: '5', role: 'assistant', text: '', at: 0, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } }
    ]
    const out = formatTestTranscript(items)
    expect(out).toContain('Tester: write a subject line')
    expect(out).toContain('· Reading style-guide.md')
    expect(out).toContain('Skill: Done — here it is.')
    expect(out).toContain('(skill edited out.md)')
    expect(out).toContain('(error: boom)')
    // usage lines never leak into the transcript
    expect(out).not.toMatch(/inputTokens|usage/i)
  })

  it('keeps the tail of an oversized transcript', () => {
    const big = 'x'.repeat(20_000)
    const items: ChatItem[] = [
      { id: '1', role: 'user', text: big, at: 0 },
      { id: '2', role: 'assistant', text: 'FINAL_MARKER', at: 0 }
    ]
    const out = formatTestTranscript(items)
    expect(out.length).toBeLessThan(20_000)
    expect(out.startsWith('[earlier turns omitted]')).toBe(true)
    expect(out).toContain('FINAL_MARKER') // most-recent turns survive
  })

  it('returns empty string for an empty thread', () => {
    expect(formatTestTranscript([])).toBe('')
  })
})
