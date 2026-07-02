# Changelog

All notable changes to Fabulist are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com); versions follow [SemVer](https://semver.org).

## [Unreleased]

### Added
- **Studio harnesses (`fabulist.json`).** A project folder can now describe its own studio in a
  checked-in manifest: custom document types (filename globs, templates, rail icons, title
  rules), palette actions that run skills or canned prompts, read-only panels rendered from
  project files, and a permission profile. The manifest is meant to live in git — one
  collaborator can design the harness and everyone who opens the project gets the same studio.
  It hot-reloads: when the agent (or a teammate's pull) edits `fabulist.json` or `.claude/`,
  the UI updates in place. Personal tweaks go in `fabulist.local.json` (gitignored). See
  `docs/harness.md` for the schema.
- **Command palette (⌘K).** Actions from the manifest, skills discovered under
  `.claude/skills/`, panels, documents, and app commands in one searchable list. Selection
  actions use the current editor selection.
- **Selection actions live in the highlight toolbar.** Highlighting text now offers the
  studio's selection-surface actions right next to Comment (up to three, with a … overflow
  into the palette) — one click runs the skill or prompt on the selected passage.
- **Studio workshop.** A dedicated agent conversation (Workshop button, or "Customize studio…"
  in the palette) whose system prompt knows the manifest schema — you design doc types, skills,
  actions, and panels by talking, and the agent writes the harness files.
- **Trusted permission profiles.** A manifest may request `"edits": "auto"` (apply the agent's
  file edits without per-edit approval) or `"bash": "deny"`. Auto-edits only take effect after
  you explicitly trust the studio; trust is stored outside the repo and keyed to the permissions
  block, so a cloned project can never grant itself anything, and any change to the block
  re-prompts. Tightening (`bash: deny`) applies unconditionally.
- **Open folder…** in the library imports any existing folder — e.g. a cloned Claude Code
  project with a `fabulist.json` — as a project via a symlink, leaving it where it is.
- New documents can be created as a studio doc type (picker in the tab bar and rail), which
  names the file to match the type's glob and seeds it from the type's template.

### Changed
- **The workspace header is calmer.** It now holds only navigation: document tabs, an Actions
  button with its ⌘K hint, an icon-only typeface picker, and the sidebar toggle (plus the agent
  status dot while Claude works). Word count and Snapshot left the header (Snapshot lives in the
  History panel and the palette); harness panels moved out of the tab strip into a **Views**
  section of the project rail; the studio identity moved to the rail under the project name,
  where "✦ Novel Studio — customize in the workshop" can actually explain itself (and doubles as
  the workshop entry, including "No studio yet — design one" for plain projects). Studio growth —
  more actions, panels, doc types — lands in the palette and rail, never widens the header.
- **Views open as tabs, like documents.** Opening a panel from the rail or palette adds a
  closable ▦ tab to the strip; it keeps its place while you switch to documents and is restored
  when you reopen the project, instead of vanishing the moment you click anything else.
- **New documents are created in a dialog.** The cramped inline forms in the tab strip and rail
  are gone; every entry point (tab-strip +, rail +, palette, empty states) opens one dialog with
  a title field, doc-type cards (icon, label, filename glob), and a live preview of the filename
  it will create.
- New projects' `.gitignore` no longer excludes `.claude/` — skills and agent personas are part
  of a shareable studio. Only `.fabulist/`, `.claude/settings.local.json`, and
  `fabulist.local.json` stay untracked.
- **Documents are now grouped into projects.** The library rail lists *projects*; opening one
  shows its documents in tabs across the top of the workspace (with a + to create or open more).
  A project is a single folder, git repo, and `CLAUDE.md`, and the writing agent now works from
  the project root — so a single conversation can read and edit across every document in the
  project (continuity between chapters, a shared story bible, callbacks). Agent conversation
  threads are now project-scoped rather than per-document; the agent model is a project setting,
  while the editor font stays per-document. History is one project-wide timeline, and
  preview/restore acts on the focused document. Existing single-document folders migrate
  automatically into one-document projects, keeping their chat, comments, model, and history.

### Fixed
- The passage-comment composer no longer covers the text you selected — it opens just below the
  selection, the passage stays highlighted while you write (instead of deselecting when the box
  takes focus), the redundant quoted-passage line is gone, and clicking anywhere outside the box
  dismisses it.
- Editing a document's title (or content) now updates its sidebar entry — title, preview,
  and word count — instead of leaving the library list stale until the next create/delete or
  agent edit.
- Switching between documents no longer flashes the empty "new document" state. The
  previous document now stays on screen until the next one's content has loaded, instead
  of blanking out during the async load.

### Changed
- **Commenting now goes straight to the conversation.** The separate Comments sidebar tab is
  gone. Highlighting a passage and clicking "Comment" opens a small composer right at the
  selection; your note and the quoted passage are sent into the open Claude conversation,
  where the reply appears — instead of living in a parallel comment thread.
- The right-hand sidebar now slides open and closed with the same animation as the library
  rail, instead of popping in and out abruptly. It stays mounted and collapses via an
  animated grid column.
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
