import { app, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DocMeta } from '@shared/types'
import { initRepo, commitAll } from './git'

export const LIBRARY_ROOT = path.join(app.getPath('documents'), 'Fabulist')
const LEGACY_LIBRARY_ROOT = path.join(app.getPath('documents'), 'Lobstertale')
const LEGACY_STATE_DIR = '.lobster'
const STATE_DIR = '.fabulist'

const exists = (p: string): Promise<boolean> =>
  fs
    .stat(p)
    .then(() => true)
    .catch(() => false)

/** Create the library root, adopting a pre-rename "Lobstertale" folder if present. */
export async function ensureLibraryRoot(): Promise<void> {
  if (!(await exists(LIBRARY_ROOT)) && (await exists(LEGACY_LIBRARY_ROOT))) {
    await fs.rename(LEGACY_LIBRARY_ROOT, LIBRARY_ROOT).catch(() => {})
  }
  await fs.mkdir(LIBRARY_ROOT, { recursive: true })
}

export const DOC_FILE = 'document.md'
export const COMMENTS_FILE = 'comments.json'

const CLAUDE_MD = (title: string) => `# About this project

This folder is a single document inside Fabulist, an AI-native writing studio.
You are the user's writing partner for the document titled "${title}".

## Ground rules

- The document lives in \`document.md\`. That file is the work itself — treat it with care.
- Prefer the smallest edit that accomplishes the goal. Preserve the author's voice,
  formatting, and intent unless asked to rewrite.
- \`comments.json\` is managed by the app. Never edit it; the app records your replies.
- When asked to respond to a comment on a quoted passage, address that passage
  specifically. If a change to the text is warranted, edit \`document.md\` directly —
  the user reviews and approves every edit before it lands.
- Keep chat replies brief. The document is where the substance goes.
- You may create supporting files (research notes, outlines) in this folder if useful.
`

const GITIGNORE = `.fabulist/
.claude/
`

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || 'untitled'
}

export function docPath(id: string): string {
  // ids are folder names; refuse anything that could escape the library
  if (id.includes('/') || id.includes('\\') || id.startsWith('.')) {
    throw new Error(`Invalid document id: ${id}`)
  }
  return path.join(LIBRARY_ROOT, id)
}

async function readMeta(id: string): Promise<DocMeta | null> {
  const dir = docPath(id)
  try {
    const file = path.join(dir, DOC_FILE)
    const [content, stat] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)])
    const firstLine = content.split('\n').find((l) => l.trim()) ?? ''
    const title = firstLine.replace(/^#+\s*/, '').trim() || id
    const body = content.replace(/^#.*\n/, '').trim()
    return {
      id,
      title,
      path: dir,
      createdAt: stat.birthtimeMs,
      updatedAt: stat.mtimeMs,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      preview: body.slice(0, 160)
    }
  } catch {
    return null
  }
}

export async function listDocs(): Promise<DocMeta[]> {
  await ensureLibraryRoot()
  const entries = await fs.readdir(LIBRARY_ROOT, { withFileTypes: true })
  const metas = await Promise.all(
    entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => readMeta(e.name))
  )
  return metas
    .filter((m): m is DocMeta => m !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function createDoc(title: string): Promise<DocMeta> {
  await ensureLibraryRoot()
  const clean = title.trim() || 'Untitled'
  let id = slugify(clean)
  // de-dupe folder name
  let n = 1
  while (
    await fs
      .stat(docPath(id))
      .then(() => true)
      .catch(() => false)
  ) {
    id = `${slugify(clean)}-${++n}`
  }
  const dir = docPath(id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, DOC_FILE), `# ${clean}\n\n`)
  await fs.writeFile(path.join(dir, 'CLAUDE.md'), CLAUDE_MD(clean))
  await fs.writeFile(path.join(dir, COMMENTS_FILE), JSON.stringify({ threads: [] }, null, 2))
  await fs.writeFile(path.join(dir, '.gitignore'), GITIGNORE)
  await initRepo(dir)
  await commitAll(dir, `Created "${clean}"`)
  const meta = await readMeta(id)
  if (!meta) throw new Error('Failed to create document')
  return meta
}

export async function deleteDoc(id: string): Promise<void> {
  await fs.rm(docPath(id), { recursive: true, force: true })
}

export async function readDoc(id: string): Promise<string> {
  return fs.readFile(path.join(docPath(id), DOC_FILE), 'utf8')
}

export async function writeDoc(id: string, content: string): Promise<void> {
  await fs.writeFile(path.join(docPath(id), DOC_FILE), content)
}

/**
 * Pick files and copy them into the doc's attachments/ folder so Claude can
 * read them from the project. Returns the doc-relative paths of what landed.
 */
export async function attachFiles(id: string): Promise<string[]> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Attach files',
    message: 'Copy files into this document’s project folder',
    properties: ['openFile', 'multiSelections']
  })
  if (canceled || filePaths.length === 0) return []
  const dir = path.join(docPath(id), 'attachments')
  await fs.mkdir(dir, { recursive: true })
  const attached: string[] = []
  for (const src of filePaths) {
    let name = path.basename(src)
    let n = 1
    while (await exists(path.join(dir, name))) {
      const ext = path.extname(name)
      name = `${path.basename(src, ext)}-${++n}${ext}`
    }
    await fs.copyFile(src, path.join(dir, name))
    attached.push(path.posix.join('attachments', name))
  }
  return attached
}

/** Delete one attachment by its doc-relative path (must live under attachments/). */
export async function removeAttachment(id: string, rel: string): Promise<void> {
  const dir = path.join(docPath(id), 'attachments')
  const target = path.resolve(docPath(id), rel)
  if (path.dirname(target) !== dir) throw new Error('Not an attachment path')
  await fs.rm(target, { force: true })
}

/** Save pasted text as attachments/pasted-N.txt; returns the doc-relative path. */
export async function attachText(id: string, text: string): Promise<string> {
  const dir = path.join(docPath(id), 'attachments')
  await fs.mkdir(dir, { recursive: true })
  let n = 0
  let name: string
  do {
    name = `pasted-${++n}.txt`
  } while (await exists(path.join(dir, name)))
  await fs.writeFile(path.join(dir, name), text)
  return path.posix.join('attachments', name)
}

// --- per-doc app state (session ids, chat transcript) under .fabulist/ ---

interface DocState {
  sessionId?: string
  chat?: unknown[]
  /** Claude Code model alias/id for this doc's agent; undefined = CLI default */
  model?: string
  /** editor font choice for this document */
  font?: string
  /** when true, file edits apply without an approval card (Bash still asks) */
  autoApprove?: boolean
}

async function statePath(id: string): Promise<string> {
  const base = docPath(id)
  const dir = path.join(base, STATE_DIR)
  const legacy = path.join(base, LEGACY_STATE_DIR)
  if (!(await exists(dir)) && (await exists(legacy))) {
    // adopt pre-rename per-doc state (session id, chat, model)
    await fs.rename(legacy, dir).catch(() => {})
    const gi = path.join(base, '.gitignore')
    const cur = await fs.readFile(gi, 'utf8').catch(() => null)
    if (cur?.includes(`${LEGACY_STATE_DIR}/`)) {
      await fs.writeFile(gi, cur.replaceAll(`${LEGACY_STATE_DIR}/`, `${STATE_DIR}/`)).catch(() => {})
    }
  }
  await fs.mkdir(dir, { recursive: true })
  return path.join(dir, 'state.json')
}

export async function readState(id: string): Promise<DocState> {
  try {
    return JSON.parse(await fs.readFile(await statePath(id), 'utf8'))
  } catch {
    return {}
  }
}

export async function patchState(id: string, patch: Partial<DocState>): Promise<void> {
  const cur = await readState(id)
  await fs.writeFile(await statePath(id), JSON.stringify({ ...cur, ...patch }, null, 2))
}

export function newId(): string {
  return randomUUID().slice(0, 8)
}
