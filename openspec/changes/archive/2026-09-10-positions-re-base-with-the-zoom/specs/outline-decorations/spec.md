## ADDED Requirements

### Requirement: A provisional position is derived from the zoomed subtree
While a zoom scope is active, the document a provisional position is materialized against SHALL
be the zoom root's subtree as a document, at the line the caret occupies within it, rather than
the whole note. Every fact that derivation produces — the position's own indentation, marker and
kind, the guides recomputed while it is open, and the facts of the other lines in the case where
the position bisects a node — SHALL therefore carry depths relative to the zoom root, on the same
column definition every other zoomed line renders on.

The position's own row SHALL render at exactly the column a real line of the same shape renders
at IN THE ZOOMED VIEW: one level in from the zoom root for a new node directly beneath it, not
one level per hidden ancestor further right. The guide extension a position contributes SHALL
likewise reach only the columns the zoomed view draws, so no visible row gains a column standing
in for an ancestor the view is not showing.

With no zoom scope active, the derivation SHALL be unchanged: the whole note, at the caret's own
line.

The rest of the provisional-position rules apply as stated, unmodified — which parse supplies the
other lines' facts, what counts as content for a guide's extent, what marker the row carries, and
that nothing else moves. Only the document those rules are answered against changes.

#### Scenario: A new-node position renders at the zoomed depth
- **WHEN** the view is zoomed to a node with hidden ancestors and the caret opens a provisional
  position on the blank line below a child of the zoom root
- **THEN** the position's row renders at the depth that child's own sibling would render at in
  the zoomed view

#### Scenario: Guides stay re-based while a position is open
- **WHEN** a provisional position is open inside a zoomed subtree
- **THEN** every visible line draws the same guide columns it draws with the caret elsewhere,
  extended only along the rows between the position and the last content line above it

#### Scenario: A bisecting position leaves the zoomed subtree in place
- **WHEN** a provisional position is opened interior to a multi-line node inside a zoomed subtree
- **THEN** the lines that render from the outline the position stands for keep their zoom-relative
  depths, and none of them shifts by the hidden ancestors' levels

#### Scenario: Unzoomed rendering is untouched
- **WHEN** no zoom scope is active and a provisional position is opened anywhere in the note
- **THEN** the position renders exactly as it did before this rule existed
