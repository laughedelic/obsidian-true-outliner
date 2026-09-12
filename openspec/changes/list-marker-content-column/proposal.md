## Why

A bullet followed by two spaces makes the item's deeper children render as raw dashes and raw
checkboxes. Our parser and re-encoder put a list item's content column one past its marker
whatever whitespace follows, so a child is nested, and written, one column short of where
Obsidian's reader requires it; Obsidian then reads the child as a sibling and its descendants,
after a blank line, as an indented code block. Measured in
[docs/research/list-marker-content-column.md](../../../docs/research/list-marker-content-column.md).

## What Changes

- A list item's content column is the column after the marker's whole whitespace run, with a
  tab advancing to the next stop, in the parser and in the width every structural operation
  uses to place a child. A marker alone on its line keeps the one-space column.
- Consequently a child of `-  a` is written at three columns, and `  - b` under `-  a` parses
  as the sibling Obsidian already reads it as.
- A list item turned into a paragraph sheds the whole run after its marker, not one space.
- Unit cover at the parser, the re-encoder and the indent operation; an e2e case asserting the
  written indentation and Obsidian's own reading of it.

**BREAKING** for documents that relied on the old reading: a list nested by exactly two
columns under a bullet followed by two spaces was a child to us and a sibling to Obsidian;
it is now a sibling to both. The tree changes to match what every other reader of the file
already showed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `document-tree-mapping`: "A list item's own lines, and what its children may be" states
  where the content column is.
- `structural-operations`: the content column an indent must reach is the same column, so a
  wide whitespace run is a wide marker for the purposes of the existing widening rule.

## Impact

- `src/parse.ts` — `parseListMarker`'s content column, now exported for the re-encoder.
- `src/reencode.ts` — `markerWidth`, and the marker strip in the list-to-paragraph kind change.
- `tests/reencode.test.ts`, `tests/ops.test.ts`, `e2e/specs/20-structural-commands.e2e.ts`.
- `docs/research/list-marker-content-column.md`.

## Non-goals

- **Normalizing the marker's whitespace on re-encode.** Collapsing `-  a` to `- a` when a node
  is rewritten would remove this class of defect, but it rewrites a line the user did not
  touch, against the minimal-change contract. Parked.
- **CommonMark's five-space fold.** Obsidian's mode has none, and the report is about
  Obsidian's rendering; see the research note.
- **The caret's and the ladder's boundaries.** `contentColumnCh` and `contentBoundaryCh`
  already span the whole run; nothing there moves.
