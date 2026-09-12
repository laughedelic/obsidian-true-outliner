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

**Non-Goals:**

- Rewriting existing whitespace, or changing the indent unit inference.

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

## Risks / Trade-offs

- **Documents nested two columns under a two-space bullet re-parse as flat** → they were flat to
  Obsidian all along; the outline now shows what Obsidian renders. Named as breaking in the
  proposal.
- **A wider column widens every child an operation writes under such an item** → the existing
  widening rule already does this for ordered markers, and the tests for it are the model for
  the new case.
