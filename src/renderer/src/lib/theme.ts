import { ACCENT_HUES, type AccentName, type ThemeDef } from '@shared/harness'

/**
 * Studio theming: a manifest names an accent and the whole ramp is derived
 * here in oklch — same lightness/chroma the stock palette uses, only the hue
 * changes. Parameterized theming (never raw CSS) is what keeps a shared
 * studio looking like Fabulist wherever it's opened.
 */

const ACCENT_VARS = ['--accent', '--accent-deep', '--accent-wash', '--accent-ink', '--selection']

/** The accent ramp for a named hue, mirroring the stock orange values. */
function accentVars(name: AccentName): Record<string, string> {
  const h = ACCENT_HUES[name]
  return {
    '--accent': `oklch(0.63 0.185 ${h})`,
    '--accent-deep': `oklch(0.53 0.165 ${h})`,
    '--accent-wash': `oklch(0.93 0.045 ${h + 12})`,
    '--accent-ink': `oklch(0.99 0.005 ${h + 18})`,
    '--selection': `oklch(0.89 0.055 ${h + 22})`
  }
}

/** A single readable swatch of a named accent, for small glyphs and chips. */
export function accentColor(name: AccentName): string {
  return `oklch(0.53 0.165 ${ACCENT_HUES[name]})`
}

/** The design tokens pushed into web panels via the /__fabulist__.js bridge. */
const PANEL_TOKENS = [
  '--font-display',
  '--font-doc',
  '--font-ui',
  '--font-mono',
  '--paper',
  '--paper-deep',
  '--paper-deeper',
  '--surface',
  '--ink',
  '--ink-soft',
  '--ink-faint',
  '--line',
  '--line-soft',
  '--accent',
  '--accent-deep',
  '--accent-wash',
  '--accent-ink',
  '--mod-view',
  '--mod-run',
  '--selection',
  '--ok',
  '--bad'
]

/** Current computed values of the panel tokens (studio theme included). */
export function themeTokens(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement)
  const out: Record<string, string> = {}
  for (const v of PANEL_TOKENS) {
    const value = cs.getPropertyValue(v).trim()
    if (value) out[v] = value
  }
  return out
}

/** Retint the app to a studio's theme; null/empty restores the stock look. */
export function applyStudioTheme(theme: ThemeDef | null | undefined): void {
  const style = document.documentElement.style
  for (const v of [...ACCENT_VARS, '--font-doc']) style.removeProperty(v)
  if (!theme) return
  if (theme.accent) {
    for (const [k, v] of Object.entries(accentVars(theme.accent))) style.setProperty(k, v)
  }
  if (theme.docFont) style.setProperty('--font-doc', `var(--font-doc-${theme.docFont})`)
}
