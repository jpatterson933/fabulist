// Loads a project's studio harness: fabulist.json (+ fabulist.local.json
// overlay), the skills discovered under .claude/skills/, and the trust
// decision for its permission profile.
//
// Trust lives OUTSIDE the project, in Electron userData, keyed by the
// project's real path and a hash of the shared manifest's permissions block.
// A cloned repo therefore can't grant itself auto-approval, and any change to
// the permissions block (by a collaborator or by the agent itself) drops back
// to untrusted until the user re-accepts.

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  EMPTY_CONFIG,
  HARNESS_FILE,
  HARNESS_LOCAL_FILE,
  mergeHarnessConfigs,
  parseHarnessConfig,
  trustGrantSnapshot,
  wantsElevatedPermissions,
  type Harness,
  type HarnessConfig,
  type SkillInfo
} from '@shared/harness'
import { projectPath } from './library'

// --- trust store ---

function trustFile(): string {
  return path.join(app.getPath('userData'), 'studio-trust.json')
}

async function readTrust(): Promise<Record<string, string>> {
  try {
    const data = JSON.parse(await fs.readFile(trustFile(), 'utf8'))
    return typeof data === 'object' && data !== null ? data : {}
  } catch {
    return {}
  }
}

// hash exactly the descriptor fields marked trust-relevant, so a new grant
// added to the schema automatically invalidates stored trust
function permissionsHash(config: HarnessConfig): string {
  return createHash('sha1').update(JSON.stringify(trustGrantSnapshot(config))).digest('hex')
}

async function trustKey(projectId: string): Promise<string> {
  const dir = projectPath(projectId)
  return fs.realpath(dir).catch(() => dir)
}

async function isTrusted(projectId: string, sharedConfig: HarnessConfig): Promise<boolean> {
  if (!wantsElevatedPermissions(sharedConfig)) return true // nothing to trust
  const trust = await readTrust()
  return trust[await trustKey(projectId)] === permissionsHash(sharedConfig)
}

export async function setTrusted(projectId: string, trusted: boolean): Promise<void> {
  const key = await trustKey(projectId)
  const trust = await readTrust()
  if (trusted) {
    const { sharedConfig } = await readConfigs(projectId)
    trust[key] = permissionsHash(sharedConfig)
  } else {
    delete trust[key]
  }
  await fs.mkdir(path.dirname(trustFile()), { recursive: true })
  await fs.writeFile(trustFile(), JSON.stringify(trust, null, 2))
}

// --- manifest + skills ---

async function readConfigs(
  projectId: string
): Promise<{ configPresent: boolean; sharedConfig: HarnessConfig; config: HarnessConfig; warnings: string[] }> {
  const dir = projectPath(projectId)
  const warnings: string[] = []

  const readOne = async (file: string): Promise<HarnessConfig | null> => {
    const raw = await fs.readFile(path.join(dir, file), 'utf8').catch(() => null)
    if (raw === null) return null
    try {
      return parseHarnessConfig(JSON.parse(raw), warnings)
    } catch (err) {
      warnings.push(`${file} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
      return { ...EMPTY_CONFIG }
    }
  }

  const shared = await readOne(HARNESS_FILE)
  const local = await readOne(HARNESS_LOCAL_FILE)
  const sharedConfig = shared ?? { ...EMPTY_CONFIG }
  // the local overlay may customize looks but never the trust-gated permissions
  if (local && Object.keys(local.permissions).length > 0) {
    warnings.push('fabulist.local.json cannot change permissions; ignored')
    local.permissions = {}
  }
  return {
    configPresent: shared !== null,
    sharedConfig,
    config: local ? mergeHarnessConfigs(sharedConfig, local) : sharedConfig,
    warnings
  }
}

/** Frontmatter-ish scan of a SKILL.md for name/description; falls back to the folder name. */
async function readSkill(dir: string, folder: string): Promise<SkillInfo | null> {
  const raw = await fs.readFile(path.join(dir, folder, 'SKILL.md'), 'utf8').catch(() => null)
  if (raw === null) return null
  let name = folder
  let description = ''
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^(name|description):\s*(.+)$/)
      if (m) {
        if (m[1] === 'name') name = m[2].trim()
        else description = m[2].trim()
      }
    }
  }
  return { name, description }
}

export async function listSkills(projectId: string): Promise<SkillInfo[]> {
  const dir = path.join(projectPath(projectId), '.claude', 'skills')
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const skills = await Promise.all(
    entries.filter((e) => e.isDirectory()).map((e) => readSkill(dir, e.name))
  )
  return skills.filter((s): s is SkillInfo => s !== null).sort((a, b) => a.name.localeCompare(b.name))
}

/** The full resolved harness for a project. */
export async function loadHarness(projectId: string): Promise<Harness> {
  const [{ configPresent, sharedConfig, config, warnings }, skills] = await Promise.all([
    readConfigs(projectId),
    listSkills(projectId)
  ])
  return {
    configPresent,
    config,
    skills,
    trusted: await isTrusted(projectId, sharedConfig),
    warnings
  }
}

/** The merged (shared + local overlay) config — what file typing and UI consult. */
export async function loadMergedConfig(projectId: string): Promise<HarnessConfig> {
  return (await readConfigs(projectId)).config
}

/** Just the shared (checked-in) config — what the permission gate consults. */
export async function loadGateConfig(
  projectId: string
): Promise<{ config: HarnessConfig; trusted: boolean }> {
  const { sharedConfig } = await readConfigs(projectId)
  return { config: sharedConfig, trusted: await isTrusted(projectId, sharedConfig) }
}

/** The studio name + theme glyph from a project's manifest, for library metadata. Cheap read. */
export async function studioBadge(
  projectId: string
): Promise<{ name?: string; glyph?: string }> {
  try {
    const raw = await fs.readFile(path.join(projectPath(projectId), HARNESS_FILE), 'utf8')
    const parsed = JSON.parse(raw) as { name?: unknown; theme?: { glyph?: unknown } }
    const str = (v: unknown, max: number): string | undefined =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined
    return { name: str(parsed.name, 80), glyph: str(parsed.theme?.glyph, 2) }
  } catch {
    return {}
  }
}
