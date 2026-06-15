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
