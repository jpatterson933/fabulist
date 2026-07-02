# Fabulist

**An AI-native studio for the desktop — make anything with Claude, powered under the hood by [Claude Code](https://claude.com/claude-code).**

Every project is a real Claude Code project folder — versioned with git, rewindable, and
shared with an agent that works *inside* the project's world. A project can be prose, a
website, a slide deck, research, code, data — and a `fabulist.json` manifest can grow a
custom studio around it: typed files, palette actions, rendered panels, live previews.
You work directly, or you highlight, comment, and ask Claude. Every change Claude proposes
is shown to you as a diff that you approve or decline before it lands.

![Fabulist — comments anchored to the file, with Claude in the thread](docs/hero.png)

**Every edit Claude proposes appears in the file as a suggested edit — strikethrough and insertion, accept or decline:**

![Reviewing a suggested edit inline](docs/approval.png)

**Every save, snapshot, and approved edit is a point you can return to:**

![Version history timeline](docs/history.png)

## Features

- **A real editor first** — CodeMirror 6 editing for every textual file: Markdown gets a
  reading page, code gets monospace and syntax highlighting, images get an image view.
  Your work lives in plain files you can open with anything.
- **Studios, not just files** — a checked-in `fabulist.json` turns a project into a
  studio: typed file kinds with templates, ⌘K palette actions backed by skills, rendered
  panels (markdown, code, image, live web), and user-run commands with log tabs and a
  live localhost preview. Built-in starters cover websites, slides, research, essays,
  novels, and campaigns — or describe your work and the workshop agent designs a studio
  around it.
- **An agent that knows the project** — chat in the sidebar; Claude reads, researches, and
  edits with full project context (each project has its own `CLAUDE.md` it loads).
  Per-project model picker, populated live from whatever your Claude Code version offers.
- **Human-approved edits** — Claude's proposed changes render in the file itself as
  Google-Docs-style suggested edits (strikethrough + insertion), with accept/decline
  (⌘⏎ / esc). Commands and other files surface as diff cards in chat. Nothing lands
  without your explicit approval (unless you trust a studio with auto-edits).
- **Comments are the conversation** — highlight text and comment, like a shared doc. Claude
  reads every comment, replies in the thread, and proposes any change as a suggested
  edit. Threads are anchored highlights that survive edits and rewrites.
- **Versioned and rewindable** — autosave checkpoints, named snapshots, and automatic commits
  for every approved Claude edit. Preview any version as a diff and restore it; restores
  commit forward, so history is never destroyed.

## Requirements

- macOS (Windows/Linux likely work — packaging targets exist — but are untested)
- [Node.js](https://nodejs.org) 20+
- `git` on your PATH
- A logged-in **Claude Code** installation — Fabulist uses your existing `claude` login
  and plan; it never asks for an API key

## Run it

```bash
git clone <this repo> fabulist && cd fabulist
npm install
npm run dev
```

> If your npm config disables postinstall scripts, run `node node_modules/electron/install.js`
> once to fetch the Electron binary.

Build a standalone app (`.dmg`/`.zip` into `dist/`):

```bash
npm run dist
```

Your projects live in `~/Documents/Fabulist/`, one folder per project:

```
~/Documents/Fabulist/<project>/
  *.md, *.html, …    ← the work itself, any file kind, nested folders fine
  fabulist.json      ← optional studio manifest (file types, actions, panels…)
  CLAUDE.md          ← per-project instructions Claude loads automatically
  .claude/skills/    ← reusable skills the studio's actions invoke
  comments.json      ← anchored comment threads (versioned with the project)
  .fabulist/         ← app state: agent session ids, chat transcripts (gitignored)
  .git/              ← full version history
```

## How it works

| Layer | Choice | Why |
|---|---|---|
| Shell | Electron + electron-vite + React | The Claude Agent SDK is a Node library; running it in the main process is the most direct integration possible — no sidecar, no server. |
| Editor | CodeMirror 6 (markdown) | Baremetal; its decoration/range-mapping API powers comment highlights that survive edits. |
| Agent | `@anthropic-ai/claude-agent-sdk` | The actual Claude Code engine. `cwd` = the project folder, `resume` keeps continuous sessions per thread, `settingSources: ['project']` loads the project's CLAUDE.md. |
| Versioning | plain `git` CLI per project folder | History = `git log`, rewind = restore from a rev (always committed forward — restoring never erases history). |
| Approval gate | SDK `canUseTool` callback | Read-only tools pass through; file edits and commands surface as inline diff cards the user must approve. `comments.json` is app-managed and off-limits to the agent. |

### The approval flow

1. Claude calls `Edit`/`Write` on a file → `canUseTool` fires in the main process.
2. Main computes before/after, sends a permission request over IPC.
3. For the focused file itself, the editor renders the change inline as a suggested edit
   (old text struck through, new text inserted) and locks the file while you review;
   commands and other files show as diff cards in the chat panel.
4. On accept, the SDK executes the edit; a file watcher picks up the change and the
   editor updates live; the turn ends with an automatic `Claude: <prompt>` commit.

## Privacy

Everything is local: your projects, comments, history, and chat transcripts stay in
`~/Documents/Fabulist/`. Conversations with Claude go through your own Claude Code
login, exactly as if you'd run `claude` in that folder yourself.

## Development

- `npm run typecheck` — strict TS over main + renderer
- `npm run build` — production bundles to `out/`
- `npm run pack` — unpacked app build for quick smoke tests (`dist/`)
- `scripts/cdp.mjs` — dev harness: launch with
  `npm run dev -- -- --remote-debugging-port=9223`, then
  `node scripts/cdp.mjs screenshot /tmp/app.png` or `node scripts/cdp.mjs eval '<js>'`
  (the renderer exposes `window.__store` in dev builds)

Source map:

```
src/main/        Electron main: window, IPC, git, library, comments store,
                 agent.ts (the Claude Code bridge + approval gate)
src/preload/     typed contextBridge API (window.fabulist)
src/shared/      types shared across processes
src/renderer/    React app: Library rail · CodeMirror editor (comment
                 decorations, selection toolbar) · sidebar (Claude chat with
                 approval cards / comment threads / history timeline)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## License

[MIT](LICENSE)
