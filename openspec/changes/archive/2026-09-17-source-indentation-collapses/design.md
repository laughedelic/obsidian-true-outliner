## Context

See proposal.md — Why, for the defect, and `docs/research/source-indentation-width` for the
measurement pass this rests on: what each shape renders today, which element holds the leading
run, and how each of them states its width.

The layer this lands in is already shaped for it. `decorate()` publishes per-line facts and
nothing else; `decorations.ts` turns facts into CM6 decorations, with a separate view plugin per
mark (`computeOrderedDigits`, `computeSurplusMarkerSpace`) rather than one builder that has to
order a `Decoration.mark` against the `Decoration.line` at the same position; and `styles/` holds
one part per feature. This change adds one fact, one plugin, one part.

## Goals / Non-Goals

**Goals:**

- One visual column per tree level, for every kind, whatever whitespace the file used to write it.
- A run identified from the parse rather than from the rendering, so what collapses is the node's
  own indentation and not whatever whitespace a line happens to start with.
- A mechanism that does not depend on which element Obsidian wrapped the run in, since that
  varies with the shape and with the reader's own indentation-guide setting.

**Non-Goals:**

- Touching a list item's run, which is sized to its hang because it carries the native marker.
- Touching a run that states a depth of its own rather than restating one (D1).
- The caret's own contract: positions inside a collapsed run stay addressable and share one x.
  Changing that is `content-space-caret`'s boundary rule, one capability over.
- Sizing the collapsed run to anything. Zero is the value; the depth rules supply the column.
- Following the caret: the collapse is unconditional, so a line does not move when the caret
  enters it. The same reasoning `10-editor.css` records for the native guide it suppresses —
  a line that blinks between two columns under the reader is worse than either column.

## Decisions

### D1 — The run is the node's own indentation, under a list item, measured on its first line

`decorate()` publishes `indentCh` per line: how many leading characters of that line fall inside
the node's first line's indentation width — and only for a node with a LIST-ITEM ANCESTOR, which
is the one place a non-list line's whitespace restates a depth the rules already state. A child of
an item is written to the item's content column; a line under a heading, or at the top level,
takes its depth from the ancestor and its whitespace says nothing about it. Collapsing there
removes width and puts nothing back, and at the top level it removes the only cue that a
four-space line is an indented code block.

Three further consequences, each deliberate:

- **A line indented deeper than its node keeps the surplus.** Code inside an indented fence is the
  case that matters, and the only one where the extra run is content rather than structure.
- **A line indented less gives up its whole run and no more**, since the count stops at the first
  non-whitespace character.
- **A tab that would straddle the boundary stays whole.** Half a tab is not a position the
  document has, so `indentPrefixCh` takes a character only if it fits entirely.

Characters rather than columns, for the reason `parseListMarker` already records for its own
pair: a tab is one character and one to four columns, and only the character count is a valid
index into the string.

### D2 — An undisplayed mark over the node's own indentation, and the span Obsidian wrapped it in

The mark covers exactly those characters, whatever Obsidian made of them. That is the point of
marking rather than selecting: measured, the run lands in a `.cm-hmd-list-indent` wrapper for
spaces under a list item, a bare `.cm-indent` for a tab, a `.cm-indent-spacing` for a leftover run
under a heading, and, inside a fence, in a highlighting token that may hold the whitespace and the
code after it together.

`display: none` rather than a zero width, and rather than a `Decoration.replace`. A box of no
width still PAINTS, and its glyphs landed on the line's own first word — clipping them hid the
native caret instead. A replacement draws nothing either, but CM6 pads one with `cm-widgetBuffer`
elements, and the native caret drawn against one of those is a different height than the caret
drawn against text. An undisplayed mark reserves nothing and paints nothing, so the caret at the
boundary stands against the line's own first character.

One exception, which the caret forced: a line whose content is ONLY the node's own indentation —
what Shift+Enter opens — takes the REPLACEMENT, because an undisplayed mark leaves that line with
nothing rendered at all and `coordsAtPos` returns null there. The replacement's buffer element is
something for the caret to stand against, at the line's own column, and the height that buffer
costs needs a boundary with text to show at.

The mark alone is not enough: CM6 nests Obsidian's own span outside it, and that span's width is
stated from the DOCUMENT — measured at 62px for two spaces and 82px for a tab against a 46px
column, and it outlives the characters the mark undraws. So `70-source-indent.css` puts that span
back to `width: auto`, with `min-width`, `padding` and `margin` zeroed too, since
`.cm-indent-spacing` carries its run as `padding-left` on a `border-box` element. Auto rather than
zero, because the span still holds the surplus, whose own glyphs are the width the line is owed.

### D3 — Only the node's OWN indentation is hidden, and no width is stated for what is past it

The distinction the fact layer carried from the start and two renderings lost. Obsidian's span
holds the run as it quantised it — the node's own indentation and anything past it together — so
zeroing that span takes the surplus with it: measured, `      second deeper` at 46px, the same
column as the flush line above it. A replacement widened to the whole run loses it the other way:
six positions rendering at one x, which reads as the caret standing still while the document
changes.

Hiding the node's own indentation ALONE needs no width stated anywhere. The surplus renders as
itself, in its own font, which is what makes the two shapes a stated width could not get right
come out correct: a space in a fence's CODE font measures 8.43px against the prose font's 5.08px,
and a tab renders to a tab stop rather than to a count of advances. Measured, with a 46px column:
`      second deeper` at 66.3 (46 + 4 × 5.08), `      deeper` inside a fence at 95.7 (62 + 4 ×
8.43), and a tab-indented child at 46.0, level with a space-indented one.

### D5 — Hidden characters are chrome, so the caret is floored at them

Hiding characters is not enough on its own: a press that walks through them looks dead, since
every position among them renders at one x. `caret.ts` floors motion and placement at the node's
own indentation, exactly as it already does at a list marker — both are characters that state the
tree's shape rather than the reader's text, and outline mode draws neither.
`EditorView.atomicRanges` carries the same rule to every gesture that does not come through the
plugin's own keys.

The floor has to hold in the predicate, both resolvers and the motion planner together: with it in
motion alone, a left-then-right round trip stopped returning where it started, caught by
`caret.test.ts`'s own property. `own-indent.ts` states which characters are hidden, once, for the
decoration layer and the caret layer together, so the two cannot disagree.

Deletion is deliberately untouched and stays stock: Obsidian's own editor removes a whole indent
unit inside leading whitespace. An earlier version made the run atomic over its WHOLE length,
which turned Backspace at a run's text start into a six-character deletion — a block leaving its
parent in one press.

### D4 — The fact is published, not the rendering decision

`indentCh` says what the node's own indentation IS on each line; whether that renders at no width
is the editor's decision, in `decorations.ts` and the stylesheet. The backlinks footer reads the
same facts and renders every row's content inline (D18), with no source indentation to collapse —
so it takes the field and ignores it, exactly as it does for `supplementalDepth`.
