## RENAMED Requirements

- FROM: `### Requirement: An unused structural keypress is undone, not deleted`
- TO: `### Requirement: Abandoning an empty place removes exactly what opened it`

## MODIFIED Requirements

### Requirement: Abandoning an empty place removes exactly what opened it
A structural keypress that creates an EMPTY PLACE — a provisional position, an empty list
item, an empty heading — and is then abandoned SHALL have that place removed, and NOTHING
ELSE about the keypress SHALL be reversed with it.

Two gestures count as declining the place, and both resolve the same way:

- MOVING THE CARET away from it without typing there. The caret then goes where the gesture
  was headed, mapped through the removal.
- DELETING it — Backspace or Delete with the caret on it. A provisional position is treated
  as the empty node it stands for, so a deletion gesture removes the WHOLE place rather than
  narrowing the gap around it. After Backspace the caret goes where the cancelled keypress
  started, which is the content end of the node above; after Delete it goes to the content
  start of the node below. Without this, Delete would shrink the separation that makes the
  position typeable and leave a caret on a blank line that silently joins its neighbour.

**The removal is STATED, never derived.** The edit that removes the place SHALL be determined by the OPERATION THAT OPENED IT, from
the document as it stood before that operation acted, and SHALL be carried to the point of
removal. It SHALL NOT be reconstructed from the resulting document — not from how many lines
the transaction grew by, not from where the caret came to rest, not from the shape of the
change set.

Deriving it is not merely fragile, it is impossible in the general case: a keypress may do
more than open a place, and the change set that reaches the editor is a minimal description
of the whole transformation, in which a removal and an insertion that touch the same lines
are one replacement. The information needed to separate them exists only while the operation
is being composed.

Two forms, chosen by what the operation MEANT, not by which key ran:

- An operation whose PURPOSE was to open the place SHALL state its own REVERSAL — the edit
  that returns the document to the text that operation acted on. Everything that operation
  did is undone, including any renumbering it performed; everything the same keypress did
  BEFORE it stands.
- An operation that DISSOLVED A NODE into a blank line, leaving the place as its residue,
  SHALL state the REMOVAL OF THAT LINE instead. Reversing such an operation would restore
  the node the user deliberately dissolved — the item they pressed Enter to leave — which is
  the opposite of abandoning the blank it left behind.

Where a keypress removed a non-empty selection before acting, abandoning SHALL return the
document to the state the REMOVAL produced, not to the state before the keypress. The
selection stays deleted; only the place opened over it goes.

**The removal is its own history step.** It SHALL be a new edit rather than an undo of the keypress. An undo reverts
everything the keypress did, which is wrong precisely for the keypresses that did more than
open a place, and it leaves no step to return to. As its own edit it forms its own history
entry, so a single undo brings the abandoned place back for a user who changes their mind
twice, and a second undo reaches the state before the keypress.

Where the plugin cannot establish that the recorded place is still the one the caret is on,
or that nothing else has changed the document since, it SHALL do nothing. Leaving the empty
place is the pre-existing behavior and is always safe.

The guarantee that an abandon can never take the user's typing with it rests on a property
of this plugin's own `userEvent` values: the editor's history joins a new change into the
previous entry only for events matching its join test (`input.type` and `delete` families),
and no structural `userEvent` this plugin dispatches can match it. A structural keypress is
therefore always its own history entry. That property SHALL be pinned by a test, not
assumed — renaming a structural event into the `input.type` family would silently turn this
cleanup into data loss.

This cleanup SHALL apply only in outline mode, evaluated per editor and per update rather
than once when the editor is set up. Stating it is not redundant with the mode gating every
other capability has: the mechanism watches ordinary editing to notice what created a place,
and the editor's own newline carries the same line-break shape that Shift+Enter's
continuation does. Ungated, the cleanup would recognise a plain newline in a note that never
opted in and remove it when the caret moved away.

KNOWN CONSEQUENCE: immediately after a cleanup, REDO re-applies the removed edit and
re-creates the empty place at a position the caret has left. The re-applied change carries no
record of what opened it, so that place cannot be abandoned a second time. Any other edit
clears the redo branch, so this is reachable only when redo is the very next action. It is
recorded rather than specified away.

#### Scenario: An unused blank position is removed on leaving
- **WHEN** Enter at the end of a paragraph widens the gap, and the caret is then moved
  elsewhere with nothing typed
- **THEN** the document is byte-identical to what it was before the Enter and the caret is
  where the gesture sent it

#### Scenario: An unused empty item is removed on leaving
- **WHEN** Enter at the end of a list item creates an empty `- `, and the caret is then
  moved elsewhere with nothing typed
- **THEN** the empty item is gone and the document is byte-identical to what it was before
  the Enter

#### Scenario: A position opened over a block selection leaves the removal standing
- **WHEN** whole subtrees are block-selected, Enter replaces them with one empty position,
  and the caret is then moved away with nothing typed
- **THEN** the selected subtrees are still gone, the position is gone with no blank line left
  where it was, and the document is exactly what the removal alone would have produced

#### Scenario: Abandoning restores an ordered run's numbering
- **WHEN** Enter at the end of `1. a` in a `1.` `2.` `3.` list creates an empty item — which
  renumbers the items below it — and the position is then abandoned
- **THEN** the list reads `1.` `2.` `3.` again, not `1.` `3.` `4.`

#### Scenario: Abandoning at the end of a document removes the whole position
- **WHEN** Enter at the end of the last node of a file opens a position, and it is then
  abandoned
- **THEN** the file is byte-identical to what it was before the Enter, whether or not it ends
  with a newline — no blank line is left behind and the removal is never a no-op

#### Scenario: Leaving a list is not undone by abandoning the blank it left
- **WHEN** Enter on an empty list item leaves the list, dissolving the item into a blank
  line, and the caret is then moved away
- **THEN** the blank line is gone and the list item is NOT restored — the departure was
  deliberate, and only its residue is abandonable

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

#### Scenario: Cleanup never swallows preceding typing
- **WHEN** text is typed and Enter is pressed immediately afterwards, within the editor's
  history grouping window, and the created position is then abandoned
- **THEN** only the Enter's effect is removed — the typed text remains

#### Scenario: One undo returns to the abandoned place
- **WHEN** a position is abandoned and undo is pressed once
- **THEN** the place is back with the document as the keypress left it, and a second undo
  reaches the document as it was before the keypress

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
