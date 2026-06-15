import { describe, expect, it } from 'vitest'
import { formatMarkdown } from '@/lib/markdown'

// Markdown formatting is delegated to Prettier; assert the formatter's contract
// (idempotence, clean trailing newline, fenced-code preservation) rather than
// pinning Prettier's exact output, which is version-specific.

describe('formatMarkdown (Prettier)', () => {
  it('is idempotent — formatting already-formatted output is a no-op', async () => {
    const once = await formatMarkdown('#Title\n\n\n## B\n*  x\n+ y\n')
    const twice = await formatMarkdown(once)
    expect(twice).toBe(once)
  })

  it('ends with a single trailing newline and trims trailing whitespace', async () => {
    const out = await formatMarkdown('# A   \nbody   \n')
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
    expect(out).not.toMatch(/[ \t]\n/)
  })

  it('preserves fenced code content verbatim', async () => {
    const out = await formatMarkdown('```\nconst x = 1\n*not a bullet\n```\n')
    expect(out).toContain('const x = 1')
    expect(out).toContain('*not a bullet')
  })
})
