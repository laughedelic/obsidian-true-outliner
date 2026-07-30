## MODIFIED Requirements

### Requirement: An operation that chooses its own cursor has it recorded in history
A structural operation whose resulting cursor is a CHOICE rather than a function of the
pre-operation caret — a merge's join point, a split point, a moved node's new location,
the survivor after a deletion — SHALL make that cursor known to the editor's undo
history, by re-asserting it in a following selection-only transaction. Recording SHALL
happen before any subsequent user input can be processed, so an undo issued immediately
after the operation still finds it recorded.

Indent and outdent SHALL NOT be recorded. Their cursor is derived by mapping the
pre-operation caret forward (`minimal-change-dispatch`), which is what the history
recomputes on redo, so the two already agree at any depth; recording them would only
subject them to the limitation below.

Recording is required because no rule applied AFTER the fact can recover the position, and
because whether mapping happens to recover it is not a property the operation controls. A
swap has two equally true descriptions — this node moved down, that node moved up — and
nothing in the resulting text says which node the user acted on. `minimal-change-dispatch`
describes a swap of two similar lines in place, because rewriting the characters that differ
claims less of the document than relocating either line, so the caret is inside a change in
BOTH directions and mapping puts it on whatever now occupies those lines — a position that
is perfectly legal, and therefore invisible to any check that only asks whether the caret
may be there. Recording is what makes the answer right, because the information identifying
the moved node is not present in what the history retains. Nor can the narrowing be asked to
supply it: which node "moved" is a fact about the gesture, and the change set is derived from
the text.

#### Scenario: Redo after moving a node
- **WHEN** a node is moved up or down, then undone and redone
- **THEN** the cursor is on the moved node, not on the sibling that took its former
  place

#### Scenario: Repeated redo keeps the moved node's cursor
- **WHEN** a move is followed by repeated undo/redo cycles
- **THEN** every redo puts the cursor back on the moved node

#### Scenario: Recording covers what mapping cannot, in either direction
- **WHEN** a node is moved up, or the other node is moved down to the same effect, and the
  operation is undone and redone
- **THEN** the cursor is on the moved node in both cases, where without recording each would
  have landed on the sibling that took its former place

#### Scenario: Indent is not recorded and stays correct anyway
- **WHEN** Tab indents a node and the user undoes and redoes any number of times
- **THEN** the cursor is correct at every depth, from mapping alone
