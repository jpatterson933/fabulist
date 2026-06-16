# Changelog

All notable changes to Fabulist are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com); versions follow [SemVer](https://semver.org).

## [Unreleased]

### Added
- **Code-editor power features in both editors — Find, multi-cursor, and Tab-to-indent.**
  Editing a document (writing app) or a skill file (Plugin Studio) now has the shortcuts you'd
  expect from a real editor: **⌘F** opens a Find / Replace panel (**⌘G** / **⇧⌘G** for next /
  previous, esc to close); **⌘D** selects the next occurrence of the word or selection for
  VS Code-style multi-cursor editing (**⇧⌘L** selects every occurrence at once); **⌘⌥G** jumps
  to a line; **Tab** / **⇧Tab** indent / dedent the current line(s) instead of moving focus out
  of the editor; and Alt-drag makes a rectangular (column) selection. Other instances of the
  current selection are highlighted live. This lives in one self-contained module
  (`src/renderer/src/editor/powerEditing.ts`) that both editors pull in with a single spread —
  unbraided from the comment / suggestion machinery, so it's easy to retune later — and the
  Find panel is themed from the app's own CSS variables, so it matches whichever page hosts it.
  (Multi-cursor needs CodeMirror to *draw* selections, so the editors now render selection and
  caret via the app's `--selection` / `--accent` colors instead of the browser defaults.)

### Changed
- **Workspace names and dark studio themes.** The app remains **Fabulist**, while the two
  workspaces are now **Markdown Studio** and **Plugin Studio** in the switcher and docs. The
  shared design tokens now define a soft dark Markdown Studio palette, and Plugin Studio
  overrides the same tokens with a scoped dark-neon palette so future visual retuning stays
  modular instead of braided through component styles.
- **Plugin Studio `/test` now sends the FULL test transcript.** Referencing a run (current or
  archived) in the authoring chat previously serialized only the last ~12k characters
  (~3k tokens) of the transcript — so most runs were diagnosed from their tail. That cap is
  removed: the whole run is sent. Each run's token/cost/turns **and the model it actually ran
  on** are now woven in too (previously usage lines were dropped), so the authoring agent can
  reason about efficiency, not just correctness.
- **Plugin Studio test transcripts are no longer capped at 200 messages.** The live test thread,
  the authoring chat, and each archived run were each silently clipped to their last 200
  items on save — losing the head of long runs even before `/test`. The full transcripts are
  now persisted. Archived runs are still capped by **count** at the **10** most recent (down
  from 50), and the archived-run picker now shows a note once that cap is reached so it's
  clear older runs aren't kept.
- Reworked `README.md` into a clearer visual app flow using selected root-level
  screenshots from `docs/`.
- **Plugin Studio edits now mirror the writing app.** When the authoring agent proposes an
  edit (auto-apply off), the diff is rendered **inline in the file editor** — deletions
  struck through in red, insertions in green — and the buffer locks while it's under review,
  with **Accept (⌘⏎) / Decline (esc)** in a bar over the editor (the chat card collapses to a
  compact "shown in the editor" note). Previously the diff only appeared in the chat. This
  reuses the document editor's exact suggestion overlay; the two pages stay unbraided.
- **Applied Plugin Studio edits appear instantly.** Approving an edit (or having it auto-applied)
  now lands the change in the editor immediately instead of after the whole turn finishes —
  the editor buffer is updated optimistically from the edit's own diff, with the end-of-turn
  disk re-read kept as a reconciling backstop.
- **Plugin Studio auto-apply now behaves exactly like the writing app.** It's persisted per skill
  and **re-read on every edit**, so toggling "Auto-apply edits" takes effect immediately —
  even mid-run — instead of being fixed when the message was sent (it's no longer passed as a
  per-send argument; the gate reads it from the skill's settings, mirroring `agent.ts`).
- **Plugin Studio editor scroll position is now actually restored** when you leave a file and come
  back — including the bottom of a long file. The position is captured **as you scroll** (while
  the editor is on-screen) instead of when it's torn down: React runs the teardown after it has
  already detached the old editor, and a detached element reports `scrollTop: 0`, so the old
  code always "remembered" the top. Restoring now happens at editor construction (CodeMirror's
  `scrollTo`), which builds the first viewport around the saved position so it lands exactly.

### Added
- **Plugin Studio model picker.** Choose the Claude model for a skill — used for both the
  authoring chat and test runs — from a picker in the Chat and Test compose bars, mirroring
  the writing app's model picker. The choice is persisted per skill (alongside auto-apply)
  under `.skill-studio/.state/<slug>.json` and read by the engine when it launches a run, so
  it survives a restart.

### Added
- **Plugin Studio**: a separate workspace for building and testing Claude skills, reached
  from the ❡ wordmark dropdown at the top-left of the (collapsible) rail. Each skill is
  its own real local Claude *plugin* under `~/Documents/Fabulist/.skill-studio/<slug>/` —
  with its own `.claude-plugin/plugin.json`, `skills/<slug>/SKILL.md`, `agents/`, and
  `.mcp.json`, listed in a top-level `marketplace.json` — kept entirely separate from the
  documents library. Create a skill, edit its files (the file tree shows the whole plugin),
  then **test it on the spot**: the **Test** panel runs the skill's plugin in a throwaway
  sandbox (any sub-agents it bundles spin up too), streaming inline. Test runs auto-approve
  inside the sandbox for fast iteration but stay confined to it — they can't touch your
  files. "New test" starts a fresh thread that picks up your latest edits. The right
  sidebar has three tabs: **Chat** — an authoring agent that reads and edits the skill's
  files directly (its changes stream in as diffs and land in the editor); **Comments** —
  highlight text in a file, click **Comment**, write a note, and it's sent into the Chat
  where Claude responds; and **Test** — the sandbox run above. The file tree supports a
  **right-click menu** to create a new file or folder *in the folder you clicked* (or at the
  root from empty space), and to delete a file/folder — no need to type full paths. The rail
  collapses with `⌘\`, mirroring the writing app, and the whole studio leaves the writing
  side untouched. Every test and authoring run shows its **token + cost usage** (input /
  output / cache and dollar cost) as a line in the thread plus a running session total at the
  top — and logs it to the process console — so consumption stays visible. The `.md` editor has
  an **Auto-format** button (next to Comment) that formats Markdown with **Prettier** (run
  in-renderer via `prettier/standalone`), leaving fenced code untouched. The studio
  wears a scoped **dark + neon** theme (soft borders, accents, and glows), and the skill
  editor is now a syntax-highlighting **Markdown editor** that
  colors each element type — headings, bold, italics, inline/fenced code, links, lists,
  blockquotes, rules — from a swappable per-element palette.
- **Resizable Plugin Studio sidebar**: drag the chat/test/comments panel's left edge to widen
  it (it won't go narrower than the default); double-click the edge to snap back. The panel
  also **flexes with the window** — it grows as you enlarge the window (to ~32vw, capped at
  60vw) so chat/test/comment text and tables get more room instead of staying pinned at a
  fixed width; dragging still overrides the width on top of that.
- **Versioned, archived test runs**: Plugin Studio test threads are now numbered — the live
  thread shows **TEST v0.0.1** (an odometer that carries: `0.0.9`→`0.1.0`, `0.9.9`→`1.0.0`).
  **New test** now archives the current run instead of discarding it: the button arms to
  **"Archive current test?"** and a second click files the run under its version, bumps to
  the next, and opens a fresh thread (an empty thread just clears — nothing to archive). The
  authoring **Chat**'s `/` reference menu gains an **Archived** entry beneath `/test` — a
  searchable list of past runs (most-recent-first, top 5, filter by version) you can weave
  into a message just like the live run. Archives (version + timestamp + transcript) persist
  across restarts, capped at the 50 most recent.
- **Invoke a specific skill in a test, like a real user would**: the Plugin Studio **Test**
  tab now enables the plugin's skills the way the engine does (the Agent SDK's `skills: 'all'`)
  and lets you type `/` to pick one by name. Picking a skill sends a "use the `<name>` skill"
  invocation (the natural-language equivalent of calling it) and then lets the skill's own
  `SKILL.md` drive what it reads — proper progressive disclosure, rather than the test harness
  steering it to pre-read everything. Leave the picker alone to give a plain task and let the
  model select a skill by its description, as it would in the wild. The chat shows your task
  plus a short "Using the `<name>` skill" marker; the directive goes to the model, not the echo.
- **Reference a test run from the authoring chat**: in the Plugin Studio **Chat**, type
  `/` to reference the latest **Test** run — its transcript (your prompt, the skill's
  replies, the tools it ran, files it touched, and any errors) is woven into the message
  Claude receives, so you can say *"the test did X but I expected Y — review and propose a
  fix"* and it can see exactly what happened. Your chat bubble shows just your note plus a
  short "Referenced the latest test run" marker; the full transcript goes to the model, not
  the visible echo. Oversized transcripts keep their most-recent turns.
- **Plugin Studio authoring edits now follow the same approval flow as the writing app**:
  the authoring **Chat** no longer applies (and commits) the agent's file edits silently.
  By default each edit arrives as an **approval card** with a diff — **Apply** or
  **Decline** — and only approved edits are written and committed. An **Auto-apply edits**
  toggle under the composer (mirroring the writing app) flips back to immediate, no-card
  application for fast iteration. Either way, an applied edit shows as a collapsed diff in
  chat with a **Show in file** button that opens the edited file and briefly highlights the
  changed text, the same reveal the document editor uses.
- **Clone a document**: a clone button (⧉) on each library row copies the document's
  current text into a brand-new document — titled "<title> (copy)" — with chat,
  comments, history, and the agent session all starting fresh. Only the manuscript
  carries over; everything else is reset.
- **"Show in document" now highlights the edit**: clicking it on an applied-edit card
  still scrolls to the change, and now also paints a brief highlight over the new text
  so your eye lands on it. The highlight is temporary — the next click anywhere clears it.
- **Skills**: install Claude Code skills (SKILL.md instruction packs) from a local
  folder or archive, then toggle them on per document — managed
  from a **Skills modal** opened via the **+** button next to the model picker (or the
  "Manage skills…" row in the `/` menu). Local and stateless: the library is a plain
  folder at `~/Documents/Fabulist/.skills/`; the document's `.claude/skills/` folder is
  the source of truth for what's enabled (symlinked in, dangling links swept, hand-added
  skills listed too). Skill scripts still run through the Bash approval gate. Skill cards
  expand on click to show the full description.
- **`/` skill autocomplete** in the chat composer: typing `/` pops up the document's
  enabled skills, filtered as you type; arrows + Enter/Tab insert the skill name.
- **Attach files**: the **+** button copies files into the document's `attachments/`
  folder, and pasting more than ~500 characters is saved as `attachments/pasted-N.txt`.
  Either way the attachment shows as a removable chip above the composer (✕ deletes the
  file too); on send, the file paths are appended to the prompt so Claude reads them.
- **Auto-apply edits** toggle under the chat composer: when on, Claude's file edits apply
  immediately with no approval cards, so it can revise non-stop. Commands (Bash) still
  ask, every run is still committed, and the setting persists per document. Flipping it
  mid-run takes effect on the next edit.
- Per-document editor typeface: an **Aa** picker in the header (Newsreader, Literata,
  Fraunces, Plex Sans, Plex Mono — all bundled, offline), persisted per document.

### Added
- A failed save now surfaces as a dismissible error banner instead of being silently
  swallowed — if writing your changes to disk fails, you'll see why rather than losing
  work without warning.

### Fixed
- **Stray highlight when switching Plugin Studio files**: opening a file no longer carries
  over the "Show in file" highlight from a previous reveal (it bled onto longer files —
  usually Markdown — as a half-page accent wash). The highlight is cleared on every file
  open and re-applied only for the file a reveal actually targets.
- **Auto-format no longer snaps the editor to the top**: formatting a Plugin Studio file (and
  agent edits to the open file) now apply as a minimal in-place change, so CodeMirror keeps
  your scroll position instead of jumping to line 1.
- **Plugin Studio chat renders Markdown** instead of showing raw `**asterisks**`, `###`
  headings, and `|` tables. The authoring **Chat**, **Test** transcript, and **Comments**
  notes now display the LLM's output as formatted Markdown (GFM — headings, bold/italic,
  lists, fenced code, blockquotes, tables, links) so it's readable. Links open in your
  system browser; raw HTML is not rendered (XSS-safe). Scoped to the Plugin Studio chat
  surfaces only — the document chat and every file editor still show/edit raw source
  exactly as before.
- **Plugin Studio chats now survive an app restart**: the authoring and test transcripts
  used to live only in memory, so quitting and relaunching wiped them — unlike the
  document chat, which persists. Both threads (and the authoring session, so the
  conversation resumes) are now saved per skill under `.skill-studio/.state/<slug>.json`
  and restored when you open the skill. State lives outside the plugin folder (so it never
  shows in the file tree or loads as plugin content) and is gitignored; "New test" and
  deleting a skill clear it. Restored transcripts are validated on read.
- **Chats no longer yank you to the bottom while you're reading**: a streaming reply
  only auto-scrolls when you're already at (or near) the bottom — scroll up to read and
  it stays put until you return. This was already true of the document chat; the Skill
  Studio **authoring** and **test** threads shared none of it (they jumped on every
  token) and now do, via one shared `useStickToBottom` hook so all three chats behave
  identically.
- **Testing a skill no longer auto-skips its questions**: when a skill under test asks the
  user a question (`AskUserQuestion`), the **Test** thread now surfaces a question card and
  waits for your answer — just as a real user would see — instead of silently allowing it
  answer-less, which the engine had treated as "skipped" so the skill pressed on with
  defaults. (The throwaway sandbox still auto-approves everything else for friction-free
  iteration.)
- A comment you were typing no longer vanishes when you switch sidebar tabs (e.g. to
  the Claude tab and back) — the in-progress draft text now lives in the store, so it
  survives until you post or cancel.
- Notebook (`NotebookEdit`) approval cards were blank and labelled with the bare
  tool name: they now show the proposed cell source as a diff and read "Editing
  `<file>.ipynb`", like every other file edit. (Tool descriptions, approval
  payloads, and the approval policy are now defined once per tool in a single
  registry, so a tool can no longer be half-wired.)
- Editor/IDE "Cannot find module '@shared/types'" on renderer imports: added root
  `tsconfig.json` so TypeScript path aliases resolve in the language service (build
  already worked via `tsconfig.web.json`).
  could flex-squash the card (its `overflow: hidden` allowed shrinking) down to a bare
  border line, leaving the run waiting on an approval you couldn't see or click. Chat
  items no longer shrink — the panel scrolls instead.
- Clicking **Comment** on a highlight no longer appears to do nothing when the comments
  list is scrolled down — the list jumps to the new draft card.
- An abandoned comment draft no longer paints its highlight on random text while Claude
  edits the document: the draft anchor is re-located by its quoted text on every external
  change (like comment threads are), and is dropped if that text disappears.
- The "Waiting for your approval" status no longer lingers after you've already
  approved — it resets to "Claude is working" the moment the last pending request is
  resolved (long thinking stretches emit no status updates of their own, so the stale
  label used to sit there indefinitely).
- A pending command (Bash) approval no longer looks like a frozen "Running:" spinner:
  the chat jumps to the approval card when it appears (even if you had scrolled up),
  the status line says **Waiting for your approval**, and approval requests are no
  longer dropped if they arrive for a document that isn't frontmost.
- Scrolling up in the chat no longer fights you while Claude is responding: the chat
  only auto-follows new output when you're already at (or near) the bottom, and snaps
  back when you scroll down again or send a message.
- Skill descriptions written as YAML block scalars (`description: >` / `|`) no longer
  render as a bare `>` or `|` — multi-line frontmatter values are parsed properly, and
  the skill "View" pane no longer shows the raw frontmatter fence.
- External edits (Claude's, or any change on disk) no longer yank the editor: the
  update is applied as a minimal text change instead of a whole-document replace, so
  scroll position and cursor stay where you are while reading.

### Changed
- Auto-applied edits leave a collapsed diff card in chat ("Edited document.md") with a
  **Show in document** button — review what changed, and jump to it only when you choose.
  Back-to-back edits are further grouped into one collapsed card
  ("✦ Edited document.md — N edits"); expand it to review each diff individually.
  Edits you approve by hand (auto-apply off) now leave the same collapsed diff card,
  so every applied edit has a record in chat regardless of mode.
- Pasting more than ~500 characters into a comment box (new comment or thread reply)
  becomes a removable attachment chip, exactly like in the chat composer.
- Comments are ordered by most recent activity — a thread moves to the top of its
  section when a new reply lands.
- Claude's **AskUserQuestion** tool renders as a real question card in chat (header
  chip, question, clickable options with descriptions; multi-select supported) instead
  of a bare Apply/Decline stub. A lone single-choice question answers on click; Skip
  tells Claude to proceed with its best judgment.

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
