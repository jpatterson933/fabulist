# Fabulist

**An AI-native writing studio for the desktop, powered under the hood by [Claude Code](https://claude.com/claude-code).**

Fabulist is a local desktop app for drafting with an agent inside the document, not beside it.
Each document is a real Claude Code project folder under `~/Documents/Fabulist/`: plain
Markdown, git history, local attachments, anchored comments, and approval-gated edits.

The app has two workspaces:

- **Markdown Studio** for drafting, commenting, revising, and rewinding documents.
- **Plugin Studio** for building and testing Claude Code skills as real local plugins.

![Fabulist writing workspace with document library, manuscript editor, comments, and history panel](docs/hero.png)

_Markdown Studio keeps the manuscript in the center, document library on the left, and
Claude, comments, history, or skills on the right._

## Markdown Studio

### 1. Write in a real document

The editor is a CodeMirror 6 Markdown surface with manuscript typography. Your work is stored as
`document.md`, so it stays portable, inspectable, and easy to version outside the app.

### 2. Ask Claude, then approve the change

Claude can read the document, answer questions, and propose edits. Document edits appear inline
as suggested changes, while commands and non-document file changes appear as approval cards.
Nothing lands unless you approve it, unless you intentionally enable auto-apply.

![Claude suggested edit shown inline in the document with accept and decline controls](docs/approval.png)

_Suggested edits are visible in the manuscript before they touch the file._

### 3. Keep discussion attached to the text

Highlight a passage, leave a comment, and Claude replies in that thread with the quoted context.
Comment anchors are relocated through edits, so a thread continues to point at the right passage
after revisions. Long pasted text and files can travel with the prompt as attachments.

The overview screenshot above shows the comments panel in context: comments stay attached to the
manuscript while the conversation continues in the sidebar.

### 4. Add skills when a workflow needs them

Install Claude Code skills from local folders or archives, enable them per document, and invoke
them from the composer with `/`. Skills stay local in the document's `.claude/skills/` folder,
and their scripts still pass through the same approval gate.

Enable skills once, then call the right one from the document conversation.

### 5. Rewind without erasing history

Every save, snapshot, and approved Claude edit becomes a point in the document's git history.
Restoring an older version commits forward, so history stays intact instead of being destroyed.

![Document history timeline with Claude edits, manual edits, snapshots, and restores](docs/history.png)

_History is a timeline you can inspect and restore from, not a hidden backup folder._

## Plugin Studio

Plugin Studio is a separate workspace for authoring and testing local Claude plugins. Each plugin
lives under `~/Documents/Fabulist/.skill-studio/<slug>/`, with its own
`.claude-plugin/plugin.json`, `skills/<slug>/SKILL.md`, optional agents, MCP config, authoring
chat, and sandboxed test thread.

![Plugin Studio start screen for creating and testing a plugin](docs/plugin-studio.png)

_Build a plugin, edit its files, test it in a jailed thread, then use its skills from Fabulist documents._

## Where Work Lives

Everything is local under `~/Documents/Fabulist/`.

A document folder looks like this:

```text
~/Documents/Fabulist/<document>/
  document.md        # the manuscript
  CLAUDE.md          # per-document instructions Claude loads automatically
  comments.json      # anchored comment threads
  attachments/       # files and pasted text attached to prompts
  .fabulist/         # app state and chat transcript, gitignored
  .git/              # full version history
```

Plugin Studio lives beside documents, hidden from the document library:

```text
~/Documents/Fabulist/.skill-studio/
  .claude-plugin/marketplace.json
  .state/<slug>.json
  <slug>/
    .claude-plugin/plugin.json
    skills/<slug>/SKILL.md
    agents/
    .mcp.json
```

## Requirements

- macOS. Windows and Linux packaging targets exist, but are not yet tested.
- [Node.js](https://nodejs.org) 20+
- `git` on your PATH
- A logged-in **Claude Code** installation. Fabulist uses your existing `claude` login and plan;
  it never asks for an API key.

## Run It

```bash
git clone <this repo> fabulist
cd fabulist
npm install
npm run dev
```

If your npm config disables postinstall scripts, run this once to fetch the Electron binary:

```bash
node node_modules/electron/install.js
```

Build a standalone app into `dist/`:

```bash
npm run dist
```

## How It Works

| Layer          | Choice                           | Why                                                                                                                       |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Shell          | Electron + electron-vite + React | The Claude Agent SDK is a Node library, so the main process can run it directly with no sidecar server.                   |
| Editor         | CodeMirror 6                     | Decorations and range mapping power anchored comments, inline suggestions, and reveal highlights.                         |
| Agent          | `@anthropic-ai/claude-agent-sdk` | Documents run with `cwd` set to the document folder; Plugin Studio runs authoring and test sessions against local plugins. |
| Versioning     | plain `git` CLI per folder       | History, snapshots, approved edits, and restores all become inspectable commits.                                          |
| Approval gate  | SDK `canUseTool` callback        | Read-only tools pass through; edits and commands surface as approval requests unless auto-apply is on.                    |
| Chat rendering | `react-markdown` + `remark-gfm`  | Plugin Studio chat, test threads, and comments render Markdown safely without raw HTML.                                  |

## Development

- `npm run typecheck` — strict TypeScript over main and renderer
- `npm test` — Vitest regression suite
- `npm run build` — production bundles to `out/`
- `npm run pack` — unpacked app build for smoke testing
- `scripts/cdp.mjs` — dev harness for screenshots and renderer evaluation

Source map:

```text
src/main/        Electron main process, IPC, git, library, agent, Plugin Studio storage
src/preload/     typed contextBridge API exposed as window.fabulist
src/shared/      shared types and IPC channel contract
src/renderer/    React UI, CodeMirror editor, chat, comments, history, settings, Plugin Studio
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR.

## License

[MIT](./LICENSE)
