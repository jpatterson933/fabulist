import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The Skill Studio scaffolds each skill as its OWN Claude plugin under
// .skill-studio/<slug>/ (manifest + skills/<slug>/SKILL.md + agents/ + .mcp.json),
// listed in a top-level marketplace.json, and guards every write through resolveInside.

let root = ''

afterEach(async () => {
  vi.resetModules()
  vi.doUnmock('electron')
  vi.doUnmock('../../../src/main/library')
  vi.doUnmock('../../../src/main/git')
  if (root) await fs.rm(root, { recursive: true, force: true }).catch(() => {})
  root = ''
})

async function load(): Promise<typeof import('../../../src/main/skillStudio')> {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'fabulist-studio-test-'))
  vi.doMock('electron', () => ({ shell: { openPath: vi.fn(async () => '') } }))
  vi.doMock('../../../src/main/library', () => ({ LIBRARY_ROOT: root }))
  vi.doMock('../../../src/main/git', () => ({
    initRepo: vi.fn(async () => {}),
    commitAll: vi.fn(async () => false)
  }))
  return import('../../../src/main/skillStudio')
}

const studioRoot = (): string => path.join(root, '.skill-studio')
const pluginDir = (slug: string): string => path.join(studioRoot(), slug)

describe('skill studio — one plugin per skill', () => {
  it('scaffolds a complete plugin and a valid nested SKILL.md', async () => {
    const studio = await load()
    const skill = await studio.createSkill('Copywriting Logos')
    expect(skill.slug).toBe('copywriting-logos')
    const dir = pluginDir('copywriting-logos')

    const plugin = JSON.parse(await fs.readFile(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8'))
    expect(plugin.name).toBe('copywriting-logos')
    await expect(fs.stat(path.join(dir, '.mcp.json'))).resolves.toBeTruthy()
    await expect(fs.stat(path.join(dir, 'agents'))).resolves.toBeTruthy()

    const skillMd = await fs.readFile(path.join(dir, 'skills', 'copywriting-logos', 'SKILL.md'), 'utf8')
    expect(skillMd).toContain('name: copywriting-logos')
    expect(skillMd).toContain('description: Copywriting Logos')

    const market = JSON.parse(
      await fs.readFile(path.join(studioRoot(), '.claude-plugin', 'marketplace.json'), 'utf8')
    )
    expect(market.plugins.map((p: { name: string }) => p.name)).toContain('copywriting-logos')

    expect((await studio.listSkills()).map((s) => s.slug)).toContain('copywriting-logos')
  })

  it('lists the full plugin structure and round-trips files', async () => {
    const studio = await load()
    const { slug } = await studio.createSkill('voice')
    await studio.writeFile(slug, 'references/brand.md', '# Brand voice')
    expect(await studio.readFile(slug, 'references/brand.md')).toBe('# Brand voice')

    const rels = (await studio.listFiles(slug)).map((f) => f.rel)
    expect(rels).toContain('skills/voice/SKILL.md')
    expect(rels).toContain('references/brand.md')
    expect(rels).toContain('agents') // empty dir still shown so its structure is visible
  })

  it('creates folders (incl. nested) and refuses to escape the plugin folder', async () => {
    const studio = await load()
    const { slug } = await studio.createSkill('folders')
    await studio.createFolder(slug, 'references/copy-library')
    const rels = (await studio.listFiles(slug)).map((f) => f.rel)
    expect(rels).toContain('references')
    expect(rels).toContain('references/copy-library')
    await expect(studio.createFolder(slug, '../escape')).rejects.toThrow()
  })

  it('refuses to write outside the skill plugin folder', async () => {
    const studio = await load()
    const { slug } = await studio.createSkill('guard')
    await expect(studio.writeFile(slug, '../escape.md', 'x')).rejects.toThrow()
  })
})
