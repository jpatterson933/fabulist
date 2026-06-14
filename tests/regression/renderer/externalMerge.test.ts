import { describe, expect, it } from 'vitest'
import { minimalReplace } from '@/lib/externalMerge'

// Characterization: the minimal single-span replacement used to apply external
// (Claude / restore) edits without yanking the editor viewport. Pure; pinned so
// Theme 8's editor-hook extraction can't quietly change the merge math.

describe('minimalReplace', () => {
  it('returns null when nothing changed', () => {
    expect(minimalReplace('same', 'same')).toBeNull()
  })

  it('trims a common prefix and suffix around a middle change', () => {
    expect(minimalReplace('abXcd', 'abYcd')).toEqual({ from: 2, to: 3, insert: 'Y' })
  })

  it('represents a pure insertion as a zero-width replacement', () => {
    expect(minimalReplace('world', 'hello world')).toEqual({ from: 0, to: 0, insert: 'hello ' })
  })

  it('represents a pure deletion as an empty insert', () => {
    expect(minimalReplace('hello world', 'world')).toEqual({ from: 0, to: 6, insert: '' })
  })

  it('handles an append at the end', () => {
    expect(minimalReplace('abc', 'abcdef')).toEqual({ from: 3, to: 3, insert: 'def' })
  })
})
