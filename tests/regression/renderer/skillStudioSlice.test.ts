import { afterEach, describe, expect, it, vi } from 'vitest'
import { freshStore, makeFabulist } from '../../helpers/store'

// The Plugin Studio slice owns the mode switch and routes its own streaming events
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

  it('persists the auto-apply flag instead of passing it per send', async () => {
    const authSend = vi.fn(async () => {})
    const setSetting = vi.fn(async () => {})
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { authSend, setSetting } }))
    useStore.setState({ activeSkill: 'a' })

    // main now reads auto-apply from the skill's persisted settings (the gate re-reads it
    // per call, mirroring the doc app), so it is no longer a send argument
    await useStore.getState().authSend('build it')
    expect(authSend.mock.calls[0]).toEqual(['a', 'build it', undefined])

    // toggling it updates the store AND persists it for the gate to read
    useStore.getState().setStudioAutoApprove(true)
    expect(useStore.getState().studioAutoApprove).toBe(true)
    expect(setSetting).toHaveBeenCalledWith('a', 'autoApprove', true)
  })

  it('weaves the test transcript into an authoring prompt when referenced', async () => {
    const authSend = vi.fn(async () => {})
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { authSend } }))
    useStore.setState({
      activeSkill: 'a',
      testChats: {
        a: [
          { id: 'u', role: 'user', text: 'write a haiku', at: 0 },
          { id: 'r', role: 'assistant', text: 'Here is your haiku…', at: 0 }
        ]
      }
    })

    await useStore.getState().authSend('the test ignored the haiku rule, fix it', { testRef: 'current' })
    const [slug, prompt, display] = authSend.mock.calls[0] as [
      string,
      string,
      { echo: string; quote?: string }
    ]
    expect(slug).toBe('a')
    // the model receives the transcript woven in…
    expect(prompt).toContain('write a haiku')
    expect(prompt).toContain('Here is your haiku')
    expect(prompt).toContain('the test ignored the haiku rule, fix it')
    // …but the chat echoes only the user's note, plus a short reference marker
    expect(display.echo).toBe('the test ignored the haiku rule, fix it')
    expect(display.quote).toMatch(/test run/i)
  })

  it('skips the transcript framing when there is no test run to reference', async () => {
    const authSend = vi.fn(async () => {})
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { authSend } }))
    useStore.setState({ activeSkill: 'a' })
    await useStore.getState().authSend('just edit it', { testRef: 'current' })
    const [, prompt, display] = authSend.mock.calls[0]
    expect(prompt).toBe('just edit it') // no <test-run> framing
    expect(display).toBeUndefined()
  })

  it('queues an authoring approval card and clears it when resolved', async () => {
    const { useStore } = await freshStore()
    useStore.setState({ activeSkill: 'a', studioTab: 'test' })
    const request = {
      requestId: 'r1',
      docId: 'a',
      tool: 'Edit',
      filePath: 'skills/a/SKILL.md',
      before: 'old',
      after: 'new',
      summary: 'Editing SKILL.md',
      kind: 'edit' as const
    }
    useStore.getState().handleAuthEvent({ kind: 'permission-request', docId: 'a', request })
    expect(useStore.getState().authPermissions['a']).toHaveLength(1)
    // a pending approval pulls the user to the chat tab where the card lives
    expect(useStore.getState().studioTab).toBe('chat')

    useStore
      .getState()
      .handleAuthEvent({ kind: 'permission-resolved', docId: 'a', requestId: 'r1', approved: true })
    expect(useStore.getState().authPermissions['a']).toHaveLength(0)
  })

  it('queues a test-run question and routes the answer to the studio channel', async () => {
    const respondPermission = vi.fn(() => {})
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { respondPermission } }))
    useStore.setState({ activeSkill: 'a' })
    const request = {
      requestId: 'q1',
      docId: 'a',
      tool: 'AskUserQuestion',
      summary: 'Asking: Tone?',
      kind: 'question' as const,
      questions: [{ question: 'Tone?', header: 'Tone', options: [{ label: 'Punchy' }] }]
    }
    useStore.getState().handleStudioEvent({ kind: 'permission-request', docId: 'a', request })
    expect(useStore.getState().testPermissions['a']).toHaveLength(1)

    useStore.getState().respondStudioPermission('q1', true, { Tone: 'Punchy' })
    expect(respondPermission).toHaveBeenCalledWith('q1', true, { Tone: 'Punchy' })

    useStore
      .getState()
      .handleStudioEvent({ kind: 'permission-resolved', docId: 'a', requestId: 'q1', approved: true })
    expect(useStore.getState().testPermissions['a']).toHaveLength(0)
  })

  it('reveals an applied edit by locating its text in the opened file', async () => {
    const readFile = vi.fn(async () => 'intro\nthe new line\noutro')
    const { useStore } = await freshStore(
      makeFabulist({ skillStudio: { readFile, listFiles: vi.fn(async () => []) } })
    )
    useStore.setState({ activeSkill: 'a' })
    await useStore.getState().revealStudioEdit({
      tool: 'Edit',
      filePath: 'skills/a/SKILL.md',
      before: 'the old line',
      after: 'the new line'
    })
    expect(useStore.getState().openFilePath).toBe('skills/a/SKILL.md')
    const pos = useStore.getState().studioRevealPos
    expect(pos).not.toBeNull()
    // the span points at the inserted text inside the loaded content
    expect('intro\nthe new line\noutro'.slice(pos!.from, pos!.to)).toBe('the new line')
  })

  it('restores persisted transcripts when a skill is opened', async () => {
    const readChats = vi.fn(async () => ({
      authChat: [{ id: 'a1', role: 'user' as const, text: 'earlier note', at: 0 }],
      testChat: [{ id: 't1', role: 'assistant' as const, text: 'earlier test', at: 0 }]
    }))
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { readChats } }))

    await useStore.getState().openStudioSkill('a')
    expect(readChats).toHaveBeenCalledWith('a')
    expect(useStore.getState().authChats['a']?.[0]?.text).toBe('earlier note')
    expect(useStore.getState().testChats['a']?.[0]?.text).toBe('earlier test')
  })

  it('does not clobber an in-memory transcript when re-opening a skill', async () => {
    const readChats = vi.fn(async () => ({
      authChat: [{ id: 'disk', role: 'user' as const, text: 'from disk', at: 0 }],
      testChat: []
    }))
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { readChats } }))
    // live in-memory threads already exist (e.g. a background run streamed into them)
    useStore.setState({
      authChats: { a: [{ id: 'live', role: 'user', text: 'in memory', at: 0 }] },
      testChats: { a: [] }
    })

    await useStore.getState().openStudioSkill('a')
    expect(readChats).not.toHaveBeenCalled() // both threads already present → no disk read
    expect(useStore.getState().authChats['a']?.[0]?.text).toBe('in memory')
  })

  it('persists the authoring transcript when a run finishes', async () => {
    const saveAuthChat = vi.fn(async () => {})
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { saveAuthChat } }))
    useStore.setState({ activeSkill: 'a' })
    useStore.getState().handleAuthEvent({ kind: 'user-echo', docId: 'a', itemId: 'u1', text: 'hi' })
    useStore.getState().handleAuthEvent({ kind: 'assistant-text', docId: 'a', itemId: 'r1', text: 'done' })
    useStore.getState().handleAuthEvent({ kind: 'result', docId: 'a', ok: true })
    expect(saveAuthChat).toHaveBeenCalledTimes(1)
    const [slug, chat] = saveAuthChat.mock.calls[0]
    expect(slug).toBe('a')
    expect(chat.map((c: { text: string }) => c.text)).toEqual(['hi', 'done'])
  })

  it('clears the persisted test transcript on reset', async () => {
    const saveTestChat = vi.fn(async () => {})
    const resetTest = vi.fn(async () => {})
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { saveTestChat, resetTest } }))
    useStore.setState({ activeSkill: 'a', testChats: { a: [{ id: 't', role: 'assistant', text: 'x', at: 0 }] } })
    await useStore.getState().resetTest()
    expect(saveTestChat).toHaveBeenCalledWith('a', [])
    expect(useStore.getState().testChats['a']).toEqual([])
  })

  it('clears the authoring chat + usage and rotates the SDK session on reset', async () => {
    const resetAuth = vi.fn(async () => {})
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { resetAuth } }))
    useStore.setState({
      activeSkill: 'a',
      authChats: { a: [{ id: 'm', role: 'assistant', text: 'x', at: 0 }] },
      authUsage: {
        a: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 1, runs: 1 }
      },
      authAgent: { a: 'done' }
    })
    await useStore.getState().resetAuth()
    // main does the real reset (drops the resume session + wipes the on-disk transcript/id)
    expect(resetAuth).toHaveBeenCalledWith('a')
    // and the in-memory conversation is cleared to a clean slate
    expect(useStore.getState().authChats['a']).toEqual([])
    expect(useStore.getState().authUsage['a']).toBeUndefined()
    expect(useStore.getState().authAgent['a']).toBe('idle')
  })

  it('invokes a picked skill with a directive, keeping the chat echo clean', async () => {
    const test = vi.fn(async () => {})
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { test } }))
    useStore.setState({ activeSkill: 'a' })

    await useStore.getState().testSkill('write a subject line', { skill: 'copywriting' })
    const [slug, prompt, display] = test.mock.calls[0] as [
      string,
      string,
      { echo: string; quote?: string }
    ]
    expect(slug).toBe('a')
    // the model gets the explicit invocation directive + the task
    expect(prompt).toContain('Use the "copywriting" skill')
    expect(prompt).toContain('write a subject line')
    // the chat shows just the task plus a short marker
    expect(display.echo).toBe('write a subject line')
    expect(display.quote).toMatch(/copywriting skill/i)
  })

  it('runs a plain task with no directive when no skill is picked', async () => {
    const test = vi.fn(async () => {})
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { test } }))
    useStore.setState({ activeSkill: 'a' })
    await useStore.getState().testSkill('just do it')
    const [, prompt, display] = test.mock.calls[0]
    expect(prompt).toBe('just do it')
    expect(display).toBeUndefined()
  })

  it('archives the live test, bumps the version, and prepends it to the archive', async () => {
    const archiveTest = vi.fn(async () => ({ version: '0.0.1', at: 123, nextVersion: 2 }))
    const resetTest = vi.fn(async () => {})
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { archiveTest, resetTest } }))
    useStore.setState({
      activeSkill: 'a',
      testChats: { a: [{ id: 't', role: 'assistant', text: 'ran', at: 0 }] },
      testVersion: { a: 1 }
    })

    await useStore.getState().archiveAndResetTest()
    expect(archiveTest).toHaveBeenCalledTimes(1)
    expect(resetTest).toHaveBeenCalledTimes(1) // session + sandbox dropped
    expect(useStore.getState().testVersion['a']).toBe(2)
    expect(useStore.getState().testChats['a']).toEqual([])
    const arch = useStore.getState().archivedTests['a']
    expect(arch).toHaveLength(1)
    expect(arch[0].version).toBe('0.0.1')
    expect(arch[0].chat.map((c) => c.text)).toEqual(['ran'])
  })

  it('clears (does not archive) an empty test thread', async () => {
    const archiveTest = vi.fn(async () => ({ version: '0.0.1', at: 0, nextVersion: 2 }))
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { archiveTest } }))
    useStore.setState({ activeSkill: 'a', testChats: { a: [] } })
    await useStore.getState().archiveAndResetTest()
    expect(archiveTest).not.toHaveBeenCalled()
  })

  it('references an archived run by version', async () => {
    const authSend = vi.fn(async () => {})
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { authSend } }))
    useStore.setState({
      activeSkill: 'a',
      archivedTests: {
        a: [{ version: '0.0.1', at: 0, chat: [{ id: 'x', role: 'assistant', text: 'archived output', at: 0 }] }]
      }
    })
    await useStore.getState().authSend('what went wrong here?', { testRef: { version: '0.0.1' } })
    // skillStudio.authSend(slug, prompt, display)
    const [, prompt, display] = authSend.mock.calls[0] as [string, string, { quote?: string }]
    expect(prompt).toContain('archived output')
    expect(prompt).toContain('what went wrong here?')
    expect(display.quote).toMatch(/test v0\.0\.1/i)
  })

  it('restores the test version and archive when a skill is opened', async () => {
    const readChats = vi.fn(async () => ({
      authChat: [],
      testChat: [],
      testVersion: 3,
      archivedTests: [
        { version: '0.0.2', at: 0, chat: [] },
        { version: '0.0.1', at: 0, chat: [] }
      ]
    }))
    const { useStore } = await freshStore(makeFabulist({ skillStudio: { readChats } }))
    await useStore.getState().openStudioSkill('a')
    expect(useStore.getState().testVersion['a']).toBe(3)
    expect(useStore.getState().archivedTests['a'].map((x) => x.version)).toEqual(['0.0.2', '0.0.1'])
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
