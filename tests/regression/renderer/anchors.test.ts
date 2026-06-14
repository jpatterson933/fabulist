import { describe, expect, it } from 'vitest'
import { makeAnchor, locateAnchor, CONTEXT } from '@/lib/anchors'

// Characterization: comment anchoring by quote + surrounding context. Pure;
// pinned because Theme 8 may relocate this into editor hooks and it underpins
// the reanchor() behavior already covered elsewhere.

describe('makeAnchor', () => {
  it('captures the quote with up to CONTEXT chars of prefix/suffix', () => {
    const content = 'the quick brown fox jumps'
    const a = makeAnchor(content, 10, 15) // "brown"
    expect(a.text).toBe('brown')
    expect(a.prefix).toBe('the quick ')
    expect(a.suffix).toBe(' fox jumps')
    expect(a.from).toBe(10)
    expect(a.to).toBe(15)
    expect(CONTEXT).toBe(32)
  })
})

describe('locateAnchor', () => {
  it('finds a unique quote regardless of stored offsets', () => {
    const content = 'alpha beta gamma'
    const a = makeAnchor(content, 6, 10) // "beta"
    const moved = 'XYZ alpha beta gamma'
    expect(locateAnchor(moved, a)).toEqual({ from: 10, to: 14 })
  })

  it('returns null when the quote is gone', () => {
    const a = makeAnchor('keep the secret', 9, 15) // "secret"
    expect(locateAnchor('nothing here', a)).toBeNull()
  })

  it('returns null for an empty quote', () => {
    expect(locateAnchor('anything', makeAnchor('anything', 0, 0))).toBeNull()
  })

  it('disambiguates repeated quotes by surrounding context', () => {
    // two "cat" occurrences; the anchor was built around the second one
    const content = 'a cat here and a cat there'
    const second = content.indexOf('cat', 5) // 17
    const a = makeAnchor(content, second, second + 3)
    const loc = locateAnchor(content, a)
    expect(loc).toEqual({ from: second, to: second + 3 })
  })
})
