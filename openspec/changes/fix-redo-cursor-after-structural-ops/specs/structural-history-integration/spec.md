## ADDED Requirements

### Requirement: The first redo restores a structural operation's own cursor
When a structural operation is undone and then redone, the cursor SHALL be restored to
the position that operation itself produced — the same position the operation left the
cursor at when first performed. The cursor SHALL NOT be derived by mapping the pre-edit
cursor through the operation's changes, which for a whole-region replacement lands at
the end of the rewritten region rather than at the operation's semantic result.

This applies to every structural operation regardless of which dispatch site produced
it: the outline keyboard grammar (indent, outdent, move up, move down, split) and the
edit-enforcement rewrite path (boundary deletions and merges, structural paste,
type-over).

Scope is deliberately limited to the FIRST undo/redo pair following an operation — see
"Known limitation" below, which this requirement does not cover.

#### Scenario: Redo after a merge
- **WHEN** Backspace at a node's content start merges it into the preceding node, and
  the user then undoes and redoes with no intervening cursor movement
- **THEN** the cursor is at the merge join point — the same position the merge itself
  placed it — and not on the following gap line

#### Scenario: Redo after a merge that re-parents children
- **WHEN** a merge whose rewritten region spans the node's re-parented children is
  undone and redone with no intervening cursor movement
- **THEN** the cursor is at the merge join point, and not at the start of the node
  following the rewritten subtree

#### Scenario: Redo after indenting a node with children
- **WHEN** Tab indents a node that has children, and the user then undoes and redoes
  with no intervening cursor movement
- **THEN** the cursor is at the indented node's own content start, and not at the start
  of the node following the rewritten subtree

#### Scenario: No intervening selection is required
- **WHEN** a structural operation is followed immediately by undo and redo, with no
  cursor movement, click, or any other selection-changing event in between
- **THEN** the cursor is still restored correctly — correctness SHALL NOT depend on a
  stray selection change happening to occur between the operation and the undo

### Requirement: Known limitation — repeated undo/redo cycles are not covered
Cursor restoration beyond the first undo/redo pair is NOT guaranteed by this
capability. A second undo (undo, redo, undo) restores a mechanically mapped position —
typically the end of the document — rather than the pre-operation cursor.

This is a structural limit of the recording mechanism, not an implementation defect,
and it SHALL be documented rather than worked around: the event that a second undo
reads its restore position from is created on the history's *undone* branch during the
first undo, and the editor's history only ever records selections onto its *done*
branch. No selection transaction this capability can dispatch is able to reach it.

Removing this limitation requires the operation's changes themselves to be minimal
(character-level) rather than whole-region replacements, so that the mapped position is
semantically correct in both directions and no recording is needed at all. That is a
separate change against the structural-operation dispatch, not an extension of this
mechanism.

#### Scenario: Second undo after an undo/redo cycle
- **WHEN** a structural operation is followed by undo, redo, and undo again
- **THEN** the cursor is not guaranteed to be at the pre-operation position — this is a
  known, documented gap, and correcting it is out of scope for this capability

#### Scenario: The limitation is recorded, not silently shipped
- **WHEN** this capability is implemented
- **THEN** the limitation is stated in the project's research log alongside the root
  cause, so a future report of "the cursor still jumps" is recognized as this known gap
  rather than investigated as a new bug

### Requirement: A structural operation's resulting cursor is recorded in history
A structural transaction that changes the document SHALL make its own resulting cursor
known to the editor's undo history, by re-asserting that cursor in a following
selection-only transaction. Recording SHALL happen before any subsequent user input can
be processed, so that an undo issued immediately after the operation still finds the
cursor recorded.

The re-assertion SHALL be a visual no-op: same position, no document change, no
observable cursor movement.

#### Scenario: The resulting cursor is recorded
- **WHEN** any structural operation commits
- **THEN** the editor's undo history has recorded that operation's resulting cursor as
  the selection following the operation

#### Scenario: Recording is not observable
- **WHEN** a structural operation commits and its cursor is recorded
- **THEN** the document is unchanged by the recording, and the cursor is at the same
  position it was placed at by the operation itself

### Requirement: Undo behavior and undo granularity are unchanged
Recording the resulting cursor SHALL NOT change what undo does. One structural
operation SHALL remain exactly one undo step, and undo SHALL continue to restore both
the pre-operation document and the pre-operation cursor.

#### Scenario: One undo step per structural operation
- **WHEN** a structural operation is performed and undo is pressed once
- **THEN** the document is restored to its exact pre-operation state, with no second
  undo press required

#### Scenario: Undo restores the pre-operation cursor
- **WHEN** a structural operation is undone
- **THEN** the cursor is restored to where it was before the operation was performed

### Requirement: The cursor re-assertion is treated as plugin-own
The cursor re-assertion transaction SHALL be classified as this plugin's own and passed
through unmodified — it SHALL NOT be subjected to selection escalation or
marker-transparent cursor clamping, which could otherwise move the very cursor being
recorded.

#### Scenario: Re-assertion is not escalated or clamped
- **WHEN** a structural operation's cursor is re-asserted
- **THEN** the re-asserted position is exactly the operation's own cursor, unchanged by
  any selection-enforcement or cursor-clamping behavior

### Requirement: Structural dispatch sites share one recording mechanism
All structural dispatch sites SHALL be covered by a single recording mechanism keyed on
the existing set of this plugin's own structural `userEvent` values, rather than by
per-site implementations. A structural dispatch that carries a `userEvent` outside that
set is not covered, and adding such a dispatch without extending the set is a defect.

#### Scenario: Both dispatch sites are covered
- **WHEN** a structural operation is dispatched by the keyboard grammar, and separately
  when one is dispatched by the edit-enforcement rewrite path
- **THEN** both have their resulting cursor recorded by the same mechanism, with no
  site-specific recording code that could diverge
