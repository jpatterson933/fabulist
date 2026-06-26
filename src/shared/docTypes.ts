// The doc-type registry: the single place that knows which files count as
// "docs" in a project, how to classify them, and how to derive their title and
// preview. Today exactly one type is supported — Markdown. Supporting another
// file type later (`.txt`, `.png`, `.pdf`, …) is adding a row here plus a
// renderer view that branches on DocMeta.type; the project/tab model itself
// does not change.

export type DocType = 'markdown'

interface DocTypeHandler {
  type: DocType
  /** lowercased extensions (with dot) that map to this type */
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

const HANDLERS: DocTypeHandler[] = [MARKDOWN]

/** Lowercased extensions (with dot) recognized as docs — the discovery allowlist. */
export const DOC_EXTENSIONS: string[] = HANDLERS.flatMap((h) => h.extensions)

function extOf(file: string): string {
  const i = file.lastIndexOf('.')
  return i === -1 ? '' : file.slice(i).toLowerCase()
}

/** Is this filename a recognized doc? (used to scan a project folder) */
export function isDocFile(file: string): boolean {
  return DOC_EXTENSIONS.includes(extOf(file))
}

/** The doc type for a filename, or null if unrecognized. */
export function docTypeForFile(file: string): DocType | null {
  return HANDLERS.find((h) => h.extensions.includes(extOf(file)))?.type ?? null
}

function handlerFor(file: string): DocTypeHandler {
  return HANDLERS.find((h) => h.extensions.includes(extOf(file))) ?? MARKDOWN
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
