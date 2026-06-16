import path from 'node:path'

export function validateDocId(id: string): string {
  if (!id || id.startsWith('.') || id.includes('/') || id.includes('\\') || id.includes('\0')) {
    throw new Error(`Invalid document id: ${id}`)
  }
  return id
}

export function validateSkillSlug(slug: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Invalid skill slug: ${slug}`)
  }
  return slug
}

/**
 * The path of `value` relative to `root` if it resolves *inside* `root`, else null.
 * `root` itself counts as outside (a tool targeting the root, not a file under it).
 * The non-throwing half of `resolveInside` — used to test membership across several
 * candidate roots without try/catch noise.
 */
export function relativeIfInside(root: string, value: string): string | null {
  const relative = path.relative(root, path.resolve(root, value))
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return relative
}

export function resolveInside(root: string, value: string): { absolute: string; relative: string } {
  const relative = relativeIfInside(root, value)
  if (relative === null) throw new Error(`Path escapes root: ${value}`)
  return { absolute: path.resolve(root, value), relative }
}
