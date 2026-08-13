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

**When this is reached.** Mod-A dispatches a selection, and a selection that leaves a provisional
position is the abandon gesture (`structural-history-integration`) — so the first press after the
keypress removes the place instead. This requirement governs the case where no live record exists
to abandon: a position restored by REDO, or one whose record a later document change dropped.

#### Scenario: The content rung covers the whole node
- **WHEN** Mod-A is pressed with the caret on a provisional position interior to a two-line list
  item, and no live record exists to abandon
- **THEN** the rung covers the item's content across both of its own lines and the position
  between them, not only the line above the position

#### Scenario: The same holds for a bisected paragraph
- **WHEN** the same press is made with the caret on a position interior to a two-line paragraph
- **THEN** the rung covers both of the paragraph's own lines
