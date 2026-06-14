import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import type { PermissionRequest } from '../../../src/shared/types'
import {
  describeTool,
  isReadOnly,
  isFileEditTool,
  toolPathInput,
  buildToolPayload
} from '../../../src/main/toolRegistry'

const cwd = path.join(path.sep, 'tmp', 'fabulist-doc')

function baseReq(tool: string, filePath?: string): PermissionRequest {
  return { requestId: 'r', docId: 'doc', tool, filePath, summary: '' }
}

async function build(tool: string, input: Record<string, unknown>, filePath?: string) {
  const req = baseReq(tool, filePath)
  await buildToolPayload(req, tool, input, {
    cwd,
    readFile: vi.fn(async () => 'PRIOR CONTENT')
  })
  return req
}

describe('tool registry classification', () => {
  it('classifies read / edit / ask policies', () => {
    expect(isReadOnly('Read')).toBe(true)
    expect(isReadOnly('NotebookRead')).toBe(true)
    expect(isFileEditTool('Write')).toBe(true)
    expect(isFileEditTool('NotebookEdit')).toBe(true)
    expect(isFileEditTool('Read')).toBe(false)
    expect(isReadOnly('Bash')).toBe(false)
    expect(isFileEditTool('Bash')).toBe(false)
  })

  it('picks the declared path field, falling back for unknown tools', () => {
    expect(toolPathInput('Read', { file_path: 'a.md' })).toBe('a.md')
    expect(toolPathInput('NotebookEdit', { notebook_path: 'n.ipynb' })).toBe('n.ipynb')
    expect(toolPathInput('Grep', { path: 'sub', pattern: 'x' })).toBe('sub')
    expect(toolPathInput('mcp__x__y', { file_path: 'z' })).toBe('z')
  })
})

describe('describeTool via registry', () => {
  it('summarizes each known tool', () => {
    expect(describeTool('Read', { file_path: 'document.md' }, cwd)).toBe('Reading document.md')
    expect(describeTool('NotebookEdit', { notebook_path: 'a.ipynb' }, cwd)).toBe('Editing a.ipynb')
    expect(describeTool('Bash', { command: 'ls' }, cwd)).toBe('Running: ls')
  })

  it('falls back to the bare tool name for unknown tools', () => {
    expect(describeTool('mcp__x__y', {}, cwd)).toBe('mcp__x__y')
  })
})

describe('buildToolPayload', () => {
  it('Bash carries the command and a command kind', async () => {
    const req = await build('Bash', { command: 'rm -rf build' })
    expect(req.kind).toBe('command')
    expect(req.command).toBe('rm -rf build')
  })

  it('Edit carries before/after and a single edit', async () => {
    const req = await build('Edit', { old_string: 'a', new_string: 'b', replace_all: true }, 'document.md')
    expect(req.kind).toBe('edit')
    expect(req.before).toBe('a')
    expect(req.after).toBe('b')
    expect(req.edits).toEqual([{ old: 'a', new: 'b', all: true }])
  })

  it('Write reads the prior content as before', async () => {
    const req = await build('Write', { content: 'NEW' }, 'document.md')
    expect(req.kind).toBe('edit')
    expect(req.after).toBe('NEW')
    expect(req.before).toBe('PRIOR CONTENT')
  })

  it('AskUserQuestion carries normalized questions and a question kind', async () => {
    const req = await build('AskUserQuestion', {
      questions: [{ question: 'Tone?', header: 'Voice', options: [{ label: 'Warm' }] }]
    })
    expect(req.kind).toBe('question')
    expect(req.questions).toEqual([
      { question: 'Tone?', header: 'Voice', multiSelect: false, options: [{ label: 'Warm', description: undefined }] }
    ])
  })

  it('NotebookEdit now produces a diff payload (was a blank, bare-labeled card)', async () => {
    const req = await build('NotebookEdit', { new_source: 'print(42)' }, 'analysis.ipynb')
    expect(req.kind).toBe('edit')
    expect(req.after).toBe('print(42)')
    expect(req.before).toBe('')
  })
})
