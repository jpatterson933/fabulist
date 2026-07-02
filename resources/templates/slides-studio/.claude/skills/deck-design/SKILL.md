---
name: deck-design
description: Polish the deck's visual design — type scale, contrast, spacing, slide rhythm — editing the deck and deck.css.
---

Do a design pass on the deck:

1. Read `deck/index.html` and `deck/deck.css`.
2. Judge it like a presentation designer: is the headline readable from the
   back row (type scale, contrast), does each slide have one focal point,
   is spacing consistent slide to slide, do title/section/content slides
   feel like one family?
3. Fix what you find. Shared improvements go in `deck/deck.css`; only
   slide-specific structure changes go in the HTML.
4. Do not add frameworks, external fonts, or CDN links. System font stacks
   and hand-written CSS only.
5. Reply with a short list of what changed and why — one line each.
