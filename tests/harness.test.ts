import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  EMPTY_CONFIG,
  fileNameForType,
  globMatch,
  mergeHarnessConfigs,
  parseHarnessConfig,
  trustGrantSnapshot,
  wantsElevatedPermissions,
  type HarnessConfig
} from '../src/shared/harness'
import {
  HARNESS_DOC_PATH,
  SCHEMA_JSON_PATH,
  renderSchemaJson,
  spliceHarnessDoc
} from '../scripts/gen-harness-schema'

const parse = (raw: unknown): { config: HarnessConfig; warnings: string[] } => {
  const warnings: string[] = []
  return { config: parseHarnessConfig(raw, warnings), warnings }
}

describe('parseHarnessConfig — the lenient-parsing contract', () => {
  it('accepts an empty object', () => {
    const { config, warnings } = parse({})
    expect(config).toEqual({ ...EMPTY_CONFIG, name: undefined, description: undefined })
    expect(warnings).toEqual([])
  })

  it('ignores unknown fields everywhere (forward compatibility)', () => {
    const { config, warnings } = parse({
      name: 'X',
      futureThing: { nested: true },
      fileTypes: [{ id: 'a', match: '*.md', someFutureOption: 42 }],
      permissions: { edits: 'ask', futureGrant: 'yes' }
    })
    expect(config.name).toBe('X')
    expect(config.fileTypes).toHaveLength(1)
    expect(warnings).toEqual([])
  })

  it('drops malformed entries with a warning instead of failing the manifest', () => {
    const { config, warnings } = parse({
      fileTypes: [{ match: '*.md' }, { id: 'ok', match: '*.ok.md' }],
      actions: [{ label: 'No skill or prompt' }],
      panels: [{ title: 'No source' }]
    })
    expect(config.fileTypes.map((t) => t.id)).toEqual(['ok'])
    expect(config.actions).toEqual([])
    expect(config.panels).toEqual([])
    expect(warnings.length).toBeGreaterThanOrEqual(3)
  })

  it('rejects non-object roots with a warning and defaults', () => {
    expect(parse('nope').config).toEqual({ ...EMPTY_CONFIG })
    expect(parse(['nope']).config).toEqual({ ...EMPTY_CONFIG })
    expect(parse('nope').warnings[0]).toMatch(/must be a JSON object/)
  })

  it('tells the author when a manifest still uses the pre-release "docTypes" key', () => {
    const { config, warnings } = parse({ docTypes: [{ id: 'a', match: '*.md' }] })
    expect(config.fileTypes).toEqual([])
    expect(warnings.some((w) => w.includes('renamed to "fileTypes"'))).toBe(true)
    // once fileTypes is present, the stale key is just an ignored unknown
    expect(
      parse({ docTypes: [], fileTypes: [{ id: 'a', match: '*.md' }] }).warnings
    ).toEqual([])
  })

  it('validates enums and drops bad values with a warning', () => {
    const { config, warnings } = parse({ permissions: { edits: 'yolo', bash: 'deny' } })
    expect(config.permissions.edits).toBeUndefined()
    expect(config.permissions.bash).toBe('deny')
    expect(warnings[0]).toMatch(/permissions\.edits/)
  })

  it('rejects unsafe doc-type globs (traversal, absolute, dotfiles)', () => {
    const { config, warnings } = parse({
      fileTypes: [
        { id: 'up', match: '../*.md' },
        { id: 'abs', match: '/etc/*.md' },
        { id: 'dot', match: '.claude/*.md' },
        { id: 'ok', match: 'chapters/*.md' }
      ]
    })
    expect(config.fileTypes.map((t) => t.id)).toEqual(['ok'])
    expect(warnings).toHaveLength(3)
  })

  it('parses the panel view kinds and defaults to markdown', () => {
    const { config, warnings } = parse({
      panels: [
        { title: 'Bible', source: 'bible.md' },
        { title: 'Site', source: 'index.html', view: 'web' },
        { title: 'Cover', source: 'art/cover.png', view: 'image' },
        { title: 'Source', source: 'src/main.py', view: 'code' },
        { title: 'Bad', source: 'x.md', view: 'hologram' }
      ]
    })
    expect(config.panels.map((p) => p.view)).toEqual(['markdown', 'web', 'image', 'code', 'markdown'])
    expect(warnings[0]).toMatch(/panels\[4\]\.view/)
  })

  it('parses commands, slugs ids from labels, and drops non-localhost previews', () => {
    const { config, warnings } = parse({
      commands: [
        { label: 'Dev Server', run: 'npx serve -l 5050 .', preview: 'http://localhost:5050' },
        { id: 'build', run: 'npm run build' },
        { label: 'Evil', run: 'x', preview: 'https://example.com' },
        { label: 'No run' }
      ]
    })
    expect(config.commands.map((c) => c.id)).toEqual(['dev-server', 'build', 'evil'])
    expect(config.commands[0].preview).toBe('http://localhost:5050')
    expect(config.commands[2].preview).toBeUndefined()
    expect(warnings.join('\n')).toMatch(/preview must be a localhost/)
    expect(warnings.join('\n')).toMatch(/needs "run"/)
  })

  it('rejects unsafe panel sources', () => {
    const { config } = parse({
      panels: [
        { title: 'Up', source: '../secrets.md' },
        { title: 'Dot', source: '.fabulist/state.json' },
        { title: 'Ok', source: 'notes/bible.md' }
      ]
    })
    expect(config.panels.map((p) => p.title)).toEqual(['Ok'])
    expect(config.panels[0].view).toBe('markdown')
  })

  it('defaults action ids from labels and surfaces to project', () => {
    const { config } = parse({ actions: [{ label: 'Punch Up Dialogue!', prompt: 'go' }] })
    expect(config.actions[0]).toMatchObject({ id: 'punch-up-dialogue', surface: 'project' })
  })

  it('lets a skill name stand in for a label', () => {
    const { config } = parse({ actions: [{ skill: 'tighten-prose' }] })
    expect(config.actions[0].label).toBe('tighten-prose')
  })

  it('caps icon length', () => {
    const { config } = parse({ fileTypes: [{ id: 'a', match: '*.md', icon: 'ABCDE' }] })
    expect(config.fileTypes[0].icon).toBe('AB')
  })

  it('warns when the manifest version is newer than the app understands', () => {
    const { warnings } = parse({ version: 99 })
    expect(warnings[0]).toMatch(/newer than this app/)
  })

  it('parses the editor-shaping file-type fields and the frontmatter field syntax', () => {
    const { config, warnings } = parse({
      fileTypes: [
        {
          id: 'scene',
          match: '*.scene.md',
          color: 'blue',
          font: 'serif',
          width: 'narrow',
          wordCount: true,
          fields: ['status: draft | revised | final', 'pov', 'bad key!']
        }
      ]
    })
    const t = config.fileTypes[0]
    expect(t).toMatchObject({ color: 'blue', font: 'serif', width: 'narrow', wordCount: true })
    expect(t.fields).toEqual([
      { key: 'status', values: ['draft', 'revised', 'final'] },
      { key: 'pov' }
    ])
    expect(warnings.join('\n')).toMatch(/bad key!/)
    // non-array fields is dropped with a warning, not fatal
    const bad = parse({ fileTypes: [{ id: 'a', match: '*.md', fields: 'status' }] })
    expect(bad.config.fileTypes[0].fields).toBeUndefined()
    expect(bad.warnings[0]).toMatch(/fields must be an array/)
  })

  it('parses the theme block, validating accents and capping the glyph', () => {
    const { config, warnings } = parse({
      theme: { accent: 'violet', glyph: '🎓✦x', docFont: 'serif' }
    })
    expect(config.theme).toEqual({ accent: 'violet', glyph: '🎓', docFont: 'serif' })
    expect(warnings).toEqual([])
  })

  it('drops unknown theme values with a warning, keeping the rest', () => {
    const { config, warnings } = parse({ theme: { accent: 'hotpink', docFont: 'mono' } })
    expect(config.theme).toEqual({ docFont: 'mono' })
    expect(warnings[0]).toMatch(/theme\.accent/)
    expect(parse({ theme: 'loud' }).warnings[0]).toMatch(/theme must be an object/)
  })
})

describe('mergeHarnessConfigs — the local overlay contract', () => {
  const base = parse({
    name: 'Shared',
    fileTypes: [{ id: 'scene', match: '*.scene.md', label: 'Scene' }],
    actions: [{ id: 'a', label: 'A', prompt: 'a' }],
    permissions: { edits: 'auto' }
  }).config

  it('replaces entries by id and appends new ones', () => {
    const local = parse({
      fileTypes: [
        { id: 'scene', match: '*.scene.md', label: 'My Scene' },
        { id: 'note', match: '*.note.md' }
      ]
    }).config
    const merged = mergeHarnessConfigs(base, local)
    expect(merged.fileTypes.find((t) => t.id === 'scene')?.label).toBe('My Scene')
    expect(merged.fileTypes).toHaveLength(2)
  })

  it('overlays theme per-field', () => {
    const themedBase = parse({ theme: { accent: 'violet', glyph: '🎓' } }).config
    const local = parse({ theme: { accent: 'teal' } }).config
    const merged = mergeHarnessConfigs(themedBase, local)
    expect(merged.theme).toEqual({ accent: 'teal', glyph: '🎓' })
  })

  it('never lets the overlay touch permissions', () => {
    const local = parse({ permissions: { edits: 'ask', bash: 'deny' } }).config
    const merged = mergeHarnessConfigs(base, local)
    expect(merged.permissions).toEqual(base.permissions)
  })
})

describe('trust', () => {
  it('snapshot covers exactly the trust-marked fields, defaults filled', () => {
    expect(trustGrantSnapshot(parse({}).config)).toEqual({ edits: 'ask', mcp: 'none' })
    expect(trustGrantSnapshot(parse({ permissions: { edits: 'auto' } }).config)).toEqual({
      edits: 'auto',
      mcp: 'none'
    })
    expect(trustGrantSnapshot(parse({ permissions: { mcp: 'allow' } }).config)).toEqual({
      edits: 'ask',
      mcp: 'allow'
    })
  })

  it('elevation means any trust field off its default', () => {
    expect(wantsElevatedPermissions(parse({}).config)).toBe(false)
    expect(wantsElevatedPermissions(parse({ permissions: { bash: 'deny' } }).config)).toBe(false)
    expect(wantsElevatedPermissions(parse({ permissions: { edits: 'auto' } }).config)).toBe(true)
    // connecting project MCP servers is a grant in both modes
    expect(wantsElevatedPermissions(parse({ permissions: { mcp: 'ask' } }).config)).toBe(true)
    expect(wantsElevatedPermissions(parse({ permissions: { mcp: 'allow' } }).config)).toBe(true)
  })
})

describe('globMatch', () => {
  it('* and ? stay within one path segment', () => {
    expect(globMatch('*.scene.md', 'cold-open.scene.md')).toBe(true)
    expect(globMatch('*.scene.md', 'chapters/cold-open.scene.md')).toBe(false)
    expect(globMatch('ch-?.md', 'ch-1.md')).toBe(true)
    expect(globMatch('ch-?.md', 'ch-12.md')).toBe(false)
  })

  it('matches within named folders', () => {
    expect(globMatch('chapters/*.md', 'chapters/ch-1.md')).toBe(true)
    expect(globMatch('chapters/*.md', 'notes/ch-1.md')).toBe(false)
    expect(globMatch('chapters/*.md', 'chapters/deep/ch-1.md')).toBe(false)
  })

  it('** spans folders, including zero of them', () => {
    expect(globMatch('**/*.md', 'top.md')).toBe(true)
    expect(globMatch('**/*.md', 'a/b/c.md')).toBe(true)
    expect(globMatch('chapters/**', 'chapters/a.md')).toBe(true)
    expect(globMatch('chapters/**', 'chapters/deep/a.md')).toBe(true)
    expect(globMatch('chapters/**', 'notes/a.md')).toBe(false)
    expect(globMatch('a/**/b.md', 'a/b.md')).toBe(true)
    expect(globMatch('a/**/b.md', 'a/x/y/b.md')).toBe(true)
  })

  it('is case-insensitive and escapes regex characters', () => {
    expect(globMatch('*.Scene.MD', 'x.scene.md')).toBe(true)
    expect(globMatch('a+b.md', 'a+b.md')).toBe(true)
    expect(globMatch('a+b.md', 'aab.md')).toBe(false)
  })
})

describe('fileNameForType', () => {
  it('substitutes the slug into a single-star glob, folders included', () => {
    const t = { id: 's', match: 'chapters/*.scene.md' }
    expect(fileNameForType(t, 'cold-open')).toBe('chapters/cold-open.scene.md')
  })

  it('falls back to slug.md for fancy globs', () => {
    expect(fileNameForType({ id: 'x', match: '**/*.md' }, 'a')).toBe('a.md')
    expect(fileNameForType({ id: 'x', match: 'ch-?.md' }, 'a')).toBe('a.md')
  })
})

describe('generated schema artifacts stay in sync (npm run gen:schema)', () => {
  it('docs/fabulist.schema.json matches the descriptors', () => {
    expect(readFileSync(SCHEMA_JSON_PATH, 'utf8')).toBe(renderSchemaJson())
  })

  it('docs/harness.md schema section matches the descriptors', () => {
    const current = readFileSync(HARNESS_DOC_PATH, 'utf8')
    expect(current).toBe(spliceHarnessDoc(current))
  })
})
