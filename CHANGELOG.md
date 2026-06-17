# Changelog

All notable changes to Fabulist are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com); versions follow [SemVer](https://semver.org).

## [Unreleased]

### Fixed
- Editing a document's title (or content) now updates its sidebar entry — title, preview,
  and word count — instead of leaving the library list stale until the next create/delete or
  agent edit.
- Switching between documents no longer flashes the empty "new document" state. The
  previous document now stays on screen until the next one's content has loaded, instead
  of blanking out during the async load.

### Changed
- The sidebar toggle in the workspace header is now an icon button (matching the library
  toggle) instead of a "Panel" text label.
- Removed the thread-count badge from the per-document conversation selector.

### Added
- **Attach files to a chat message**: a 📎 button (and drag-and-drop onto the chat panel)
  lets you attach one or more files to a message for Claude. Images and PDFs are sent inline
  so Claude sees them directly; other files (text, code, data, …) are copied into the
  document's project folder and referenced so Claude can open them with its Read tool.
  Attachments show as removable chips while composing and stay visible on the sent message.
- **Multiple conversations per document**: a thread switcher above the chat lets you start
  a fresh conversation with Claude (＋), switch between existing ones, and rename or delete
  them. Each thread keeps its own transcript and resumable Claude session, so context stays
  separate between, say, drafting a scene and researching background. New threads are named
  after their opening message; the active thread is remembered per document. Existing
  single-session documents are migrated automatically into one "Conversation" thread.
- **Auto-accept edits** toggle below the chat composer: when checked, Claude's document
  edits apply automatically without the per-change approval card. Bash commands still
  prompt for approval regardless. The preference persists across sessions.
- Markdown rendering for Claude's chat replies and comment-thread messages, via
  [Streamdown](https://github.com/vercel/streamdown): headings, lists, tables, links,
  blockquotes, inline code, and syntax-highlighted code blocks now render instead of raw
  text, and partial markdown stays readable while a reply streams in.
- Per-document editor typeface: an **Aa** picker in the header (Newsreader, Literata,
  Fraunces, Plex Sans, Plex Mono — all bundled, offline), persisted per document.

### Changed
- Model picker shows the real model name in use. The engine's default row (a concrete
  model, e.g. "Opus 4.8 with 1M context") is now labelled with that model name — parsed
  from the engine's own description — instead of the generic word "Default". The list
  stays sourced live from the Claude Code engine's `supportedModels()`.
- Comments always engage Claude: submitting a comment or thread reply automatically sends
  the highlighted passage and thread to Claude, whose reply lands in the thread (queued if
  the agent is mid-task). The separate "Ask Claude" selection action and chat quote-chip
  flow were removed.
- Claude's pending document edits render as in-document suggested edits (strikethrough +
  insertion, Google-Docs style) with a floating accept/decline pill (⌘⏎ / esc); the editor
  locks while a suggestion is under review. Commands and non-document files keep the chat
  diff card.
- Comment cards no longer quote the selection — the commented text is highlighted in the
  document (immediately while composing a draft); clicking a card jumps to its highlight.
  The stored quote appears only for orphaned threads.
- Active-comment emphasis comes from context: sibling highlights ghost out while the
  selected thread keeps a moderate amber and accent underline.

### Fixed
- Comment-anchor corruption: full-document replaces (Claude's edits, restores) could
  rewrite comment anchors to cover text that was never commented on.
- Sidebar panels (comments/chat/history) not scrolling — the app-frame grid let the
  sidebar grow past the window instead of constraining it.
- App chrome could be scrolled off-screen by programmatic `scrollIntoView` from the
  editor or panels (`overflow: clip` on the frame).
- Pending permission requests are re-emitted when a document is (re)watched, so a
  renderer reload mid-approval no longer strands the agent.

## [0.1.0] — 2026-06-11

Initial release.

### Added
- AI-native writing studio powered by Claude Code: every document is a Claude Code
  project folder — versioned with git, rewindable, with its own `CLAUDE.md`.
- CodeMirror 6 markdown editor with manuscript typography.
- Agent sidebar: streaming chat with the Claude Code engine scoped to the document
  (`cwd` = doc folder, one resumable session per doc).
- Human approval gate (`canUseTool`): read-only tools pass through; file edits and
  commands require explicit approval. `comments.json` is app-managed and off-limits.
- Anchored comment threads: highlight text, comment, re-anchor across edits; Claude
  replies recorded in-thread.
- Version history: autosave checkpoints, named snapshots, automatic `Claude:` commits
  after approved edits; preview any version as a diff and restore (restores commit
  forward — history is never destroyed).
- Per-document model picker populated live from the Claude Code engine
  (`supportedModels()`), including Fable; falls back to static aliases.
- Collapsible library rail (⌘\); macOS traffic-light-aware chrome.
- electron-builder packaging (`npm run dist`) with the Agent SDK's native engine
  unpacked from the asar so it can spawn in packaged builds.
- MIT license, contributing guide, dev CDP harness (`scripts/cdp.mjs`).

[Unreleased]: https://github.com/MasonLS/fabulist/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/MasonLS/fabulist/releases/tag/v0.1.0
