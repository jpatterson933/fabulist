import { afterEach, describe, expect, it, vi } from 'vitest'
import { freshStore, flush, makeThread } from '../../helpers/store'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const DOC = 'doc'
const CONTENT = 'Hello world'

describe('engageClaudeOnThread', () => {
  it('sends the comment to Claude immediately when the agent is idle', async () => {
    const { useStore, fabulist } = await freshStore()
    useStore.setState({ activeId: DOC, content: CONTENT })
    const thread = makeThread('t1', CONTENT, 6, 11, { text: 'fix this' }) // "world"

    useStore.getState().engageClaudeOnThread(thread)
    await flush()

    expect(fabulist.agent.send).toHaveBeenCalledWith(DOC, 'fix this', {
      quote: 'world',
      commentId: 't1'
    })
    expect(useStore.getState().queuedCommentSends).toHaveLength(0)
  })

  it('queues the comment instead of sending while the agent is busy', async () => {
    const { useStore, fabulist } = await freshStore()
    useStore.setState({ activeId: DOC, content: CONTENT, agent: { [DOC]: { status: 'working' } } })
    const thread = makeThread('t1', CONTENT, 6, 11, { text: 'fix this' })

    useStore.getState().engageClaudeOnThread(thread)
    await flush()

    expect(fabulist.agent.send).not.toHaveBeenCalled()
    expect(useStore.getState().queuedCommentSends).toEqual([
      { commentId: 't1', prompt: 'fix this', quote: 'world' }
    ])
  })

  it('dedupes repeated engagements of the same thread in the queue', async () => {
    const { useStore } = await freshStore()
    useStore.setState({ activeId: DOC, content: CONTENT, agent: { [DOC]: { status: 'working' } } })
    const thread = makeThread('t1', CONTENT, 6, 11, { text: 'fix this' })

    useStore.getState().engageClaudeOnThread(thread)
    useStore.getState().engageClaudeOnThread(thread)

    expect(useStore.getState().queuedCommentSends).toHaveLength(1)
  })
})
