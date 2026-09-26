## ADDED Requirements

### Requirement: A pick-up over an open place declines the place, and no drag begins

Where a provisional position or an empty node a structural keypress just made is OPEN when a
mark is pressed, the pick-up SHALL decline that place first, as every gesture whose selection
leaves an open place does (`structural-history-integration`, "A carried place is declined like a
fresh one"). The place is removed by its own edit, and that drag SHALL NOT begin.

This is an exception to two requirements and SHALL be read as one:
- "A press on a node's mark that moves picks that node up": such a press does not pick anything up.
- "A cancelled drag leaves nothing behind": the removal belongs to the declined place, not to the
  drag. It is its own undo entry, as every removal is, and the drag writes nothing.

A second press on the mark, with no place open any more, is an ordinary pick-up.

#### Scenario: Pressing a bullet right after Shift+Enter declines the position
- **WHEN** Shift+Enter at the end of a list item opens a position, and the item's bullet is then
  pressed and moved past the drag threshold
- **THEN** the position is removed, no drag begins, and one undo brings the position back

#### Scenario: The same after a carry
- **WHEN** Shift+Enter opens a position, Tab carries it, and a bullet is then pressed and moved
  past the drag threshold
- **THEN** the position is removed, the item stays where Tab put it, and no drag begins

#### Scenario: A second press drags
- **WHEN** a press has declined an open place, and the same bullet is pressed again and moved past
  the threshold
- **THEN** the drag begins as it would with no place ever opened
