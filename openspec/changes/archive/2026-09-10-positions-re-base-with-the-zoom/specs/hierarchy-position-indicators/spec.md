## ADDED Requirements

### Requirement: The trail accents the columns the zoomed view renders
While a zoom scope is active, the position trail SHALL accent the guide columns and markers of
the ZOOMED view: depths measured from the zoom root, ancestors above the zoom root not accented
at all, because the view draws no column for them. This SHALL hold wherever the caret is,
including on a provisional position inside the zoomed subtree, where the trail describes the node
that position stands for.

An accent SHALL never be drawn on a depth the line carries no guide at. Where a re-basing would
otherwise place one there, the accent SHALL be omitted rather than moved to a neighbouring
column.

#### Scenario: No accent for a hidden ancestor
- **WHEN** the view is zoomed to a node several levels deep and the caret rests on one of its
  descendants
- **THEN** the accented columns are those the zoomed view draws, and no accent stands in for an
  ancestor above the zoom root

#### Scenario: A provisional position accents the zoomed columns
- **WHEN** the caret rests on a provisional position inside a zoomed subtree
- **THEN** the trail accents the column of the node that position stands for, measured from the
  zoom root, rather than a column measured from the note's own root

#### Scenario: The trail is restored on zoom out
- **WHEN** the user clears the zoom with the caret unchanged
- **THEN** the trail accents exactly the columns it accented for that caret before the zoom
