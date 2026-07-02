import { describe, expect, it } from 'vitest'
import {
  deriveDocMeta,
  docTypeForFile,
  isDocFile,
  isKnownBinary,
  isTextDoc
} from '../src/shared/docTypes'

describe('docTypeForFile — markdown by extension, text as fallback', () => {
  it('maps .md to markdown', () => {
    expect(docTypeForFile('notes.md')).toBe('markdown')
    expect(docTypeForFile('a/b/NOTES.MD')).toBe('markdown')
  })

  it('falls back to text for other textual extensions', () => {
    expect(docTypeForFile('index.html')).toBe('text')
    expect(docTypeForFile('data.json')).toBe('text')
    expect(docTypeForFile('src/main.py')).toBe('text')
    expect(docTypeForFile('Makefile')).toBe('text')
  })

  it('rejects known-binary files', () => {
    expect(docTypeForFile('cover.png')).toBeNull()
    expect(docTypeForFile('deck.pdf')).toBeNull()
    expect(docTypeForFile('theme.woff2')).toBeNull()
  })
})

describe('isKnownBinary', () => {
  it('recognizes binary extensions case-insensitively', () => {
    expect(isKnownBinary('a.PNG')).toBe(true)
    expect(isKnownBinary('a.zip')).toBe(true)
    expect(isKnownBinary('a.ts')).toBe(false)
    expect(isKnownBinary('no-extension')).toBe(false)
  })
})

describe('the bare allowlist stays markdown-only', () => {
  it('isDocFile admits only .md without a harness', () => {
    expect(isDocFile('a.md')).toBe(true)
    expect(isDocFile('a.html')).toBe(false)
    expect(isDocFile('a.txt')).toBe(false)
  })
})

describe('deriveDocMeta for text docs', () => {
  it('titles by filename, not content', () => {
    const meta = deriveDocMeta('pages/index.html', '<!doctype html>\n<title>Hi</title>')
    expect(meta.title).toBe('index.html')
    expect(meta.preview).toContain('<!doctype html>')
  })

  it('markdown still titles from the first heading', () => {
    expect(deriveDocMeta('a.md', '# Hello\n\nBody').title).toBe('Hello')
  })

  it('text docs support text features', () => {
    expect(isTextDoc('src/app.ts')).toBe(true)
    expect(isTextDoc('a.md')).toBe(true)
  })
})
