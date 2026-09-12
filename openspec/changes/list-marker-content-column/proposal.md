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
- The surplus of a marker's run is MARKED in outline mode — the spaces past the one the
  marker needs, with a title saying what they are and what removes them — so the column that
  moved is visible on the line that moved it.
- Backspace at the content start of such an item deletes the surplus space instead of being
  read as a merge intent; the merge is recognized once the run is down to one character.
  The caret already resolves every column inside the run to the content start, so that is
  the one column the surplus can be removed from, and where Cmd-Left and Mod-Backspace land.
- A structural operation that rewrites an item's first line writes its run as one space:
  indent, outdent, a re-encoding move, a paste. A line the operation leaves alone keeps its
  run.
- Unit cover at the parser, the re-encoder, the classifier and the indent operation; e2e cases
  for the written indentation and Obsidian's reading of it, the mark, the Backspace and the
  placement.

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
  wide whitespace run is a wide marker for the purposes of the existing widening rule; a new
  requirement has a rewritten first line carry a one-space run.
- `transaction-classification`, `node-edit-enforcement`: the marker-space Backspace is a merge
  intent only when the run is the one character the marker needs; wider, it is an ordinary
  deletion of the surplus.
- `outline-decorations`: a new requirement marks the surplus run.

## Impact

- `src/parse.ts` — `parseListMarker`'s content column, now exported for the re-encoder.
- `src/reencode.ts` — `markerWidth`, the marker strip in the list-to-paragraph kind change, and
  `normalizeMarkerRun` in the no-conversion re-encoding.
- `src/ops.ts` — `surplusMarkerSpace`, read by `src/classify.ts` and the decoration.
- `src/plugin/decorations.ts`, `styles/10-editor.css` — the mark and its rule.
- `tests/reencode.test.ts`, `tests/ops.test.ts`, `tests/classify.test.ts`;
  `e2e/specs/20-structural-commands.e2e.ts`, `e2e/specs/57-marker-surplus-space.e2e.ts`.
- `docs/research/list-marker-content-column.md`.

## Non-goals

- **Normalizing a run on a line no operation rewrites.** A parent's `-  a` keeps its run when
  a child arrives under it; only the line an operation rewrites anyway is written with one
  space. Rewriting the rest would touch lines the user did not, against the minimal-change
  contract, and the mark shows where the runs are.
- **Binding Cmd-Left.** Measured: the transaction it dispatches already resolves to the content
  start past the whole run, so no binding is needed (research note).
- **CommonMark's five-space fold.** Obsidian's mode has none, and the report is about
  Obsidian's rendering; see the research note.
- **The caret's and the ladder's boundaries.** `contentColumnCh` and `contentBoundaryCh`
  already span the whole run; nothing there moves.
