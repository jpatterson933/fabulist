// The file-format registry: the single place that knows which files count as
// "files" in a project, how to classify them, and how to derive their title and
// preview. Any project admits Markdown, images, and any other textual file —
// a studio harness adds kind labels/icons/templates on top via fileType globs,
// but no manifest is needed for a file to open. Supporting a richer type later
// (`.pdf`, …) is adding a row here plus a renderer view that branches on
// FileMeta.type; the project/tab model itself does not change.

export type FileFormat = 'markdown' | 'text' | 'image'

interface FileFormatHandler {
  type: FileFormat
  /** lowercased extensions (with dot) that map to this type; [] = fallback */
  extensions: string[]
  /** can this type be edited as text — comments, anchors, the text editor */
  text: boolean
  /** derive a display title from the raw file contents */
  title: (content: string, file: string) => string
  /** derive a short preview from the raw file contents */
  preview: (content: string) => string
}

const baseName = (file: string): string => file.split('/').pop() ?? file

const MARKDOWN: FileFormatHandler = {
  type: 'markdown',
  extensions: ['.md'],
  text: true,
  title: (content, file) => {
    const firstLine = content.split('\n').find((l) => l.trim()) ?? ''
    return firstLine.replace(/^#+\s*/, '').trim() || file
  },
  preview: (content) => content.replace(/^#.*\n/, '').trim().slice(0, 160)
}

// Raster images open in a read-only image view; no text features.
const IMAGE: FileFormatHandler = {
  type: 'image',
  extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'],
  text: false,
  title: (_content, file) => baseName(file),
  preview: () => ''
}

// Any other textual file (source, JSON, CSV, HTML, …).
// A code file's first line makes a poor title, so text files title by filename.
const TEXT: FileFormatHandler = {
  type: 'text',
  extensions: [],
  text: true,
  title: (_content, file) => baseName(file),
  preview: (content) => content.trim().slice(0, 160)
}

const HANDLERS: FileFormatHandler[] = [MARKDOWN, IMAGE, TEXT]

/** Lowercased extensions (with dot) recognized as files in ANY project. */
export const MAPPED_EXTENSIONS: string[] = HANDLERS.flatMap((h) => h.extensions)

// Extensions we know aren't text — they can't be opened in the text editor
// or diffed, and (unless a richer handler claims them) aren't files at all.
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

/** Files that can never be text files, whatever the harness globs say. */
export function isKnownBinary(file: string): boolean {
  return BINARY_EXTENSIONS.has(extOf(file))
}

/** Is this filename a work file in any project? Extension-mapped, or any non-binary text file. */
export function isProjectFile(file: string): boolean {
  return MAPPED_EXTENSIONS.includes(extOf(file)) || !isKnownBinary(file)
}

/**
 * The render format for a filename. Extension-mapped formats win; anything else
 * that isn't known-binary falls back to `text`.
 */
export function fileFormatFor(file: string): FileFormat | null {
  const mapped = HANDLERS.find((h) => h.extensions.includes(extOf(file)))?.type
  if (mapped) return mapped
  return isKnownBinary(file) ? null : 'text'
}

function handlerFor(file: string): FileFormatHandler {
  return HANDLERS.find((h) => h.extensions.includes(extOf(file))) ?? TEXT
}

/** Whether a file format supports text features (comments, anchors, text editor). */
export function isTextFile(file: string): boolean {
  return handlerFor(file).text
}

/** Derive {title, preview} for a file from its raw contents. */
export function deriveFileMeta(file: string, content: string): { title: string; preview: string } {
  const h = handlerFor(file)
  return {
    title: h.title(content, file),
    preview: h.preview(content)
  }
}
