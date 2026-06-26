import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AgentThread, ChatItem, DocMeta, ProjectMeta } from '@shared/types'
import { DOC_EXTENSIONS, deriveDocMeta, docTypeForFile, isDocFile } from '@shared/docTypes'
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

/** The single doc file every pre-projects folder held; kept for migration. */
export const DOC_FILE = 'document.md'
export const COMMENTS_FILE = 'comments.json'

const CLAUDE_MD = (title: string) => `# About this project

This folder is a project inside Fabulist, an AI-native writing studio. You are the
user's writing partner for "${title}".

## Ground rules

- A project holds one or more documents — Markdown files (\`*.md\`) in this folder.
  Each file is a piece of the work; treat them all with care. The author tells you
  which document they are currently focused on.
- You can read and edit any document in the project — use this to keep continuity
  across them (recurring characters, callbacks, a shared style or outline).
- Prefer the smallest edit that accomplishes the goal. Preserve the author's voice,
  formatting, and intent unless asked to rewrite.
- \`comments.json\` is managed by the app. Never edit it; the app records your replies.
- When asked to respond to a comment on a quoted passage, address that passage
  specifically. If a change to the text is warranted, edit the relevant document
  directly — the user reviews and approves every edit before it lands.
- Keep chat replies brief. The documents are where the substance goes.
- You may create supporting files (research notes, outlines, a story bible) here.
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

export function projectPath(id: string): string {
  // ids are folder names; refuse anything that could escape the library
  if (id.includes('/') || id.includes('\\') || id.startsWith('.')) {
    throw new Error(`Invalid project id: ${id}`)
  }
  return path.join(LIBRARY_ROOT, id)
}

/** Absolute path to a doc file within a project, with traversal guarded. */
export function docPath(projectId: string, docFile: string): string {
  if (docFile.includes('/') || docFile.includes('\\') || docFile.startsWith('.')) {
    throw new Error(`Invalid document file: ${docFile}`)
  }
  return path.join(projectPath(projectId), docFile)
}

// --- project.json: docs registry, per-doc prefs, open tabs (app state) ---

interface ProjectDocEntry {
  file: string
  font?: string
}

interface ProjectFile {
  title: string
  docs: ProjectDocEntry[]
  openTabs: string[]
  activeDoc: string | null
}

function projectJsonPath(projectId: string): string {
  return path.join(projectPath(projectId), STATE_DIR, 'project.json')
}

// Markdown files that are project machinery, not documents the user authors.
const RESERVED_FILES = new Set(['CLAUDE.md', 'AGENTS.md'])

async function scanDocFiles(projectId: string): Promise<string[]> {
  const dir = projectPath(projectId)
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((e) => e.isFile() && isDocFile(e.name) && !RESERVED_FILES.has(e.name))
    .map((e) => e.name)
    .sort()
}

/**
 * Read a project's app state, migrating a pre-projects single-doc folder on
 * first read: re-key comments.json, lift the legacy editor font, and write a
 * project.json. Idempotent — once project.json exists this is a plain read.
 * Must run inside the project's state lock.
 */
async function ensureProjectUnlocked(projectId: string): Promise<ProjectFile> {
  const jsonPath = projectJsonPath(projectId)
  const existing = await fs.readFile(jsonPath, 'utf8').catch(() => null)
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as Partial<ProjectFile>
      const docs = Array.isArray(parsed.docs) ? parsed.docs : []
      return {
        title: parsed.title || projectId,
        docs,
        openTabs: Array.isArray(parsed.openTabs) ? parsed.openTabs : [],
        activeDoc: parsed.activeDoc ?? docs[0]?.file ?? null
      }
    } catch {
      /* fall through to rebuild */
    }
  }

  // --- migrate / initialize ---
  const files = await scanDocFiles(projectId)
  // legacy single-doc font lived in state.json
  const legacyState = await readState(projectId)
  const docs: ProjectDocEntry[] = files.map((file) => ({
    file,
    font: file === DOC_FILE ? legacyState.font : undefined
  }))
  const primary = files.includes(DOC_FILE) ? DOC_FILE : files[0]
  let title = projectId
  if (primary) {
    const content = await fs.readFile(docPath(projectId, primary), 'utf8').catch(() => '')
    title = deriveDocMeta(primary, content).title
  }
  const project: ProjectFile = {
    title,
    docs,
    openTabs: primary ? [primary] : [],
    activeDoc: primary ?? null
  }

  // re-key a flat comments.json ({threads:[]}) into per-doc ({ "<file>": {threads} })
  await migrateCommentsFile(projectId)
  // drop the now-relocated font from state.json
  if (legacyState.font !== undefined) await patchStateUnlocked(projectId, { font: undefined })

  await fs.mkdir(path.dirname(jsonPath), { recursive: true })
  await fs.writeFile(jsonPath, JSON.stringify(project, null, 2))
  return project
}

async function migrateCommentsFile(projectId: string): Promise<void> {
  const file = path.join(projectPath(projectId), COMMENTS_FILE)
  const raw = await fs.readFile(file, 'utf8').catch(() => null)
  if (!raw) return
  try {
    const data = JSON.parse(raw)
    // legacy flat shape: { threads: [...] }
    if (data && Array.isArray(data.threads)) {
      const rekeyed = { [DOC_FILE]: { threads: data.threads } }
      await fs.writeFile(file, JSON.stringify(rekeyed, null, 2))
    }
  } catch {
    /* leave a malformed file alone */
  }
}

export function readProject(projectId: string): Promise<ProjectFile> {
  return withStateLock(projectId, () => ensureProjectUnlocked(projectId))
}

async function writeProjectUnlocked(projectId: string, project: ProjectFile): Promise<void> {
  await fs.mkdir(path.dirname(projectJsonPath(projectId)), { recursive: true })
  await fs.writeFile(projectJsonPath(projectId), JSON.stringify(project, null, 2))
}

function patchProject(projectId: string, patch: Partial<ProjectFile>): Promise<void> {
  return withStateLock(projectId, async () => {
    const cur = await ensureProjectUnlocked(projectId)
    await writeProjectUnlocked(projectId, { ...cur, ...patch })
  })
}

// --- doc metadata ---

async function readDocMeta(projectId: string, file: string): Promise<DocMeta | null> {
  const type = docTypeForFile(file)
  if (!type) return null
  const full = docPath(projectId, file)
  try {
    const [content, stat] = await Promise.all([fs.readFile(full, 'utf8'), fs.stat(full)])
    const derived = deriveDocMeta(file, content)
    return {
      file,
      type,
      title: derived.title,
      path: full,
      createdAt: stat.birthtimeMs,
      updatedAt: stat.mtimeMs,
      wordCount: derived.wordCount,
      preview: derived.preview
    }
  } catch {
    return null
  }
}

/** All docs in a project, ordered by project.json then any newly-discovered files. */
export async function listProjectDocs(projectId: string): Promise<DocMeta[]> {
  const project = await readProject(projectId)
  const onDisk = await scanDocFiles(projectId)
  const ordered = [
    ...project.docs.map((d) => d.file).filter((f) => onDisk.includes(f)),
    ...onDisk.filter((f) => !project.docs.some((d) => d.file === f))
  ]
  const metas = await Promise.all(ordered.map((f) => readDocMeta(projectId, f)))
  return metas.filter((m): m is DocMeta => m !== null)
}

export async function listProjects(): Promise<ProjectMeta[]> {
  await ensureLibraryRoot()
  const entries = await fs.readdir(LIBRARY_ROOT, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  const metas = await Promise.all(
    dirs.map(async (e) => {
      const id = e.name
      const files = await scanDocFiles(id)
      if (files.length === 0) return null
      const project = await readProject(id)
      const stats = await Promise.all(
        files.map((f) => fs.stat(docPath(id, f)).catch(() => null))
      )
      const times = stats.filter(Boolean).map((s) => s!.mtimeMs)
      const births = stats.filter(Boolean).map((s) => s!.birthtimeMs)
      const meta: ProjectMeta = {
        id,
        title: project.title,
        path: projectPath(id),
        docCount: files.length,
        createdAt: births.length ? Math.min(...births) : Date.now(),
        updatedAt: times.length ? Math.max(...times) : Date.now()
      }
      return meta
    })
  )
  return metas
    .filter((m): m is ProjectMeta => m !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function uniqueDocFile(existing: string[], title: string): string {
  let base = slugify(title)
  let candidate = `${base}.md`
  let n = 1
  while (existing.includes(candidate)) candidate = `${base}-${++n}.md`
  return candidate
}

export async function createProject(title: string): Promise<ProjectMeta> {
  await ensureLibraryRoot()
  const clean = title.trim() || 'Untitled'
  let id = slugify(clean)
  let n = 1
  while (await exists(projectPath(id))) id = `${slugify(clean)}-${++n}`

  const dir = projectPath(id)
  const docFile = `${slugify(clean)}.md`
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, docFile), `# ${clean}\n\n`)
  await fs.writeFile(path.join(dir, 'CLAUDE.md'), CLAUDE_MD(clean))
  await fs.writeFile(path.join(dir, COMMENTS_FILE), JSON.stringify({}, null, 2))
  await fs.writeFile(path.join(dir, '.gitignore'), GITIGNORE)
  await fs.mkdir(path.join(dir, STATE_DIR), { recursive: true })
  await writeProjectUnlocked(id, {
    title: clean,
    docs: [{ file: docFile }],
    openTabs: [docFile],
    activeDoc: docFile
  })
  await initRepo(dir)
  await commitAll(dir, `Created "${clean}"`)
  const metas = await listProjects()
  const meta = metas.find((m) => m.id === id)
  if (!meta) throw new Error('Failed to create project')
  return meta
}

/** Create a new doc in a project; registers it and makes it the active tab. */
export async function createDoc(projectId: string, title: string): Promise<DocMeta> {
  const clean = title.trim() || 'Untitled'
  return withStateLock(projectId, async () => {
    const project = await ensureProjectUnlocked(projectId)
    const onDisk = await scanDocFiles(projectId)
    const file = uniqueDocFile([...onDisk, ...project.docs.map((d) => d.file)], clean)
    await fs.writeFile(docPath(projectId, file), `# ${clean}\n\n`)
    await writeProjectUnlocked(projectId, {
      ...project,
      docs: [...project.docs, { file }],
      openTabs: [...project.openTabs.filter((f) => f !== file), file],
      activeDoc: file
    })
    const meta = await readDocMeta(projectId, file)
    if (!meta) throw new Error('Failed to create document')
    await commitAll(projectPath(projectId), `Added "${clean}"`).catch(() => {})
    return meta
  })
}

export async function deleteProject(projectId: string): Promise<void> {
  await fs.rm(projectPath(projectId), { recursive: true, force: true })
}

/** Remove a single doc file from a project (and unregister it). */
export async function deleteDoc(projectId: string, docFile: string): Promise<void> {
  await fs.rm(docPath(projectId, docFile), { force: true })
  const project = await readProject(projectId)
  const docs = project.docs.filter((d) => d.file !== docFile)
  const openTabs = project.openTabs.filter((f) => f !== docFile)
  const activeDoc =
    project.activeDoc === docFile ? openTabs[openTabs.length - 1] ?? docs[0]?.file ?? null : project.activeDoc
  await patchProject(projectId, { docs, openTabs, activeDoc })
}

export async function readDoc(projectId: string, docFile: string): Promise<string> {
  return fs.readFile(docPath(projectId, docFile), 'utf8')
}

export async function writeDoc(projectId: string, docFile: string, content: string): Promise<void> {
  await fs.writeFile(docPath(projectId, docFile), content)
}

// --- per-doc font (stored in project.json) ---

export async function getDocFont(projectId: string, docFile: string): Promise<string> {
  const project = await readProject(projectId)
  return project.docs.find((d) => d.file === docFile)?.font ?? ''
}

export function setDocFont(projectId: string, docFile: string, font: string): Promise<void> {
  return withStateLock(projectId, async () => {
    const project = await ensureProjectUnlocked(projectId)
    const has = project.docs.some((d) => d.file === docFile)
    const docs = has
      ? project.docs.map((d) => (d.file === docFile ? { ...d, font: font || undefined } : d))
      : [...project.docs, { file: docFile, font: font || undefined }]
    await writeProjectUnlocked(projectId, { ...project, docs })
  })
}

// --- open-tab persistence (project.json) ---

export function setOpenTabs(projectId: string, openTabs: string[]): Promise<void> {
  return patchProject(projectId, { openTabs })
}

export function setActiveDoc(projectId: string, activeDoc: string | null): Promise<void> {
  return patchProject(projectId, { activeDoc })
}

// --- per-project app state (model, session ids, chat transcript) under .fabulist/ ---

/** One agent conversation, with its own resumable SDK session and transcript. */
interface StoredThread {
  id: string
  title: string
  sessionId?: string
  chat: ChatItem[]
  createdAt: number
  updatedAt: number
}

interface ProjectState {
  /** legacy single-session fields, migrated into a thread on first read */
  sessionId?: string
  chat?: unknown[]
  /** legacy per-doc font (pre-projects); migrated into project.json */
  font?: string
  /** Claude Code model alias/id for this project's agent; undefined = CLI default */
  model?: string
  /** agent conversations for this project */
  threads?: StoredThread[]
  /** which thread new messages and the UI default to */
  activeThreadId?: string
}

const DEFAULT_THREAD_TITLE = 'New thread'

async function statePath(id: string): Promise<string> {
  const base = projectPath(id)
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

export async function readState(id: string): Promise<ProjectState> {
  try {
    return JSON.parse(await fs.readFile(await statePath(id), 'utf8'))
  } catch {
    return {}
  }
}

// Serialize per-project state writes. state.json and project.json both hold
// several independently-mutated fields, and a single agent turn ends with two
// writes firing near-simultaneously — the main process saving the resumed
// session id and the renderer saving the transcript. Read-modify-write under
// one lock (shared with project.json + migration) keeps either from clobbering
// the other, and keeps the one-time legacy migration from racing itself.
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

async function patchStateUnlocked(id: string, patch: Partial<ProjectState>): Promise<void> {
  const cur = await readState(id)
  await fs.writeFile(await statePath(id), JSON.stringify({ ...cur, ...patch }, null, 2))
}

export function patchState(id: string, patch: Partial<ProjectState>): Promise<void> {
  return withStateLock(id, () => patchStateUnlocked(id, patch))
}

export function newId(): string {
  return randomUUID().slice(0, 8)
}

// --- agent threads (multiple conversations per project) ---

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
 * Resolve a project's threads, migrating the pre-threads single-session shape
 * (top-level `sessionId`/`chat`) into one thread the first time we see it.
 * Always returns at least one thread and a valid `activeThreadId`; persists the
 * migrated shape back to disk so subsequent reads are clean. Must run inside the
 * project's state lock — callers hold it so the read and any resulting write are atomic.
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

/** Delete a thread; never leaves a project with zero threads. Returns the (possibly new) active id. */
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

export { DEFAULT_THREAD_TITLE, DOC_EXTENSIONS }
