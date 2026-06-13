# Changelog

All notable changes to Fabulist are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com); versions follow [SemVer](https://semver.org).

## [Unreleased]

### Added
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

### Fixed
- Command (Bash) approval cards no longer vanish when the chat is full: the chat column
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
