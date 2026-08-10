## ADDED Requirements

### Requirement: An unused structural keypress has its place removed
A structural keypress that creates an EMPTY PLACE — a provisional position, an empty list
item, an empty heading — and is then declined SHALL have that place removed by a NEW,
undoable edit that deletes it, leaving everything else the keypress did in place.

Two gestures count as declining, and both resolve the same way:

- MOVING THE CARET away from it without typing there. The caret then goes where the gesture
  was headed.
- DELETING it — Backspace or Delete with the caret on it. A provisional position is treated
  as the empty node it stands for, so a deletion gesture removes the WHOLE place rather than
  narrowing the gap around it. After Backspace the caret goes where the cancelled keypress
  started, which is the content end of the node above; after Delete it goes to the content
  start of the node below. Without this, Delete would shrink the separation that makes the
  position typeable and leave a caret on a blank line that silently joins its neighbour.

A REMOVAL, not an undo of the keypress. Undoing was specified first and withdrawn: it
reverts everything the keypress did, and a keypress can do more than open a place — Enter
over a block selection removes the selection AND opens one, so undoing it brought the
deleted text back. Removal also leaves a real history entry, so ONE undo returns to the
empty place, which is what a user who changes their mind twice expects. The three objections
that originally argued for undo are answered by removing a RECORDED span rather than a
computed one: nothing has to decide what counts as removable content, and nothing has to
guess a gap's minimal width.

The removal SHALL delete the place's own line plus however many lines the keypress added
beyond it. One rule covers every producer: an end-of-node Enter widens a gap by two lines
and both go; a materialized empty item or heading occupies one line and it goes; an unwrap,
or an outdent that DISSOLVES an empty item into a blank line, adds no line at all and the
one it left goes. A place on the document's last line has no following line break to take,
so the removal SHALL take the preceding one instead.

WHICH DISPATCHES CREATE A PLACE is decided by where the caret lands, not by which key ran.
A dispatch of this plugin's that leaves the caret on a GAP LINE necessarily created that
position — a gap line is a place and not a node, so there was nothing there to land on. An
EMPTY NODE is different: it can pre-exist the keypress, so only the dispatches that
materialize one qualify, or an outdent that merely moved an already-empty item would be
recorded and then removed out from under the user.

Keying on the operation instead was tried and is wrong, for a reason worth stating: which
operation dissolves an empty item into a blank line depends on the item's PARENT, not on
the gesture. At the top of a list, or under a heading, Enter unwraps it. Under a PARAGRAPH
the same press outdents it — the item becomes a sibling of the paragraph, the reparent rule
encodes it as a paragraph, and an empty paragraph has no encoding. Same place, different
operation.

Where the plugin cannot establish that the place is still the one it recorded — anything
else changed the document in between, or the record was lost — it SHALL do nothing. Leaving
the empty place is the pre-existing behavior and is always safe.

This cleanup SHALL apply only in outline mode, evaluated per editor and per update rather
than once when the editor is set up. Stating it is not redundant with the mode gating every
other capability has: the mechanism watches ordinary editing to notice what created a place,
and the editor's own newline carries the same line-break shape that Shift+Enter's
continuation does. Ungated, the cleanup would recognise a plain newline in a note that never
opted in and remove it when the caret moved away.

The removal SHALL carry a plugin-own `userEvent`, so the verdict layer short-circuits it —
deleting lines would otherwise read as a boundary-crossing edit — and one outside the
editor's joinable history families, so it forms its own entry and a single undo returns to
the empty place rather than past the keypress.

#### Scenario: An unused blank position is removed on leaving
- **WHEN** Enter at the end of a paragraph widens the gap, and the caret is then moved
  elsewhere with nothing typed
- **THEN** the document is byte-identical to what it was before the Enter, and the caret is
  where the gesture sent it

#### Scenario: One undo returns to the empty place
- **WHEN** a place is removed on abandonment and undo is pressed once
- **THEN** the place is back — the removal is a real edit, not a silent rewind past the
  keypress that made it

#### Scenario: An unused empty item is removed on leaving
- **WHEN** Enter at the end of a list item creates an empty `- `, and the caret is then
  moved elsewhere with nothing typed
- **THEN** the empty item is gone

#### Scenario: A place at the document's end is removed too
- **WHEN** the place occupies the last line, so there is no following line break to take,
  and it is abandoned
- **THEN** it is removed by taking the preceding line break — the removal is never a no-op

#### Scenario: Leaving a list leaves no blank line, whatever the list's parent
- **WHEN** a run of Enters walks an item out of a list and past it, for a list at the top
  level, under a heading, and under a paragraph
- **THEN** no blank line remains in any of the three, even though the operation that
  dissolves the item differs between them

#### Scenario: Backspace cancels the position it is on
- **WHEN** Enter at the end of a paragraph widens the gap and Backspace is pressed with the
  caret still on the resulting blank line
- **THEN** the document is byte-identical to what it was before the Enter and the caret is at
  the content end of the paragraph above — the gap is not narrowed by one line, and the two
  paragraphs around it are not merged

#### Scenario: Backspace cancels an empty node the same way
- **WHEN** Enter at the end of a list item creates an empty `- ` and Backspace is pressed at
  its content start
- **THEN** the empty item is gone and the caret is at the end of the item above, which is
  also what the merge rule would produce — the two readings agree

#### Scenario: A used position is left alone
- **WHEN** text is typed on the created position before the caret moves away
- **THEN** nothing is removed, and both the keypress and the typing remain in the history as
  the separate steps they are

#### Scenario: A note without outline mode is never touched
- **WHEN** the editor's own Enter inserts a newline in a note with outline mode off, and the
  caret is then moved away
- **THEN** the newline remains — no place was recorded, and nothing is removed

#### Scenario: An intervening change disables the cleanup
- **WHEN** anything else changes the document between the keypress and the caret moving
  away
- **THEN** no cleanup happens and the empty place remains, exactly as it does today

#### Scenario: Undo remains one step per structural operation
- **WHEN** a structural operation is used normally — its position typed into — and undo is
  pressed once
- **THEN** the behavior is unchanged from before this requirement: one undo step, restoring
  the pre-operation document and cursor

### Requirement: Known limitations of place removal
Two shapes are NOT covered, both found by real-vault use. They are recorded rather than
specified away: knowing which shapes the guarantee holds for is worth more than a
requirement that quietly overstates it. Neither SHALL be read as permitted behaviour — each
is a defect with a known cause and a known fix, and the requirement above continues to
state what the removal is FOR.

A place opened OVER A BLOCK SELECTION is not removed cleanly: the keypress removed the
selection and opened the place in one transaction, and the plan's changes are a MINIMAL DIFF
in which those two are not separable — for a paragraph between two others the whole edit is a
single replacement of its text by a blank line. The removal therefore cannot subtract only
the place. Closing this means the PLANNER carrying the exact removal edit, computed where the
intermediate state (after the selection went, before the key acted) is still known, instead
of the cleanup deriving one.

A place restored by REDO cannot be declined a second time. Abandoning it once removes it;
redoing brings it back with the caret in it, and abandoning again does nothing, leaving a gap
that ordinary caret motion skips over. The recorder re-arms only for this plugin's own
dispatches, and a redo is not one. Two ways to recognise it were tried — the editor's own
`redo` user event, and a history-depth test — and neither fired, which suggests the host's
redo does not run through the editor library's history command at all.

#### Scenario: A block-selection place is not removed cleanly
- **WHEN** a block selection is replaced by Enter and the resulting place is abandoned
- **THEN** the outcome is not the specified one, and the limitation is documented rather
  than the requirement being weakened to match it

#### Scenario: A redone place cannot be declined again
- **WHEN** an abandoned place is restored by redo and abandoned a second time
- **THEN** nothing happens, and removing it requires an explicit undo
