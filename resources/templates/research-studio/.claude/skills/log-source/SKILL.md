---
name: log-source
description: Capture a URL, paper, or pasted text as a structured source note under sources/.
---

The user wants to log a source (they'll give a URL, a citation, or pasted
text). Create `sources/<slug>.source.md` for it:

1. If it's a URL, fetch it. If it's pasted text, work from that.
2. Fill the frontmatter (`title`, `url`, `found` = today's date) and the three
   sections: **What it claims** (the source's own position, 2-4 bullets),
   **How solid is it** (method, sample, incentives, date — be skeptical),
   **Quotes worth keeping** (verbatim, short).
3. Check `questions.md`: if this source bears on an open question, note which
   one at the bottom of the source note.
4. Reply with one line: the filename and the single most useful thing in it.
