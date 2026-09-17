# Hiding gap lines: the mechanism, and what the outline gives up to do it

A blank line between two blocks is a node's `trailingGap` (`model.ts`) — owned by the node above
it, never a node of its own, and already not a position the caret may occupy
(`content-space-caret`). Every layer above the parse therefore already treats it as a non-place.
Only the rendering still draws it, as an empty row between every paragraph and every loose list
item, while a tight list has no such row at all. A setting that collapses those rows was proposed
on the grounds that the outline would then step one node at a time whatever the kind.

Two questions had to be answered before the setting was worth building, and this note answers
both: which mechanism collapses a row without disturbing anything anchored near it, and what the
outline stops being able to say once the rows are gone. The second is the more interesting half —
the mechanism holds, and the cost is real and unavoidable.

## The mechanism: a line decoration, not a block replacement

`zoom-hiding-mechanism` established that block-level replace decorations take lines out of the
layout entirely, and the zoom is built on them. Reaching for the same primitive here is the
obvious move and the wrong one, for three reasons that are already recorded rather than newly
measured:

1. **A view plugin may not emit one.** CodeMirror refuses decorations that replace line breaks
   from a plugin source, which is why `zoom-decorations.ts` is a `StateField`. Every decoration in
   `decorations.ts` comes from a view plugin, so gap hiding would need a second, parallel source.
2. **A range reaching `doc.length` swallows the backlinks footer.** The footer's widget anchors
   there, and `zoom-hiding-mechanism` measured that no position strictly inside a trailing range
   leaves that anchor outside it. A document's final gap is exactly such a range.
3. **Gap lines are where two existing mechanisms already end.** A fold cover ends on the trailing
   gap line its subtree owns, and so does a node cover's selection background; a zoom's tail range
   begins at the last visible line's end, which is a gap line whenever the zoom root has one. A
   second block replacement would have to be kept disjoint from all three, on every state.

A `Decoration.line` carrying a class, with the height taken to zero in the stylesheet, is disjoint
from all of it by construction: the row keeps its element, its position in CodeMirror's line order
and its extent in the document. Nothing downstream has to learn about the setting.

## What the mechanism measures

**Measured 17 September 2026**, Obsidian 1.13.7 (installer 1.5.8, Linux container), against the
real feature with the whole decoration stack live and the backlinks footer mounted — driven from a
throwaway `99-gap-hiding-probe.e2e.ts`. The fixture is an eleven-line note: a heading, a two-line
paragraph, a paragraph, two list items, and the five gaps between and after them.

| | setting off | setting on |
| --- | --- | --- |
| `.cm-content` box height | 700.31px | 613.95px |
| CodeMirror's own `contentHeight` | 700.31px | 580.31px |
| Sum of the rendered rows | 291.81px | 171.81px |
| `.cm-line` elements | 12 | 12 |
| Height of every blank row | 24.00px | **0.00px** |
| `coordsAtPos` → `posAtCoords` round-trips on every content line | yes | yes |

Two things the table is making precise:

- **The rows survive; only their height changes.** The element count is identical, and every
  content row's class list and height are byte-identical to its unhidden rendering — checked
  row by row, not sampled. The collapse composes with the established decoration sources rather
  than displacing them, which is the composition question `outline-decorations-postmortem` exists
  to insist on asking first.
- **The seams close exactly.** For every collapsed gap the row above ends and the row below begins
  at the same coordinate, to 0.01px. A guide running through the gap therefore stays continuous:
  there is no longer a row between its neighbours to break it.

The third thing it makes precise is a DEFECT, and an earlier draft of this note read the same two
numbers as their own refutation — "CodeMirror's height map stays coherent, its own `contentHeight`
moves with the DOM". Both `contentHeight` and the rendered-row sum fall by exactly 120.00px, which
is the five gap rows at 24.00px each, so the height map agrees with the rows it has MEASURED. The
box falls by 86.36px, and the difference is not the point. The point is what happens to the rows it
has not measured, which an eleven-line fixture inside one viewport cannot show at all.

## The height map inflates every gap row it has not rendered

A CSS collapse is invisible to CodeMirror until it measures the DOM, and it measures only the
rendered viewport. `measureVisibleLineHeights` iterates the rendered children alone, and
`HeightMapText.updateHeight` takes a measured height only when one is available for that line —
otherwise it falls back to `max(widgetHeight, oracle.heightForLine(...))`, which for a
non-wrapping line is `oracle.lineHeight` and is never zero.

**Measured 17 September 2026**, same instance, on a 600-line note: 300 paragraphs each followed by
one blank line, so half its rows collapse.

| | `contentHeight` | `scrollHeight` |
| --- | --- | --- |
| Setting off | 14785px | 14893px |
| Setting on, at open | 13921px | 14029px |
| Setting on, after scrolling to the end and back | **9720.5px** | 9829px |

Walking down the document reads 12625 → 11329 → 10009 → 9864.5, monotonically, as each gap row
enters the viewport and is measured at zero for the first time. So at open CodeMirror believes the
note is 43% taller than it is, and the scrollbar thumb grows by that much over one pass through it.
It is not a one-time settling either: any refresh that marks the map outdated — a window resize, a
font change — re-inflates every row not currently rendered.

This is the property the block replacement has and this mechanism does not. A block-level
replacement records the collapse on the height-map node itself, so an unrendered hidden range is
exact without ever being measured. D1 weighed three costs of that mechanism and did not weigh this
one against them, because this one was not known until the note was challenged.

The claim "nothing downstream has to learn about the setting" is therefore false as written:
CodeMirror's height oracle has to, and cannot.

Also measured, and each one a mechanism that could have broken:

- **Motion is unchanged.** `ArrowDown` twice from column 3 of the two-line paragraph lands at
  column 3 of the paragraph below, crossing the collapsed gap in one press with the goal column
  intact — which is `content-space-caret`'s existing requirement, holding unmodified. A click on a
  list item lands on that list item.
- **The footer renders.** Nine of its elements are present with the setting on, against a document
  ending in a gap. This is the case a block replacement would have lost.
- **A node cover composes with the collapse.** A cover of `Alpha` in `Alpha` / blank / `Beta` runs
  to the gap line the node owns, and that row measures
  `cm-line to-decor-gap-hidden to-decor-node-selected` at 0.00px: CodeMirror merges the two
  same-position line decorations from their separate providers rather than one displacing the
  other, and the cover ends on the last content row. An earlier draft of this note reasoned this
  out instead of measuring it, and named it among the mechanisms task 1.3 had probed when it had
  not.
- **A top-level gap needs the decoration it did not previously get.** The last gap row measures
  `cm-line to-decor-gap-hidden` with no `to-decor-guides`: at the top level there is no guide to
  draw, so `gapLineDecoration` was never emitted for such a row at all. Collapsing it is a second,
  independent reason to emit one, and without that the document's outermost gaps would have stayed
  open while every nested one closed.

## The caret is never on a collapsed row, and not by a special case

The row the caret occupies must not collapse under it. Two independent properties make that true,
and neither is code this change adds.

`content-space-caret` already states that a gap line is not addressable: vertical motion crosses a
gap in one press, horizontal motion plans across it directionally, and a click or a programmatic
placement resolves through gap ownership to the owning node's content end (`src/caret.ts`).

Where a caret comes to rest on a blank line anyway — the plugin's own provisional dispatch, or a
programmatic placement that requirement deliberately does not correct — `decorations.ts`'s
`computeProvisional` treats it as a PROVISIONAL POSITION and gives that line a full
`LineDecorationFact`. A line with a fact is not a gap line in the render walk, so it never takes
the collapse class. The property that matters is therefore that the two sets never overlap, and
that both halves are total.

**Measured at the pure level**, 2,000 `arbMarkdownText` documents and 600 `arbTree` documents
(`tests/generators.ts`, fast-check seed 42), over every line `computeLineGuides` calls a gap line —
24,248 of them — with a caret at column 0 and at end of line:

| | count |
| --- | --- |
| Gap lines | 24,248 |
| Gap lines where a caret fails to materialize a provisional position | **0** |
| Gap lines that also carry a `decorate()` fact | **0** |

So the caret's own row always has a fact, and a row with a fact is never collapsed. The safety
property falls out of the layers as they stand.

**Measured in the rendered case too**, in the same probe. Enter at the end of `Alpha` in `Alpha` /
blank / `Beta` leaves `Alpha\n\n\n\nBeta\n` with the caret on line 2, and the three rows render:

| Row | Text | Classes | Height |
| --- | --- | --- | --- |
| 1 | | `cm-line to-decor-gap-hidden` | 0.00px |
| **2** | *(caret)* | `cm-line to-decor-block to-decor-current cm-active` | **24.00px** |
| 3 | | `cm-line to-decor-gap-hidden` | 0.00px |

The position renders as exactly one visible row, with the separation that makes it a position
collapsed on both sides. That is better than the unhidden rendering rather than merely as good:
with the gaps drawn, the keypress opens three blank rows and the reader has to work out which of
them the caret is on.

## What the outline gives up

The mechanism is cheap. The cost is not in the mechanism, and it is not fixable — it is what the
setting is for.

**A run of several blank lines is indistinguishable from one.** Measured in the same probe:
`Alpha` / three blanks / `Beta` and `Alpha` / one blank / `Beta` both leave 0.00px between the two
content rows. Nodes own their gaps verbatim (`model.ts` D2), so a run survives every structural
operation and round-trips into the file. With the setting on, nobody can see it is there, and
nobody will clean it up. The file stays valid and turning the setting off reveals it, so nothing is
lost permanently — but the outline stops being a faithful picture of the file, which is the
isomorphism the README claims.

**The loose/tight distinction disappears, and its consequences do not.** A blank line between two
list items is that item's trailing gap, and it is also what makes the list LOOSE: Obsidian's
reading view wraps each item in a paragraph and spaces them differently, and so does every other
renderer of the file. `docs/research/open-questions` already records an indent leaving "the old
separator blank line with the untouched sibling (a loose list — same tree)" and calls it cosmetic.
It is cosmetic while the outline shows the blank line. Once the outline refuses to show it, the
outline says "tight" and the reading view says "loose", and there is no way to tell from inside the
editor which one a list is. This is the sharpest cost, and it is inherent: hiding gaps means
erasing the one distinction markdown draws with a blank line that is visible outside the editor.
Hiding only single-blank gaps does not rescue it, because zero blank lines and one are exactly the
tight and loose cases, and both would render with no row.

**Two sibling paragraphs and one wrapped paragraph render alike.** `Alpha` / blank / `Beta` is two
nodes; `Alpha` / `Beta` is one node of two lines. With the gap collapsed both are two rows on the
same column, and the only thing left that tells them apart is the block marker each node's first
line carries. The setting therefore has a silent dependency on `markerVisibility`: at
`with-children`, two childless sibling paragraphs and one wrapped paragraph are identical on
screen. That is the opposite of the consistency the setting exists to give, in the one
configuration where it bites.

## What does not change, and why that is most of the answer

The editing grammar is untouched, and the reason is structural rather than careful: the setting
changes one class on one decoration. Gaps are parsed, owned, encoded and operated on exactly as
before, and a note is byte-identical whichever way the setting is set.

Two behaviours worth naming because they look like they should break and do not:

- **Backspace across a gap is not a keystroke trap.** `docs/research/open-questions` recorded
  Backspace taking one keystroke per gap line before anything merged; `node-edit-enforcement`'s
  D10 replaced that with cursor-derived recognition, which merges from a node's content start
  "whatever the gap width". A collapsed multi-line gap therefore costs one press, not three.
- **Undo and redo cannot drift.** The decoration is derived from each state, never mapped, which
  is the same property `zoom-decorations.ts` records for the zoom's own ranges.

## Verdict

The three costs in "What the outline gives up" are not defects to fix later — the first two are what
the setting means, and the third is a note for its description. Where a reader wants the outline to
keep telling them how their file is punctuated, the answer is to leave the setting off.

The height map was the open question and is now settled: **the CSS collapse stands and the settling
is accepted.** A CSS collapse cannot be made exact — there is no way to tell CodeMirror a line's
height short of replacing it — so the choice was between a scrollbar that settles as the reader
scrolls and a block replacement kept disjoint from the fold cover, the node cover and the zoom's own
ranges, stopped short of the document end to leave the footer's anchor outside it. Tried against the
real thing, the settling is not a defect a reader trips over, and the alternative is a second
decoration source maintained on every state in exchange for an exact scrollbar on a setting that is
off by default.

So all four costs are the same kind of thing: a preference's price, named rather than paid down. The
setting carries an EXPERIMENTAL chip and states three of them in its own description — the run of
blanks, the loose/tight distinction, and the settling scrollbar — so a reader turning it on has
agreed to them. The fourth, two siblings reading as one wrapped node, is left to the marker layer it
depends on.

What this note records for anyone who reopens the question: D1 chose the line decoration without
knowing it was choosing, and the figures above are what the choice is now made against. If the
setting ever stops being opt-in, the trade changes with it.
