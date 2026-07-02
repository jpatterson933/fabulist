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
      docTypes: [{ id: 'a', match: '*.md', someFutureOption: 42 }],
      permissions: { edits: 'ask', futureGrant: 'yes' }
    })
    expect(config.name).toBe('X')
    expect(config.docTypes).toHaveLength(1)
    expect(warnings).toEqual([])
  })

  it('drops malformed entries with a warning instead of failing the manifest', () => {
    const { config, warnings } = parse({
      docTypes: [{ match: '*.md' }, { id: 'ok', match: '*.ok.md' }],
      actions: [{ label: 'No skill or prompt' }],
      panels: [{ title: 'No source' }]
    })
    expect(config.docTypes.map((t) => t.id)).toEqual(['ok'])
    expect(config.actions).toEqual([])
    expect(config.panels).toEqual([])
    expect(warnings.length).toBeGreaterThanOrEqual(3)
  })

  it('rejects non-object roots with a warning and defaults', () => {
    expect(parse('nope').config).toEqual({ ...EMPTY_CONFIG })
    expect(parse(['nope']).config).toEqual({ ...EMPTY_CONFIG })
    expect(parse('nope').warnings[0]).toMatch(/must be a JSON object/)
  })

  it('validates enums and drops bad values with a warning', () => {
    const { config, warnings } = parse({ permissions: { edits: 'yolo', bash: 'deny' } })
    expect(config.permissions.edits).toBeUndefined()
    expect(config.permissions.bash).toBe('deny')
    expect(warnings[0]).toMatch(/permissions\.edits/)
  })

  it('rejects unsafe doc-type globs (traversal, absolute, dotfiles)', () => {
    const { config, warnings } = parse({
      docTypes: [
        { id: 'up', match: '../*.md' },
        { id: 'abs', match: '/etc/*.md' },
        { id: 'dot', match: '.claude/*.md' },
        { id: 'ok', match: 'chapters/*.md' }
      ]
    })
    expect(config.docTypes.map((t) => t.id)).toEqual(['ok'])
    expect(warnings).toHaveLength(3)
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
    const { config } = parse({ docTypes: [{ id: 'a', match: '*.md', icon: 'ABCDE' }] })
    expect(config.docTypes[0].icon).toBe('AB')
  })

  it('warns when the manifest version is newer than the app understands', () => {
    const { warnings } = parse({ version: 99 })
    expect(warnings[0]).toMatch(/newer than this app/)
  })
})

describe('mergeHarnessConfigs — the local overlay contract', () => {
  const base = parse({
    name: 'Shared',
    docTypes: [{ id: 'scene', match: '*.scene.md', label: 'Scene' }],
    actions: [{ id: 'a', label: 'A', prompt: 'a' }],
    permissions: { edits: 'auto' }
  }).config

  it('replaces entries by id and appends new ones', () => {
    const local = parse({
      docTypes: [
        { id: 'scene', match: '*.scene.md', label: 'My Scene' },
        { id: 'note', match: '*.note.md' }
      ]
    }).config
    const merged = mergeHarnessConfigs(base, local)
    expect(merged.docTypes.find((t) => t.id === 'scene')?.label).toBe('My Scene')
    expect(merged.docTypes).toHaveLength(2)
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
