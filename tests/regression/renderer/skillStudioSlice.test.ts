import { afterEach, describe, expect, it, vi } from 'vitest'
import { freshStore, makeFabulist } from '../../helpers/store'

// The Skill Studio slice owns the mode switch and routes its own streaming events
// into per-skill test threads — never into the document chat.

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('skill studio slice', () => {
  it('opens the studio and loads its skills', async () => {
    const fabulist = makeFabulist({
      skillStudio: {
        list: vi.fn(async () => [{ slug: 'a', name: 'A', description: 'x' }])
      }
    })
    const { useStore } = await freshStore(fabulist)
    await useStore.getState().openStudio()
    expect(useStore.getState().mode).toBe('skillStudio')
    expect(useStore.getState().studioSkills).toHaveLength(1)
    useStore.getState().closeStudio()
    expect(useStore.getState().mode).toBe('doc')
  })

  it('routes a studio event into the matching test thread', async () => {
    const { useStore } = await freshStore()
    useStore.setState({ activeSkill: 'a' })
    useStore.getState().handleStudioEvent({ kind: 'user-echo', docId: 'a', itemId: 'u1', text: 'hi' })
    useStore
      .getState()
      .handleStudioEvent({ kind: 'assistant-text', docId: 'a', itemId: 'a1', text: 'draft' })
    const chat = useStore.getState().testChats['a']
    expect(chat.map((c) => c.role)).toEqual(['user', 'assistant'])
    expect(chat[1].text).toBe('draft')
    // a studio event must never leak into the document chat map
    expect(useStore.getState().chats['a']).toBeUndefined()
  })

  it('clears the open buffer when a deleted folder contains the open file', async () => {
    const { useStore } = await freshStore()
    useStore.setState({
      activeSkill: 'a',
      openFilePath: 'agents/reviewer.md',
      fileContent: 'draft',
      fileDirty: true
    })
    await useStore.getState().removeStudioFile('agents')
    expect(useStore.getState().openFilePath).toBeNull()
    expect(useStore.getState().fileContent).toBe('')
    expect(useStore.getState().fileDirty).toBe(false)
  })

  it('routes an authoring event into the chat, separate from the test thread', async () => {
    const { useStore } = await freshStore()
    useStore.setState({ activeSkill: 'a' })
    useStore.getState().handleAuthEvent({ kind: 'assistant-text', docId: 'a', itemId: 'a1', text: 'sure' })
    expect(useStore.getState().authChats['a']?.[0]?.text).toBe('sure')
    expect(useStore.getState().testChats['a']).toBeUndefined()
  })

  it('accumulates token usage across test result events', async () => {
    const { useStore } = await freshStore()
    useStore.setState({ activeSkill: 'a' })
    useStore.getState().handleStudioEvent({
      kind: 'result',
      docId: 'a',
      ok: true,
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, cacheCreationTokens: 1, costUsd: 0.01 }
    })
    useStore.getState().handleStudioEvent({
      kind: 'result',
      docId: 'a',
      ok: true,
      usage: { inputTokens: 50, outputTokens: 10, cacheReadTokens: 2, cacheCreationTokens: 0, costUsd: 0.005 }
    })
    const u = useStore.getState().testUsage['a']
    expect(u.inputTokens).toBe(150)
    expect(u.outputTokens).toBe(30)
    expect(u.runs).toBe(2)
    expect(u.costUsd).toBeCloseTo(0.015)
    // a per-run usage line is appended to the transcript
    expect(useStore.getState().testChats['a'].filter((c) => c.usage)).toHaveLength(2)
  })

  it('turns a comment into a chat prompt and switches to the chat tab', async () => {
    const authSend = vi.fn(async () => {})
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { authSend } }))
    useStore.setState({ activeSkill: 'a' })

    useStore.getState().startComment('skills/a/SKILL.md', 'be punchy')
    expect(useStore.getState().studioTab).toBe('comments')
    expect(useStore.getState().studioDraft?.quote).toBe('be punchy')

    await useStore.getState().submitComment('make it punchier')
    expect(useStore.getState().comments['a']).toHaveLength(1)
    expect(useStore.getState().studioDraft).toBeNull()
    expect(useStore.getState().studioTab).toBe('chat')
    expect(authSend).toHaveBeenCalledTimes(1)
    const [slug, prompt] = authSend.mock.calls[0]
    expect(slug).toBe('a')
    expect(prompt).toContain('be punchy')
    expect(prompt).toContain('make it punchier')
  })
})
