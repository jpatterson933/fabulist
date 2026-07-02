import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AgentThread, ChatItem, FileMeta, ProjectMeta } from '@shared/types'
import { MAPPED_EXTENSIONS, deriveFileMeta, fileFormatFor, isProjectFile, isTextFile } from '@shared/fileFormats'
import {
  HARNESS_FILE,
  HARNESS_LOCAL_FILE,
  fileTypeFor,
  fileNameForType,
  isSafeRelPath,
  type FileTypeDef,
  type HarnessConfig
} from '@shared/harness'
import { initRepo, commitAll } from './git'
// note: harness.ts imports projectPath back from this module; both sides only
// touch each other at call time, so the cycle is harmless
import { loadMergedConfig, studioName } from './harness'

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

/** The single document file every pre-projects folder held; kept for migration. */
export const LEGACY_DOC_FILE = 'document.md'
export const COMMENTS_FILE = 'comments.json'

const CLAUDE_MD = (title: string) => `# About this project

This folder is a project inside Fabulist, an AI-native studio for making things
with Claude. You are the user's working partner for "${title}" — whatever kind
of work it turns out to be: prose, a website, code, data, notes, slides.

## Ground rules

- The files in this folder are the work — any kind (Markdown, HTML, source code,
  data, images). Each one is a piece of it; treat them all with care. The user
  tells you which file they are currently focused on.
- You can read and edit any file in the project — use this to keep the whole
  consistent (shared structure, naming, style, cross-references).
- Prefer the smallest edit that accomplishes the goal. Preserve the user's intent
  and conventions unless asked to rework something.
- \`comments.json\` is managed by the app. Never edit it; the app records your replies.
- When asked to respond to a comment on quoted text, address that text
  specifically. If a change is warranted, edit the relevant file directly —
  the user reviews and approves every edit before it lands.
- Keep chat replies brief. The files are where the substance goes.
- You may create supporting files (notes, outlines, reference sheets) here.
- \`fabulist.json\` (optional, at the project root) is the studio manifest: it can
  define custom file types, palette actions, panels, and a permission profile for
  this project. The user designs it with you in a "studio workshop" conversation.
`

// .claude/ itself is committed (skills/agents are part of a shareable studio);
// only session-local files stay out of the repo
export const GITIGNORE = `.fabulist/
.claude/settings.local.json
fabulist.local.json
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

/**
 * Absolute path to a file within a project. File ids are project-relative
 * POSIX paths ("chapters/ch-1.md"); traversal, absolute paths, and dot
 * segments are rejected.
 */
export function projectFilePath(projectId: string, file: string): string {
  if (!isSafeRelPath(file)) {
    throw new Error(`Invalid project file: ${file}`)
  }
  return path.join(projectPath(projectId), ...file.split('/'))
}

// --- project.json: files registry, per-file prefs, open tabs (app state) ---

interface ProjectFileEntry {
  file: string
  font?: string
}

interface ProjectFile {
  title: string
  files: ProjectFileEntry[]
  openTabs: string[]
  activeFile: string | null
}

function projectJsonPath(projectId: string): string {
  return path.join(projectPath(projectId), STATE_DIR, 'project.json')
}

// Top-level files that are project machinery, not work files.
export const RESERVED_FILES = new Set([
  'CLAUDE.md', 'AGENTS.md', 'README.md',
  COMMENTS_FILE, HARNESS_FILE, HARNESS_LOCAL_FILE,
  'package.json', 'package-lock.json'
])
// Folders that hold app/tool machinery or build output, never work files.
export const IGNORED_DIRS = new Set([
  'attachments', 'node_modules', 'dist', 'build', 'out', 'coverage',
  'vendor', 'target', '__pycache__'
])
const SCAN_DEPTH = 8

/**
 * All work files in a project as project-relative POSIX paths, sorted.
 * Every textual file and every image counts — a studio harness adds kind
 * labels and templates via fileType globs, but admission needs no manifest.
 */
async function scanProjectFiles(projectId: string): Promise<string[]> {
  const root = projectPath(projectId)
  const out: string[] = []
  const isWorkFile = (rel: string, name: string): boolean =>
    !RESERVED_FILES.has(rel) && isProjectFile(name)
  const walk = async (rel: string, depth: number): Promise<void> => {
    const entries = await fs
      .readdir(rel ? path.join(root, ...rel.split('/')) : root, { withFileTypes: true })
      .catch(() => [])
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (depth < SCAN_DEPTH && !IGNORED_DIRS.has(e.name)) await walk(childRel, depth + 1)
      } else if (e.isFile() && isWorkFile(childRel, e.name)) {
        out.push(childRel)
      }
    }
  }
  await walk('', 0)
  return out.sort()
}

/**
 * Read a project's app state, migrating a pre-projects single-document folder on
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
      const files = Array.isArray(parsed.files) ? parsed.files : []
      return {
        title: parsed.title || projectId,
        files,
        openTabs: Array.isArray(parsed.openTabs) ? parsed.openTabs : [],
        activeFile: parsed.activeFile ?? files[0]?.file ?? null
      }
    } catch {
      /* fall through to rebuild */
    }
  }

  // --- migrate / initialize ---
  const onDisk = await scanProjectFiles(projectId)
  // legacy single-doc font lived in state.json
  const legacyState = await readState(projectId)
  const files: ProjectFileEntry[] = onDisk.map((file) => ({
    file,
    font: file === LEGACY_DOC_FILE ? legacyState.font : undefined
  }))
  const primary = onDisk.includes(LEGACY_DOC_FILE) ? LEGACY_DOC_FILE : onDisk[0]
  // title from the legacy doc file or the first markdown file; a code or data
  // file's name makes a poor project title, so otherwise keep the folder name
  const titleSource = onDisk.includes(LEGACY_DOC_FILE)
    ? LEGACY_DOC_FILE
    : onDisk.find((f) => f.toLowerCase().endsWith('.md'))
  let title = projectId
  if (titleSource) {
    const content = await fs.readFile(projectFilePath(projectId, titleSource), 'utf8').catch(() => '')
    title = deriveFileMeta(titleSource, content).title
  }
  const project: ProjectFile = {
    title,
    files,
    openTabs: primary ? [primary] : [],
    activeFile: primary ?? null
  }

  // re-key a flat comments.json ({threads:[]}) into per-file ({ "<file>": {threads} })
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
      const rekeyed = { [LEGACY_DOC_FILE]: { threads: data.threads } }
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

export function setProjectTitle(projectId: string, title: string): Promise<void> {
  return patchProject(projectId, { title })
}

// --- file metadata ---

/** Drop a leading YAML frontmatter block so title/preview derive from the body. */
function stripFrontmatter(content: string): string {
  const m = content.match(/^---\n[\s\S]*?\n---\n?/)
  return m ? content.slice(m[0].length) : content
}

function frontmatterValue(content: string, key: string): string | undefined {
  const fm = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) return undefined
  for (const line of fm[1].split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.+)$/)
    if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

/** Title per the harness file type's titleFrom rule; falls back to the h1 derivation. */
function titleForType(file: string, content: string, harnessType: FileTypeDef, fallback: string): string {
  const rule = harnessType.titleFrom
  if (rule === 'filename') {
    const base = file.split('/').pop() ?? file
    return base.replace(/(\.[^.]+)+$/, '')
  }
  if (rule?.startsWith('frontmatter:')) {
    return frontmatterValue(content, rule.slice('frontmatter:'.length)) ?? fallback
  }
  return fallback
}

async function readFileMeta(
  projectId: string,
  file: string,
  config?: HarnessConfig
): Promise<FileMeta | null> {
  const type = fileFormatFor(file)
  if (!type) return null
  const full = projectFilePath(projectId, file)
  try {
    // non-text files (images) never have their bytes read as content
    const [content, stat] = await Promise.all([
      isTextFile(file) ? fs.readFile(full, 'utf8') : Promise.resolve(''),
      fs.stat(full)
    ])
    const harnessType = config ? fileTypeFor(config, file) : null
    // frontmatter is metadata for any file — titles/previews derive from the body
    const derived = deriveFileMeta(file, stripFrontmatter(content))
    return {
      file,
      type,
      title: harnessType ? titleForType(file, content, harnessType, derived.title) : derived.title,
      path: full,
      createdAt: stat.birthtimeMs,
      updatedAt: stat.mtimeMs,
      preview: derived.preview,
      kind: harnessType?.id,
      kindLabel: harnessType ? harnessType.label ?? harnessType.id : undefined,
      kindIcon: harnessType?.icon
    }
  } catch {
    return null
  }
}

/** All files in a project, ordered by project.json then any newly-discovered files. */
export async function listProjectFiles(projectId: string): Promise<FileMeta[]> {
  const config = await loadMergedConfig(projectId)
  const [project, onDisk] = await Promise.all([
    readProject(projectId),
    scanProjectFiles(projectId)
  ])
  const ordered = [
    ...project.files.map((d) => d.file).filter((f) => onDisk.includes(f)),
    ...onDisk.filter((f) => !project.files.some((d) => d.file === f))
  ]
  const metas = await Promise.all(ordered.map((f) => readFileMeta(projectId, f, config)))
  return metas.filter((m): m is FileMeta => m !== null)
}

export async function listProjects(): Promise<ProjectMeta[]> {
  await ensureLibraryRoot()
  const entries = await fs.readdir(LIBRARY_ROOT, { withFileTypes: true })
  // symlinks admit folders imported from elsewhere (openFolder)
  const dirs = entries.filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.'))
  const metas = await Promise.all(
    dirs.map(async (e) => {
      const id = e.name
      const files = await scanProjectFiles(id)
      // folders with no files are noise — unless they declare a studio manifest
      if (files.length === 0 && !(await exists(path.join(projectPath(id), 'fabulist.json')))) return null
      const [project, studio] = await Promise.all([readProject(id), studioName(id)])
      const stats = await Promise.all(
        files.map((f) => fs.stat(projectFilePath(id, f)).catch(() => null))
      )
      const times = stats.filter(Boolean).map((s) => s!.mtimeMs)
      const births = stats.filter(Boolean).map((s) => s!.birthtimeMs)
      const meta: ProjectMeta = {
        id,
        title: project.title,
        path: projectPath(id),
        fileCount: files.length,
        createdAt: births.length ? Math.min(...births) : Date.now(),
        updatedAt: times.length ? Math.max(...times) : Date.now(),
        studio
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
  const file = `${slugify(clean)}.md`
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, file), `# ${clean}\n\n`)
  await fs.writeFile(path.join(dir, 'CLAUDE.md'), CLAUDE_MD(clean))
  await fs.writeFile(path.join(dir, COMMENTS_FILE), JSON.stringify({}, null, 2))
  await fs.writeFile(path.join(dir, '.gitignore'), GITIGNORE)
  await fs.mkdir(path.join(dir, STATE_DIR), { recursive: true })
  await writeProjectUnlocked(id, {
    title: clean,
    files: [{ file: file }],
    openTabs: [file],
    activeFile: file
  })
  await initRepo(dir)
  await commitAll(dir, `Created "${clean}"`)
  const metas = await listProjects()
  const meta = metas.find((m) => m.id === id)
  if (!meta) throw new Error('Failed to create project')
  return meta
}

/**
 * Create a new file in a project; registers it and makes it the active tab.
 * With a harness file-type id, the filename follows the type's glob and the
 * type's template seeds the content.
 */
export async function createFile(projectId: string, title: string, typeId?: string): Promise<FileMeta> {
  const clean = title.trim() || 'Untitled'
  const config = await loadMergedConfig(projectId)
  const harnessType = typeId ? config.fileTypes.find((t) => t.id === typeId) ?? null : null
  return withStateLock(projectId, async () => {
    const project = await ensureProjectUnlocked(projectId)
    const onDisk = await scanProjectFiles(projectId)
    const taken = [...onDisk, ...project.files.map((d) => d.file)]
    let file: string
    if (harnessType) {
      const slug = slugify(clean)
      file = fileNameForType(harnessType, slug)
      for (let n = 2; taken.includes(file); n++) file = fileNameForType(harnessType, `${slug}-${n}`)
    } else {
      file = uniqueDocFile(taken, clean)
    }
    const seed = harnessType?.template
      ? harnessType.template.replaceAll('{{title}}', clean)
      : `# ${clean}\n\n`
    const full = projectFilePath(projectId, file)
    await fs.mkdir(path.dirname(full), { recursive: true }) // typed globs may nest
    await fs.writeFile(full, seed)
    await writeProjectUnlocked(projectId, {
      ...project,
      files: [...project.files, { file }],
      openTabs: [...project.openTabs.filter((f) => f !== file), file],
      activeFile: file
    })
    const meta = await readFileMeta(projectId, file, config)
    if (!meta) throw new Error('Failed to create file')
    await commitAll(projectPath(projectId), `Added "${clean}"`).catch(() => {})
    return meta
  })
}

/**
 * Bring an existing folder (e.g. a cloned Claude Code project with a
 * fabulist.json) into the library by symlinking it under the library root.
 * The folder stays where it is; deleting the project later removes only the
 * link. Returns the project id.
 */
export async function openFolder(folder: string): Promise<string> {
  await ensureLibraryRoot()
  const real = await fs.realpath(folder)
  const stat = await fs.stat(real)
  if (!stat.isDirectory()) throw new Error('Not a folder')
  // already in the library (directly or via an existing link)?
  const entries = await fs.readdir(LIBRARY_ROOT, { withFileTypes: true })
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const target = await fs.realpath(path.join(LIBRARY_ROOT, e.name)).catch(() => null)
    if (target === real) return e.name
  }
  let id = slugify(path.basename(real))
  let n = 1
  while (await exists(projectPath(id))) id = `${slugify(path.basename(real))}-${++n}`
  await fs.symlink(real, projectPath(id), 'dir')
  await initRepo(real).catch(() => {})
  return id
}

export async function deleteProject(projectId: string): Promise<void> {
  // for symlinked (imported) folders this removes only the link
  await fs.rm(projectPath(projectId), { recursive: true, force: true })
}

/** Remove a single file from a project (and unregister it). */
export async function deleteFile(projectId: string, file: string): Promise<void> {
  await fs.rm(projectFilePath(projectId, file), { force: true })
  const project = await readProject(projectId)
  const files = project.files.filter((d) => d.file !== file)
  const openTabs = project.openTabs.filter((f) => f !== file)
  const activeFile =
    project.activeFile === file ? openTabs[openTabs.length - 1] ?? files[0]?.file ?? null : project.activeFile
  await patchProject(projectId, { files, openTabs, activeFile })
}

export async function readFileContent(projectId: string, file: string): Promise<string> {
  return fs.readFile(projectFilePath(projectId, file), 'utf8')
}

export async function writeFileContent(projectId: string, file: string, content: string): Promise<void> {
  await fs.writeFile(projectFilePath(projectId, file), content)
}

// --- per-file font (stored in project.json) ---

export async function getFileFont(projectId: string, file: string): Promise<string> {
  const project = await readProject(projectId)
  return project.files.find((d) => d.file === file)?.font ?? ''
}

export function setFileFont(projectId: string, file: string, font: string): Promise<void> {
  return withStateLock(projectId, async () => {
    const project = await ensureProjectUnlocked(projectId)
    const has = project.files.some((d) => d.file === file)
    const files = has
      ? project.files.map((d) => (d.file === file ? { ...d, font: font || undefined } : d))
      : [...project.files, { file: file, font: font || undefined }]
    await writeProjectUnlocked(projectId, { ...project, files })
  })
}

// --- open-tab persistence (project.json) ---

export function setOpenTabs(projectId: string, openTabs: string[]): Promise<void> {
  return patchProject(projectId, { openTabs })
}

export function setActiveFile(projectId: string, activeFile: string | null): Promise<void> {
  return patchProject(projectId, { activeFile })
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
  /** 'workshop' threads design the studio harness instead of the files */
  kind?: 'workshop'
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
    messageCount: t.chat.length,
    kind: t.kind
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

export function createThread(id: string, title?: string, kind?: 'workshop'): Promise<AgentThread> {
  return withStateLock(id, async () => {
    const { threads } = await resolveThreads(id)
    const now = Date.now()
    const thread: StoredThread = {
      id: newId(),
      title: title?.trim() || DEFAULT_THREAD_TITLE,
      chat: [],
      createdAt: now,
      updatedAt: now,
      kind
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

export { DEFAULT_THREAD_TITLE, MAPPED_EXTENSIONS }
