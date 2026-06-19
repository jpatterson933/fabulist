import { afterEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import type { AgentEvent } from '../../../src/shared/types'

// The Plugin Studio gates mirror the document app's gate (src/main/agent.ts): the
// authoring gate asks before applying edits unless auto-apply is on, and a test run
// surfaces AskUserQuestion instead of letting the engine treat it as skipped.

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('electron')
  vi.doUnmock('@anthropic-ai/claude-agent-sdk')
  vi.doUnmock('../../../src/main/library')
  vi.doUnmock('../../../src/main/git')
  vi.doUnmock('../../../src/main/skillStudio')
})

const cwd = path.join(path.sep, 'tmp', 'fabulist-skill-test')

async function loadManager(autoApprove = false): Promise<{
  manager: import('../../../src/main/studioAgent').StudioAgentManager
  events: { channel: string; event: AgentEvent }[]
}> {
  vi.doMock('electron', () => ({ app: { isPackaged: false } }))
  vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }))
  vi.doMock('../../../src/main/library', () => ({ newId: () => 'req' }))
  vi.doMock('../../../src/main/git', () => ({ commitAll: vi.fn() }))
  vi.doMock('../../../src/main/skillStudio', () => ({
    ensureStudio: vi.fn(),
    pluginPath: (slug: string) => path.join(path.sep, 'tmp', 'studio', slug),
    // the authoring gate reads auto-apply from persisted settings per call (not a param)
    readSettings: vi.fn(async () => ({ model: '', autoApprove }))
  }))

  const { StudioAgentManager } = await import('../../../src/main/studioAgent')
  const manager = new StudioAgentManager()
  const events: { channel: string; event: AgentEvent }[] = []
  manager.attach({
    isDestroyed: () => false,
    send: (channel: string, event: AgentEvent) => events.push({ channel, event })
  } as never)
  return { manager, events }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('studio test gate', () => {
  it('blocks on AskUserQuestion and passes the answer back', async () => {
    const { manager, events } = await loadManager()
    const gate = (
      manager as unknown as {
        gate: (
          slug: string,
          cwd: string,
          tool: string,
          input: Record<string, unknown>,
          signal: AbortSignal
        ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown> }>
      }
    ).gate.bind(manager)

    const p = gate(
      'skill',
      cwd,
      'AskUserQuestion',
      { questions: [{ question: 'Tone?', header: 'Tone', options: [{ label: 'Punchy' }] }] },
      new AbortController().signal
    )
    await flush()
    // a question card was surfaced to the renderer, not auto-allowed
    const request = events.find((e) => e.event.kind === 'permission-request')
    expect(request).toBeTruthy()
    expect(request!.channel).toBe('skillStudio:event')

    manager.resolvePermission('req', true, { Tone: 'Punchy' })
    const result = await p
    expect(result.behavior).toBe('allow')
    expect(result.updatedInput).toMatchObject({ answers: { Tone: 'Punchy' } })
  })

  it('denies a skipped question so the model proceeds on its own', async () => {
    const { manager } = await loadManager()
    const gate = (
      manager as unknown as {
        gate: (s: string, c: string, t: string, i: Record<string, unknown>, sig: AbortSignal) => Promise<{ behavior: string }>
      }
    ).gate.bind(manager)
    const p = gate('skill', cwd, 'AskUserQuestion', { questions: [] }, new AbortController().signal)
    await flush()
    manager.resolvePermission('req', false)
    expect((await p).behavior).toBe('deny')
  })

  it('auto-allows non-question tools in the sandbox', async () => {
    const { manager } = await loadManager()
    const gate = (
      manager as unknown as {
        gate: (s: string, c: string, t: string, i: Record<string, unknown>, sig: AbortSignal) => Promise<{ behavior: string }>
      }
    ).gate.bind(manager)
    const result = await gate('skill', cwd, 'Bash', { command: 'ls' }, new AbortController().signal)
    expect(result.behavior).toBe('allow')
  })

  it("lets a skill READ its own bundled files from the plugin folder, but not write them", async () => {
    const { manager } = await loadManager()
    const gate = (
      manager as unknown as {
        gate: (s: string, c: string, t: string, i: Record<string, unknown>, sig: AbortSignal) => Promise<{ behavior: string }>
      }
    ).gate.bind(manager)
    // pluginPath('skill') is mocked to /tmp/studio/skill — a file the SKILL.md references
    const bundled = path.join(path.sep, 'tmp', 'studio', 'skill', 'skills', 'skill', 'brand-voice.md')

    const read = await gate('skill', cwd, 'Read', { file_path: bundled }, new AbortController().signal)
    expect(read.behavior).toBe('allow')

    // a test must never be able to mutate the skill it's exercising
    const write = await gate(
      'skill',
      cwd,
      'Write',
      { file_path: bundled, content: 'x' },
      new AbortController().signal
    )
    expect(write.behavior).toBe('deny')

    // and a read of something outside both the sandbox and the plugin folder is still denied
    const outside = await gate(
      'skill',
      cwd,
      'Read',
      { file_path: path.join(path.sep, 'etc', 'passwd') },
      new AbortController().signal
    )
    expect(outside.behavior).toBe('deny')
  })

  it('settles a request once even if an answer is followed by an abort', async () => {
    const { manager, events } = await loadManager()
    const gate = (
      manager as unknown as {
        gate: (s: string, c: string, t: string, i: Record<string, unknown>, sig: AbortSignal) => Promise<{ behavior: string }>
      }
    ).gate.bind(manager)
    const ctrl = new AbortController()
    const p = gate('skill', cwd, 'AskUserQuestion', { questions: [] }, ctrl.signal)
    await flush()
    manager.resolvePermission('req', true, {})
    await p
    // a late interrupt must not emit a second, contradictory resolution
    ctrl.abort()
    await flush()
    expect(events.filter((e) => e.event.kind === 'permission-resolved')).toHaveLength(1)
  })
})

describe('studio authoring gate', () => {
  type AuthGate = (
    slug: string,
    cwd: string,
    tool: string,
    input: Record<string, unknown>,
    signal: AbortSignal
  ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown> }>

  it('auto-applies an edit when auto-apply is on and records it', async () => {
    const { manager, events } = await loadManager(true)
    const authGate = (manager as unknown as { authGate: AuthGate }).authGate.bind(manager)
    const result = await authGate(
      'skill',
      cwd,
      'Edit',
      { file_path: 'skills/skill/SKILL.md', old_string: 'a', new_string: 'b' },
      new AbortController().signal
    )
    expect(result.behavior).toBe('allow')
    expect(events.some((e) => e.event.kind === 'edit-applied' && e.channel === 'skillStudio:authEvent')).toBe(true)
  })

  it('asks before applying an edit when auto-apply is off', async () => {
    const { manager, events } = await loadManager()
    const authGate = (manager as unknown as { authGate: AuthGate }).authGate.bind(manager)
    const p = authGate(
      'skill',
      cwd,
      'Edit',
      { file_path: 'skills/skill/SKILL.md', old_string: 'a', new_string: 'b' },
      new AbortController().signal
    )
    await flush()
    // an approval card was surfaced; the edit has NOT been recorded as applied yet
    expect(events.some((e) => e.event.kind === 'permission-request')).toBe(true)
    expect(events.some((e) => e.event.kind === 'edit-applied')).toBe(false)

    manager.resolvePermission('req', true)
    const result = await p
    expect(result.behavior).toBe('allow')
    expect(events.some((e) => e.event.kind === 'edit-applied')).toBe(true)
  })

  it('declining an edit denies it and applies nothing', async () => {
    const { manager, events } = await loadManager()
    const authGate = (manager as unknown as { authGate: AuthGate }).authGate.bind(manager)
    const p = authGate(
      'skill',
      cwd,
      'Write',
      { file_path: 'skills/skill/SKILL.md', content: 'x' },
      new AbortController().signal
    )
    // the Write payload reads the file before surfacing the card, so a single tick isn't
    // enough — wait until the approval request actually appears before answering it
    for (let i = 0; i < 50 && !events.some((e) => e.event.kind === 'permission-request'); i++) {
      await flush()
    }
    manager.resolvePermission('req', false)
    expect((await p).behavior).toBe('deny')
    expect(events.some((e) => e.event.kind === 'edit-applied')).toBe(false)
  })

  it('auto-allows non-edit tools (Bash, MCP) so authoring matches the test chat', async () => {
    const { manager } = await loadManager()
    const authGate = (manager as unknown as { authGate: AuthGate }).authGate.bind(manager)
    const bash = await authGate('skill', cwd, 'Bash', { command: 'ls' }, new AbortController().signal)
    expect(bash.behavior).toBe('allow')
    const mcp = await authGate(
      'skill',
      cwd,
      'mcp__claude_ai_AE_Google_MCP__read_doc',
      { documentId: 'abc' },
      new AbortController().signal
    )
    expect(mcp.behavior).toBe('allow')
  })

  it('still confines file edits to the skill folder', async () => {
    const { manager } = await loadManager()
    const authGate = (manager as unknown as { authGate: AuthGate }).authGate.bind(manager)
    const outside = await authGate(
      'skill',
      cwd,
      'Write',
      { file_path: path.join(path.sep, 'etc', 'passwd'), content: 'x' },
      new AbortController().signal
    )
    expect(outside.behavior).toBe('deny')
  })
})
