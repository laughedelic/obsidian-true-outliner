## ADDED Requirements

### Requirement: Shift+Arrow extends by exactly one node per press
In outline mode, `Shift+ArrowDown` and `Shift+ArrowUp` SHALL be intercepted before the
native extension commands run.

For an anchor node — the node the range's anchor resolves to — and a direction, the
reachable selections SHALL form an ordered, strictly growing SEQUENCE OF COVERS: its first
element is the anchor node's own whole subtree cover, including that node's trailing gap in
full per the existing gap-inclusive subtree-cover geometry; each subsequent element is the
cover obtained by additionally taking the next node in content order in that direction, with
any step that would leave the cover unchanged omitted from the sequence. Each press SHALL
move the selection one position along the sequence for the pressed direction. While a further
element exists in that direction, a press SHALL always change the selection — no press is a
visible no-op. When the sequence is exhausted, the selection SHALL remain unchanged.

The sequence itself SHALL be recomputed from the document on every press, and the selection's
position within it SHALL be determined by the current cover together with the range's
anchor/head orientation — never by a press count, a timer, or a stored head node, since the
same cover can correspond to more than one head node.

The ANCHOR NODE, however, SHALL be carried as explicit state: an **extension origin**
recording the document position the current extension gesture started from. It SHALL be
cleared by any document change and by any selection change this capability did not itself
produce; when no origin is recorded, a press SHALL begin a fresh gesture from the current
selection. Deriving the anchor node from the selection instead is not possible: once the
cover grows to include an ancestor, the range's ends are that ancestor's bounds and the
originating node is no longer identifiable. A monotone ladder such as
`progressive-select-all`'s needs no such state; a bidirectional walk does.

#### Scenario: The originating node survives an ancestor being pulled in
- **WHEN** the caret is in a subtree's last child, the user presses Shift+ArrowDown twice —
  the second press necessarily pulling in the parent — and then presses Shift+ArrowUp
- **THEN** the selection returns to the last child's own subtree, the cover the first press
  produced, and never to a cover that did not appear on the way down

#### Scenario: An interruption starts a fresh gesture
- **WHEN** the user extends a selection, then clicks elsewhere or edits the document, then
  presses Shift+ArrowDown again
- **THEN** the extension begins again from the current selection, with no stale origin from
  the earlier gesture

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
`Shift+ArrowUp` and `Shift+ArrowDown` SHALL be exact inverses OVER COVERS: pressing the
opposite direction SHALL restore precisely the cover that preceded the last press, moving one
position back along the same sequence. Consecutive covers in a sequence SHALL be strictly
nested, so a shrink is always a proper reduction. Shrinking SHALL bottom out at the
sequence's first element, the anchor node's own whole subtree; pressing further SHALL switch
to the opposite direction's sequence, so the selection begins growing on the other side, with
the range's anchor/head orientation reflecting that direction.

The inverse property is stated over covers rather than over head-node identity deliberately:
different head nodes can produce the identical cover — with the anchor on a parent, a head on
its last child and a head on the parent itself both yield the parent's whole subtree — so
head identity is neither observable in the resulting selection nor a sound basis for a test.

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
