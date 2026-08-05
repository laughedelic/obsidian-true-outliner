## ADDED Requirements

### Requirement: Shift+Arrow extends by exactly one node per press
In outline mode, `Shift+ArrowDown` and `Shift+ArrowUp` SHALL be intercepted before the native
extension commands run.

For an anchor node — the node the range's anchor resolves to — and a direction, the reachable
selections SHALL form an ordered, strictly growing SEQUENCE OF COVERS: its first element is the
anchor node's own whole subtree cover, including that node's trailing gap in full per the
existing gap-inclusive subtree-cover geometry; each subsequent element is the cover obtained by
additionally taking the next node in content order in that direction, computed through
`node-selection-enforcement`'s forest-span geometry. Each press SHALL move the selection one
position along the sequence for the pressed direction. While a further element exists in that
direction, a press SHALL always change the selection — no press is a visible no-op. When the
sequence is exhausted, the selection SHALL remain unchanged.

The sequence SHALL be recomputed from the document on every press, and the selection's position
within it determined by the current cover together with the range's anchor/head orientation.
A range that is NOT an exact cover SHALL first be normalized to the whole-subtree cover of the
node its anchor resolves to. This normalization is the identity for every range that is already
a cover. It SHALL NOT be expressed as ordinary selection escalation: escalation deliberately
leaves a within-node content range untouched, so it does not produce a cover for these inputs.

Two ordinary gestures produce such a range: a selection restored by undo or redo, which bypasses
the escalation filter entirely (`@codemirror/commands` dispatches history transactions with
`filter: false`), and the progressive-select-all ladder's first rung, which is a node's own
content and is not a cover.

Where the normalization CHANGES the selection, that change SHALL BE the press's step, and the
sequence SHALL NOT additionally advance. A press moves one position; for an input that was not on
the sequence, arriving on it is that move.
No press-count, timer, stored head node, or stored extension origin SHALL be used: because
escalation no longer expands a crossing range to a common ancestor, the cover's start edge (for
a forward selection) or end edge (for a backward one) continues to identify the anchor node
however far the selection has grown.

A press SHALL NOT be intercepted at all while the selection is a plain character range lying
entirely within ONE node's own content lines and the press would leave it within them. Such a
press SHALL fall through to the platform's ordinary line-wise extension, so the interior of a
node that owns several lines stays reachable by keyboard selection. Interception SHALL resume at
the node's boundary — the first press whose target leaves those content lines, including onto the
node's own trailing gap — which SHALL produce the anchor node's whole subtree cover as above. For
a node owning a single line no such press exists, so its first press covers the node.

#### Scenario: Extension inside a multi-line node stays character-level
- **WHEN** the caret is on the first of a node's two content lines and the user presses
  Shift+ArrowDown
- **THEN** the selection extends one line as ordinary text selection, keeping the anchor's exact
  column, and no block chrome appears

#### Scenario: The node boundary is where interception resumes
- **WHEN** the selection has been extended to a multi-line node's last content line and the user
  presses Shift+ArrowDown again
- **THEN** the selection becomes that node's whole subtree cover, including its trailing gap

#### Scenario: First press selects the anchor node alone
- **WHEN** the caret is mid-text in a list item that has a following sibling on the very next
  line, with no blank line between them, and the user presses Shift+ArrowDown
- **THEN** the selection covers that item's subtree only, not the following sibling

#### Scenario: First press on a parent takes its whole subtree
- **WHEN** the caret is mid-text in a list item that has children and the user presses
  Shift+ArrowDown
- **THEN** the selection covers that item and all of its descendants

#### Scenario: A heading extends by its whole section
- **WHEN** the caret is inside a heading's text and the user presses Shift+ArrowDown
- **THEN** the selection covers the heading's entire subtree, the same way a parent list
  item's does

#### Scenario: Extending out of a scope does not pull in the parent
- **WHEN** the caret is in a subtree's LAST child and the user presses Shift+ArrowDown twice
- **THEN** the first press covers that child's subtree and the second additionally covers the
  following node — the child's parent is NOT added to the selection

#### Scenario: A press that would not change the cover is skipped
- **WHEN** the selection covers a parent's whole subtree and the user presses Shift+ArrowDown
- **THEN** the selection grows to include the parent's next sibling — the already-covered
  children are passed over rather than costing a keypress

#### Scenario: A selection restored by undo is normalized before stepping
- **WHEN** an undo or redo restores a selection that is not an exact cover — history maps the
  pre-operation selection forward through the operation's changes without the escalation
  filter ever seeing it — and the user then presses Shift+ArrowDown
- **THEN** the selection is first taken to the nearest cover, and the press steps from there;
  the result is a cover, never a range whose edge falls mid-node

### Requirement: Extension is symmetric and can shrink
The anchor node SHALL be read from the current cover's own covered ROOTS, never from stored
state: for a cover with two or more roots it is the FIRST root when the range is oriented
forward and the LAST root when oriented backward — the root on the side the extension is not
growing from. For a cover with exactly ONE root, that root IS the anchor node and the cover is
the base of its sequence.

While the cover has two or more roots, `Shift+ArrowUp` and `Shift+ArrowDown` SHALL be exact
inverses OVER COVERS: pressing the opposite direction SHALL restore precisely the cover that
preceded the last press, by dropping the root on the growing side. Consecutive covers in a
sequence SHALL be strictly nested, so a shrink is always a proper reduction. Shrinking SHALL
bottom out at a single-root cover and SHALL NOT reduce further to a caret or a partial range.

From a single-root cover, BOTH directions SHALL grow — there is no smaller element to return to
— with the range's anchor/head orientation reflecting the pressed direction.

A consequence, stated because it is a real behavior and not an oversight: an upward press out of
a node that is not its parent's last child yields that parent's whole subtree, since downward
closure admits no smaller cover containing both. That cover has ONE root, so by the rule above
the parent becomes the anchor, and no number of opposite presses returns to the original child.
The selection instead oscillates between the parent's subtree and the parent plus its next
sibling. Extension SHALL NOT attempt to return to a cover that is not reachable from the current
selection, and SHALL NOT produce a cover that did not appear along the current anchor's sequence.

The inverse property is stated over covers rather than over head-node identity deliberately:
different head nodes can produce the identical cover, so head identity is neither observable in
the resulting selection nor a sound basis for a test.

#### Scenario: Shift+Up undoes Shift+Down
- **WHEN** the user presses Shift+ArrowDown twice and then Shift+ArrowUp once
- **THEN** the selection is exactly what it was after the first press

#### Scenario: Reversing after leaving a scope still returns to the anchor node
- **WHEN** the caret is in a subtree's last child, the user presses Shift+ArrowDown twice —
  the second press taking the following node, outside the parent's scope — and then presses
  Shift+ArrowUp
- **THEN** the selection returns to the last child's own subtree, and never to a cover that did
  not appear on the way down

#### Scenario: Shrinking bottoms out at the anchor node
- **WHEN** the user presses Shift+ArrowUp repeatedly from a selection extended downward
- **THEN** the selection reduces to the anchor node's own whole subtree and does not become a
  caret or a partial range

#### Scenario: Continuing past the anchor grows upward
- **WHEN** the selection is exactly the anchor node's own subtree, the node has a preceding
  sibling, and the user presses Shift+ArrowUp
- **THEN** the selection grows to cover the previous node as well, oriented backward

#### Scenario: An upward press out of a first child re-seats the anchor on the parent
- **WHEN** the caret is in a list item that is its parent's FIRST child, the parent has a later
  child, and the user presses Shift+ArrowUp
- **THEN** the selection covers the parent's whole subtree — including the later child, below
  the caret — because downward closure admits no smaller cover, and the parent is now the
  anchor node

#### Scenario: Reversing after a re-seat grows rather than shrinking
- **WHEN** the selection is exactly a parent's whole subtree, reached by the previous scenario,
  and the user presses Shift+ArrowDown
- **THEN** the selection grows to additionally cover the parent's next sibling — it does not
  shrink, and in particular does not reduce to the parent's last child, a cover that never
  appeared on the way up

#### Scenario: A press never leaves the selection unchanged while a further cover exists
- **WHEN** the selection is a parent's whole subtree whose own trailing gap line follows its
  first line, and the user presses Shift+ArrowDown — the shape that is a fixpoint today, because
  the head falls into the parent's own gap and re-resolves to the parent
- **THEN** the selection changes, growing to include the parent's next sibling

### Requirement: A block selection and a multi-cursor selection are told apart by shape
A selection consisting of exactly ONE range SHALL be treated as a block selection and extended
as a whole, per the sequence above. A selection with SEVERAL ranges SHALL be treated as
multi-cursor: each range SHALL advance or retreat along its own anchor node's sequence
independently, and the resulting ranges assembled together, letting normal selection
normalization merge any that now overlap. Ranges SHALL NOT be forced to a common node, depth,
or step count.

This discriminator is available only because an escalated block selection remains a single
contiguous range under `selection-as-subtree-set`: the forest span of a crossing selection is
contiguous text, so growing a block selection never splits it into several ranges.

#### Scenario: One range extends as a block
- **WHEN** the selection is a single range covering one or more subtrees and the user presses
  Shift+ArrowDown
- **THEN** exactly one node is added, at the selection's far end

#### Scenario: Two cursors extend independently
- **WHEN** the caret is placed in two separate nodes and the user presses Shift+ArrowDown once
- **THEN** the result is two ranges, each covering its own node's subtree

#### Scenario: Cursors at different depths advance independently
- **WHEN** one caret sits in a shallow node and another in a deeply nested node, and the user
  presses Shift+ArrowDown
- **THEN** each range covers its own node's subtree, neither jumping ahead because the other is
  deeper

### Requirement: Extension and progressive select-all compose through the selection alone
Neither extension nor the `progressive-select-all` ladder SHALL consult, record, or infer how the
current selection was produced. A selection reached by any sequence of gestures SHALL behave
identically to the same selection reached by any other sequence.

Consequently, `Mod+A` applied to a selection built by extension SHALL climb that selection's own
ladder — the smallest rung strictly containing it, which is the nearest sibling run covering the
whole selection, else the enclosing parent's subtree — including when the selection's covered
roots sit at different depths, and SHALL preserve the range's orientation. Extension applied to a
selection built by `Mod+A` SHALL step from that selection exactly as if it had been reached by
extension. Neither capability SHALL gain shared state with the other, and neither SHALL
special-case a selection by its provenance.

#### Scenario: Mod+A over an extension-built sibling run climbs to the parent
- **WHEN** the selection covers two sibling subtrees under one parent, reached by extension, and
  the user presses Mod+A
- **THEN** the selection becomes the parent's whole subtree

#### Scenario: Mod+A over a cross-scope extension selection climbs to the enclosing run
- **WHEN** the selection covers a nested item's subtree and a following top-level subtree,
  reached by extension, and the user presses Mod+A
- **THEN** the selection becomes the nearest run of whole subtrees containing both

#### Scenario: Extension from a ladder rung matches extension from a caret
- **WHEN** the user presses Mod+A once — selecting the node's own content, which is not a cover
  — and then presses Shift+ArrowDown
- **THEN** the selection is that node's whole subtree, identical to pressing Shift+ArrowDown from
  a bare caret in the same node

#### Scenario: Extension from a climbed ladder rung steps from that rung
- **WHEN** the user presses Mod+A repeatedly until the selection is some node's whole subtree,
  then presses Shift+ArrowDown
- **THEN** the selection grows by one node from that subtree, identical to having reached the
  same subtree by extension

#### Scenario: Orientation survives the handoff
- **WHEN** the selection was built by extending BACKWARD and the user presses Mod+A
- **THEN** the resulting rung keeps the backward orientation, so a following Shift+ArrowUp
  continues to grow upward rather than reversing

### Requirement: Extension dispatches exact covers and leaves escalation untouched
Each extension SHALL dispatch a selection whose every range is already an exact cover under
`node-selection-enforcement`'s geometry, so the transaction filter's escalation leaves it
unchanged. This capability SHALL NOT alter the escalation math, the expand-only invariant, or
any behavior of `node-selection-enforcement` for ranges the user produces by other means.

#### Scenario: No escalation correction follows an extension
- **WHEN** any extension press dispatches its selection
- **THEN** the transaction filter applies no selection correction to it, and the resulting
  selection is byte-identical to what the handler dispatched

#### Scenario: Drag selection is unaffected
- **WHEN** the user drag-selects across node boundaries
- **THEN** escalation behaves exactly as `node-selection-enforcement` specifies, including
  expand-only retention of ends placed beyond the computed cover

### Requirement: Extension is scoped to outline mode
Extension handlers SHALL activate per keypress only when the editor's file has outline mode
enabled, resolved through the SAME single gate every other binding in the outline keymap uses —
the public `editorInfoField`, AND exclusion of nested editors. Outside outline mode every
binding SHALL decline the key, so `Shift+ArrowUp` and `Shift+ArrowDown` behave byte-for-byte as
stock Obsidian.

The nested-editor exclusion is not optional for these bindings. Obsidian mounts a table cell
being edited as its own `EditorView`, the plugin's editor extension is installed there too, and
`editorInfoField` still resolves to the outer note — so a gate reading outline mode alone would
apply outline rules to a document that is only the cell's raw text. A private check that merely
looks equivalent to the shared one SHALL NOT be used.

#### Scenario: Off-mode extension is native
- **WHEN** the user presses Shift+ArrowDown in a note without outline mode
- **THEN** the native line-wise extension runs, unaffected by the plugin

#### Scenario: A nested editor gets native extension
- **WHEN** the user is editing a table cell inside an outline-mode note — a nested editor whose
  own document is the cell's raw text — and presses Shift+ArrowDown
- **THEN** the binding declines and native extension runs against the cell's own text, with no
  node sequence computed from the outer note's tree

#### Scenario: Toggle takes effect immediately
- **WHEN** outline mode is toggled while the note is open
- **THEN** the next Shift+Arrow press already follows the new mode, with no editor reload
