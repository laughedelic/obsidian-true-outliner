## MODIFIED Requirements

### Requirement: An operation that chooses its own cursor has it recorded in history
A structural DISPATCH whose cursor is not the position mapping would produce SHALL make
that cursor known to the editor's undo history, by re-asserting it in a following
selection-only transaction. Recording SHALL happen before any subsequent user input can be
processed, so an undo issued immediately after the operation still finds it recorded.

The decision SHALL be derived from the transaction itself — comparing the dispatched
selection against the pre-operation selection mapped forward through the change set, at
the same association CodeMirror's own redo restore uses — and SHALL NOT be read from a
list of operation names. A per-operation list is insufficient in a measurable way: one
operation can dispatch a derived cursor most of the time and a chosen one when its
addressability fallback fires, and a list leaves the second case unrecorded.

The derived rule SHALL preserve the previous set's BEHAVIOUR rather than its membership.
Every dispatch mapping cannot reproduce is recorded, so redo stays exact wherever the list
made it exact. It may record fewer transactions: a merge join point, a moved node's new
location and the seam after a deletion are not what mapping produces and are recorded as
before, but a split point CAN coincide with the mapped position (a mid-item split inserts
its marker at the caret, which assoc=1 maps onto the new item's content start), and such a
dispatch is correctly left unrecorded — redo already reproduces it.

Recording is required because no rule applied AFTER the fact can recover the position, and
because whether mapping happens to recover it is not a property the operation controls. A
swap has two equally true descriptions — this node moved down, that node moved up — and the
line alignment in `minimal-change-dispatch` selects one of them from the line content alone,
not from which node the user acted on. When it selects the user's node as the one that MOVED,
the caret rides the relocated run and mapping lands correctly by coincidence; when it selects
the other way, the caret is in text the change rewrites and mapping puts it on whatever now
occupies those lines — a position that is perfectly legal, and therefore invisible to any
check that only asks whether the caret may be there. Both outcomes are reachable from the
same operation in opposite directions. Recording is what makes the answer the same either
way, because the information identifying the moved node is not present in what the history
retains. Nor can the narrowing be asked to supply it: which node "moved" is a fact about the
gesture, and the change set is derived from the text.

#### Scenario: Redo after moving a node
- **WHEN** a node is moved up or down, then undone and redone
- **THEN** the cursor is on the moved node, not on the sibling that took its former
  place

#### Scenario: Repeated redo keeps the moved node's cursor
- **WHEN** a move is followed by repeated undo/redo cycles
- **THEN** every redo puts the cursor back on the moved node

#### Scenario: Recording covers the direction mapping cannot
- **WHEN** the move direction is the one whose change set rewrites the lines the caret was
  in, rather than relocating them, and the operation is undone and redone
- **THEN** the cursor is on the moved node, where without recording it would have landed on
  the sibling that took its former place

#### Scenario: Indent is not recorded and stays correct anyway
- **WHEN** Tab indents a node with a plain caret, so the dispatch uses the mapped position,
  and the user undoes and redoes any number of times
- **THEN** the cursor is correct at every depth, from mapping alone, and nothing was
  recorded

#### Scenario: The same operation records only when it chooses
- **WHEN** indent is invoked twice — once with a plain caret, once with a whole-block
  cover whose mapped position would not be addressable
- **THEN** the first dispatch is not recorded and the second is, from the same operation
