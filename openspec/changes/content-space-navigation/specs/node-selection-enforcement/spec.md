## MODIFIED Requirements

### Requirement: Within-node content selections and cursors are untouched
Selection ranges whose two ends both rest on a single node's own content lines SHALL
pass through unmodified.

Cursor (empty range) placement is no longer this layer's concern. The marker-clamp
mechanism this requirement previously defined — redirecting a cursor landing inside a
list item's marker prefix to its content-start column — is SUPERSEDED by
`content-space-caret`'s general rule that only content positions are addressable at all,
which subsumes the marker case and additionally covers gap lines. Its former guarantee
that GAP-LINE cursor placement stays byte-for-byte native is REVERSED for outline mode:
a caret can no longer be placed on a gap line, and a placement that would land there
resolves to the owning node's content end. Both changes are deliberate reversals of
invariants adopted in Phase B and recorded as needing their own design pass in
`docs/research/13` ("Gap-line cursor transparency"); see the `content-space-navigation`
change's design.md (D1, D2, D11) for the rationale, including the measured finding that
the clamp's claimed input-agnosticism did not hold — Home reached positions ArrowLeft and
mouse clicks were both prevented from reaching.

Outside outline mode, cursor placement remains byte-for-byte stock, as it always was.

#### Scenario: Double-click word selection
- **WHEN** the user double-clicks a word inside a node
- **THEN** the native word selection is applied unmodified

#### Scenario: Within-node drag stays character-level
- **WHEN** the user drag-selects between two points on the same node's content lines
- **THEN** the native character-level selection is applied unmodified

#### Scenario: Cursor placement is governed by the caret capability
- **WHEN** any gesture would place the cursor on a gap line or inside a list item's
  marker prefix in outline mode
- **THEN** the resulting position is determined by `content-space-caret`, not by this
  layer, which no longer moves empty ranges at all

#### Scenario: Off-mode cursor placement is untouched
- **WHEN** the user clicks on a blank line between nodes in a note without outline mode
- **THEN** the cursor lands exactly where stock Obsidian would place it

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` (within-node drag,
double-click, off-mode placement); `tests/escalate.test.ts` (empty ranges pass through
`escalateRanges` unchanged); the caret capability's own suites for placement itself.
