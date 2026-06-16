import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { decideTool } from '../../../src/main/toolPolicy'

const cwd = path.join(path.sep, 'tmp', 'fabulist-doc')

describe('agent tool policy', () => {
  it('denies read and write file paths outside the document root', () => {
    expect(decideTool(cwd, 'Read', { file_path: '../secret.txt' })).toMatchObject({
      kind: 'deny'
    })
    expect(decideTool(cwd, 'Write', { file_path: '/tmp/secret.txt', content: 'x' })).toMatchObject({
      kind: 'deny'
    })
    expect(decideTool(cwd, 'Grep', { path: '../outside', pattern: 'secret' })).toMatchObject({
      kind: 'deny'
    })
  })

  it('denies edits to comments.json', () => {
    expect(decideTool(cwd, 'Edit', { file_path: 'comments.json' })).toMatchObject({
      kind: 'deny',
      message:
        'comments.json is managed by Fabulist. Reply in chat instead; the app records comment replies.'
    })
  })

  it('asks for document-root file edits with a normalized relative path', () => {
    expect(decideTool(cwd, 'Write', { file_path: './document.md', content: 'x' })).toEqual({
      kind: 'ask',
      filePath: 'document.md'
    })
  })

  it('allows safe read-only tools without a file escape', () => {
    expect(decideTool(cwd, 'Read', { file_path: 'document.md' })).toEqual({
      kind: 'allow',
      filePath: 'document.md'
    })
    expect(decideTool(cwd, 'WebSearch', { query: 'topic' })).toEqual({ kind: 'allow' })
  })

  it('does not silently allow unknown MCP-prefixed tools', () => {
    expect(decideTool(cwd, 'mcp__unknown__mutate', {})).toEqual({ kind: 'ask' })
  })

  it('asks for MultiEdit and resolves its file path', () => {
    expect(decideTool(cwd, 'MultiEdit', { file_path: 'document.md', edits: [] })).toEqual({
      kind: 'ask',
      filePath: 'document.md'
    })
  })

  it('resolves a NotebookEdit via notebook_path and asks', () => {
    expect(decideTool(cwd, 'NotebookEdit', { notebook_path: 'analysis.ipynb' })).toEqual({
      kind: 'ask',
      filePath: 'analysis.ipynb'
    })
  })

  it('denies a NotebookEdit that escapes the document root', () => {
    expect(decideTool(cwd, 'NotebookEdit', { notebook_path: '../escape.ipynb' })).toMatchObject({
      kind: 'deny'
    })
  })

  it('allows NotebookRead as read-only', () => {
    expect(decideTool(cwd, 'NotebookRead', { notebook_path: 'analysis.ipynb' })).toEqual({
      kind: 'allow',
      filePath: 'analysis.ipynb'
    })
  })
})

describe('read roots (skill under test reads its own bundled files)', () => {
  const pluginRoot = path.join(path.sep, 'tmp', 'studio', 'copywright')
  const bundled = path.join(pluginRoot, 'skills', 'copywright', 'brand-voice.md')

  it('allows a read-only tool to reach a declared read root outside cwd', () => {
    expect(decideTool(cwd, 'Read', { file_path: bundled }, [pluginRoot])).toEqual({ kind: 'allow' })
    expect(decideTool(cwd, 'Grep', { path: pluginRoot, pattern: 'voice' }, [pluginRoot])).toEqual({
      kind: 'allow'
    })
  })

  it('still denies WRITES to a read root — a test can never mutate the skill it exercises', () => {
    expect(
      decideTool(cwd, 'Write', { file_path: bundled, content: 'x' }, [pluginRoot])
    ).toMatchObject({ kind: 'deny' })
    expect(decideTool(cwd, 'Edit', { file_path: bundled }, [pluginRoot])).toMatchObject({
      kind: 'deny'
    })
  })

  it('denies reads that fall outside both cwd and every read root', () => {
    const elsewhere = path.join(path.sep, 'tmp', 'elsewhere', 'secret.md')
    expect(decideTool(cwd, 'Read', { file_path: elsewhere }, [pluginRoot])).toMatchObject({
      kind: 'deny'
    })
  })

  it('leaves in-cwd resolution unchanged when read roots are supplied', () => {
    expect(decideTool(cwd, 'Read', { file_path: 'document.md' }, [pluginRoot])).toEqual({
      kind: 'allow',
      filePath: 'document.md'
    })
    expect(decideTool(cwd, 'Write', { file_path: 'document.md', content: 'x' }, [pluginRoot])).toEqual({
      kind: 'ask',
      filePath: 'document.md'
    })
  })
})
