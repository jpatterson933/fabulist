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
})
