// The studio harness: the shape of `fabulist.json`, the checked-in manifest
// that turns a plain Claude Code project folder into a custom studio. The
// manifest only declares what Claude Code itself doesn't already know —
// file types, UI actions, panels, and a permission profile. Skills, agents,
// hooks, and CLAUDE.md live in their native Claude Code locations; Fabulist
// discovers and renders them.
//
// THE SCHEMA IS SELF-DEFINING. Every field is a row in the descriptor tables
// below, and everything else derives from them: the lenient parser and its
// warnings, the schema reference embedded in the workshop agent's prompt
// (schemaMarkdown), the JSON Schema published for editor autocomplete
// (jsonSchema), the generated section of docs/harness.md, and the trust hash
// (fields marked `trust: true`). To add a manifest option, add a row — the
// agent, the files, validation, and the trust model pick it up from there.
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
  kind: 'string' | 'enum' | 'boolean'
  values?: readonly string[]
  required?: boolean
  /** one-line description; feeds the workshop prompt, files, and JSON Schema */
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

export type ActionSurface = 'selection' | 'file' | 'project'
export type PanelViewKind = 'markdown' | 'code' | 'image' | 'web'

/**
 * The named accent palette: every accent is one oklch hue angle; the renderer
 * derives the full accent ramp (button, wash, selection…) from it, so a themed
 * studio re-tints coherently instead of skinning arbitrarily. Also the palette
 * for per-file-type colors.
 */
export const ACCENT_HUES = {
  orange: 42,
  crimson: 20,
  magenta: 345,
  violet: 295,
  blue: 255,
  cyan: 215,
  teal: 175,
  green: 150,
  amber: 80
} as const
export type AccentName = keyof typeof ACCENT_HUES
export const ACCENT_NAMES = Object.keys(ACCENT_HUES) as AccentName[]

/** Document typeface choices; the chrome always keeps the app faces. */
export const DOC_FONTS = ['sans', 'serif', 'mono'] as const
export type DocFontName = (typeof DOC_FONTS)[number]

export interface ThemeDef {
  accent?: AccentName
  glyph?: string
  docFont?: DocFontName
}

export interface FileTypeDef {
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

export interface CommandDef {
  id: string
  label: string
  run: string
  preview?: string
}

export interface PermissionsDef {
  edits?: 'ask' | 'auto'
  bash?: 'ask' | 'deny'
  mcp?: 'none' | 'ask' | 'allow'
}

export const FILE_TYPES_BLOCK: ListBlockSpec<FileTypeDef> = {
  key: 'fileTypes',
  doc: 'Typed kinds of files this studio works with, matched by filename glob. A matching file gets the icon and label in the rail, its title derived per titleFrom, and a card in the New File dialog (the filename follows the glob, the template seeds the content). Any file kind can be typed (.md, .html, .json, .py, …) — every textual file and image is already a work file; a file type adds meaning on top.',
  fields: [
    { key: 'id', kind: 'string', required: true, doc: 'stable identifier', example: '"lesson"' },
    {
      key: 'match',
      kind: 'string',
      required: true,
      doc: 'project-relative filename glob; * and ? stay within one path segment, ** spans folders',
      example: '"lessons/*.lesson.md"'
    },
    { key: 'label', kind: 'string', doc: 'display label; defaults to the id', example: '"Lesson"' },
    { key: 'icon', kind: 'string', maxLen: 2, doc: '1–2 characters/emoji shown in the file rail', example: '"🎓"' },
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
      doc: 'seed content for new files of this type; {{title}} is substituted',
      example: '"---\\ntitle: {{title}}\\n---\\n\\n"'
    }
  ],
  finalize: (e, warn) => {
    if (!e.id || !e.match) return null
    if (!isSafeGlob(e.match)) {
      warn(`fileType "${e.id}": match "${e.match}" must be a safe project-relative glob; skipped`)
      return null
    }
    let titleFrom = e.titleFrom
    if (titleFrom && titleFrom !== 'h1' && titleFrom !== 'filename' && !titleFrom.startsWith('frontmatter:')) {
      warn(`fileType "${e.id}": unknown titleFrom "${titleFrom}"; using h1`)
      titleFrom = undefined
    }
    return { id: e.id, match: e.match, label: e.label, icon: e.icon, titleFrom, template: e.template }
  }
}

export const ACTIONS_BLOCK: ListBlockSpec<ActionDef> = {
  key: 'actions',
  doc: 'Commands surfaced in the ⌘K palette (and, for surface "selection", in the highlight toolbar). An action runs a .claude/skills skill, sends a canned prompt, or both.',
  fields: [
    { key: 'id', kind: 'string', doc: 'stable identifier; defaults to a slug of the label', example: '"simplify"' },
    { key: 'label', kind: 'string', doc: 'palette label (required unless a skill names it)', example: '"Simplify this"' },
    {
      key: 'surface',
      kind: 'enum',
      values: ['selection', 'file', 'project'],
      doc: 'what the action operates on; "selection" needs highlighted text',
      example: '"selection"'
    },
    { key: 'skill', kind: 'string', doc: 'a .claude/skills name to invoke', example: '"simplify-explanation"' },
    {
      key: 'prompt',
      kind: 'string',
      raw: true,
      doc: 'instructions sent to the project agent (alongside or instead of the skill)',
      example: '"Rewrite this to be clearer without losing precision."'
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
    { key: 'id', kind: 'string', doc: 'stable identifier; defaults to a slug of the title', example: '"outline"' },
    { key: 'title', kind: 'string', required: true, doc: 'tab and rail label', example: '"Course Outline"' },
    {
      key: 'source',
      kind: 'string',
      required: true,
      doc: 'project-relative file the panel renders',
      example: '"outline.md"'
    },
    {
      key: 'view',
      kind: 'enum',
      values: ['markdown', 'code', 'image', 'web'],
      doc: 'how the source is rendered: "markdown" (default) renders prose, "code" shows syntax-highlighted source, "image" displays a picture file, "web" embeds the file as a live page (relative assets and scripts work)',
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

/** Preview URLs must stay on this machine — the frame embeds them live. */
export function isLocalPreviewUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)
}

export const COMMANDS_BLOCK: ListBlockSpec<CommandDef> = {
  key: 'commands',
  doc: 'Shell commands the studio can run at the project root (dev server, build, tests…), started only by the user from the rail — never by the agent — with the exact command line always shown. Output streams into a log tab; a long-running command keeps a ● running indicator until stopped.',
  fields: [
    { key: 'id', kind: 'string', doc: 'stable identifier; defaults to a slug of the label', example: '"dev"' },
    { key: 'label', kind: 'string', doc: 'rail label (required unless id is given)', example: '"Dev server"' },
    {
      key: 'run',
      kind: 'string',
      required: true,
      raw: true,
      doc: 'the shell command line, run at the project root',
      example: '"npx serve -l 5050 ."'
    },
    {
      key: 'preview',
      kind: 'string',
      doc: 'a localhost URL embedded as a live preview beside the log while the command runs',
      example: '"http://localhost:5050"'
    }
  ],
  finalize: (e, warn) => {
    const label = e.label ?? e.id
    if (!label || !e.run?.trim()) {
      warn(`a command needs a "label" (or "id") plus a "run" command line; skipped`)
      return null
    }
    let preview = e.preview
    if (preview && !isLocalPreviewUrl(preview)) {
      warn(`command "${label}": preview must be a localhost / 127.0.0.1 URL; ignored`)
      preview = undefined
    }
    return { id: e.id ?? slugId(label), label, run: e.run, preview }
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

/** A single-object block (theme, layout) — same field machinery as lists. */
export interface ObjectBlockSpec {
  key: string
  doc: string
  fields: FieldSpec[]
}

export const THEME_BLOCK: ObjectBlockSpec = {
  key: 'theme',
  doc: 'How the studio looks. Parameterized, not raw CSS: an accent re-tints the whole UI coherently (buttons, focus rings, highlights), so every studio stays recognizably Fabulist. Looks only — never trust-gated, and fabulist.local.json may override it.',
  fields: [
    {
      key: 'accent',
      kind: 'enum',
      values: ACCENT_NAMES,
      doc: 'named accent color the UI derives its whole accent ramp from',
      example: '"violet"'
    },
    {
      key: 'glyph',
      kind: 'string',
      maxLen: 2,
      doc: "1–2 characters/emoji shown as the studio's mark in the rail and project list",
      example: '"🎓"'
    },
    {
      key: 'docFont',
      kind: 'enum',
      values: DOC_FONTS,
      doc: 'default document typeface for prose files; the app chrome keeps its own faces',
      example: '"serif"'
    }
  ]
}

export const TOP_LEVEL_FIELDS: FieldSpec[] = [
  { key: 'name', kind: 'string', doc: 'studio name, shown in the rail and project list', example: '"Course Studio"' },
  { key: 'description', kind: 'string', doc: 'one line about the studio', example: '"A video course: lessons, scripts, and slides"' },
  { key: 'version', kind: 'string', doc: `manifest schema version; currently ${HARNESS_VERSION}`, example: `${HARNESS_VERSION}` },
  {
    key: 'template',
    kind: 'boolean',
    doc: 'mark this project as a studio template: opening it offers "new project from this studio" instead of editing it in place',
    example: 'true'
  }
]

export const LIST_BLOCKS = [FILE_TYPES_BLOCK, ACTIONS_BLOCK, PANELS_BLOCK, COMMANDS_BLOCK] as const
export const OBJECT_BLOCKS: ObjectBlockSpec[] = [THEME_BLOCK]

// --- parsed shape ---

export interface HarnessConfig {
  name?: string
  description?: string
  /** this project is a studio template, meant to be instantiated rather than edited */
  template?: boolean
  theme: ThemeDef
  fileTypes: FileTypeDef[]
  actions: ActionDef[]
  panels: PanelDef[]
  commands: CommandDef[]
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
  theme: {},
  fileTypes: [],
  actions: [],
  panels: [],
  commands: [],
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
  if (spec.kind === 'boolean') {
    if (typeof value === 'boolean') return String(value)
    if (value === 'true' || value === 'false') return value
    warn(`${at}.${spec.key} must be true or false`)
    return undefined
  }
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
  // pre-release manifests used "docTypes"; tell the author rather than silently ignoring it
  if (obj.docTypes !== undefined && obj.fileTypes === undefined) {
    warnings.push('"docTypes" was renamed to "fileTypes"; rename the block in fabulist.json')
  }

  /** Parse a single-object block's fields into a plain record. */
  const parseObjectBlock = (block: ObjectBlockSpec): Record<string, string | undefined> => {
    const out: Record<string, string | undefined> = {}
    const raw = obj[block.key]
    if (raw === undefined) return out
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      warnings.push(`${block.key} must be an object`)
      return out
    }
    for (const f of block.fields) {
      const v = parseField(f, (raw as Record<string, unknown>)[f.key], (m) => warnings.push(m), block.key)
      // only set present keys, so spreading an overlay never clobbers with undefined
      if (v !== undefined) out[f.key] = v
    }
    return out
  }

  const theme = parseObjectBlock(THEME_BLOCK) as ThemeDef

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
    template: top.template === 'true' ? true : undefined,
    theme,
    fileTypes: parseListBlock(FILE_TYPES_BLOCK, obj.fileTypes, warnings),
    actions: parseListBlock(ACTIONS_BLOCK, obj.actions, warnings),
    panels: parseListBlock(PANELS_BLOCK, obj.panels, warnings),
    commands: parseListBlock(COMMANDS_BLOCK, obj.commands, warnings),
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
    template: base.template,
    theme: { ...base.theme, ...local.theme },
    fileTypes: mergeList(base.fileTypes, local.fileTypes),
    actions: mergeList(base.actions, local.actions),
    panels: mergeList(base.panels, local.panels),
    commands: mergeList(base.commands, local.commands),
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
export function fileTypeFor(config: HarnessConfig, file: string): FileTypeDef | null {
  return config.fileTypes.find((t) => globMatch(t.match, file)) ?? null
}

/**
 * Derive a filename for a new doc of a type from its glob: the single `*` is
 * replaced with the slug ("chapters/*.scene.md" + "Cold Open" →
 * "chapters/cold-open.scene.md"). Anything fancier falls back to `<slug>.md`.
 */
export function fileNameForType(type: FileTypeDef, slug: string): string {
  const stars = type.match.split('*')
  if (stars.length === 2 && !type.match.includes('?')) {
    return `${stars[0]}${slug}${stars[1]}`
  }
  return `${slug}.md`
}

// --- generated artifacts: workshop prompt schema, files section, JSON Schema ---

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
  for (const block of OBJECT_BLOCKS) {
    lines.push('', `\`${block.key}\` — ${block.doc}`)
    for (const f of block.fields) lines.push(fieldLine(f))
  }
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
    ...(f.kind === 'enum'
      ? { enum: [...f.values!] }
      : f.kind === 'boolean'
        ? { type: 'boolean' }
        : { type: 'string' }),
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
      ...Object.fromEntries(
        OBJECT_BLOCKS.map((b) => [
          b.key,
          {
            type: 'object',
            description: b.doc,
            properties: Object.fromEntries(b.fields.map((f) => [f.key, fieldSchema(f)])),
            additionalProperties: true
          }
        ])
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
