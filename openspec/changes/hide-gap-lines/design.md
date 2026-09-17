## Context

The rendering question and the cost question are separable, and
[`docs/research/gap-line-hiding`](../../../docs/research/gap-line-hiding.md) answers both against a
real instance before any of this was designed. What follows records the decisions that note's
findings force, and does not restate its figures.

## D1 — A line decoration with a stylesheet height collapse, not a block replacement

The zoom hides lines by replacing them, and reaching for the same primitive here is the obvious
move. The note gives three reasons it is the wrong one: a view plugin may not emit a decoration
that replaces a line break, a range reaching `doc.length` takes the backlinks footer's anchor with
it, and a gap line is exactly where a fold cover, a node cover's background and a zoom's tail range
already end.

So the row is COLLAPSED, not removed. It keeps its element, its place in CodeMirror's line order
and its extent in the document. The measured consequence is that the three mechanisms above need no
coordination at all — not that they were made to agree, but that there was never a second claim on
the row.

**This decision is OPEN, and the reason is a fourth cost it did not weigh.** A CSS collapse is
invisible to CodeMirror's height map until it measures the DOM, and it measures only the rendered
viewport; every gap row outside it is counted at a full line's height. Measured on a 600-line note:
`contentHeight` reads 13921px at open against a true 9720.5px, settling only as the reader scrolls
through. The note carries the figures. A block replacement does not have this defect — it records
the collapse on the height-map node, so an unrendered range is exact — which means the three costs
above are not a clean win over it, they are a trade against this one. Nothing here is decided until
that trade is.

## D2 — The setting emits a decoration where the layer previously emitted none

`gapLineDecoration` was emitted only for a gap line that carries a guide. A top-level gap carries
none, so the document's outermost gaps had no decoration to hang a class on. The setting is
therefore a second, independent reason to emit one, and `guides` becomes optional on that
decoration rather than its precondition.

This is the only place the change widens an existing predicate, and the note records the negative
control: without it the outermost gaps stay open while every nested one closes.

## D3 — The caret's row is protected by an existing invariant, not by a new check

A SINGLE EMPTY cursor on a blank line is a provisional position, which carries a full per-line
fact; a gap line by definition carries none. The two sets are disjoint, measured over every gap line
two generators produce, so "never collapse the row a lone caret is on" needs no code.

The precondition is load-bearing. `computeProvisional` gates on `sel.empty` and a single range, so a
non-empty selection's head or one of several ranges resting on a blank line gets no fact and the row
collapses. Both are reachable — an escalated node cover ends on the gap line it owns, and a
programmatic multi-range placement is outside `content-space-caret`'s jurisdiction — and neither
strands a visible caret, because no caret is drawn at a selection head that is not a lone cursor.
The spec states the precondition rather than the unconditional claim an earlier draft made.

Stating it as a spec requirement anyway is deliberate. The property is a consequence of where
`computeProvisional`'s gate sits, and a future change narrowing that gate — to the plugin's own
dispatch, say, rather than to any lone cursor on a blank line — would strand a caret on a
zero-height row with nothing failing. The requirement is what makes that a spec break.

The unit property in `tests/decorate.test.ts` does NOT guard that gate: it guards
`materializeProvisional`, in the pure layer. `computeProvisional` lives in `decorations.ts`, which
imports `obsidian` and has no unit test, so only the e2e caret case reaches it, and only for the
single-cursor path. That gap is recorded rather than closed.

## D4 — The costs are stated, not mitigated

Three things the outline stops being able to say, all recorded in the note: a run of blank lines
reads as one, the loose/tight distinction between list items disappears, and two sibling paragraphs
render like one wrapped paragraph unless a block marker separates them.

None is fixed here, and the first two cannot be. Hiding gaps means erasing the distinction markdown
draws with a blank line; loose-versus-tight is that distinction in the one place it is visible
outside the editor, and no rule that hides some gaps rescues it, because zero blanks and one are
exactly the two cases.

What the change does instead is say so — in the setting's own description, where a reader deciding
whether to turn it on is the one who needs it. A "tidy gaps" pass, which would make the first cost
moot by removing what cannot be seen, stays parked where it already is.

## D5 — One global appearance setting, off by default

Off by default because the outline's job is to be a faithful picture of the file, and this setting
trades some of that for rhythm. Global rather than per-note or per-tab, like every other setting in
its slice; a reader who wants the file's punctuation back turns it off, and nothing in any note
records which way it was set.
