## ADDED Requirements

### Requirement: Shift+Arrow extends by exactly one node per press
In outline mode, `Shift+ArrowDown` and `Shift+ArrowUp` SHALL be intercepted before the
native extension commands run. The selection SHALL be understood as an (anchor node, head
node) pair, where the anchor node is the node the range's anchor resolves to. The FIRST press
in either direction SHALL set the head node to the anchor node, producing that node's whole
subtree cover — including its own trailing gap in full, per the existing gap-inclusive
subtree-cover geometry. Each FURTHER press SHALL move the head node to the next node in
content order, in the pressed direction, that changes the resulting cover, then replace the
range with the cover of the anchor and head nodes. A step that would leave the cover
unchanged SHALL be skipped rather than consuming the keypress, so no press is ever a
visible no-op. When no further node exists in the pressed direction, the selection SHALL
remain unchanged.

#### Scenario: First press selects the anchor node alone
- **WHEN** the caret is mid-text in a list item that has a following sibling on the very next
  line, with no blank line between them, and the user presses Shift+ArrowDown
- **THEN** the selection covers that item's subtree only, not the following sibling

#### Scenario: First press on a parent takes its whole subtree
- **WHEN** the caret is mid-text in a list item that has children and the user presses
  Shift+ArrowDown
- **THEN** the selection covers that item and all of its descendants

#### Scenario: A press that would not change the cover is skipped
- **WHEN** the selection covers a parent's whole subtree and the user presses Shift+ArrowDown
- **THEN** the selection grows to include the parent's next sibling — the already-covered
  children are passed over rather than costing a keypress

#### Scenario: Taking the next node pulls in what the invariant requires, in one press
- **WHEN** the selection covers only the last child of a subtree and the user presses
  Shift+ArrowDown
- **THEN** the selection becomes the cover of that child and the following node, which
  necessarily includes the parent's whole subtree — reached in this single press, not split
  across two

#### Scenario: A heading extends by its whole section
- **WHEN** the caret is inside a heading's text and the user presses Shift+ArrowDown
- **THEN** the selection covers the heading's entire subtree, the same way a parent list
  item's does

### Requirement: Extension is symmetric and can shrink
`Shift+ArrowUp` and `Shift+ArrowDown` SHALL be exact inverses over the head node's walk: the
reverse direction moves the head node back along content order, shrinking the cover one node
at a time, bottoming out at the anchor node's own whole subtree. Continuing past that point
SHALL move the head node beyond the anchor in the opposite direction, so the selection begins
growing again on the other side, with the range's anchor/head orientation reflecting that
direction.

#### Scenario: Shift+Up undoes Shift+Down
- **WHEN** the user presses Shift+ArrowDown twice and then Shift+ArrowUp once
- **THEN** the selection is exactly what it was after the first press

#### Scenario: Shrinking bottoms out at the anchor node
- **WHEN** the user presses Shift+ArrowUp repeatedly from a selection extended downward
- **THEN** the selection reduces to the anchor node's own whole subtree and does not become a
  caret or a partial range

#### Scenario: Continuing past the anchor grows upward
- **WHEN** the selection is exactly the anchor node's own subtree and the user presses
  Shift+ArrowUp
- **THEN** the selection grows to cover the previous node as well, oriented backward

### Requirement: Extension dispatches exact covers and leaves escalation untouched
Each extension SHALL dispatch a selection whose every range is already an exact node or
sibling-run cover, so the transaction filter's escalation leaves it unchanged. This
capability SHALL NOT alter the escalation math, the expand-only invariant, or any behavior of
`node-selection-enforcement` for ranges the user produces by other means.

#### Scenario: No escalation correction follows an extension
- **WHEN** any extension press dispatches its selection
- **THEN** the transaction filter applies no selection correction to it, and the resulting
  selection is byte-identical to what the handler dispatched

#### Scenario: Drag selection is unaffected
- **WHEN** the user drag-selects across node boundaries
- **THEN** escalation behaves exactly as it does today, including expand-only retention of
  ends placed beyond the computed cover

### Requirement: Each range in a multi-range selection extends independently
When the selection has several ranges, each SHALL advance or retreat along its own anchor
node's walk, and the resulting ranges SHALL be assembled together, letting normal selection
normalization merge any that now overlap. Ranges SHALL NOT be forced to a common node,
depth, or step count.

#### Scenario: Two cursors in adjacent siblings each take their own node
- **WHEN** the caret is placed in two adjacent sibling nodes and the user presses
  Shift+ArrowDown once
- **THEN** the result is two ranges, each covering its own node's subtree — not a single
  range covering their parent or the whole document

#### Scenario: Cursors at different depths advance independently
- **WHEN** one caret sits in a shallow node and another in a deeply nested node, and the user
  presses Shift+ArrowDown
- **THEN** each range covers its own node's subtree, neither jumping ahead because the other
  is deeper

### Requirement: Extension is scoped to outline mode
Extension handlers SHALL activate per keypress only when the editor's file has outline mode
enabled, resolved through the public `editorInfoField`. Outside outline mode every binding
SHALL decline the key, so `Shift+ArrowUp` and `Shift+ArrowDown` behave byte-for-byte as stock
Obsidian.

#### Scenario: Off-mode extension is native
- **WHEN** the user presses Shift+ArrowDown in a note without outline mode
- **THEN** the native line-wise extension runs, unaffected by the plugin

#### Scenario: Toggle takes effect immediately
- **WHEN** outline mode is toggled while the note is open
- **THEN** the next Shift+Arrow press already follows the new mode, with no editor reload
