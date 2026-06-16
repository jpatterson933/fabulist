import { promises as fs } from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import {
  MAX_ARCHIVED_TESTS,
  type ArchivedTest,
  type ChatItem,
  type StudioFile,
  type StudioSettings,
  type StudioSettingKey,
  type StudioSkill
} from '@shared/types'
import { formatTestVersion } from '@shared/testVersion'
import { LIBRARY_ROOT, sanitizeChat } from './library'
import { initRepo, commitAll } from './git'
import { validateSkillSlug, resolveInside } from './pathGuards'

/**
 * Plugin Studio storage — a local Claude plugin *marketplace* at
 * ~/Documents/Fabulist/.skill-studio/, where EACH skill is its own self-contained
 * plugin in its own folder:
 *
 *   .skill-studio/
 *     .claude-plugin/marketplace.json     ← lists every skill-plugin (regenerated)
 *     <slug>/                             ← one complete plugin per skill
 *       .claude-plugin/plugin.json
 *       skills/<slug>/SKILL.md
 *       agents/
 *       .mcp.json
 *
 * This is the BUILD world, kept entirely separate from the consume library
 * (.skills/, src/main/skills.ts). The test harness (src/main/studioAgent.ts) loads
 * a single skill's plugin off disk via the SDK `plugins` option, so each skill — with
 * its own agents and MCP — is runnable in isolation the moment it is written.
 *
 * Dot-prefixed root, so listDocs() (which skips dot-dirs) never surfaces it. Paths
 * are guarded by validateSkillSlug + resolveInside (NOT docPath, which rejects
 * dot-prefixed ids).
 */
export const STUDIO_ROOT = path.join(LIBRARY_ROOT, '.skill-studio')
const MARKET_DIR = path.join(STUDIO_ROOT, '.claude-plugin')
// Per-skill app state (chat transcripts + authoring session), kept OUTSIDE the
// plugin folders so it never shows in the file tree or loads as plugin content.
// Dot-dir, so listPluginSlugs skips it; gitignored so transcripts aren't versioned.
const STATE_DIR = path.join(STUDIO_ROOT, '.state')

const MAX_FILES = 800
const MAX_DEPTH = 8
const SKIP = new Set(['.git', '.DS_Store'])

const exists = (p: string): Promise<boolean> => fs.stat(p).then(() => true, () => false)

/** A skill's plugin root: .skill-studio/<slug>/ */
export function pluginPath(slug: string): string {
  return path.join(STUDIO_ROOT, validateSkillSlug(slug))
}
function skillMdPath(slug: string): string {
  return path.join(pluginPath(slug), 'skills', slug, 'SKILL.md')
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'skill'
}

/** Minimal SKILL.md frontmatter read (name + description) — no body parsing. */
function parseFrontmatter(src: string): { name: string; description: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const field = (key: string): string => {
    if (!m) return ''
    const line = m[1].split(/\r?\n/).find((l) => l.startsWith(`${key}:`))
    return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : ''
  }
  return { name: field('name'), description: field('description') }
}

/** A bare, valid SKILL.md skeleton — the author fills in the body and rules themselves. */
function skillMd(slug: string, description: string): string {
  return `---\nname: ${slug}\ndescription: ${description}\n---\n\n`
}

/** Plugin folders directly under the studio root (skips dot-dirs like .claude-plugin/.git). */
async function listPluginSlugs(): Promise<string[]> {
  const entries = await fs.readdir(STUDIO_ROOT, { withFileTypes: true }).catch(() => [])
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
}

async function readMeta(slug: string): Promise<StudioSkill | null> {
  const src = await fs.readFile(skillMdPath(slug), 'utf8').catch(() => null)
  if (src === null) return null
  const fm = parseFrontmatter(src)
  return { slug, name: fm.name || slug, description: fm.description }
}

/** Regenerate the marketplace manifest listing every skill-plugin. */
async function writeMarketplace(): Promise<void> {
  const slugs = await listPluginSlugs()
  const plugins = []
  for (const slug of slugs) {
    const meta = await readMeta(slug).catch(() => null)
    plugins.push({ name: slug, source: `./${slug}`, description: meta?.description ?? '' })
  }
  await fs.mkdir(MARKET_DIR, { recursive: true })
  await fs.writeFile(
    path.join(MARKET_DIR, 'marketplace.json'),
    JSON.stringify({ name: 'fabulist-skill-studio', owner: { name: 'Fabulist' }, plugins }, null, 2) + '\n'
  )
}

/** Create the studio root + marketplace if absent (idempotent). */
export async function ensureStudio(): Promise<void> {
  const fresh = !(await exists(STUDIO_ROOT))
  await fs.mkdir(MARKET_DIR, { recursive: true })
  await ensureGitignore()
  await writeMarketplace()
  if (fresh) {
    await initRepo(STUDIO_ROOT).catch(() => {})
    await commitAll(STUDIO_ROOT, 'Initialize Plugin Studio').catch(() => {})
  }
}

/** Keep .DS_Store and the .state/ app-state dir out of git, without clobbering manual edits. */
async function ensureGitignore(): Promise<void> {
  const giPath = path.join(STUDIO_ROOT, '.gitignore')
  const cur = await fs.readFile(giPath, 'utf8').catch(() => '')
  const lines = cur.split(/\r?\n/)
  const missing = ['.DS_Store', '.state/'].filter((w) => !lines.includes(w))
  if (missing.length === 0) return
  await fs.writeFile(giPath, (cur && !cur.endsWith('\n') ? cur + '\n' : cur) + missing.join('\n') + '\n')
}

// --- per-skill app state under .skill-studio/.state/<slug>.json ---

interface StudioState {
  authChat?: ChatItem[]
  testChat?: ChatItem[]
  /** resume id for the authoring conversation, so it continues after a restart */
  authSessionId?: string
  /** version index of the CURRENT live test (1 = the first); see shared/testVersion.ts */
  testVersion?: number
  /** archived test runs, most-recent-first, read-only */
  archivedTests?: ArchivedTest[]
  /** model alias for authoring + test runs ('' / unset = CLI default) */
  model?: string
  /** apply the authoring agent's edits without an approval card */
  autoApprove?: boolean
}

/** Validate archived-test entries read off disk (never trust on-disk JSON). */
function sanitizeArchived(v: unknown): ArchivedTest[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(
      (a): a is ArchivedTest =>
        !!a &&
        typeof (a as ArchivedTest).version === 'string' &&
        typeof (a as ArchivedTest).at === 'number'
    )
    .map((a) => ({ version: a.version, at: a.at, chat: sanitizeChat(a.chat) }))
}

function statePath(slug: string): string {
  return path.join(STATE_DIR, `${validateSkillSlug(slug)}.json`)
}

async function readStudioState(slug: string): Promise<StudioState> {
  try {
    return JSON.parse(await fs.readFile(statePath(slug), 'utf8')) as StudioState
  } catch {
    return {}
  }
}

async function patchStudioState(slug: string, patch: Partial<StudioState>): Promise<void> {
  const cur = await readStudioState(slug)
  await fs.mkdir(STATE_DIR, { recursive: true })
  await fs.writeFile(statePath(slug), JSON.stringify({ ...cur, ...patch }, null, 2))
}

/** The persisted authoring + test transcripts, live test version, and archive (validated on read). */
export async function readChats(slug: string): Promise<{
  authChat: ChatItem[]
  testChat: ChatItem[]
  testVersion: number
  archivedTests: ArchivedTest[]
}> {
  const s = await readStudioState(slug)
  return {
    authChat: sanitizeChat(s.authChat),
    testChat: sanitizeChat(s.testChat),
    testVersion: typeof s.testVersion === 'number' ? s.testVersion : 1,
    archivedTests: sanitizeArchived(s.archivedTests)
  }
}

/**
 * Archive the current test transcript under its version, then bump to the next version
 * and clear the live thread. Returns the assigned version + the next live version so the
 * renderer can update without re-reading. The sandbox/session are dropped separately
 * (resetTest) — an archived run is a read-only transcript, not a resumable session.
 */
export async function archiveTest(
  slug: string,
  chat: ChatItem[]
): Promise<{ version: string; at: number; nextVersion: number }> {
  const s = await readStudioState(slug)
  const cur = typeof s.testVersion === 'number' ? s.testVersion : 1
  const version = formatTestVersion(cur)
  const at = Date.now()
  // keep the FULL transcript — a partial run can't be diagnosed (see formatTestTranscript)
  const entry: ArchivedTest = { version, at, chat: sanitizeChat(chat) }
  // most-recent-first, capped to the last MAX_ARCHIVED_TESTS runs
  const archivedTests = [entry, ...(s.archivedTests ?? [])].slice(0, MAX_ARCHIVED_TESTS)
  const nextVersion = cur + 1
  await patchStudioState(slug, { archivedTests, testChat: [], testVersion: nextVersion })
  return { version, at, nextVersion }
}

export async function saveAuthChat(slug: string, chat: ChatItem[]): Promise<void> {
  await patchStudioState(slug, { authChat: sanitizeChat(chat) })
}

export async function saveTestChat(slug: string, chat: ChatItem[]): Promise<void> {
  await patchStudioState(slug, { testChat: sanitizeChat(chat) })
}

/** Authoring session resume id (the test session isn't resumable — its sandbox is ephemeral). */
export async function readAuthSessionId(slug: string): Promise<string | undefined> {
  return (await readStudioState(slug)).authSessionId
}

export async function saveAuthSessionId(slug: string, sessionId: string): Promise<void> {
  await patchStudioState(slug, { authSessionId: sessionId })
}

/**
 * Wipe the authoring conversation from disk — both the transcript and the now-stale
 * resume id — so a reset survives a restart and the next send can't resume the old SDK
 * session. The skill's actual files (the real output) are deliberately left untouched.
 */
export async function resetAuthChat(slug: string): Promise<void> {
  await patchStudioState(slug, { authChat: [], authSessionId: undefined })
}

/** Per-skill settings (model + auto-apply), defaulted on read — mirrors library.readSettings. */
export async function readSettings(slug: string): Promise<StudioSettings> {
  const s = await readStudioState(slug)
  return { model: s.model ?? '', autoApprove: Boolean(s.autoApprove) }
}

/** Persist one setting — mirrors library.writeSetting. */
export async function writeSetting<K extends StudioSettingKey>(
  slug: string,
  key: K,
  value: StudioSettings[K]
): Promise<void> {
  await patchStudioState(slug, { [key]: value })
}

export async function listSkills(): Promise<StudioSkill[]> {
  await ensureStudio()
  const out: StudioSkill[] = []
  for (const slug of await listPluginSlugs()) {
    const meta = await readMeta(slug).catch(() => null)
    if (meta) out.push(meta)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Scaffold a complete plugin for a new skill: manifest, skills/<slug>/SKILL.md, agents/, .mcp.json. */
export async function createSkill(name: string): Promise<StudioSkill> {
  await ensureStudio()
  const clean = name.trim() || 'skill'
  let slug = slugify(clean)
  let n = 1
  while (await exists(pluginPath(slug))) slug = `${slugify(clean)}-${++n}`
  const dir = pluginPath(slug)
  await fs.mkdir(path.join(dir, '.claude-plugin'), { recursive: true })
  await fs.mkdir(path.join(dir, 'skills', slug), { recursive: true })
  await fs.mkdir(path.join(dir, 'agents'), { recursive: true })
  await fs.writeFile(
    path.join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: slug, version: '0.1.0', description: clean }, null, 2) + '\n'
  )
  await fs.writeFile(skillMdPath(slug), skillMd(slug, clean))
  await fs.writeFile(path.join(dir, '.mcp.json'), '{\n  "mcpServers": {}\n}\n')
  await writeMarketplace()
  await commitAll(STUDIO_ROOT, `Add skill ${slug}`).catch(() => {})
  return { slug, name: slug, description: clean }
}

export async function deleteSkill(slug: string): Promise<void> {
  await fs.rm(pluginPath(slug), { recursive: true, force: true })
  await fs.rm(statePath(slug), { force: true }).catch(() => {})
  await writeMarketplace()
  await commitAll(STUDIO_ROOT, `Remove skill ${slug}`).catch(() => {})
}

/**
 * The skills this plugin ships (one entry per skills/<dir>/SKILL.md), by frontmatter
 * name + description. Powers the Test tab's "/" picker — the model sees these same
 * skills via the SDK's `skills: 'all'`, so picking one mirrors invoking it for real.
 */
export async function listPluginSkills(slug: string): Promise<{ name: string; description: string }[]> {
  const skillsDir = path.join(pluginPath(slug), 'skills')
  const entries = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => [])
  const out: { name: string; description: string }[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const src = await fs.readFile(path.join(skillsDir, e.name, 'SKILL.md'), 'utf8').catch(() => null)
    if (src === null) continue
    const fm = parseFrontmatter(src)
    out.push({ name: fm.name || e.name, description: fm.description })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Everything inside a skill's plugin folder (files + dirs), so the full structure shows. */
export async function listFiles(slug: string): Promise<StudioFile[]> {
  const root = pluginPath(slug)
  const out: StudioFile[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || out.length > MAX_FILES) return
    for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (SKIP.has(e.name)) continue
      const abs = path.join(dir, e.name)
      const rel = path.relative(root, abs).split(path.sep).join('/')
      out.push({ rel, isDir: e.isDirectory() })
      if (e.isDirectory()) await walk(abs, depth + 1)
    }
  }
  await walk(root, 0)
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

export async function readFile(slug: string, rel: string): Promise<string> {
  const { absolute } = resolveInside(pluginPath(slug), rel)
  return fs.readFile(absolute, 'utf8')
}

export async function writeFile(slug: string, rel: string, content: string): Promise<void> {
  const { absolute } = resolveInside(pluginPath(slug), rel)
  await fs.mkdir(path.dirname(absolute), { recursive: true })
  await fs.writeFile(absolute, content)
}

export async function createFile(slug: string, rel: string): Promise<void> {
  const { absolute } = resolveInside(pluginPath(slug), rel)
  if (await exists(absolute)) return
  await fs.mkdir(path.dirname(absolute), { recursive: true })
  await fs.writeFile(absolute, '')
}

export async function createFolder(slug: string, rel: string): Promise<void> {
  const { absolute } = resolveInside(pluginPath(slug), rel)
  await fs.mkdir(absolute, { recursive: true })
}

export async function deleteFile(slug: string, rel: string): Promise<void> {
  const { absolute } = resolveInside(pluginPath(slug), rel)
  await fs.rm(absolute, { recursive: true, force: true })
}

export async function reveal(slug?: string): Promise<void> {
  await ensureStudio()
  await shell.openPath(slug ? pluginPath(slug) : STUDIO_ROOT)
}
