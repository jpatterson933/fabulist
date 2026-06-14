import { describe, expect, it } from 'vitest'
import { reanchor } from '@/store/shared'
import { makeThread } from '../../helpers/store'

describe('reanchor', () => {
  it('passes resolved threads through untouched', () => {
    const content = 'the quick brown fox'
    const t = makeThread('t1', content, 4, 9, { status: 'resolved' }) // "quick"
    // even if the offsets are now wrong, a resolved thread is left alone
    const [out] = reanchor([{ ...t, anchor: { ...t.anchor, from: 999, to: 1000 } }], content)
    expect(out.status).toBe('resolved')
    expect(out.anchor.from).toBe(999)
  })

  it('remaps an open thread to the moved quote', () => {
    const original = 'Hello world'
    const t = makeThread('t1', original, 6, 11) // "world"
    const moved = 'Say: Hello world' // "world" now at 11
    const [out] = reanchor([t], moved)
    expect(out.status).toBe('open')
    expect(moved.slice(out.anchor.from, out.anchor.to)).toBe('world')
    expect(out.anchor.from).toBe(11)
  })

  it('orphans a thread whose quote is gone', () => {
    const t = makeThread('t1', 'keep the secret passage', 9, 15) // "secret"
    const [out] = reanchor([t], 'nothing matches here')
    expect(out.status).toBe('orphaned')
  })

  it('revives an orphaned thread when its quote reappears', () => {
    const content = 'the secret passage'
    const t = makeThread('t1', content, 4, 10, { status: 'orphaned' }) // "secret"
    const [out] = reanchor([t], content)
    expect(out.status).toBe('open')
    expect(content.slice(out.anchor.from, out.anchor.to)).toBe('secret')
  })
})
