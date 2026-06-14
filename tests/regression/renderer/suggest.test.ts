import { describe, expect, it } from 'vitest'
import { buildProposed, computeSuggestion, suggestionSegments } from '@/lib/suggest'
import type { PermissionRequest } from '@shared/types'

// Characterization: pins how a pending PermissionRequest is turned into an
// inline document suggestion. Theme 3 (tool registry / discriminated request)
// and Theme 7 (the 'document.md' predicate) both touch the fields read here,
// so this guards that the inline-suggestion behavior survives those refactors.

function req(partial: Partial<PermissionRequest>): PermissionRequest {
  return {
    requestId: 'r1',
    docId: 'doc',
    tool: 'Edit',
    filePath: 'document.md',
    summary: 's',
    ...partial
  }
}

describe('buildProposed', () => {
  it('returns the whole-file content for a Write', () => {
    expect(buildProposed('old body', req({ tool: 'Write', after: 'new body' }))).toBe('new body')
  })

  it('returns null for a Write that does not change anything', () => {
    expect(buildProposed('same', req({ tool: 'Write', after: 'same' }))).toBeNull()
  })

  it('applies a single Edit via its before/after when no edits array is present', () => {
    const out = buildProposed('The cat sat.', req({ tool: 'Edit', before: 'cat', after: 'dog' }))
    expect(out).toBe('The dog sat.')
  })

  it('applies an explicit edits list in order', () => {
    const out = buildProposed(
      'one two three',
      req({ tool: 'MultiEdit', edits: [{ old: 'one', new: 'ONE' }, { old: 'three', new: 'THREE' }] })
    )
    expect(out).toBe('ONE two THREE')
  })

  it('replaces all occurrences only when all=true', () => {
    expect(buildProposed('a a a', req({ tool: 'Edit', edits: [{ old: 'a', new: 'b', all: true }] }))).toBe(
      'b b b'
    )
    expect(buildProposed('a a a', req({ tool: 'Edit', edits: [{ old: 'a', new: 'b', all: false }] }))).toBe(
      'b a a'
    )
  })

  it('returns null when the old text is not present', () => {
    expect(buildProposed('hello', req({ tool: 'Edit', edits: [{ old: 'xyz', new: 'q' }] }))).toBeNull()
  })

  it('keeps $ sequences in replacement text literal', () => {
    expect(buildProposed('cost is X', req({ tool: 'Edit', edits: [{ old: 'X', new: '$5' }] }))).toBe(
      'cost is $5'
    )
  })
})

describe('computeSuggestion', () => {
  it('returns null for a request that is not on the primary document', () => {
    expect(computeSuggestion('body', req({ filePath: 'notes.md', tool: 'Write', after: 'x' }))).toBeNull()
  })

  it('produces deletion and insertion segments for an edit on document.md', () => {
    const segs = computeSuggestion('The cat sat.', req({ tool: 'Edit', before: 'cat', after: 'dog' }))
    expect(segs).not.toBeNull()
    expect(segs!.some((s) => s.kind === 'del')).toBe(true)
    expect(segs!.some((s) => s.kind === 'ins' && s.text?.includes('dog'))).toBe(true)
  })

  it('returns null when the proposed content is unrenderable (old text gone)', () => {
    expect(computeSuggestion('hello', req({ tool: 'Edit', edits: [{ old: 'zzz', new: 'q' }] }))).toBeNull()
  })
})

describe('suggestionSegments', () => {
  it('maps a pure insertion to a single ins widget at the insertion point', () => {
    const segs = suggestionSegments('hello world', 'hello brave world')
    const ins = segs.find((s) => s.kind === 'ins')
    expect(ins).toBeDefined()
    expect(ins!.text).toContain('brave')
  })
})
