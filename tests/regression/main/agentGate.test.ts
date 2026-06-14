import { afterEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('electron')
  vi.doUnmock('@anthropic-ai/claude-agent-sdk')
  vi.doUnmock('../../../src/main/library')
  vi.doUnmock('../../../src/main/git')
  vi.doUnmock('../../../src/main/comments')
})

describe('agent permission gate', () => {
  it('does not let auto-apply bypass path denial', async () => {
    const cwd = path.join(path.sep, 'tmp', 'fabulist-doc')
    const readState = vi.fn(async () => ({ autoApprove: true }))
    const onEditApplied = vi.fn()

    vi.doMock('electron', () => ({
      app: { isPackaged: false }
    }))
    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      query: vi.fn()
    }))
    vi.doMock('../../../src/main/library', () => ({
      LIBRARY_ROOT: path.join(path.sep, 'tmp', 'fabulist'),
      ensureLibraryRoot: vi.fn(),
      docPath: (id: string) => path.join(path.sep, 'tmp', 'fabulist', id),
      DOC_FILE: 'document.md',
      readState,
      patchState: vi.fn(),
      newId: () => 'req'
    }))
    vi.doMock('../../../src/main/git', () => ({
      commitAll: vi.fn()
    }))
    vi.doMock('../../../src/main/comments', () => ({
      reply: vi.fn()
    }))

    const { AgentManager } = await import('../../../src/main/agent')
    const manager = new AgentManager()
    const gateTool = (
      manager as unknown as {
        gateTool: (
          docId: string,
          cwd: string,
          tool: string,
          input: Record<string, unknown>,
          signal: AbortSignal,
          onEditApplied: () => void
        ) => Promise<{ behavior: string; message?: string }>
      }
    ).gateTool.bind(manager)

    const result = await gateTool(
      'doc',
      cwd,
      'Write',
      { file_path: '../outside.md', content: 'x' },
      new AbortController().signal,
      onEditApplied
    )

    expect(result).toMatchObject({ behavior: 'deny' })
    expect(readState).not.toHaveBeenCalled()
    expect(onEditApplied).not.toHaveBeenCalled()
  })
})
