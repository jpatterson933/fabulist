import { afterEach, describe, expect, it, vi } from 'vitest'
import { freshStore, makeFabulist, makeThread } from '../../helpers/store'
import { DEFAULT_FONT } from '@shared/types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const DOC = 'd1'
const CONTENT = 'Hello world'

// Characterization: openDoc loads a document and distributes its pieces across
// every slice; closeDoc tears it back down. Theme 4 inverts this into per-slice
// onDocOpen/onDocClose participants — the resulting store state MUST stay identical,
// which is exactly what this pins.

function loaded() {
  return makeFabulist({
    doc: {
      read: vi.fn(async () => CONTENT),
      chat: vi.fn(async () => [{ id: 'c1', role: 'assistant', text: 'hi', at: 0 }]),
      getSettings: vi.fn(async () => ({ model: 'opus', font: 'literata', autoApprove: true })),
      watch: vi.fn(async () => {}),
      snapshot: vi.fn(async () => true),
      write: vi.fn(async () => {})
    },
    comments: { list: vi.fn(async () => [makeThread('t1', CONTENT, 6, 11)]) },
    history: { log: vi.fn(async () => [{ hash: 'abc', subject: 'Created', at: 1 }]) }
  })
}

describe('openDoc', () => {
  it('loads and distributes content, threads, chat, history, and settings', async () => {
    const fab = loaded()
    const { useStore } = await freshStore(fab)
    await useStore.getState().openDoc(DOC)

    const s = useStore.getState()
    expect(s.activeId).toBe(DOC)
    expect(s.content).toBe(CONTENT)
    expect(s.external).toMatchObject({ content: CONTENT })
    expect(s.threads.map((t) => t.id)).toEqual(['t1'])
    expect(s.threads[0].status).toBe('open')
    expect(s.commits).toEqual([{ hash: 'abc', subject: 'Created', at: 1 }])
    expect(s.model).toBe('opus')
    expect(s.font).toBe('literata')
    expect(s.autoApprove).toBe(true)
    expect(s.chats[DOC]).toHaveLength(1)
    expect(fab.doc.watch).toHaveBeenCalledWith(DOC)
  })

  it('falls back to the default font when none is stored', async () => {
    const fab = loaded()
    fab.doc.getSettings = vi.fn(async () => ({ model: 'opus', font: '', autoApprove: true }))
    const { useStore } = await freshStore(fab)
    await useStore.getState().openDoc(DOC)
    expect(useStore.getState().font).toBe(DEFAULT_FONT)
  })

  it('resets transient per-doc state on open', async () => {
    const { useStore } = await freshStore(loaded())
    useStore.setState({
      permissions: [{ requestId: 'stale', docId: 'old', tool: 'Bash', summary: 'x' }],
      inlineSuggestionId: 'stale',
      pendingCommentId: 'old',
      queuedCommentSends: [{ commentId: 'q', prompt: 'p', quote: '' }]
    })
    await useStore.getState().openDoc(DOC)
    const s = useStore.getState()
    expect(s.permissions).toEqual([])
    expect(s.inlineSuggestionId).toBeNull()
    expect(s.pendingCommentId).toBeNull()
    expect(s.queuedCommentSends).toEqual([])
  })
})

describe('closeDoc', () => {
  it('snapshots, stops watching, and clears the open document', async () => {
    const fab = loaded()
    const { useStore } = await freshStore(fab)
    await useStore.getState().openDoc(DOC)
    await useStore.getState().closeDoc()

    const s = useStore.getState()
    expect(s.activeId).toBeNull()
    expect(s.content).toBe('')
    expect(s.threads).toEqual([])
    expect(s.commits).toEqual([])
    expect(s.preview).toBeNull()
    expect(fab.doc.snapshot).toHaveBeenCalledWith(DOC, 'Edited')
    expect(fab.doc.watch).toHaveBeenLastCalledWith(null)
  })
})
