import { afterEach, describe, expect, it, vi } from 'vitest'
import { freshStore, flush } from '../../helpers/store'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const DOC = 'doc'

describe('handleAgentEvent', () => {
  it('records agent run status per document', async () => {
    const { useStore } = await freshStore()
    useStore.getState().handleAgentEvent({ kind: 'status', docId: DOC, status: 'working', detail: 'Edit' })
    expect(useStore.getState().agent[DOC]).toEqual({ status: 'working', detail: 'Edit' })
  })

  it('appends a user echo with its quote', async () => {
    const { useStore } = await freshStore()
    useStore.getState().handleAgentEvent({
      kind: 'user-echo',
      docId: DOC,
      itemId: 'u1',
      text: 'rewrite this',
      quote: 'the line'
    })
    const item = useStore.getState().chats[DOC][0]
    expect(item).toMatchObject({ id: 'u1', role: 'user', text: 'rewrite this', quote: 'the line' })
  })

  it('streams text deltas by concatenating onto the same item', async () => {
    const { useStore } = await freshStore()
    const ev = (delta: string): void =>
      useStore.getState().handleAgentEvent({ kind: 'text-delta', docId: DOC, itemId: 'a1', delta })
    ev('Hel')
    ev('lo')
    const item = useStore.getState().chats[DOC][0]
    expect(item.text).toBe('Hello')
    expect(item.streaming).toBe(true)
  })

  it('replaces streamed text with the final assistant text', async () => {
    const { useStore } = await freshStore()
    useStore.getState().handleAgentEvent({ kind: 'text-delta', docId: DOC, itemId: 'a1', delta: 'Hel' })
    useStore.getState().handleAgentEvent({ kind: 'assistant-text', docId: DOC, itemId: 'a1', text: 'Hello there' })
    const item = useStore.getState().chats[DOC][0]
    expect(item.text).toBe('Hello there')
    expect(item.streaming).toBe(false)
  })

  it('adds a tool note then marks it done', async () => {
    const { useStore } = await freshStore()
    useStore.getState().handleAgentEvent({
      kind: 'tool-note',
      docId: DOC,
      itemId: 'a1',
      toolId: 't1',
      note: 'Reading draft'
    })
    useStore.getState().handleAgentEvent({
      kind: 'tool-note',
      docId: DOC,
      itemId: 'a1',
      toolId: 't1',
      note: '',
      done: true,
      ok: true
    })
    const note = useStore.getState().chats[DOC][0].toolNotes![0]
    expect(note).toMatchObject({ toolId: 't1', note: 'Reading draft', done: true, ok: true })
  })

  it('adds permission requests and dedupes by requestId', async () => {
    const { useStore } = await freshStore()
    useStore.setState({ activeId: DOC })
    const request = { requestId: 'r1', docId: DOC, tool: 'Bash', summary: 'run', command: 'ls' }
    useStore.getState().handleAgentEvent({ kind: 'permission-request', docId: DOC, request })
    useStore.getState().handleAgentEvent({ kind: 'permission-request', docId: DOC, request })
    expect(useStore.getState().permissions).toHaveLength(1)
    expect(useStore.getState().sidebarOpen).toBe(true)
  })

  it('removes a permission when it resolves', async () => {
    const { useStore } = await freshStore()
    useStore.setState({
      permissions: [{ requestId: 'r1', docId: DOC, tool: 'Bash', summary: 'run' }]
    })
    useStore.getState().handleAgentEvent({ kind: 'permission-resolved', docId: DOC, requestId: 'r1', approved: true })
    expect(useStore.getState().permissions).toHaveLength(0)
  })

  it('appends an error item on a failed result', async () => {
    const { useStore } = await freshStore()
    useStore.setState({ activeId: DOC })
    useStore.getState().handleAgentEvent({ kind: 'result', docId: DOC, ok: false, error: 'rate limited' })
    expect(useStore.getState().chats[DOC].at(-1)).toMatchObject({ error: 'rate limited' })
  })

  it('clears the pending comment and drains the queued send on result', async () => {
    const { useStore, fabulist } = await freshStore()
    useStore.setState({
      activeId: DOC,
      pendingCommentId: 'c1',
      queuedCommentSends: [{ commentId: 'c2', prompt: 'next prompt', quote: 'q' }]
    })
    useStore.getState().handleAgentEvent({ kind: 'result', docId: DOC, ok: true, commentId: 'c1' })

    // the just-finished comment is no longer pending; the queue is emptied synchronously
    expect(useStore.getState().queuedCommentSends).toHaveLength(0)

    await flush()
    // the queued comment is sent to the agent
    expect(fabulist.agent.send).toHaveBeenCalledWith(DOC, 'next prompt', { quote: 'q', commentId: 'c2' })
  })
})
