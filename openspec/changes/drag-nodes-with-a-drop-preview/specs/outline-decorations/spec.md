## ADDED Requirements

### Requirement: A drop preview anchors on the destination's own column

While a drag names a destination (`node-dragging`), this layer SHALL draw an indicator at the seam
the run will land on, and that indicator's left end SHALL sit on the DESTINATION DEPTH's own
column — the column the run's first root's mark will occupy once it lands.

The column SHALL come from this layer's own column definition, the one markers and guides already
share, and SHALL NOT be measured off any mark's rendered box. A mark's box is not the column: a
list bullet's span begins at its column where every other mark is centred on it
(docs/research/node-drag-and-drop), so a preview positioned from a box lands a few pixels out on
one kind and not the others.

The mark the run will have AFTER re-encoding SHALL be drawn at that column, at the size every
other mark this layer draws is drawn at. The run's CURRENT mark SHALL NOT be drawn there: a run
that changes kind on arrival would otherwise be previewed as something that never exists.

The destination's PARENT SHALL be accented, using the accent this layer already publishes for the
caret's own ancestors, so that the parent is stated rather than counted out of columns. The accent
SHALL NOT change the weight of what it accents, which is the rule guide accents already follow.

#### Scenario: The indicator moves column by column
- **WHEN** a drag's destination moves between the legal depths of one seam
- **THEN** the indicator's left end sits on each destination's own column in turn, one outline
  unit apart, matching the columns markers render on

#### Scenario: The preview's mark is the destination's kind
- **WHEN** the run will be re-encoded into a different kind on arrival
- **THEN** the mark drawn at the destination column is that kind's glyph

#### Scenario: A list destination is not offset by its bullet's box
- **WHEN** a destination's row is a list item
- **THEN** the indicator's left end sits on the same column a marker icon would be centred on at
  that depth, not at the left edge of a bullet's span

#### Scenario: The accented parent keeps its weight
- **WHEN** a destination parent is accented
- **THEN** its guide and marker render at the same weight as before, differing only in colour

### Requirement: An absorbed region is drawn where the drop puts it

Where a drop would absorb content that is not part of the run (`node-dragging`), this layer SHALL
draw the absorbed rows at the depth the drop gives them, with the guide that will connect them to
the ghost mark: the result shown as the result. The shift SHALL cover exactly the rows the
absorption reaches and SHALL end where it ends.

The shift SHALL be sideways only, and those rows SHALL be the only ones the preview moves: their
text, order and lines stay as they are, and a cancel takes the shift away with the rest of the
preview. No tint SHALL mark them. The three preview states each answer a different question, so
they SHALL NOT share a treatment: the lifted run is faded, the destination parent is accented, and
the absorbed rows are told apart by where they are drawn.

#### Scenario: The absorbed rows are drawn in to where absorption ends
- **WHEN** a heading drop would take three following siblings into its section, and a fourth row
  ends the absorption
- **THEN** exactly those three rows are drawn at the depth the drop gives them, and the fourth
  keeps its place

#### Scenario: Three preview states stay distinguishable
- **WHEN** a drag shows a lifted run, an accented destination parent and an absorbed region at once
- **THEN** the three render distinguishably from one another

#### Scenario: Absorbed rows move only sideways
- **WHEN** rows are drawn as absorbed
- **THEN** each stays on its own line with its text unchanged, and a cancelled drag draws it back
  at its own depth

### Requirement: A run in flight renders as lifted, in place

While a drag is in flight, the rows of every subtree in the operand SHALL render as lifted —
distinguishable at a glance from the rows around them, and from the destination's own chrome — and
SHALL STAY WHERE THEY ARE. This layer SHALL NOT move, hide, or re-lay out any row on account of a
drag, beyond the sideways shift of an absorbed region: nothing has changed in the document, and a
preview that re-lays out the page has to put it all back when the drag is cancelled.

The lifted treatment SHALL compose with the block-selection chrome an operand carries rather than
replacing it, since the operand is a selection cover and is already decorated as one.

Every trace of the lifted treatment and of the preview SHALL be gone once the drag ends, however it
ends.

#### Scenario: Lifted rows stay in place
- **WHEN** a run is in flight and the pointer moves across several destinations
- **THEN** the run's rows remain on their original lines, rendered as lifted, and no row moves
  but an absorbed region's

#### Scenario: Lifted composes with selection chrome
- **WHEN** the operand is a multi-root cover
- **THEN** the cover's own block chrome still renders, with the lifted treatment on top of it

#### Scenario: A cancelled drag leaves no chrome
- **WHEN** a drag is cancelled by Escape
- **THEN** no lifted treatment, indicator, ghost mark or parent accent remains anywhere in the view
