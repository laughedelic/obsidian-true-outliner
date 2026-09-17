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

### D2 — A mark, collapsed to zero, plus the span Obsidian wrapped it in

The mark covers exactly those characters, whatever Obsidian made of them. That is the point of
marking rather than selecting: measured, the run lands in a `.cm-hmd-list-indent` wrapper for
spaces under a list item, a bare `.cm-indent` for a tab, a `.cm-indent-spacing` for a leftover run
under a heading, and, inside a fence, in a highlighting token that may hold the whitespace and the
code after it together.

Zero width rather than a stated one, because CM6 may split a mark across those spans and a stated
width would be paid once per piece, where zero survives the split.

The mark alone is not enough: CM6 nests Obsidian's own span outside it, and that span's width is
stated — measured at 62px for two spaces and 82px for a tab against a 46px column. So
`70-source-indent.css` zeroes that span too, and by `width`, `min-width`, `padding` and `margin`
together, since `.cm-indent-spacing` carries its run as `padding-left` on a `border-box` element
where a zero width leaves the padding standing.

### D3 — The wrapper is collapsed only where the mark covers the whole run

Obsidian's span holds the run as it quantised it, the node's own indentation and anything past it
together, so zeroing it on a line that carries more discards the surplus D1 deliberately left
standing. The rule is therefore keyed on the mark's own coverage — `SOURCE_INDENT_WHOLE_CLASS`,
set from the line's leading run — rather than on the kind of line.

Keyed on the kind instead, two shapes lose indentation that is content: a fence's interior (all
six spaces of `      deeper`) and, measured after the first version shipped this rule as a
fence-only exclusion, an ordinary paragraph continuation (`      second deeper` at 46px, the same
column as the line above it). One rule covers both, and a fence needs no exception of its own.

What remains is a residue rather than a defect: on a line the rule skips, the surviving
indentation renders as Obsidian quantised it, up to one quantum wider than its own characters —
48.36px where four spaces measure about 33.7px. The numbers are in the research note.

### D4 — The fact is published, not the rendering decision

`indentCh` says what the node's own indentation IS on each line; whether that renders at no width
is the editor's decision, in `decorations.ts` and the stylesheet. The backlinks footer reads the
same facts and renders every row's content inline (D18), with no source indentation to collapse —
so it takes the field and ignores it, exactly as it does for `supplementalDepth`.
