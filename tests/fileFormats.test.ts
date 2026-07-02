import { describe, expect, it } from 'vitest'
import {
  deriveFileMeta,
  fileFormatFor,
  isProjectFile,
  isKnownBinary,
  isTextFile
} from '../src/shared/fileFormats'

describe('fileFormatFor — markdown and image by extension, text as fallback', () => {
  it('maps .md to markdown', () => {
    expect(fileFormatFor('notes.md')).toBe('markdown')
    expect(fileFormatFor('a/b/NOTES.MD')).toBe('markdown')
  })

  it('maps raster images to image', () => {
    expect(fileFormatFor('cover.png')).toBe('image')
    expect(fileFormatFor('photos/Trip.JPEG')).toBe('image')
    expect(fileFormatFor('anim.webp')).toBe('image')
  })

  it('falls back to text for other textual extensions', () => {
    expect(fileFormatFor('index.html')).toBe('text')
    expect(fileFormatFor('data.json')).toBe('text')
    expect(fileFormatFor('src/main.py')).toBe('text')
    expect(fileFormatFor('Makefile')).toBe('text')
  })

  it('rejects other known-binary files', () => {
    expect(fileFormatFor('deck.pdf')).toBeNull()
    expect(fileFormatFor('theme.woff2')).toBeNull()
    expect(fileFormatFor('archive.zip')).toBeNull()
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

describe('every textual file and image is a project file', () => {
  it('admits markdown, code, data, and images', () => {
    expect(isProjectFile('a.md')).toBe(true)
    expect(isProjectFile('a.html')).toBe(true)
    expect(isProjectFile('a.txt')).toBe(true)
    expect(isProjectFile('Makefile')).toBe(true)
    expect(isProjectFile('pic.png')).toBe(true)
  })

  it('rejects non-image binaries', () => {
    expect(isProjectFile('a.zip')).toBe(false)
    expect(isProjectFile('a.pdf')).toBe(false)
    expect(isProjectFile('a.dylib')).toBe(false)
  })
})

describe('deriveFileMeta', () => {
  it('titles text files by filename, not content', () => {
    const meta = deriveFileMeta('pages/index.html', '<!doctype html>\n<title>Hi</title>')
    expect(meta.title).toBe('index.html')
    expect(meta.preview).toContain('<!doctype html>')
  })

  it('markdown still titles from the first heading', () => {
    expect(deriveFileMeta('a.md', '# Hello\n\nBody').title).toBe('Hello')
  })

  it('images title by filename with no preview', () => {
    const meta = deriveFileMeta('art/cover.png', '')
    expect(meta.title).toBe('cover.png')
    expect(meta.preview).toBe('')
  })
})

describe('isTextFile — text features (editor, comments, anchors)', () => {
  it('text and markdown yes, images no', () => {
    expect(isTextFile('src/app.ts')).toBe(true)
    expect(isTextFile('a.md')).toBe(true)
    expect(isTextFile('pic.png')).toBe(false)
  })
})
