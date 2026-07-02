// The studio harness: the shape of `fabulist.json`, the checked-in manifest
// that turns a plain Claude Code project folder into a custom studio. The
// manifest only declares what Claude Code itself doesn't already know —
// doc types, UI actions, panels, and a permission profile. Skills, agents,
// hooks, and CLAUDE.md live in their native Claude Code locations; Fabulist
// discovers and renders them.
//
// THE SCHEMA IS SELF-DEFINING. Every field is a row in the descriptor tables
// below, and everything else derives from them: the lenient parser and its
// warnings, the schema reference embedded in the workshop agent's prompt
// (schemaMarkdown), the JSON Schema published for editor autocomplete
// (jsonSchema), the generated section of docs/harness.md, and the trust hash
// (fields marked `trust: true`). To add a manifest option, add a row — the
// agent, the docs, validation, and the trust model pick it up from there.
//
// Parsing is deliberately lenient: unknown keys are ignored and malformed
// entries are dropped with a warning, so a project authored against a newer
// app version still opens.

export const HARNESS_FILE = 'fabulist.json'
export const HARNESS_LOCAL_FILE = 'fabulist.local.json'
export const HARNESS_VERSION = 1

// --- descriptor model ---

export interface FieldSpec {
  key: string
  /** enum fields validate against `values`; strings are trimmed non-empty */
  kind: 'string' | 'enum'
  values?: readonly string[]
  required?: boolean
  /** one-line description; feeds the workshop prompt, docs, and JSON Schema */
  doc: string
  /** example value rendered into the schema example (JSON literal) */
  example?: string
  /** hard cap on string length (e.g. rail icons) */
  maxLen?: number
  /** participates in the trust hash — changing it re-prompts the user */
  trust?: boolean
  /** allow multi-line/untrimmed strings (templates) */
  raw?: boolean
}

interface ListBlockSpec<T> {
  key: string
  doc: string
  fields: FieldSpec[]
  /** shape-level validation + defaults after field parsing; null drops the entry */
  finalize: (entry: Record<string, string | undefined>, warn: (msg: string) => void) => T | null
}

// --- shared validation helpers ---

export function slugId(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** A safe project-relative path: no traversal, no absolute, no dot segments. */
export function isSafeRelPath(p: string): boolean {
  if (!p || p.startsWith('/') || p.includes('\\')) return false
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..' && !seg.startsWith('.'))
}

/** Globs are safe rel-paths where `*`, `?`, and `**` segments are allowed. */
function isSafeGlob(p: string): boolean {
  if (!p || p.startsWith('/') || p.includes('\\')) return false
  return p
    .split('/')
    .every((seg) => seg !== '' && seg !== '.' && seg !== '..' && (seg === '**' || !seg.startsWith('.')))
}

// --- the schema, as data ---

export type ActionSurface = 'selection' | 'doc' | 'project'
export type PanelViewKind = 'markdown'

export interface DocTypeDef {
  id: string
  match: string
  label?: string
  icon?: string
  titleFrom?: string
  template?: string
}

export interface ActionDef {
  id: string
  label: string
  surface: ActionSurface
  skill?: string
  prompt?: string
}

export interface PanelDef {
  id: string
  title: string
  source: string
  view: PanelViewKind
}

export interface PermissionsDef {
  edits?: 'ask' | 'auto'
  bash?: 'ask' | 'deny'
  mcp?: 'none' | 'ask' | 'allow'
}

export const DOC_TYPES_BLOCK: ListBlockSpec<DocTypeDef> = {
  key: 'docTypes',
  doc: 'Kinds of documents this studio works with, matched by filename glob. A matching doc gets the icon and label in the rail, its title derived per titleFrom, and a card in the New Document dialog (the filename follows the glob, the template seeds the content).',
  fields: [
    { key: 'id', kind: 'string', required: true, doc: 'stable identifier', example: '"scene"' },
    {
      key: 'match',
      kind: 'string',
      required: true,
      doc: 'project-relative filename glob; * and ? stay within one path segment, ** spans folders',
      example: '"chapters/*.scene.md"'
    },
    { key: 'label', kind: 'string', doc: 'display label; defaults to the id', example: '"Scene"' },
    { key: 'icon', kind: 'string', maxLen: 2, doc: '1–2 characters/emoji shown in the document rail', example: '"🎬"' },
    {
      key: 'titleFrom',
      kind: 'string',
      doc: '"h1" (default), "filename", or "frontmatter:<key>"',
      example: '"frontmatter:title"'
    },
    {
      key: 'template',
      kind: 'string',
      raw: true,
      doc: 'seed content for new docs of this type; {{title}} is substituted',
      example: '"---\\ntitle: {{title}}\\n---\\n\\n"'
    }
  ],
  finalize: (e, warn) => {
    if (!e.id || !e.match) return null
    if (!isSafeGlob(e.match)) {
      warn(`docType "${e.id}": match "${e.match}" must be a safe project-relative glob; skipped`)
      return null
    }
    let titleFrom = e.titleFrom
    if (titleFrom && titleFrom !== 'h1' && titleFrom !== 'filename' && !titleFrom.startsWith('frontmatter:')) {
      warn(`docType "${e.id}": unknown titleFrom "${titleFrom}"; using h1`)
      titleFrom = undefined
    }
    return { id: e.id, match: e.match, label: e.label, icon: e.icon, titleFrom, template: e.template }
  }
}

export const ACTIONS_BLOCK: ListBlockSpec<ActionDef> = {
  key: 'actions',
  doc: 'Commands surfaced in the ⌘K palette (and, for surface "selection", in the highlight toolbar). An action runs a .claude/skills skill, sends a canned prompt, or both.',
  fields: [
    { key: 'id', kind: 'string', doc: 'stable identifier; defaults to a slug of the label', example: '"punch-up"' },
    { key: 'label', kind: 'string', doc: 'palette label (required unless a skill names it)', example: '"Punch up dialogue"' },
    {
      key: 'surface',
      kind: 'enum',
      values: ['selection', 'doc', 'project'],
      doc: 'what the action operates on; "selection" needs highlighted text',
      example: '"selection"'
    },
    { key: 'skill', kind: 'string', doc: 'a .claude/skills name to invoke', example: '"punch-up-dialogue"' },
    {
      key: 'prompt',
      kind: 'string',
      raw: true,
      doc: 'instructions sent to the writing agent (alongside or instead of the skill)',
      example: '"Sharpen this dialogue without changing what is said."'
    }
  ],
  finalize: (e, warn) => {
    const label = e.label ?? e.skill
    if (!label || (!e.skill && !e.prompt)) {
      warn(`an action needs a "label" plus a "skill" or "prompt"; skipped`)
      return null
    }
    return {
      id: e.id ?? slugId(label),
      label,
      surface: (e.surface as ActionSurface) ?? 'project',
      skill: e.skill,
      prompt: e.prompt
    }
  }
}

export const PANELS_BLOCK: ListBlockSpec<PanelDef> = {
  key: 'panels',
  doc: 'Read-only rendered views over project files, opened as ▦ tabs from the rail or palette.',
  fields: [
    { key: 'id', kind: 'string', doc: 'stable identifier; defaults to a slug of the title', example: '"bible"' },
    { key: 'title', kind: 'string', required: true, doc: 'tab and rail label', example: '"Story Bible"' },
    {
      key: 'source',
      kind: 'string',
      required: true,
      doc: 'project-relative markdown file to render',
      example: '"bible.md"'
    },
    {
      key: 'view',
      kind: 'enum',
      values: ['markdown'],
      doc: 'how the source is rendered; only "markdown" today',
      example: '"markdown"'
    }
  ],
  finalize: (e, warn) => {
    if (!e.title || !e.source) return null
    if (!isSafeRelPath(e.source)) {
      warn(`panel "${e.title}": source must be a safe project-relative path; skipped`)
      return null
    }
    return {
      id: e.id ?? slugId(e.title),
      title: e.title,
      source: e.source,
      view: (e.view as PanelViewKind) ?? 'markdown'
    }
  }
}

/** permissions is a single object, not a list; same field machinery. */
export const PERMISSION_FIELDS: FieldSpec[] = [
  {
    key: 'edits',
    kind: 'enum',
    values: ['ask', 'auto'],
    trust: true,
    doc: '"auto" applies the agent\'s file edits without per-edit approval; only takes effect after the user explicitly trusts the studio in the app',
    example: '"ask"'
  },
  {
    key: 'bash',
    kind: 'enum',
    values: ['ask', 'deny'],
    doc: '"deny" removes the shell tool from the agent entirely (tightening never needs trust)',
    example: '"ask"'
  },
  {
    key: 'mcp',
    kind: 'enum',
    values: ['none', 'ask', 'allow'],
    trust: true,
    doc: 'project MCP servers (.mcp.json + .claude/settings.json enablement): "none" (default) ignores them, "ask" connects them with per-tool approval, "allow" connects and auto-approves their tools; anything but "none" requires the user to trust the studio',
    example: '"ask"'
  }
]

export const TOP_LEVEL_FIELDS: FieldSpec[] = [
  { key: 'name', kind: 'string', doc: 'studio name, shown in the rail and project list', example: '"Novel Studio"' },
  { key: 'description', kind: 'string', doc: 'one line about the studio', example: '"Long-form fiction with continuity checking"' },
  { key: 'version', kind: 'string', doc: `manifest schema version; currently ${HARNESS_VERSION}`, example: `${HARNESS_VERSION}` }
]

export const LIST_BLOCKS = [DOC_TYPES_BLOCK, ACTIONS_BLOCK, PANELS_BLOCK] as const

// --- parsed shape ---

export interface HarnessConfig {
  name?: string
  description?: string
  docTypes: DocTypeDef[]
  actions: ActionDef[]
  panels: PanelDef[]
  permissions: PermissionsDef
}

/** A skill discovered under .claude/skills/<name>/SKILL.md */
export interface SkillInfo {
  name: string
  description: string
}

/** The resolved harness handed to the renderer for one project. */
export interface Harness {
  /** true when a fabulist.json exists (possibly invalid) */
  configPresent: boolean
  config: HarnessConfig
  skills: SkillInfo[]
  /** user has accepted this studio's permission profile */
  trusted: boolean
  /** lenient-parse notes, surfaced in the studio UI */
  warnings: string[]
}

export const EMPTY_CONFIG: HarnessConfig = {
  docTypes: [],
  actions: [],
  panels: [],
  permissions: {}
}

export const EMPTY_HARNESS: Harness = {
  configPresent: false,
  config: EMPTY_CONFIG,
  skills: [],
  trusted: false,
  warnings: []
}

// --- descriptor-driven parsing ---

function parseField(spec: FieldSpec, value: unknown, warn: (msg: string) => void, at: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    // tolerate numbers for fields like version
    if (typeof value === 'number') return String(value)
    warn(`${at}.${spec.key} must be a string`)
    return undefined
  }
  const v = spec.raw ? value : value.trim()
  if (!v) return undefined
  if (spec.kind === 'enum' && !spec.values?.includes(v)) {
    warn(`${at}.${spec.key} must be one of ${spec.values?.map((x) => `"${x}"`).join(', ')}`)
    return undefined
  }
  return spec.maxLen ? v.slice(0, spec.maxLen) : v
}

function parseListBlock<T>(
  block: ListBlockSpec<T>,
  raw: unknown,
  warnings: string[]
): T[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push(`${block.key} must be an array`)
    return []
  }
  const out: T[] = []
  for (const [i, item] of (raw as unknown[]).entries()) {
    const at = `${block.key}[${i}]`
    if (typeof item !== 'object' || item === null) {
      warnings.push(`${at} must be an object; skipped`)
      continue
    }
    const obj = item as Record<string, unknown>
    const entry: Record<string, string | undefined> = {}
    let missing = false
    for (const f of block.fields) {
      entry[f.key] = parseField(f, obj[f.key], (m) => warnings.push(m), at)
      if (f.required && entry[f.key] === undefined) {
        warnings.push(`${at} needs "${f.key}"; skipped`)
        missing = true
      }
    }
    if (missing) continue
    const finalized = block.finalize(entry, (m) => warnings.push(m))
    if (finalized !== null) out.push(finalized)
  }
  return out
}

/**
 * Parse raw JSON into a HarnessConfig, dropping malformed entries and
 * collecting human-readable warnings. Never throws on shape problems.
 */
export function parseHarnessConfig(raw: unknown, warnings: string[]): HarnessConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warnings.push('fabulist.json must be a JSON object; using defaults')
    return { ...EMPTY_CONFIG }
  }
  const obj = raw as Record<string, unknown>

  const top: Record<string, string | undefined> = {}
  for (const f of TOP_LEVEL_FIELDS) {
    top[f.key] = parseField(f, obj[f.key], (m) => warnings.push(m), 'fabulist.json')
  }
  if (top.version && Number(top.version) > HARNESS_VERSION) {
    warnings.push(`manifest version ${top.version} is newer than this app understands (${HARNESS_VERSION}); unknown options are ignored`)
  }

  const permissions: PermissionsDef = {}
  if (obj.permissions !== undefined) {
    if (typeof obj.permissions !== 'object' || obj.permissions === null) {
      warnings.push('permissions must be an object')
    } else {
      const p = obj.permissions as Record<string, unknown>
      for (const f of PERMISSION_FIELDS) {
        const v = parseField(f, p[f.key], (m) => warnings.push(m), 'permissions')
        if (v !== undefined) (permissions as Record<string, string>)[f.key] = v
      }
    }
  }

  return {
    name: top.name,
    description: top.description,
    docTypes: parseListBlock(DOC_TYPES_BLOCK, obj.docTypes, warnings),
    actions: parseListBlock(ACTIONS_BLOCK, obj.actions, warnings),
    panels: parseListBlock(PANELS_BLOCK, obj.panels, warnings),
    permissions
  }
}

/**
 * Overlay a personal fabulist.local.json onto the shared config. Scalars are
 * replaced; list entries with a matching id replace their shared counterpart,
 * others are appended. The overlay can never touch permissions — that block
 * is trust-gated to the shared, checked-in manifest.
 */
export function mergeHarnessConfigs(base: HarnessConfig, local: HarnessConfig): HarnessConfig {
  const mergeList = <T extends { id: string }>(a: T[], b: T[]): T[] => [
    ...a.filter((x) => !b.some((y) => y.id === x.id)),
    ...b
  ]
  return {
    name: local.name ?? base.name,
    description: local.description ?? base.description,
    docTypes: mergeList(base.docTypes, local.docTypes),
    actions: mergeList(base.actions, local.actions),
    panels: mergeList(base.panels, local.panels),
    permissions: base.permissions
  }
}

// --- trust ---

/**
 * The exact grant surface the user consents to: every permission field marked
 * `trust: true`, with defaults filled in. Hash this to key stored trust — any
 * new trust-relevant field added to the descriptor automatically re-prompts.
 */
export function trustGrantSnapshot(config: HarnessConfig): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of PERMISSION_FIELDS) {
    if (!f.trust) continue
    out[f.key] = (config.permissions as Record<string, string | undefined>)[f.key] ?? f.values![0]
  }
  return out
}

/** Does the profile ask for anything beyond the default always-ask gate? */
export function wantsElevatedPermissions(config: HarnessConfig): boolean {
  return Object.entries(trustGrantSnapshot(config)).some(([key, value]) => {
    const spec = PERMISSION_FIELDS.find((f) => f.key === key)!
    return value !== spec.values![0]
  })
}

// --- glob matching ---

const escapeRx = (s: string): string => s.replace(/[.+^${}()|[\]\\]/g, '\\$&')

/**
 * Convert a manifest glob to a regex over project-relative paths:
 * `*` and `?` stay within one path segment; a `**` segment spans any depth.
 */
export function globToRegExp(pattern: string): RegExp {
  const segs = pattern.split('/')
  let rx = '^'
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1
    if (seg === '**') {
      rx += last ? '.*' : '(?:.*/)?'
      return
    }
    rx += seg
      .split('')
      .map((ch) => (ch === '*' ? '[^/]*' : ch === '?' ? '[^/]' : escapeRx(ch)))
      .join('')
    if (!last) rx += '/'
  })
  return new RegExp(rx + '$', 'i')
}

export function globMatch(pattern: string, file: string): boolean {
  if (pattern.includes('\\')) return false
  return globToRegExp(pattern).test(file)
}

/** The first doc type whose glob matches the file path, if any. */
export function docTypeFor(config: HarnessConfig, file: string): DocTypeDef | null {
  return config.docTypes.find((t) => globMatch(t.match, file)) ?? null
}

/**
 * Derive a filename for a new doc of a type from its glob: the single `*` is
 * replaced with the slug ("chapters/*.scene.md" + "Cold Open" →
 * "chapters/cold-open.scene.md"). Anything fancier falls back to `<slug>.md`.
 */
export function fileNameForType(type: DocTypeDef, slug: string): string {
  const stars = type.match.split('*')
  if (stars.length === 2 && !type.match.includes('?')) {
    return `${stars[0]}${slug}${stars[1]}`
  }
  return `${slug}.md`
}

// --- generated artifacts: workshop prompt schema, docs section, JSON Schema ---

function fieldLine(f: FieldSpec): string {
  const req = f.required ? ' (required)' : ''
  const en = f.kind === 'enum' ? ` — one of ${f.values!.map((v) => `"${v}"`).join(' | ')}` : ''
  return `  - \`${f.key}\`${req}: ${f.doc}${en}${f.example ? ` — e.g. ${f.example}` : ''}`
}

/**
 * The manifest schema as markdown — embedded verbatim in the workshop agent's
 * system prompt and in the generated section of docs/harness.md, so neither
 * can drift from the parser.
 */
export function schemaMarkdown(): string {
  const lines: string[] = []
  lines.push('Top-level fields (all optional; unknown fields are ignored):')
  for (const f of TOP_LEVEL_FIELDS) lines.push(fieldLine(f))
  for (const block of LIST_BLOCKS) {
    lines.push('', `\`${block.key}\` — ${block.doc}`)
    for (const f of block.fields) lines.push(fieldLine(f))
  }
  lines.push('', '`permissions` — the gate profile. A manifest can always tighten the gate; loosening requires explicit user trust in the app, stored outside the repo and keyed to the trust-relevant fields, so any change re-prompts.')
  for (const f of PERMISSION_FIELDS) lines.push(fieldLine(f))
  return lines.join('\n')
}

/** JSON Schema (draft-07) for fabulist.json, for editor autocomplete. */
export function jsonSchema(): Record<string, unknown> {
  const fieldSchema = (f: FieldSpec): Record<string, unknown> => ({
    ...(f.kind === 'enum' ? { enum: [...f.values!] } : { type: 'string' }),
    description: f.doc,
    ...(f.maxLen ? { maxLength: f.maxLen } : {})
  })
  const listSchema = (block: ListBlockSpec<unknown>): Record<string, unknown> => ({
    type: 'array',
    description: block.doc,
    items: {
      type: 'object',
      properties: Object.fromEntries(block.fields.map((f) => [f.key, fieldSchema(f)])),
      required: block.fields.filter((f) => f.required).map((f) => f.key),
      additionalProperties: true
    }
  })
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Fabulist studio manifest (fabulist.json)',
    type: 'object',
    properties: {
      ...Object.fromEntries(
        TOP_LEVEL_FIELDS.map((f) => [f.key, f.key === 'version' ? { type: ['string', 'number'], description: f.doc } : fieldSchema(f)])
      ),
      ...Object.fromEntries(LIST_BLOCKS.map((b) => [b.key, listSchema(b as ListBlockSpec<unknown>)])),
      permissions: {
        type: 'object',
        description: 'Gate profile; loosening grants requires user trust in the app.',
        properties: Object.fromEntries(PERMISSION_FIELDS.map((f) => [f.key, fieldSchema(f)])),
        additionalProperties: true
      }
    },
    additionalProperties: true
  }
}
