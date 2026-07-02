# The studio harness: `fabulist.json`

A Fabulist project is a plain Claude Code project folder. Dropping a
`fabulist.json` at its root turns it into a **studio** — the manifest tells the
app what kind of work the project holds and what UI to grow around it. The file
is meant to be committed: one collaborator can design the harness, everyone who
opens the project (in Fabulist, or with plain `claude` in a terminal) gets the
same setup. The app hot-reloads it, so edits — by you, by a teammate's pull, or
by the agent in a workshop conversation — appear in the UI immediately.

The manifest only declares what Claude Code doesn't already know. Everything
behavioral lives in its native Claude Code location and is discovered from
there:

| concern | where it lives |
| --- | --- |
| standing instructions | `CLAUDE.md` |
| reusable skills | `.claude/skills/<name>/SKILL.md` |
| subagent personas | `.claude/agents/<name>.md` |
| file types, actions, panels, permissions | `fabulist.json` |
| personal overrides (gitignored) | `fabulist.local.json` |

## Schema

The schema is defined once, as descriptor tables in `src/shared/harness.ts`;
the parser, the workshop agent's prompt, the JSON Schema
(`docs/fabulist.schema.json`, point `"$schema"` at it for editor
autocomplete), and the reference below are all generated from those tables.
Parsing is lenient: every field is optional, unknown fields are ignored, and
malformed entries are dropped with a warning shown in the app.

<!-- generated:schema:start (npm run gen:schema) -->

Top-level fields (all optional; unknown fields are ignored):
  - `name`: studio name, shown in the rail and project list — e.g. "Course Studio"
  - `description`: one line about the studio — e.g. "A video course: lessons, scripts, and slides"
  - `version`: manifest schema version; currently 1 — e.g. 1
  - `template`: mark this project as a studio template: opening it offers "new project from this studio" instead of editing it in place — e.g. true

`theme` — How the studio looks. Parameterized, not raw CSS: an accent re-tints the whole UI coherently (buttons, focus rings, highlights), so every studio stays recognizably Fabulist. Looks only — never trust-gated, and fabulist.local.json may override it.
  - `accent`: named accent color the UI derives its whole accent ramp from — one of "orange" | "crimson" | "magenta" | "violet" | "blue" | "cyan" | "teal" | "green" | "amber" — e.g. "violet"
  - `glyph`: 1–2 characters/emoji shown as the studio's mark in the rail and project list — e.g. "🎓"
  - `docFont`: default document typeface for prose files; the app chrome keeps its own faces — one of "sans" | "serif" | "mono" — e.g. "serif"

`fileTypes` — Typed kinds of files this studio works with, matched by filename glob. A matching file gets the icon and label in the rail, its title derived per titleFrom, and a card in the New File dialog (the filename follows the glob, the template seeds the content). Any file kind can be typed (.md, .html, .json, .py, …) — every textual file and image is already a work file; a file type adds meaning on top.
  - `id` (required): stable identifier — e.g. "lesson"
  - `match` (required): project-relative filename glob; * and ? stay within one path segment, ** spans folders — e.g. "lessons/*.lesson.md"
  - `label`: display label; defaults to the id — e.g. "Lesson"
  - `icon`: 1–2 characters/emoji shown in the file rail — e.g. "🎓"
  - `titleFrom`: "h1" (default), "filename", or "frontmatter:<key>" — e.g. "frontmatter:title"
  - `template`: seed content for new files of this type; {{title}} is substituted — e.g. "---\ntitle: {{title}}\n---\n\n"

`actions` — Commands surfaced in the ⌘K palette (and, for surface "selection", in the highlight toolbar). An action runs a .claude/skills skill, sends a canned prompt, or both.
  - `id`: stable identifier; defaults to a slug of the label — e.g. "simplify"
  - `label`: palette label (required unless a skill names it) — e.g. "Simplify this"
  - `surface`: what the action operates on; "selection" needs highlighted text — one of "selection" | "file" | "project" — e.g. "selection"
  - `skill`: a .claude/skills name to invoke — e.g. "simplify-explanation"
  - `prompt`: instructions sent to the project agent (alongside or instead of the skill) — e.g. "Rewrite this to be clearer without losing precision."

`panels` — Read-only rendered views over project files, opened as ▦ tabs from the rail or palette.
  - `id`: stable identifier; defaults to a slug of the title — e.g. "outline"
  - `title` (required): tab and rail label — e.g. "Course Outline"
  - `source` (required): project-relative file the panel renders — e.g. "outline.md"
  - `view`: how the source is rendered: "markdown" (default) renders prose, "code" shows syntax-highlighted source, "image" displays a picture file, "web" embeds the file as a live page (relative assets and scripts work) — one of "markdown" | "code" | "image" | "web" — e.g. "markdown"

`commands` — Shell commands the studio can run at the project root (dev server, build, tests…), started only by the user from the rail — never by the agent — with the exact command line always shown. Output streams into a log tab; a long-running command keeps a ● running indicator until stopped.
  - `id`: stable identifier; defaults to a slug of the label — e.g. "dev"
  - `label`: rail label (required unless id is given) — e.g. "Dev server"
  - `run` (required): the shell command line, run at the project root — e.g. "npx serve -l 5050 ."
  - `preview`: a localhost URL embedded as a live preview beside the log while the command runs — e.g. "http://localhost:5050"

`permissions` — the gate profile. A manifest can always tighten the gate; loosening requires explicit user trust in the app, stored outside the repo and keyed to the trust-relevant fields, so any change re-prompts.
  - `edits`: "auto" applies the agent's file edits without per-edit approval; only takes effect after the user explicitly trusts the studio in the app — one of "ask" | "auto" — e.g. "ask"
  - `bash`: "deny" removes the shell tool from the agent entirely (tightening never needs trust) — one of "ask" | "deny" — e.g. "ask"
  - `mcp`: project MCP servers (.mcp.json + .claude/settings.json enablement): "none" (default) ignores them, "ask" connects them with per-tool approval, "allow" connects and auto-approves their tools; anything but "none" requires the user to trust the studio — one of "none" | "ask" | "allow" — e.g. "ask"

<!-- generated:schema:end -->

## Behavior notes

**Theme.** A studio names its look; it never writes CSS. `accent` is one of a
named palette and the app derives the entire accent ramp — buttons, focus
rings, selection, comment highlights — from that one hue, keeping lightness
and contrast stock. `glyph` marks the studio in the rail and the project
list. `docFont` picks the default document typeface for prose; the app chrome
keeps its own faces. Theme is looks-only: it is never part of the trust
grant, and `fabulist.local.json` may override any of it per person.

**File types.** A matching file gets the type's icon and label in the rail, its
title derived per `titleFrom` (frontmatter blocks are stripped before `h1`
derivation), and a card in the New File dialog — the filename follows the
glob (`chapters/*.scene.md` + "Cold Open" → `chapters/cold-open.scene.md`) and
`template` seeds the content with `{{title}}` substituted.

Every project — harness or not — treats every textual file (`pages/*.html`,
`data/*.json`, `src/**`) and every raster image as a work file: text opens in
the editor (Markdown gets the prose page, everything else monospace with
syntax highlighting), images open in a read-only image view. A file-type glob
doesn't admit files; it adds meaning on top — the rail icon and label, the
title rule, and a New File card. Other known-binary files (archives,
media) are never work files.

**Actions.** Actions run through the project's agent. `skill` asks the
agent to invoke that skill; `prompt` sends instructions; with both, the skill
is invoked with the prompt as guidance. `surface: "selection"` actions appear
in the highlight toolbar next to Comment and attach the selected text;
`surface: "file"` targets the focused file. Skills not referenced by any
action still appear in the ⌘K palette under **Skills**.

**Panels.** `markdown` renders prose; `code` shows the source read-only with
syntax highlighting picked by extension; `image` displays a picture file;
`web` embeds the file as a live page in a sandboxed frame — relative assets
and scripts inside the project folder work (files are served over an internal
per-project scheme; dotfiles and paths outside the project are never served),
so a studio that produces a website can show the website itself. Asset views
refresh automatically when the agent edits the underlying files.

**Commands.** A studio can declare the processes its work needs — a dev
server, a build, a test run. Commands appear in the rail with Run/Stop, stream
their output into a log tab, and (with `preview`) show the served page live
beside the log. Only the user starts a command, always by explicit click, with
the exact command line shown in the UI — the agent has no path to them (give
the agent shell access via `permissions.bash` instead). Processes are killed
with their whole process tree on Stop and when the app quits. `preview` must
be a localhost URL.

**Permissions and trust.** A manifest can always *tighten* the gate
(`"bash": "deny"` applies unconditionally). Loosening it — `"edits": "auto"` —
only takes effect after the user accepts the studio in the app. That acceptance
is stored **outside the repo** (in the app's user data), keyed to a hash of the
trust-relevant fields: a cloned project can't grant itself anything, any change
to those fields — including by the agent — drops back to untrusted until
re-accepted, and a *new* grant added to the schema re-prompts automatically.
`fabulist.local.json` may override looks but never permissions.

**MCP servers.** A studio can ship external tools: define servers in `.mcp.json`
at the project root, enable them with `enabledMcpjsonServers` in
`.claude/settings.json`, and set `permissions.mcp` in the manifest. Until the
user trusts the studio, project MCP config is ignored entirely (servers are
processes — connecting is already code execution). Once trusted, `"ask"` routes
every MCP tool call through an approval card and `"allow"` auto-approves them.

## The workshop

The **workshop** (open it from the studio entry in the rail, or "Customize
studio…" in the palette) is a dedicated agent conversation whose system prompt
carries this schema. Describe the work — "this is a D&D campaign; I keep
session notes and NPC sheets" — and the agent interviews you, then writes
`fabulist.json`, skills, and CLAUDE.md itself. Every edit goes through the
normal approval flow, and the UI grows the new buttons as soon as the edits
land.

## Sharing a studio

Commit `fabulist.json` and `.claude/` and push. Anyone can then use
**Open folder…** in the library (or clone into `~/Documents/Fabulist/`) to open
the project with its studio intact. A repo that is mostly harness plus a few
seed files works as a template: clone, open, write.
