// Studio templates: project folders that exist to be instantiated. The
// built-ins ship in resources/templates; any project whose manifest says
// "template": true offers the same instantiation from the studio banner.

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { HARNESS_FILE } from '@shared/harness'
import {
  GITIGNORE,
  LIBRARY_ROOT,
  ensureLibraryRoot,
  projectPath,
  readProject,
  setProjectTitle
} from './library'
import { initRepo, commitAll } from './git'

export interface TemplateInfo {
  id: string
  name: string
  description: string
}

function templatesRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'templates')
    : path.join(app.getAppPath(), 'resources', 'templates')
}

async function manifestMeta(dir: string): Promise<{ name?: string; description?: string }> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dir, HARNESS_FILE), 'utf8'))
    return {
      name: typeof raw.name === 'string' ? raw.name : undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined
    }
  } catch {
    return {}
  }
}

/** The built-in starter studios bundled with the app. */
export async function listTemplates(): Promise<TemplateInfo[]> {
  const root = templatesRoot()
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  const out: TemplateInfo[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const meta = await manifestMeta(path.join(root, e.name))
    out.push({ id: e.name, name: meta.name ?? e.name, description: meta.description ?? '' })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || 'untitled'
}

const exists = (p: string): Promise<boolean> =>
  fs
    .stat(p)
    .then(() => true)
    .catch(() => false)

/**
 * Instantiate a template folder as a fresh project: copy it (minus git and
 * app state), drop the "template" flag from the manifest, init a repo, and
 * name the project. Returns the new project id.
 */
async function instantiate(src: string, title: string): Promise<string> {
  await ensureLibraryRoot()
  const clean = title.trim() || 'Untitled'
  let id = slugify(clean)
  let n = 1
  while (await exists(projectPath(id))) id = `${slugify(clean)}-${++n}`
  const dest = projectPath(id)

  await fs.cp(src, dest, {
    recursive: true,
    filter: (from) => {
      const rel = path.relative(src, from)
      const top = rel.split(path.sep)[0]
      return top !== '.git' && top !== '.fabulist' && top !== 'node_modules'
    }
  })

  // the copy is a project now, not a template
  try {
    const manifestPath = path.join(dest, HARNESS_FILE)
    const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    delete raw.template
    delete raw.$schema
    await fs.writeFile(manifestPath, JSON.stringify(raw, null, 2) + '\n')
  } catch {
    /* no manifest, or unreadable — fine, it's just a folder copy */
  }

  const gi = path.join(dest, '.gitignore')
  if (!(await exists(gi))) await fs.writeFile(gi, GITIGNORE)

  await readProject(id) // initialize project.json
  await setProjectTitle(id, clean)
  await initRepo(dest)
  await commitAll(dest, `Created "${clean}"`)
  return id
}

/** New project from a built-in template id. */
export async function createFromTemplate(templateId: string, title: string): Promise<string> {
  if (!/^[a-z0-9-]+$/.test(templateId)) throw new Error(`Invalid template id: ${templateId}`)
  const src = path.join(templatesRoot(), templateId)
  if (!(await exists(path.join(src, HARNESS_FILE)))) throw new Error(`Unknown template: ${templateId}`)
  return instantiate(src, title)
}

/** New project from an open project that declares itself a template. */
export async function createFromProject(projectId: string, title: string): Promise<string> {
  const src = await fs.realpath(projectPath(projectId))
  if (src.startsWith(path.join(LIBRARY_ROOT, path.sep)) && !(await exists(src))) {
    throw new Error('Template project not found')
  }
  return instantiate(src, title)
}
