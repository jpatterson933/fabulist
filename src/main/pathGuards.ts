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

export function resolveInside(root: string, value: string): { absolute: string; relative: string } {
  const absolute = path.resolve(root, value)
  const relative = path.relative(root, absolute)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes root: ${value}`)
  }
  return { absolute, relative }
}
