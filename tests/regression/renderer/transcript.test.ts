import { describe, expect, it } from 'vitest'
import { formatTestTranscript } from '@/lib/transcript'
import type { ChatItem } from '@shared/types'

// formatTestTranscript serializes a test thread for the authoring agent (which
// can't see the test session) — tester turns, the skill's replies, the tools it
// ran, files it edited, errors, and each run's token/cost/turns/model. The whole
// transcript is sent in full; nothing is truncated.

describe('formatTestTranscript', () => {
  it('labels tester vs skill turns and lists tools, edits, errors, and run usage', () => {
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
      {
        id: '5',
        role: 'assistant',
        text: '',
        at: 0,
        usage: { inputTokens: 12, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.5, numTurns: 3, model: 'claude-opus-4' }
      }
    ]
    const out = formatTestTranscript(items)
    expect(out).toContain('Tester: write a subject line')
    expect(out).toContain('· Reading style-guide.md')
    expect(out).toContain('Skill: Done — here it is.')
    expect(out).toContain('(skill edited out.md)')
    expect(out).toContain('(error: boom)')
    // the run's usage — tokens, cost, turns, and the model — is now woven in
    expect(out).toContain('[run: 12 in · 5 out · $0.5000 · 3 turns · claude-opus-4]')
  })

  it('keeps the full transcript without truncating', () => {
    const big = 'x'.repeat(20_000)
    const items: ChatItem[] = [
      { id: '1', role: 'user', text: big, at: 0 },
      { id: '2', role: 'assistant', text: 'FINAL_MARKER', at: 0 }
    ]
    const out = formatTestTranscript(items)
    expect(out.length).toBeGreaterThan(20_000) // nothing dropped
    expect(out).not.toContain('earlier turns omitted')
    expect(out).toContain(big) // the head survives in full
    expect(out).toContain('FINAL_MARKER')
  })

  it('returns empty string for an empty thread', () => {
    expect(formatTestTranscript([])).toBe('')
  })
})
