import manifest from 'material-icon-theme/dist/material-icons.json'

/**
 * IDE-style file icons from the Material Icon Theme (the VS Code standard set).
 * The manifest maps file names and (multi-part) extensions to icon names; every
 * SVG ships in the package, so the glob below turns them into bundled asset URLs.
 * Studio harness `kindIcon` glyphs still take precedence over these in the UI.
 */
const globbed = import.meta.glob('@file-icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

// key by icon name ("typescript" from ".../typescript.svg") — glob keys vary by resolver
const urls: Record<string, string> = {}
for (const [path, assetUrl] of Object.entries(globbed)) {
  urls[(path.split('/').pop() ?? '').replace(/\.svg$/, '')] = assetUrl
}

type NameMap = Record<string, string> | undefined

const icons = manifest as {
  fileExtensions: Record<string, string>
  fileNames: Record<string, string>
  folderNames: Record<string, string>
  folderNamesExpanded: Record<string, string>
  light?: { fileExtensions?: NameMap; fileNames?: NameMap }
  file: string
  folder: string
  folderExpanded: string
}

function url(name: string | undefined): string | null {
  if (!name) return null
  return urls[name] ?? null
}

/** The app runs on a light surface; prefer the theme's light variant when one exists. */
const lookup = (maps: NameMap[], key: string): string | null => {
  for (const m of maps) {
    const hit = m?.[key]
    if (hit) return hit
  }
  return null
}

const FALLBACK_FILE = url(icons.file) ?? ''

export function fileIconUrl(file: string): string {
  const base = (file.split('/').pop() ?? file).toLowerCase()
  const byName = lookup([icons.light?.fileNames, icons.fileNames], base)
  if (byName) {
    const u = url(byName)
    if (u) return u
  }
  // longest compound extension wins: "app.test.ts" tries "test.ts" before "ts"
  const segs = base.split('.').slice(1)
  for (let i = 0; i < segs.length; i++) {
    const ext = segs.slice(i).join('.')
    const name = lookup([icons.light?.fileExtensions, icons.fileExtensions], ext)
    const u = url(name ?? undefined)
    if (u) return u
  }
  return FALLBACK_FILE
}

export function folderIconUrl(name: string, open: boolean): string {
  const key = name.toLowerCase()
  const mapped = open ? icons.folderNamesExpanded[key] : icons.folderNames[key]
  const fallback = open ? icons.folderExpanded : icons.folder
  return url(mapped) ?? url(fallback) ?? ''
}
