## Why

A guide runs to the bottom of every trailing gap it can reach, so it outlives the content it
belongs to. At the end of a section the guide keeps descending through the blank separator
below the last paragraph; at the end of the file it descends past the last line of the
document into the final blank line. What the reader sees is a guide pointing at nothing —
the column says "there is more of this section down here" on rows where the section is
already over.

That is a direct consequence of how gap coverage was added. `computeLineGuides` covers gap
lines to close a visible break (`outline-decorations`, "Guides span blank lines between
siblings"), and it does that by giving every gap line the depths of whichever node owns it —
a purely local rule that cannot tell "a gap between two siblings" from "the gap after the
last one". Closing the break at the top of a gap and overshooting at the bottom are the same
line of code.

## What Changes

- **A guide ends at the last content line of its subtree.** A guide owned by an ancestor
  still starts on the row after that ancestor's own rows and still covers every line of its
  subtree; it now stops at the last line in that subtree that is a node's own line, and
  renders on none of the trailing gap lines below it.
- **Continuity through gaps is unchanged.** A gap line still carries every guide that has
  content below it, so a guide is still one unbroken run — no gap line ever punches a hole in
  a guide that passes through it. Only the tail below the last content line is cut. A run of
  blanks that closes several nested subtrees at once ends all of their guides on one row, the
  last content line above the run; guides end on different rows only where their subtrees' last
  content lines differ.
- **The `full` accent is cut to the same extent.** The position-indicator layer accents an
  ancestor's guide "along its whole extent"; when that extent shortens, so does the accent.
  Without this an accent would render on rows where the base guide no longer exists — the
  same defect the layer already forbids on an ancestor's own rows.
- **A provisional position keeps its guide.** A caret resting on a trailing gap line opens a
  provisional position that already renders as the node it would become. That position now
  counts as content for the guide extent, so the guide reaches the caret's own row (and every
  gap row between it and the last real content line, so the extension is continuous) instead
  of stopping above it and leaving the position's marker unattached. This amends
  `outline-decorations`' current statement that a position's own guides come from the
  document rule unchanged.

Non-goal: nothing here changes which depths a CONTENT line carries, where a guide starts, or
what any line's indentation, marker, or depth is. The change is entirely about where a guide
ends.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `outline-decorations`: the guide requirement gains the extent rule (a guide ends at the last
  content line of its subtree, with continuity through interior gaps unchanged), and the
  provisional-position requirement's guide clause changes from "unchanged from the document
  rule" to "the position extends the extent to its own line".
- `hierarchy-position-indicators`: the `full` guide accent's extent is stated as the base
  guide's own extent, which now excludes the trailing gap rows.

## Impact

- `src/plugin/decorate.ts`: `computeLineGuides` trims a gap line's depths to those that still
  have content below it, and takes the open provisional position (if any) as content;
  `computePositionTrail`'s `full` branch clips each ancestor's accent to the same row.
- `src/plugin/decorations.ts`: the guide computation is handed the provisional line. No
  consumer change beyond that — a gap line whose depths trim to empty is already skipped by
  the existing `hasOverlay` check, so it simply renders no decoration.
- `tests/decorate.test.ts`: new cases for the extent rule, a blank run closing several
  nested subtrees, the unchanged interior continuity, the accent clip, and the provisional
  extension.
- `e2e/specs/51-guides-gradient.e2e.ts` and `e2e/specs/55-position-indicators.e2e.ts`: a
  rendered check that the last gap rows of a subtree draw no gradient layer while the rows
  above them still do.
