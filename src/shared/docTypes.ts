// The doc-type registry: the single place that knows which files count as
// "docs" in a project, how to classify them, and how to derive their title and
// preview. Markdown is the default doc type every project gets; `text` covers
// any other textual file a studio opts into via a harness docType glob
// (source files, JSON, CSV, HTML, …). Supporting a richer type later
// (`.png`, `.pdf`, …) is adding a row here plus a renderer view that branches
// on DocMeta.type; the project/tab model itself does not change.

export type DocType = 'markdown' | 'text'

interface DocTypeHandler {
  type: DocType
  /** lowercased extensions (with dot) that map to this type; [] = fallback */
  extensions: string[]
  /** can this type be edited as text — comments, anchors, the text editor */
  text: boolean
  /** derive a display title from the raw file contents */
  title: (content: string, file: string) => string
  /** derive a short preview from the raw file contents */
  preview: (content: string) => string
  /** word count for the rail meta */
  wordCount: (content: string) => number
}

const MARKDOWN: DocTypeHandler = {
  type: 'markdown',
  extensions: ['.md'],
  text: true,
  title: (content, file) => {
    const firstLine = content.split('\n').find((l) => l.trim()) ?? ''
    return firstLine.replace(/^#+\s*/, '').trim() || file
  },
  preview: (content) => content.replace(/^#.*\n/, '').trim().slice(0, 160),
  wordCount: (content) => content.split(/\s+/).filter(Boolean).length
}

// Any other textual file, admitted per-project by a harness docType glob.
// A code file's first line makes a poor title, so text docs title by filename.
const TEXT: DocTypeHandler = {
  type: 'text',
  extensions: [],
  text: true,
  title: (_content, file) => file.split('/').pop() ?? file,
  preview: (content) => content.trim().slice(0, 160),
  wordCount: (content) => content.split(/\s+/).filter(Boolean).length
}

const HANDLERS: DocTypeHandler[] = [MARKDOWN, TEXT]

/** Lowercased extensions (with dot) recognized as docs in ANY project. */
export const DOC_EXTENSIONS: string[] = HANDLERS.flatMap((h) => h.extensions)

// Extensions we know aren't text — a harness glob may match them, but they
// can't be opened in the text editor or diffed as prose.
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.icns', '.bmp', '.tiff',
  '.pdf', '.zip', '.gz', '.tar', '.7z', '.rar', '.dmg',
  '.mp3', '.mp4', '.m4a', '.mov', '.avi', '.mkv', '.wav', '.ogg', '.flac', '.webm',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.exe', '.dll', '.dylib', '.so', '.bin', '.wasm',
  '.sqlite', '.db', '.ds_store'
])

function extOf(file: string): string {
  const i = file.lastIndexOf('.')
  return i === -1 ? '' : file.slice(i).toLowerCase()
}

/** Files that can never be text docs, whatever the harness globs say. */
export function isKnownBinary(file: string): boolean {
  return BINARY_EXTENSIONS.has(extOf(file))
}

/** Is this filename a doc in any project, harness or not? (the bare allowlist) */
export function isDocFile(file: string): boolean {
  return DOC_EXTENSIONS.includes(extOf(file))
}

/**
 * The doc type for a filename. Extension-mapped types win; anything else
 * that isn't known-binary falls back to `text` (callers decide whether a
 * harness glob actually admits it as a doc).
 */
export function docTypeForFile(file: string): DocType | null {
  const mapped = HANDLERS.find((h) => h.extensions.includes(extOf(file)))?.type
  if (mapped) return mapped
  return isKnownBinary(file) ? null : 'text'
}

function handlerFor(file: string): DocTypeHandler {
  return HANDLERS.find((h) => h.extensions.includes(extOf(file))) ?? TEXT
}

/** Whether a doc type supports text features (comments, anchors, text editor). */
export function isTextDoc(file: string): boolean {
  return handlerFor(file).text
}

/** Derive {title, preview, wordCount} for a doc from its raw contents. */
export function deriveDocMeta(
  file: string,
  content: string
): { title: string; preview: string; wordCount: number } {
  const h = handlerFor(file)
  return {
    title: h.title(content, file),
    preview: h.preview(content),
    wordCount: h.wordCount(content)
  }
}
