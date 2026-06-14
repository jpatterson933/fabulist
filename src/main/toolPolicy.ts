import path from 'node:path'
import { resolveInside } from './pathGuards'

const COMMENTS_FILE = 'comments.json'

const READ_ONLY = new Set([
  'Read',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'Task',
  'NotebookRead',
  'ListMcpResourcesTool'
])

const FILE_EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

export type ToolDecision =
  | { kind: 'allow'; filePath?: string }
  | { kind: 'ask'; filePath?: string }
  | { kind: 'deny'; message: string; filePath?: string }

export function isFileEditTool(tool: string): boolean {
  return FILE_EDIT_TOOLS.has(tool)
}

export function decideTool(cwd: string, tool: string, input: Record<string, unknown>): ToolDecision {
  const filePath = resolveToolFile(cwd, toolPath(input))
  if (filePath.kind === 'deny') return filePath
  if (filePath.filePath === COMMENTS_FILE) {
    return {
      kind: 'deny',
      message:
        'comments.json is managed by Fabulist. Reply in chat instead; the app records comment replies.',
      filePath: filePath.filePath
    }
  }
  if (READ_ONLY.has(tool)) return { kind: 'allow', filePath: filePath.filePath }
  return { kind: 'ask', filePath: filePath.filePath }
}

function toolPath(input: Record<string, unknown>): unknown {
  return input.file_path ?? input.notebook_path ?? input.path
}

function resolveToolFile(
  cwd: string,
  value: unknown
): { kind: 'ok'; filePath?: string } | { kind: 'deny'; message: string } {
  if (typeof value !== 'string') return { kind: 'ok' }
  try {
    return { kind: 'ok', filePath: toPosix(resolveInside(cwd, value).relative) }
  } catch {
    return { kind: 'deny', message: 'File path is outside this document project.' }
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join(path.posix.sep)
}
