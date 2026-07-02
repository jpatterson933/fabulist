// The panel bridge: a small script served to every project at
// /__fabulist__.js (it never resolves to a real file). A web panel that
// includes it gets the app's design tokens applied as CSS variables on its
// own :root — so studio-built UI can use var(--paper), var(--accent), … and
// match the app, themed studios included — plus a tiny `window.fabulist` API
// for navigation and (trust-gated, on the app side) running harness actions.
//
// Everything crosses the frame boundary via postMessage; the renderer
// validates the source window and every payload, and the gate on run-action
// lives over there — this script is convenience, not authority.

export const PANEL_BRIDGE_PATH = '__fabulist__.js'

export const PANEL_BRIDGE_JS = `// Fabulist panel bridge — see docs/harness.md, "Panels".
;(() => {
  const post = (msg) => window.parent.postMessage(Object.assign({ fabulist: true }, msg), '*')
  window.fabulist = {
    /** the app's design tokens, once received; also applied to :root as CSS vars */
    theme: {},
    /** open a project file as a tab */
    openFile: (file) => post({ type: 'open-file', file: String(file) }),
    /** open another harness panel */
    openPanel: (panel) => post({ type: 'open-panel', panel: String(panel) }),
    /** run a harness action by id (the app allows this only for trusted studios) */
    runAction: (action) => post({ type: 'run-action', action: String(action) })
  }
  window.addEventListener('message', (e) => {
    const d = e.data
    if (!d || d.fabulist !== true || d.type !== 'theme' || typeof d.vars !== 'object') return
    for (const k in d.vars) {
      if (/^--[a-z0-9-]+$/i.test(k)) document.documentElement.style.setProperty(k, String(d.vars[k]))
    }
    window.fabulist.theme = d.vars
    window.dispatchEvent(new CustomEvent('fabulist:theme', { detail: d.vars }))
  })
  post({ type: 'ready' })
})()
`
