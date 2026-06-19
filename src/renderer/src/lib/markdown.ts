import { format } from 'prettier/standalone'
import * as markdownPlugin from 'prettier/plugins/markdown'
import type { Plugin } from 'prettier'

// Markdown formatting is delegated to Prettier's built-in Markdown formatter (run
// in-renderer via prettier/standalone) — a real, battle-tested, idempotent formatter
// rather than ad-hoc rules. proseWrap:'preserve' keeps the author's line breaks;
// embeddedLanguageFormatting:'off' leaves fenced code untouched (and avoids pulling
// in extra language plugins).
export function formatMarkdown(src: string): Promise<string> {
  return format(src, {
    parser: 'markdown',
    plugins: [markdownPlugin as Plugin],
    proseWrap: 'preserve',
    embeddedLanguageFormatting: 'off'
  })
}

// JSON is formatted by round-tripping through the platform's own parser (2-space indent).
// Deliberately NOT via Prettier: its `json` parser needs the babel + estree plugins, which
// add ~600KB to the renderer bundle — whereas JSON.parse/stringify is built in, idempotent
// for strict JSON, and zero-weight. Rejects on invalid JSON so the caller can report it
// (rather than throwing synchronously out of formatForPath, which would escape its .catch).
export function formatJson(src: string): Promise<string> {
  try {
    return Promise.resolve(JSON.stringify(JSON.parse(src), null, 2) + '\n')
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Auto-format a studio file by extension, or null when the type has no Prettier-backed
 * formatter (so the caller can hide the affordance). Only `.md` and `.json` qualify with
 * the plugins we already bundle — Python has no Prettier support, so `.py` returns null.
 */
export function formatForPath(path: string, src: string): Promise<string> | null {
  if (path.endsWith('.md')) return formatMarkdown(src)
  if (path.endsWith('.json')) return formatJson(src)
  return null
}
