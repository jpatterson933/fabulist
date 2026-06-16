import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The Plugin Studio scaffolds each skill as its OWN Claude plugin under
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
  vi.doMock('../../../src/main/library', () => ({
    LIBRARY_ROOT: root,
    sanitizeChat: (chat: unknown) =>
      Array.isArray(chat)
        ? chat.filter(
            (c) =>
              !!c &&
              typeof (c as { id?: unknown }).id === 'string' &&
              ((c as { role?: unknown }).role === 'user' || (c as { role?: unknown }).role === 'assistant') &&
              typeof (c as { text?: unknown }).text === 'string'
          )
        : []
  }))
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

  it('lists the skills a plugin ships, by frontmatter name + description', async () => {
    const studio = await load()
    const { slug } = await studio.createSkill('Copywriting')
    // a second skill in the same plugin
    await studio.writeFile(
      slug,
      'skills/extra/SKILL.md',
      '---\nname: extra-helper\ndescription: Does extra things\n---\n\n'
    )
    const list = await studio.listPluginSkills(slug)
    expect(list.map((s) => s.name)).toEqual(['copywriting', 'extra-helper']) // sorted
    expect(list.find((s) => s.name === 'copywriting')?.description).toBe('Copywriting')
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

describe('skill studio — transcript persistence', () => {
  const item = (id: string, role: 'user' | 'assistant', text: string): unknown => ({ id, role, text, at: 0 })

  it('round-trips authoring and test transcripts under .state/, outside the plugin', async () => {
    const studio = await load()
    const { slug } = await studio.createSkill('persist')

    await studio.saveAuthChat(slug, [item('a1', 'user', 'build it')] as never)
    await studio.saveTestChat(slug, [item('t1', 'assistant', 'ran it')] as never)

    const { authChat, testChat } = await studio.readChats(slug)
    expect(authChat.map((c) => c.text)).toEqual(['build it'])
    expect(testChat.map((c) => c.text)).toEqual(['ran it'])

    // state lives in .skill-studio/.state/<slug>.json — never inside the plugin folder
    await expect(fs.stat(path.join(studioRoot(), '.state', `${slug}.json`))).resolves.toBeTruthy()
    expect((await studio.listFiles(slug)).map((f) => f.rel)).not.toContain('.state')
  })

  it('drops malformed transcript items on read', async () => {
    const studio = await load()
    const { slug } = await studio.createSkill('sane')
    const stateFile = path.join(studioRoot(), '.state', `${slug}.json`)
    await fs.mkdir(path.dirname(stateFile), { recursive: true })
    await fs.writeFile(
      stateFile,
      JSON.stringify({ authChat: [item('ok', 'user', 'fine'), { id: 7 }, null, { role: 'user' }] })
    )
    const { authChat } = await studio.readChats(slug)
    expect(authChat.map((c) => c.id)).toEqual(['ok'])
  })

  it('archives a test under its version, bumps the version, and clears the live thread', async () => {
    const studio = await load()
    const { slug } = await studio.createSkill('arch')

    const r1 = await studio.archiveTest(slug, [item('u', 'user', 'first run')] as never)
    expect(r1.version).toBe('0.0.1') // first live test is version index 1
    expect(r1.nextVersion).toBe(2)

    let state = await studio.readChats(slug)
    expect(state.testChat).toEqual([]) // live thread cleared
    expect(state.testVersion).toBe(2) // bumped
    expect(state.archivedTests.map((a) => a.version)).toEqual(['0.0.1'])
    expect(state.archivedTests[0].chat.map((c) => c.text)).toEqual(['first run'])

    const r2 = await studio.archiveTest(slug, [item('u2', 'user', 'second run')] as never)
    expect(r2.version).toBe('0.0.2')
    state = await studio.readChats(slug)
    expect(state.testVersion).toBe(3)
    // most-recent-first
    expect(state.archivedTests.map((a) => a.version)).toEqual(['0.0.2', '0.0.1'])
  })

  it('gitignores the .state dir and removes state when a skill is deleted', async () => {
    const studio = await load()
    const { slug } = await studio.createSkill('gone')
    await studio.saveAuthChat(slug, [item('a1', 'user', 'hi')] as never)
    const stateFile = path.join(studioRoot(), '.state', `${slug}.json`)
    await expect(fs.stat(stateFile)).resolves.toBeTruthy()

    expect(await fs.readFile(path.join(studioRoot(), '.gitignore'), 'utf8')).toContain('.state/')

    await studio.deleteSkill(slug)
    await expect(fs.stat(stateFile)).rejects.toThrow()
  })
})
