## ADDED Requirements

### Requirement: The ladder's rungs are the outline's nodes, not a bisected parse's

Every rung SHALL be computed against the OUTLINE (`outline-keyboard-grammar`'s "Provisional
positions"), which is the tree with any open provisional position resolved. A position opened
interior to a multi-line node makes the raw parse of the buffer read that node as two, and the
content rung — the ladder's first, which is a node's OWN lines rather than its subtree — then
covers only the lines above the position.

This one is not confined to the shapes the other consumers expose. A bisected list item's tail is
its child, which spares the subtree rungs but not the content rung, since that rung never included
children in the first place. So the first press of Mod-A selects half a node in every bisected
shape, list and paragraph alike.

The ladder stays stateless: nothing is remembered about the position, and the rung is still a
function of the current selection and the current document — read through the outline that
document stands for.

#### Scenario: The content rung covers the whole node
- **WHEN** a provisional position is open interior to a two-line list item and Mod-A is pressed
  with the caret on the item's own first line
- **THEN** the rung covers the item's content across both of its own lines, not only the line
  above the position

#### Scenario: The same holds for a bisected paragraph
- **WHEN** the same press is made inside a two-line paragraph with an interior position open
- **THEN** the rung covers both of the paragraph's own lines
