## ADDED Requirements

### Requirement: The footer draws the outline's chrome at whatever settings are in force

The footer SHALL take the outline unit and the guides' appearance — their weight and their
intensity — from the same declarations the editor reads, so that a note and the references below it render
one grid at one weight in one colour. It SHALL NOT hold a value of its own for any of them, and a
change to any of them SHALL reach an open footer with no note edited.

Whether the footer draws guides at all SHALL remain its own setting, with one addition: while the
guide layer is turned off, the footer SHALL draw no guides regardless of that setting, since
turning the layer off is a statement about the outline's chrome and not about one surface.

The visibility states that depend on the open note SHALL NOT apply to the footer. The footer has
no caret of its own, and every row's lineage begins at its own source note's root, so neither the
caret-scoped states nor "the document has a single root" names anything there. A footer row SHALL therefore draw one guide per ancestor row above it whatever the editor's
caret is doing, and SHALL NOT repaint as the caret moves.

#### Scenario: The footer follows a change of unit

- **WHEN** the outline unit changes, by setting or by stylesheet
- **THEN** the footer's rows, their markers and its group inset all move to the new step, in step
  with the editor above them

#### Scenario: The footer follows the guides' appearance

- **WHEN** the guides' intensity changes, or a stylesheet changes their weight, while the footer
  is drawing guides
- **THEN** the footer's guides render at the new intensity and weight, matching the editor's

#### Scenario: The layer off silences the footer's guides

- **WHEN** the guide layer is turned off while the footer's own guide setting is on
- **THEN** the footer draws no guides, and turning the layer back on restores them

#### Scenario: The footer's guides do not follow the caret

- **WHEN** the editor is set to draw only the levels the cursor is inside, and the caret moves
  between nodes
- **THEN** every footer row keeps drawing one guide per ancestor row above it, unchanged
