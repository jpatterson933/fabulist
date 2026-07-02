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
| doc types, actions, panels, permissions | `fabulist.json` |
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
  - `name`: studio name, shown in the rail and project list — e.g. "Novel Studio"
  - `description`: one line about the studio — e.g. "Long-form fiction with continuity checking"
  - `version`: manifest schema version; currently 1 — e.g. 1

`docTypes` — Kinds of documents this studio works with, matched by filename glob. A matching doc gets the icon and label in the rail, its title derived per titleFrom, and a card in the New Document dialog (the filename follows the glob, the template seeds the content).
  - `id` (required): stable identifier — e.g. "scene"
  - `match` (required): project-relative filename glob; * and ? stay within one path segment, ** spans folders — e.g. "chapters/*.scene.md"
  - `label`: display label; defaults to the id — e.g. "Scene"
  - `icon`: 1–2 characters/emoji shown in the document rail — e.g. "🎬"
  - `titleFrom`: "h1" (default), "filename", or "frontmatter:<key>" — e.g. "frontmatter:title"
  - `template`: seed content for new docs of this type; {{title}} is substituted — e.g. "---\ntitle: {{title}}\n---\n\n"

`actions` — Commands surfaced in the ⌘K palette (and, for surface "selection", in the highlight toolbar). An action runs a .claude/skills skill, sends a canned prompt, or both.
  - `id`: stable identifier; defaults to a slug of the label — e.g. "punch-up"
  - `label`: palette label (required unless a skill names it) — e.g. "Punch up dialogue"
  - `surface`: what the action operates on; "selection" needs highlighted text — one of "selection" | "doc" | "project" — e.g. "selection"
  - `skill`: a .claude/skills name to invoke — e.g. "punch-up-dialogue"
  - `prompt`: instructions sent to the writing agent (alongside or instead of the skill) — e.g. "Sharpen this dialogue without changing what is said."

`panels` — Read-only rendered views over project files, opened as ▦ tabs from the rail or palette.
  - `id`: stable identifier; defaults to a slug of the title — e.g. "bible"
  - `title` (required): tab and rail label — e.g. "Story Bible"
  - `source` (required): project-relative markdown file to render — e.g. "bible.md"
  - `view`: how the source is rendered; only "markdown" today — one of "markdown" — e.g. "markdown"

`permissions` — the gate profile. A manifest can always tighten the gate; loosening requires explicit user trust in the app, stored outside the repo and keyed to the trust-relevant fields, so any change re-prompts.
  - `edits`: "auto" applies the agent's file edits without per-edit approval; only takes effect after the user explicitly trusts the studio in the app — one of "ask" | "auto" — e.g. "ask"
  - `bash`: "deny" removes the shell tool from the agent entirely (tightening never needs trust) — one of "ask" | "deny" — e.g. "ask"
  - `mcp`: project MCP servers (.mcp.json + .claude/settings.json enablement): "none" (default) ignores them, "ask" connects them with per-tool approval, "allow" connects and auto-approves their tools; anything but "none" requires the user to trust the studio — one of "none" | "ask" | "allow" — e.g. "ask"

<!-- generated:schema:end -->

## Behavior notes

**Doc types.** A matching doc gets the type's icon and label in the rail, its
title derived per `titleFrom` (frontmatter blocks are stripped before `h1`
derivation), and a card in the New Document dialog — the filename follows the
glob (`chapters/*.scene.md` + "Cold Open" → `chapters/cold-open.scene.md`) and
`template` seeds the content with `{{title}}` substituted.

**Actions.** Actions run through the project's writing agent. `skill` asks the
agent to invoke that skill; `prompt` sends instructions; with both, the skill
is invoked with the prompt as guidance. `surface: "selection"` actions appear
in the highlight toolbar next to Comment and attach the selected passage;
`surface: "doc"` targets the focused document. Skills not referenced by any
action still appear in the ⌘K palette under **Skills**.

**Permissions and trust.** A manifest can always *tighten* the gate
(`"bash": "deny"` applies unconditionally). Loosening it — `"edits": "auto"` —
only takes effect after the user accepts the studio in the app. That acceptance
is stored **outside the repo** (in the app's user data), keyed to a hash of the
trust-relevant fields: a cloned project can't grant itself anything, any change
to those fields — including by the agent — drops back to untrusted until
re-accepted, and a *new* grant added to the schema re-prompts automatically.
`fabulist.local.json` may override looks but never permissions.

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
seed documents works as a template: clone, open, write.
