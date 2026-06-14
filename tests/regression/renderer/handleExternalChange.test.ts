import { afterEach, describe, expect, it, vi } from 'vitest'
import { freshStore, makeThread } from '../../helpers/store'
import { makeAnchor } from '@/lib/anchors'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const DOC = 'doc'

describe('handleExternalChange', () => {
  it('ignores changes for a document that is not active', async () => {
    const { useStore } = await freshStore()
    useStore.setState({ activeId: DOC, content: 'original' })
    useStore.getState().handleExternalChange('other-doc', 'replaced')
    expect(useStore.getState().content).toBe('original')
  })

  it('updates content and bumps the external seq for the editor', async () => {
    const { useStore } = await freshStore()
    useStore.setState({ activeId: DOC, content: 'original' })
    useStore.getState().handleExternalChange(DOC, 'first')
    const seq1 = useStore.getState().external!.seq
    useStore.getState().handleExternalChange(DOC, 'second')
    const state = useStore.getState()
    expect(state.content).toBe('second')
    expect(state.external!.content).toBe('second')
    expect(state.external!.seq).toBeGreaterThan(seq1)
  })

  it('re-anchors open threads through the external edit', async () => {
    const { useStore } = await freshStore()
    const before = 'Hello world'
    useStore.setState({ activeId: DOC, content: before, threads: [makeThread('t1', before, 6, 11)] }) // "world"
    const after = 'Say: Hello world' // "world" now at 11
    useStore.getState().handleExternalChange(DOC, after)
    const t = useStore.getState().threads[0]
    expect(after.slice(t.anchor.from, t.anchor.to)).toBe('world')
    expect(t.anchor.from).toBe(11)
  })

  it('drops the draft highlight when its quoted text disappears', async () => {
    const { useStore } = await freshStore()
    const before = 'foo bar'
    useStore.setState({ activeId: DOC, content: before, draftComment: { anchor: makeAnchor(before, 4, 7) } }) // "bar"
    useStore.getState().handleExternalChange(DOC, 'nothing here')
    expect(useStore.getState().draftComment).toBeNull()
  })

  it('moves the draft highlight when its quoted text shifts', async () => {
    const { useStore } = await freshStore()
    const before = 'foo bar'
    useStore.setState({ activeId: DOC, content: before, draftComment: { anchor: makeAnchor(before, 4, 7) } }) // "bar"
    const after = 'x foo bar' // "bar" now at 6
    useStore.getState().handleExternalChange(DOC, after)
    const draft = useStore.getState().draftComment!
    expect(after.slice(draft.anchor.from, draft.anchor.to)).toBe('bar')
    expect(draft.anchor.from).toBe(6)
  })
})
