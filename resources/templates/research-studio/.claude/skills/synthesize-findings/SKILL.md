---
name: synthesize-findings
description: Rebuild findings.md from all source notes — grouped claims, cited by filename, disagreements kept visible.
---

Rebuild `findings.md` from the current state of `sources/`:

1. Read every note in `sources/` and the current `findings.md`.
2. Group what the sources establish into findings — one `##` per finding,
   strongest first. Every finding cites its supporting source notes by
   filename. Where sources disagree, state both positions and which looks
   stronger and why.
3. Anything asserted by only one weak source goes under a final
   "## Thin ice" heading rather than being silently promoted.
4. Update `questions.md`: strike through questions the findings now answer
   (with a pointer to the finding), add new questions the synthesis raised.
5. Reply with one line per finding that changed.
