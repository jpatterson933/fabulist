import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'

// Characterization: the human-readable tool summaries and the prompt assembly.
// Theme 3 moves these into a tool descriptor registry; the strings pinned here
// (which the renderer shows verbatim) must survive that move unchanged.

const cwd = path.join(path.sep, 'tmp', 'fabulist-doc')

async function loadAgent() {
  vi.doMock('electron', () => ({
    app: { isPackaged: false, getPath: () => path.join(path.sep, 'tmp') }
  }))
  vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }))
  return import('../../../src/main/agent')
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.doUnmock('electron')
  vi.doUnmock('@anthropic-ai/claude-agent-sdk')
  vi.resetModules()
})

describe('describeTool', () => {
  it('summarizes file tools with the doc-relative path', async () => {
    const { describeTool } = await loadAgent()
    expect(describeTool('Read', { file_path: 'document.md' }, cwd)).toBe('Reading document.md')
    expect(describeTool('Write', { file_path: 'document.md' }, cwd)).toBe('Writing document.md')
    expect(describeTool('Edit', { file_path: 'notes.md' }, cwd)).toBe('Editing notes.md')
    expect(describeTool('MultiEdit', { file_path: 'notes.md' }, cwd)).toBe('Editing notes.md')
  })

  it('summarizes command and search tools', async () => {
    const { describeTool } = await loadAgent()
    expect(describeTool('Bash', { command: 'ls -la' }, cwd)).toBe('Running: ls -la')
    expect(describeTool('Grep', { pattern: 'needle' }, cwd)).toBe('Searching for "needle"')
    expect(describeTool('Glob', { pattern: '*.md' }, cwd)).toBe('Listing *.md')
    expect(describeTool('WebSearch', { query: 'topic' }, cwd)).toBe('Searching the web: topic')
    expect(describeTool('WebFetch', { url: 'https://x' }, cwd)).toBe('Fetching https://x')
    expect(describeTool('TodoWrite', {}, cwd)).toBe('Updating plan')
    expect(describeTool('Task', { description: 'go research' }, cwd)).toBe('Delegating: go research')
  })

  it('summarizes an AskUserQuestion by its first question', async () => {
    const { describeTool } = await loadAgent()
    expect(describeTool('AskUserQuestion', { questions: [{ question: 'Which tone?' }] }, cwd)).toBe(
      'Asking: Which tone?'
    )
  })
})

describe('buildPrompt', () => {
  it('returns the bare prompt with no options', async () => {
    const { buildPrompt } = await loadAgent()
    expect(buildPrompt('rewrite the intro', {})).toBe('rewrite the intro')
  })

  it('prepends the highlighted passage when a quote is given', async () => {
    const { buildPrompt } = await loadAgent()
    const out = buildPrompt('sharpen this', { quote: 'the old line' })
    expect(out.toLowerCase()).toContain('the author highlighted this passage')
    expect(out).toContain('the old line')
    expect(out.endsWith('sharpen this')).toBe(true)
  })

  it('adds the comment-thread instruction when a commentId is given', async () => {
    const { buildPrompt } = await loadAgent()
    const out = buildPrompt('address this', { quote: 'q', commentId: 'c1' })
    expect(out).toContain('comment')
    expect(out.split('\n\n').length).toBeGreaterThanOrEqual(3)
  })
})
