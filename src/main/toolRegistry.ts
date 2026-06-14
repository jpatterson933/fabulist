import path from 'node:path'
import type { PermissionRequest } from '@shared/types'

// Single source of truth for "what is a tool". Before this registry, knowledge
// of each tool was forked across three sites — the READ_ONLY/FILE_EDIT sets and
// path lookup in toolPolicy, the describeTool switch, and the buildRequest
// if/else — so a new tool had to be wired into all three and any omission
// degraded silently (NotebookEdit shipped with no diff and a bare label).
// A tool is now one entry here; toolPolicy, agent, and the approval UI all read it.

type Rel = (p: unknown) => string

/** Context a tool's payload builder may need (e.g. reading a file's prior contents). */
export interface ToolBuildCtx {
  cwd: string
  readFile(rel: string): Promise<string>
}

export interface ToolSpec {
  /** read = auto-allow; edit = file mutation (diff + auto-approve eligible); ask = always prompt */
  policy: 'read' | 'edit' | 'ask'
  /** which input field carries the target path, for escape-checking and diffs */
  pathField?: 'file_path' | 'notebook_path' | 'path'
  /** discriminant carried on the PermissionRequest so the UI renders one variant per kind */
  kind?: PermissionRequest['kind']
  /** one-line human summary shown in chat and on the approval card */
  describe?(input: Record<string, unknown>, rel: Rel): string
  /** enrich a PermissionRequest with tool-specific payload (command / questions / diff) */
  build?(req: PermissionRequest, input: Record<string, unknown>, ctx: ToolBuildCtx): void | Promise<void>
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export const TOOLS: Record<string, ToolSpec> = {
  // --- read-only: auto-allowed, never an approval card ---
  Read: { policy: 'read', pathField: 'file_path', describe: (i, rel) => `Reading ${rel(i.file_path)}` },
  Glob: { policy: 'read', describe: (i) => `Listing ${str(i.pattern)}` },
  Grep: { policy: 'read', pathField: 'path', describe: (i) => `Searching for "${str(i.pattern)}"` },
  WebFetch: { policy: 'read', describe: (i) => `Fetching ${str(i.url)}` },
  WebSearch: { policy: 'read', describe: (i) => `Searching the web: ${str(i.query)}` },
  TodoWrite: { policy: 'read', describe: () => 'Updating plan' },
  Task: { policy: 'read', describe: (i) => `Delegating: ${str(i.description)}` },
  NotebookRead: {
    policy: 'read',
    pathField: 'notebook_path',
    describe: (i, rel) => `Reading ${rel(i.notebook_path)}`
  },
  ListMcpResourcesTool: { policy: 'read' },

  // --- ask: prompt the author, with a tool-specific card ---
  Bash: {
    policy: 'ask',
    kind: 'command',
    describe: (i) => `Running: ${str(i.command).slice(0, 80)}`,
    build: (req, i) => {
      req.command = str(i.command)
    }
  },
  AskUserQuestion: {
    policy: 'ask',
    kind: 'question',
    describe: (i) => {
      const qs = i.questions as { question?: string }[] | undefined
      return `Asking: ${str(qs?.[0]?.question).slice(0, 80)}`
    },
    build: (req, i) => {
      if (!Array.isArray(i.questions)) return
      const questions = i.questions as {
        question?: string
        header?: string
        multiSelect?: boolean
        options?: { label?: string; description?: string }[]
      }[]
      req.questions = questions.map((q) => ({
        question: str(q.question),
        header: str(q.header),
        multiSelect: Boolean(q.multiSelect),
        options: (q.options ?? []).map((o) => ({
          label: str(o.label),
          description: o.description ? str(o.description) : undefined
        }))
      }))
    }
  },

  // --- edit: file mutations, rendered as a diff and eligible for auto-apply ---
  Write: {
    policy: 'edit',
    pathField: 'file_path',
    kind: 'edit',
    describe: (i, rel) => `Writing ${rel(i.file_path)}`,
    build: async (req, i, ctx) => {
      req.after = str(i.content)
      req.before = req.filePath ? await ctx.readFile(req.filePath).catch(() => '') : ''
    }
  },
  Edit: {
    policy: 'edit',
    pathField: 'file_path',
    kind: 'edit',
    describe: (i, rel) => `Editing ${rel(i.file_path)}`,
    build: (req, i) => {
      req.before = str(i.old_string)
      req.after = str(i.new_string)
      req.edits = [{ old: req.before, new: req.after, all: Boolean(i.replace_all) }]
    }
  },
  MultiEdit: {
    policy: 'edit',
    pathField: 'file_path',
    kind: 'edit',
    describe: (i, rel) => `Editing ${rel(i.file_path)}`,
    build: (req, i) => {
      if (!Array.isArray(i.edits)) return
      const edits = i.edits as { old_string?: string; new_string?: string; replace_all?: boolean }[]
      req.before = edits.map((e) => str(e.old_string)).join('\n…\n')
      req.after = edits.map((e) => str(e.new_string)).join('\n…\n')
      req.edits = edits.map((e) => ({
        old: str(e.old_string),
        new: str(e.new_string),
        all: Boolean(e.replace_all)
      }))
    }
  },
  NotebookEdit: {
    policy: 'edit',
    pathField: 'notebook_path',
    kind: 'edit',
    describe: (i, rel) => `Editing ${rel(i.notebook_path)}`,
    // previously had no card payload at all; show the new cell source as the change
    build: (req, i) => {
      req.after = str(i.new_source)
      req.before = ''
    }
  }
}

/** Build a cwd-relative path formatter for tool summaries. */
export function relPath(cwd: string): Rel {
  return (p) => (typeof p === 'string' ? path.relative(cwd, path.resolve(cwd, p)) || '.' : '')
}

/** Human-readable one-liner for a tool invocation (falls back to the bare tool name). */
export function describeTool(tool: string, input: Record<string, unknown>, cwd: string): string {
  const spec = TOOLS[tool]
  return spec?.describe ? spec.describe(input, relPath(cwd)) : tool
}

export function isReadOnly(tool: string): boolean {
  return TOOLS[tool]?.policy === 'read'
}

export function isFileEditTool(tool: string): boolean {
  return TOOLS[tool]?.policy === 'edit'
}

/**
 * The path argument to escape-check. Known tools use their declared field;
 * unknown (e.g. MCP) tools still probe the common fields so traversal is caught.
 */
export function toolPathInput(tool: string, input: Record<string, unknown>): unknown {
  const field = TOOLS[tool]?.pathField
  if (field) return input[field]
  return input.file_path ?? input.notebook_path ?? input.path
}

/** Populate a request's tool-specific payload (diff / command / questions). */
export async function buildToolPayload(
  req: PermissionRequest,
  tool: string,
  input: Record<string, unknown>,
  ctx: ToolBuildCtx
): Promise<void> {
  req.kind = TOOLS[tool]?.kind
  await TOOLS[tool]?.build?.(req, input, ctx)
}
