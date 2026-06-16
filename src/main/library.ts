import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AgentThread, ChatItem, DocMeta } from '@shared/types'
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

// --- per-doc app state (session ids, chat transcript) under .fabulist/ ---

/** One agent conversation, with its own resumable SDK session and transcript. */
interface StoredThread {
  id: string
  title: string
  sessionId?: string
  chat: ChatItem[]
  createdAt: number
  updatedAt: number
}

interface DocState {
  /** legacy single-session fields, migrated into a thread on first read */
  sessionId?: string
  chat?: unknown[]
  /** Claude Code model alias/id for this doc's agent; undefined = CLI default */
  model?: string
  /** editor font choice for this document */
  font?: string
  /** agent conversations for this document */
  threads?: StoredThread[]
  /** which thread new messages and the UI default to */
  activeThreadId?: string
}

const DEFAULT_THREAD_TITLE = 'New thread'

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

// Serialize per-doc state writes. state.json is one file holding several
// independently-mutated fields (model, font, every thread's session id + chat),
// and a single agent turn ends with two writes firing near-simultaneously — the
// main process saving the resumed session id and the renderer saving the
// transcript. Read-modify-write under one lock keeps either from clobbering the
// other, and keeps the one-time legacy migration (which mints a random id) from
// racing itself when openDoc reads the thread list and active id at once.
const stateLocks = new Map<string, Promise<unknown>>()
function withStateLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = (stateLocks.get(id) ?? Promise.resolve()).catch(() => {})
  const next = prev.then(fn)
  stateLocks.set(
    id,
    next.catch(() => {})
  )
  return next
}

async function patchStateUnlocked(id: string, patch: Partial<DocState>): Promise<void> {
  const cur = await readState(id)
  await fs.writeFile(await statePath(id), JSON.stringify({ ...cur, ...patch }, null, 2))
}

export function patchState(id: string, patch: Partial<DocState>): Promise<void> {
  return withStateLock(id, () => patchStateUnlocked(id, patch))
}

export function newId(): string {
  return randomUUID().slice(0, 8)
}

// --- agent threads (multiple conversations per document) ---

function toMeta(t: StoredThread): AgentThread {
  return {
    id: t.id,
    title: t.title,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    messageCount: t.chat.length
  }
}

/**
 * Resolve a document's threads, migrating the pre-threads single-session shape
 * (top-level `sessionId`/`chat`) into one thread the first time we see it.
 * Always returns at least one thread and a valid `activeThreadId`; persists the
 * migrated shape back to disk so subsequent reads are clean. Must run inside the
 * doc's state lock — callers hold it so the read and any resulting write are atomic.
 */
async function resolveThreads(
  id: string
): Promise<{ threads: StoredThread[]; activeThreadId: string }> {
  const state = await readState(id)

  if (state.threads && state.threads.length > 0) {
    const threads = state.threads
    const activeThreadId =
      state.activeThreadId && threads.some((t) => t.id === state.activeThreadId)
        ? state.activeThreadId
        : threads[0].id
    if (activeThreadId !== state.activeThreadId) await patchStateUnlocked(id, { activeThreadId })
    return { threads, activeThreadId }
  }

  // migrate: fold any legacy session/chat into a single thread
  const now = Date.now()
  const hadHistory = Boolean(state.sessionId) || ((state.chat as unknown[])?.length ?? 0) > 0
  const thread: StoredThread = {
    id: newId(),
    title: hadHistory ? 'Conversation' : DEFAULT_THREAD_TITLE,
    sessionId: state.sessionId,
    chat: (state.chat as ChatItem[]) ?? [],
    createdAt: now,
    updatedAt: now
  }
  await patchStateUnlocked(id, {
    threads: [thread],
    activeThreadId: thread.id,
    sessionId: undefined,
    chat: undefined
  })
  return { threads: [thread], activeThreadId: thread.id }
}

export function listThreads(id: string): Promise<AgentThread[]> {
  return withStateLock(id, async () => (await resolveThreads(id)).threads.map(toMeta))
}

export function getActiveThreadId(id: string): Promise<string> {
  return withStateLock(id, async () => (await resolveThreads(id)).activeThreadId)
}

export function getThreadChat(id: string, threadId: string): Promise<ChatItem[]> {
  return withStateLock(id, async () => {
    const { threads } = await resolveThreads(id)
    return threads.find((t) => t.id === threadId)?.chat ?? []
  })
}

export function createThread(id: string, title?: string): Promise<AgentThread> {
  return withStateLock(id, async () => {
    const { threads } = await resolveThreads(id)
    const now = Date.now()
    const thread: StoredThread = {
      id: newId(),
      title: title?.trim() || DEFAULT_THREAD_TITLE,
      chat: [],
      createdAt: now,
      updatedAt: now
    }
    await patchStateUnlocked(id, { threads: [...threads, thread], activeThreadId: thread.id })
    return toMeta(thread)
  })
}

export function setActiveThreadId(id: string, threadId: string): Promise<void> {
  return withStateLock(id, async () => {
    const { threads } = await resolveThreads(id)
    if (threads.some((t) => t.id === threadId)) {
      await patchStateUnlocked(id, { activeThreadId: threadId })
    }
  })
}

export function renameThread(id: string, threadId: string, title: string): Promise<void> {
  return withStateLock(id, async () => {
    const clean = title.trim()
    if (!clean) return
    const { threads } = await resolveThreads(id)
    await patchStateUnlocked(id, {
      threads: threads.map((t) => (t.id === threadId ? { ...t, title: clean } : t))
    })
  })
}

/** Delete a thread; never leaves a document with zero threads. Returns the (possibly new) active id. */
export function deleteThread(id: string, threadId: string): Promise<{ activeThreadId: string }> {
  return withStateLock(id, async () => {
    const { threads, activeThreadId } = await resolveThreads(id)
    let next = threads.filter((t) => t.id !== threadId)
    let active = activeThreadId
    if (next.length === 0) {
      const now = Date.now()
      const fresh: StoredThread = {
        id: newId(),
        title: DEFAULT_THREAD_TITLE,
        chat: [],
        createdAt: now,
        updatedAt: now
      }
      next = [fresh]
      active = fresh.id
    } else if (active === threadId) {
      active = next[next.length - 1].id
    }
    await patchStateUnlocked(id, { threads: next, activeThreadId: active })
    return { activeThreadId: active }
  })
}

/** The resumable SDK session id for a thread, if it has been started. */
export function getThreadSession(id: string, threadId: string): Promise<string | undefined> {
  return withStateLock(id, async () => {
    const { threads } = await resolveThreads(id)
    return threads.find((t) => t.id === threadId)?.sessionId
  })
}

/** Patch a single thread's mutable fields (session id, chat, title), bumping updatedAt. */
export function updateThread(
  id: string,
  threadId: string,
  patch: Partial<Pick<StoredThread, 'sessionId' | 'chat' | 'title'>>
): Promise<void> {
  return withStateLock(id, async () => {
    const { threads } = await resolveThreads(id)
    if (!threads.some((t) => t.id === threadId)) return
    await patchStateUnlocked(id, {
      threads: threads.map((t) =>
        t.id === threadId ? { ...t, ...patch, updatedAt: Date.now() } : t
      )
    })
  })
}

export { DEFAULT_THREAD_TITLE }
