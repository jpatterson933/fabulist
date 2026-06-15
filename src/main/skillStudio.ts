import { promises as fs } from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import type { StudioFile, StudioSkill } from '@shared/types'
import { LIBRARY_ROOT } from './library'
import { initRepo, commitAll } from './git'
import { validateSkillSlug, resolveInside } from './pathGuards'

/**
 * Skill Studio storage — a local Claude plugin *marketplace* at
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

async function writeIfAbsent(p: string, content: string): Promise<void> {
  if (!(await exists(p))) {
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, content)
  }
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
  await writeIfAbsent(path.join(STUDIO_ROOT, '.gitignore'), '.DS_Store\n')
  await writeMarketplace()
  if (fresh) {
    await initRepo(STUDIO_ROOT).catch(() => {})
    await commitAll(STUDIO_ROOT, 'Initialize Skill Studio').catch(() => {})
  }
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
  await writeMarketplace()
  await commitAll(STUDIO_ROOT, `Remove skill ${slug}`).catch(() => {})
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
