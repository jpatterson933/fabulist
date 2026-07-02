# Changelog

All notable changes to Fabulist are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com); versions follow [SemVer](https://semver.org).

## [Unreleased]

### Added
- **The Files rail is now a real IDE-grade file tree**, rebuilt on
  [Headless Tree](https://headless-tree.lukasbach.com) (the successor to
  react-complex-tree). What it can do now: drag-and-drop files *and folders* into any
  folder (or back to the project root), multi-select (⌘/shift-click) with group drag and
  group delete, inline rename (double-click or F2, Enter/Escape), full keyboard
  navigation (arrows, Home/End, Enter to open), and type-to-search — just start typing
  over the tree and it matches against the titles you see as well as filenames, moving
  focus to the hit. A right-click context menu carries New file / New folder (inline
  ghost-row input, created exactly where you clicked), Rename, Reveal in Finder, and
  Delete (⌫ works too). Empty folders now appear in the tree, and folders created
  outside the app (agent or terminal `mkdir`) show up live. Moves and renames carry
  everything with them: open tabs, the active file, per-file fonts, and comment threads
  all follow the new path, and each move lands as a git snapshot. Expansion state is
  still remembered per project.
- **New design language: construction kit, not manuscript.** The warm-paper/serif/ember
  theme is replaced by a modular one — a porcelain bench with a faint breadboard dot
  grid, white module surfaces with visible 1px seams, construction-orange accent, and
  category colors that mean something: blueprint blue chips mark Views, run green marks
  Commands. Archivo (wide) is the display face, Plex Mono carries uppercase micro-labels
  (section headers, the palette groups, the idle title), radii tightened app-wide, and
  the active file/project/tab is a white block with an orange connector edge. The brand
  glyph is now a 2×2 block mark (one cell lit) replacing the literary ❡ everywhere; the
  studio slot in the rail renders as a dashed empty socket until a harness fills it.
  Fraunces/Newsreader/Literata remain solely as document typeface options. The palette
  group formerly labeled "Panels" now matches the rail: "Views".
- **"Documents" are gone; everything is a file.** The whole vocabulary moved with the
  model: the rail header says Files, the dialog is New File, the palette group is Files,
  and the agent is told about files, not documents. The manifest block is now
  `fileTypes` (was `docTypes`) and the action surface is `"file"` (was `"doc"`) — hard
  renames, no aliases (pre-release; a manifest still using `docTypes` gets an explicit
  warning in the studio UI instead of silent ignoring). Internals followed completely:
  `FileMeta`/`FileFormat` types, `file:*` / `project:files` IPC channels,
  `window.fabulist.file.*`, project.json stores `files`/`activeFile`, and the shared
  registry is `src/shared/fileFormats.ts`. Built-in starters and docs updated; existing
  local projects re-derive their state on first open.
- **Every file is a document now — no manifest required.** Any project (bare or studio)
  admits every textual file as a document: `pages/*.html`, `src/**`, `data/*.json`,
  `Makefile` — they all appear in the rail and open in the editor with syntax
  highlighting. Raster images (`.png`, `.jpg`, `.gif`, `.webp`, `.avif`) are documents
  too, opening in a new read-only image view that live-refreshes when the agent changes
  the file. Doc-type globs no longer gate admission; they add meaning on top — icons,
  labels, title rules, New Document templates. Build/tooling folders (`node_modules`,
  `dist`, `build`, `out`, `coverage`, `vendor`, `target`, `__pycache__`) stay out of the
  rail. The "Fabulist edits Markdown documents for now" dead end is gone.
- **Two non-writing starters: Research Studio and Slides Studio.** Research Studio keeps
  questions, per-source notes, and briefs honest — log-source and synthesize-findings
  skills, a living Findings panel, no-source-no-claim ground rules. Slides Studio is a
  hand-built HTML deck (scroll-snap slides, keyboard nav, hidden speaker notes) with a
  live Deck Preview panel, a Serve deck command, and a deck-design skill. Built-in
  starters are now half writing, half not.

### Changed
- **The app no longer defaults to a manuscript.** The default document typeface is now a
  neutral sans (IBM Plex Sans); Newsreader, Literata, and Fraunces remain one click away
  in the typeface picker for docs that want a book page, and the picker now appears only
  on Markdown docs (code and images ignored it anyway). Quote chips, comment threads,
  diffs, and version previews follow the same neutral face.
- **External edits to non-Markdown documents now reach the editor live.** The project
  watcher previously only tracked `*.md`; it now tracks every document — text changes
  stream into open tabs, image changes refresh the image view.
- **De-specialized the words.** The default project CLAUDE.md, the agent's system-prompt
  framing, the workshop schema examples (Course Studio / lessons / outline instead of
  Novel Studio / scenes / story bible), the manifest docs, the chat/comment microcopy
  ("selection" instead of "passage"), the New Project genesis hint, the README, and the
  package description all now describe a studio for making anything, with writing as one
  of the things.
- **Website Studio** joins the built-in starters — the first non-writing one: HTML pages,
  a shared stylesheet, a design-pass skill, live web/code panels, and a **Serve site**
  command whose preview renders the site beside its server log while you and the agent
  edit it. Proof that a studio can be a workspace for software, not just prose.
- **The New Project chooser now leads with "What do you want to make?"** — Design with
  Claude (the workshop) is the first and default card, starter studios follow, Blank moves
  last. The workshop agent's guidelines now spell out the non-prose toolkit (any-extension
  doc types, code/image/web panels, commands with live previews) so studios it designs for
  websites, data, or apps use the full harness.
- **Studios can run things.** A `commands` block in the manifest declares the processes the
  work needs — a dev server, a build, a test run. Each command appears in the rail with
  Run/Stop, streams its output into a log tab (● while running), and, with a `preview`
  localhost URL, shows the served page live beside the log — edit-and-see for studios that
  produce running software. Commands start only from an explicit user click with the exact
  command line shown (the agent has no path to them; agent shell access remains a separate,
  gated concern), run at the project root in their own process group, and are killed —
  whole tree — on Stop and at app quit. Previews must be localhost URLs; the preview frame
  retries while the server warms up and has a manual reload.
- **Panels can show code, images, and live web pages.** `view` in a panel definition now
  accepts `"code"` (read-only source with by-extension syntax highlighting), `"image"`, and
  `"web"` — the file rendered as a live page in a sandboxed frame, with relative assets and
  scripts working, so a studio that builds a website can display the website. Project files
  are served over an internal per-project scheme (`fab-project://`) that never exposes
  dotfiles or anything outside the project folder; asset views refresh when the agent edits
  the files behind them.
- **Non-markdown documents open with real syntax highlighting.** Code-flavored docs
  (`.html`, `.ts`, `.json`, `.py`, … — anything a docType glob admits) now open in a
  monospace, full-width editor with the language picked by filename, lazy-loaded from the
  CodeMirror language registry. Markdown keeps the prose editor, and fenced code blocks in
  markdown are now language-highlighted too.
- **Studios aren't just for writing anymore.** A doc-type glob in the manifest now admits
  *any* textual file as a document — `pages/*.html`, `data/*.json`, `src/**` — not just
  Markdown. Matched files show up in the rail (titled by filename unless `titleFrom` says
  otherwise), open in the text editor, and get New Document cards like any other type;
  known-binary files (images, archives, media) are never admitted. Bare projects still
  default to `*.md`. The agent's built-in persona is no longer "a writing studio": it now
  introduces itself with the studio's own name and description from `fabulist.json`, and
  the "author"/"writing" framing in prompts and approval messages is gone.
- **New projects start from a studio.** The New Project flow is now a chooser: **Blank**,
  **Design with Claude** (genesis — a blank project that opens straight into the studio
  workshop, where describing your work gets a custom studio built around it), or one of three
  built-in starter studios — **Novel Studio** (scenes in chapters, a living story bible,
  tighten-prose/punch-up-dialogue/continuity-check skills), **Campaign Studio** (session notes,
  NPC forge, roster and world-primer panels), and **Essay Studio** (drafts held to your own
  style guide). Starters ship with the app (`resources/templates`) and instantiate as fresh
  projects — copied, de-templated, git-initialized, and named.
- **Any project can be a template.** `"template": true` in the manifest marks a studio as
  meant to be instantiated: opening one shows a banner ("edits here change the template for
  everyone who starts from it") with **New project from this studio**, so a cloned template
  repo becomes a project factory. Instantiation strips the flag from the copy.
- **Studios can ship MCP servers — behind trust.** A harness may now carry `.mcp.json` (+
  `enabledMcpjsonServers` in `.claude/settings.json`) and request `permissions.mcp: "ask"`
  or `"allow"` in the manifest. Until the user trusts the studio, project MCP config is
  ignored outright (`strictMcpConfig` — connecting a stdio server is code execution, so it
  never happens silently); once trusted, `"ask"` puts every MCP tool call behind an approval
  card ("MCP files: list_directory") and `"allow"` auto-approves them. This also closes a
  hole: MCP tools were previously blanket-approved by the gate. Because the trust hash covers
  the grant fields, existing trusted studios re-prompt once — the grant surface grew.
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
- **The manifest schema now defines itself.** `fabulist.json`'s shape lives in one set of
  descriptor tables (`src/shared/harness.ts`); the parser, the workshop agent's schema
  reference, the generated section of `docs/harness.md`, a published JSON Schema
  (`docs/fabulist.schema.json` — point `"$schema"` at it for editor autocomplete), and the
  trust hash all derive from it. Adding a manifest option is one row; a new permission grant
  automatically re-prompts trust; a vitest suite pins the lenient-parsing contract and fails if
  the generated artifacts drift (`npm run gen:schema` regenerates). Manifests may also declare
  a `version`; newer-than-app versions warn instead of failing.
- Panel view kinds, action surfaces, and palette command groups are now registries — adding a
  panel kind, a surface, or a command source is a table row plus a component, not a rewrite.
  Panels gained an explicit `view` field (only `"markdown"` today); unknown kinds render a
  friendly "update the app" notice instead of breaking.
- All project-folder signals (harness hot reload, external doc edits/deletions, comment
  changes) now arrive on a single typed `project:event` IPC channel instead of four bespoke
  ones.
- **The document rail is a folder tree.** Nested documents group under collapsible folders
  (chevron, per-folder counts, indentation); collapse state is remembered per project. Root
  documents and the Views section sit alongside as before. Frontmatter is now stripped before
  title/preview derivation for every doc, not just harness-typed ones, so an untyped doc with
  frontmatter no longer titles itself "---".
- **Documents can live in folders.** Doc identity is now a project-relative path
  (`chapters/ch-1.md`), discovered recursively (hidden folders, `attachments/`, and
  `node_modules/` excluded; top-level `CLAUDE.md`/`AGENTS.md`/`README.md` stay reserved).
  Doc-type globs may span folders (`chapters/*.scene.md`, `**` crosses depths), typed creation
  makes the folder and names the file inside it, and external edits/deletions of nested files
  propagate. Comments, tabs, fonts, and history all key on the relative path.
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
- A project folder that lives inside a larger git repo (a symlinked folder in a dev repo, a
  monorepo subfolder) no longer gets the *outer* repo staged and committed by Fabulist's
  auto-snapshots — git operations now require the project folder to be its own repo root, and
  opening such a folder never nests a new repo inside the enclosing one.
- Documents in the rail no longer wear a doc-type badge — the type's icon (and the hover
  tooltip) already says it; the badge was noise.
- Icon buttons (+ and × in the tab strip and rail, the chat send arrow) now center their glyphs
  explicitly instead of trusting baseline layout, which sat them slightly off-center.
- Deleting a document outside the app (terminal, agent, a teammate's pull) now removes it from
  the rail and closes its tab instead of leaving a ghost entry until the next full refresh.
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
