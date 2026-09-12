## Context

Two functions decide where a list item's content begins for structural purposes: the parser's
`parseListMarker` (what nests under an item) and the re-encoder's `markerWidth` (where a child
is written). Both counted one space. How Obsidian measures the same column, and the shape that
turns the one-column shortfall into an indented code block, are in
[docs/research/list-marker-content-column.md](../../../docs/research/list-marker-content-column.md).

## Goals / Non-Goals

**Goals:**

- One content column per list item, read and written alike, equal to what Obsidian nests at.
- Every line with a single space after its marker keeps its exact parse and its exact
  re-encoding.
- A run wider than one space can be SEEN on its line, and REMOVED with the key that removes a
  character, from the column the caret already lands on.
- A line an operation rewrites comes out with a one-space run.

**Non-Goals:**

- Rewriting whitespace on a line no operation touches, or changing the indent unit inference.

## Decisions

**One measurement, in the parser, shared by the re-encoder.** `markerWidth` now asks
`parseListMarker` for the content column instead of keeping its own regex, so the two cannot
drift again: whatever the parser requires of a child is what the re-encoder writes. The
alternative — a second regex in the re-encoder widened the same way — would leave the
invariant to a test.

**Follow Obsidian's mode on wide runs.** CommonMark folds five or more spaces back to one;
Obsidian's Live Preview mode does not. The report is about Obsidian's rendering, the two agree
on every run of one to four, and a single rule is easier to state than a clamp nobody's
document exercises.

**Measure tabs as columns.** A tab after a marker advances to the next stop, as leading tabs
already do in `indentWidth`. Obsidian's mode counts a tab as one character there; the
difference is confined to a tab directly after a marker, which the round-trip corpus does not
contain and which no operation of ours writes.

**Mark the surplus, not the run.** The mark covers the run past its first character, so
`- a` carries nothing and `-  a` carries one marked space: what is marked is exactly what
Backspace removes. A mark decoration in its own view plugin, like the ordered digits', because
a `Decoration.mark` on a line whose start carries a `Decoration.line` is ordered by CM6 across
sources but by hand within one builder. Both of a task item's columns are examined, since
`- [ ]  bar` has its run after the task marker. The rule keeps the span's width with
`white-space: pre` — a whitespace-only span at a wrap point otherwise collapses to nothing —
and colours it with the theme's own highlight and a dotted rule, so it reads in light and dark.

**The mark follows the gutter; the text follows the mark.** The marker-sizing rules were gated
on a marker followed by EXACTLY one space, so that `-  a`'s text stayed on its one-space
siblings' column; the surplus then sat inside the gutter's slack — measured, at 5.1–10.2px on
a line whose text began at 14 — a highlight in a column the caret cannot reach, between a
bullet and text that had not moved. The gate is now "followed by a space"
(`SPACED_MARKER_CLASS`), so the bullet and its own space fill the gutter on every such line,
the mark begins where a one-space item's text begins, and the text begins where the mark ends.
The text moving right by the run's width is the point: that is where the content column is. A
tab after the marker stays outside the gate and on its own stop, as before.

**A press on the mark removes the run.** The same edit Backspace makes at the content start,
reachable without first finding that column. The listener takes `zoom-click.ts`'s shape:
`pointerdown` in the capture phase on the editor's element, since a touch screen produces no
mouse event and CM6's own handler would otherwise start a selection drag from the mark; the
trailing mouse events of a handled press swallowed, since they would place a caret from
coordinates that now mean something else. The run is re-read from the document at the press
rather than carried on the mark, and dispatched as a `delete` user event, which the classifier
reads as a within-node edit: wider than one character it matches no chrome shape, and one
character wide it is the surplus rule above.

**Backspace at the content start removes the surplus, and the rule lives in the classifier.**
`crossesViaChromeDeletion` recognizes the marker-space shape only when `surplusMarkerSpace`
reports nothing at the deletion's end; otherwise the keypress is a `within-node-edit` and
the native deletion runs. The enforcement layer is not widened to match, deliberately: it is
consulted only for boundary-crossing edits, so the shape never reaches it, and a one-character
range that fell through its merge branch would be measured against the node's whole subtree
(the heading mis-reading recorded in `docs/research/heading-content-start-backspace`). One
predicate in `ops.ts` serves the classifier and the decoration, so what is marked is what the
key removes. The surplus is counted from the marker character the run follows — a list
marker's last, a heading's `#`, a task marker's `]` — so a paragraph's indentation, which the
content-column rule also spans, is nobody's run.

**Cmd-Left needs no binding; Mod-Backspace inherits the boundary.** The caret's boundary
(`contentBoundaryCh`) already spans the whole run, and the placement filter resolves every
column inside it to the content start. CodeMirror's `cursorLineBoundaryLeft` dispatches a
`select` transaction to the row's start, which that filter resolves to column 3 on `-  a` —
measured by dispatching the same shape, since the key is bound on macOS only. Mod-Backspace
(`delete-to-content-start`) plans its deletion to the same boundary, and at the boundary
defers to the Backspace path, which now deletes the surplus. So both land on column 3, and
one more Backspace removes the space.

**Normalize the run only on a line an operation rewrites.** `reencodeForDestination`'s
no-conversion branch collapses a list item's run to one space, and shifts the item's
continuation lines and children by the column change as well as the indentation delta, so
each keeps its depth relative to the text. The parent under which a child arrives is not
rewritten and keeps its run — the mark shows it, and Backspace removes it. A tab after the
marker is collapsed too: its column is a tab stop away from the marker, which is the widest
of these shapes and the one Obsidian's mode and CommonMark disagree on.

## Risks / Trade-offs

- **Documents nested two columns under a two-space bullet re-parse as flat** → they were flat to
  Obsidian all along; the outline now shows what Obsidian renders. Named as breaking in the
  proposal.
- **A wider column widens every child an operation writes under such an item** → the existing
  widening rule already does this for ordered markers, and the tests for it are the model for
  the new case.
- **An indent now rewrites more than indentation on a two-space item** → one space of change
  on a line the operation rewrites anyway, and the item's subtree moves with it; the
  round-trip and property suites hold because they generate one-space runs.
- **The mark is one more thing on the line** → it appears only where a run is wider than one
  space, which a plain Obsidian document never has, and it carries the explanation in its
  title.
- **A two-space item's text no longer aligns with its siblings'** → by exactly the marked
  surplus, which is the content column it really has; before, the misalignment was hidden and
  the cause with it. The caret requirement's scenario is amended to say so.
