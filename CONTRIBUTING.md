# Contributing to Fabulist

Thanks for your interest! Fabulist is intentionally small and baremetal — please keep it that way.

## Setup

```bash
npm install
npm run dev
```

Requirements: Node 20+, `git`, and a logged-in [Claude Code](https://claude.com/claude-code) installation (`claude` CLI). If your npm config disables postinstall scripts, run `node node_modules/electron/install.js` once to fetch the Electron binary.

## Before you open a PR

- `npm run typecheck` must pass (strict TS over main + renderer).
- Add a line for any user-visible change under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
- Verify behavior in the running app, not just the compiler. The dev harness helps:
  launch with `npm run dev -- -- --remote-debugging-port=9223`, then
  `node scripts/cdp.mjs screenshot /tmp/app.png` or `node scripts/cdp.mjs eval '<js>'`
  (the renderer exposes `window.__store` in dev builds).
- Anything that touches the approval gate (`src/main/agent.ts` → `gateTool`) needs extra care:
  the contract is that **no file mutation or command reaches a document without explicit
  user approval**. Don't widen the read-only allowlist casually.

## Design

The UI has a deliberate visual identity (warm paper, ink, ember-red accent; Fraunces /
Newsreader / IBM Plex). Match it. No new dependencies for things CSS can do.

## Architecture orientation

See the Source map in [README.md](README.md) and the repo notes in [CLAUDE.md](CLAUDE.md).
