# Fabulist — repo notes

Workflow: commit and push directly to `main` — no feature branches. Every
user-visible change must include an entry under `[Unreleased]` in CHANGELOG.md
in the same commit.

AI-native writing studio. Electron main process runs the Claude Agent SDK directly;
each user project is a Claude Code project folder under `~/Documents/Fabulist/`.

- A project may carry a studio harness: `fabulist.json` (schema in `docs/harness.md`,
  parsing in `src/shared/harness.ts`, loading/trust in `src/main/harness.ts`). File types,
  ⌘K palette actions, panels, and the permission profile all derive from it; trust for
  `edits: "auto"` lives in Electron userData keyed by a hash of the permissions block.

- ESM throughout (`"type": "module"`); electron-vite shims `__dirname` in main — do not declare it.
- Preload builds to `index.mjs`; window uses `sandbox: false` + `contextIsolation: true` (required for ESM preload).
- The approval gate lives in `src/main/agent.ts` (`gateTool`). Read-only tools auto-pass;
  file mutations and Bash go to the renderer as permission requests over `agent:event` IPC.
- Comment anchors are re-located by quote + context in `src/renderer/src/lib/anchors.ts`,
  and kept mapped through edits by the CodeMirror `threadField` decoration set.
- Electron's postinstall may be blocked by npm config; fix with `node node_modules/electron/install.js`.
- Dev verification: launch with `npm run dev -- -- --remote-debugging-port=9223`, then drive
  the app with `node scripts/cdp.mjs eval '<js>'` (store exposed as `window.__store` in dev)
  or `node scripts/cdp.mjs screenshot /tmp/app.png`.
- `npm i` of new deps may hit an electron-vite/vite peer mismatch; use `--legacy-peer-deps`.
