## Why

A provisional position's row can draw a guide that the same row loses as soon as a character is
typed there. The reported shape is a list whose parent is a paragraph: Enter, Enter at the end of
the list leaves a position standing for the paragraph's sibling, yet the paragraph's guide crosses
its marker. The spec itself prescribes this. Its extension rule takes "which guides" from the node
that owns the gap rather than from the node the position stands for, and that contradicts the same
requirement's promise that the row renders as it will once its content is really there. The
diagnosis and the measurement across the generated corpus are in
`docs/research/32-provisional-position-guides.md`. It found the over-extension in most new-node
positions there, not only in the reported shape.

## What Changes

- A provisional position's own row carries only the guides the node it stands for would carry
  once typed. As today, those are restricted to guides the document already has, so a childless
  parent still does not start owning a guide because a position sits below it.
- The blank rows between the position and the last content line above it narrow with the row.
  The extension stays one unbroken run and never draws a guide the position's row does not.
- What the extension exists for is unchanged: a position opened past a subtree's last content
  line, inside that subtree, still carries the subtree's guides, so its marker is not left below
  a guide that stopped above it.
- A position that bisects a node is untouched. Its row is already one of that node's own lines in
  the outline it stands for, and it already agrees with the typed row.
- The requirement's "Typing changes nothing this layer contributes" scenario names its one
  exception outright: typing below a childless node gives that node its first child, and so its
  guide.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `outline-decorations`: "A provisional position renders as the node it would become". The rule
  for which guides a position's row and the blank rows above it carry changes from "those the
  owning gap inherits" to "those the node it stands for would carry, among those the document
  has", with scenarios for the reported shape, its heading-parent control, and the continuation
  case.

## Non-goals

- Where a guide starts, which depths any content line carries, and where guides end when no
  position is open.
- How a position is re-based under a zoom (`positions-re-base-with-the-zoom`). This rule is
  stated against whichever document the guides come from, which while zoomed is the zoom root's
  subtree.
- The position-indicator accents. They already render only at depths their line carries a guide
  at, so they follow the narrowed guide without a change of their own.
- The childless-parent residual: the guide a node gains only once the position is typed. That is
  kept deliberately, not left unfinished.

## Impact

- `src/plugin/decorate.ts`: `computeLineGuides` and its `trimGapTails` pass, which take what the
  materialized row carries instead of a bare line number.
- `src/plugin/decorations.ts`: `factsFor`'s new-node branch hands that over.
- `tests/decorate.test.ts`: the pure cases, and a differential property over the generated corpus.
- `e2e/specs/51-guides-gradient.e2e.ts`: the reported shape driven through real keys, zoomed and
  unzoomed.
