## ADDED Requirements

### Requirement: Extension sees the node a provisional position is inside, not the halves

An extension press SHALL cover whole nodes of the OUTLINE (`outline-keyboard-grammar`'s
"Provisional positions"), which is the tree with any open provisional position resolved. Where a
position sits interior to a multi-line node, the raw parse of the buffer reads that node as two,
and an extension computed against it covers only the part above the position — half a node, from
a press whose whole promise is "exactly one node".

The rule is the same one the structural keys follow, applied to the selection: the position is a
place, not a node boundary, and nothing about the extension changes because the caret opened one.

This is measurable only where the bisection produces a SIBLING rather than a child. A bisected
list item's tail attaches to it as a child, so a subtree cover contains it either way; a bisected
paragraph's tail is its own sibling, and the cover stops short. Both are the same defect.

**When this is reached.** A selection that leaves a provisional position is itself the abandon
gesture (`structural-history-integration`), and an extension press dispatches a selection — so on
the first press after the keypress that opened the position, the place is removed and the document
returns to what it was. This requirement governs the case where no live record exists to abandon:
a position restored by REDO, or one whose record a later document change dropped. The rule is the
same either way; only one of the two paths reaches it.

#### Scenario: A bisected paragraph extends as one node
- **WHEN** the selection is extended by one node from a caret on a position interior to a
  two-line paragraph, and no live record exists to abandon
- **THEN** the cover spans both of the paragraph's own lines and the position between them, not
  only the line above the position

#### Scenario: A bisected list item is unchanged
- **WHEN** the same press is made from a position interior to a two-line list item
- **THEN** the cover spans the item and its owned gap exactly as it does with no position open,
  one line longer for the position itself
