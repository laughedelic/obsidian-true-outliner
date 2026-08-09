## ADDED Requirements

### Requirement: An unused structural keypress is undone, not deleted
A structural keypress that creates an EMPTY PLACE — a provisional position, an empty list
item, an empty heading — and is then abandoned SHALL be removed by UNDOING that keypress,
never by dispatching a new change that deletes what it made.

Two gestures count as declining the place, and both resolve the same way:

- MOVING THE CARET away from it without typing there. The caret then goes where the gesture
  was headed, mapped through the undone change.
- DELETING it — Backspace or Delete with the caret on it. A provisional position is treated
  as the empty node it stands for, so a deletion gesture removes the WHOLE place rather than
  narrowing the gap around it. After Backspace the caret goes where the cancelled keypress
  started, which is the content end of the node above; after Delete it goes to the content
  start of the node below. Without this, Delete would shrink the separation that makes the
  position typeable and leave a caret on a blank line that silently joins its neighbour.

When either occurs, and the keypress that created the place is still the most recent entry
in the undo history, the plugin SHALL undo it. The document SHALL return byte-for-byte to
its prior state, and NO history entry SHALL be added for the cleanup.

Undo is the mechanism rather than a deletion for three reasons, each of which a deletion
fails: a deletion adds an undo step the user did not ask for, or is unundoable if it
suppresses one; a deletion has to decide what counts as removable content, which asks
whether a `#` is content and a bullet is chrome — a question with a real answer that has
nothing to do with abandonment; and a deletion cannot restore a gap's ORIGINAL width, only
narrow it to what the rule believes is minimal.

The guarantee rests on a property of this plugin's own `userEvent` values: the editor's
history joins a new change into the previous entry only for events matching its join test
(`input.type` and `delete` families), and no structural `userEvent` this plugin dispatches
can match it. A structural keypress is therefore always its own history entry, and undoing
it can never swallow the typing that preceded it. That property SHALL be pinned by a test,
not assumed — renaming a structural event into the `input.type` family would silently turn
this cleanup into data loss.

Where the plugin cannot establish that the creating keypress is still the most recent entry
— anything else changed the document in between, or the record was lost — it SHALL do
nothing. Leaving the empty place is the pre-existing behavior and is always safe.

KNOWN CONSEQUENCE: immediately after a cleanup, REDO re-applies the undone keypress and
re-creates the empty place at a position the caret has left. Any other edit clears the redo
branch, so this is reachable only when redo is the very next action. It is recorded rather
than specified away.

#### Scenario: An unused blank position is undone on leaving
- **WHEN** Enter at the end of a paragraph widens the gap, and the caret is then moved
  elsewhere with nothing typed
- **THEN** the document is byte-identical to what it was before the Enter, the caret is
  where the gesture sent it, and the undo history is as if the Enter never happened

#### Scenario: An unused empty item is undone on leaving
- **WHEN** Enter at the end of a list item creates an empty `- `, and the caret is then
  moved elsewhere with nothing typed
- **THEN** the empty item is gone and no cleanup transaction appears in the history

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
  also what the merge rule would produce — the two readings agree, and no cleanup transaction
  appears in the history

#### Scenario: A used position is left alone
- **WHEN** text is typed on the created position before the caret moves away
- **THEN** nothing is undone, and both the keypress and the typing remain in the history as
  the separate steps they are

#### Scenario: Cleanup never swallows preceding typing
- **WHEN** text is typed and Enter is pressed immediately afterwards, within the editor's
  history grouping window, and the created position is then abandoned
- **THEN** only the Enter is undone — the typed text remains

#### Scenario: An intervening change disables the cleanup
- **WHEN** anything else changes the document between the keypress and the caret moving
  away
- **THEN** no cleanup happens and the empty place remains, exactly as it does today

#### Scenario: Undo remains one step per structural operation
- **WHEN** a structural operation is used normally — its position typed into — and undo is
  pressed once
- **THEN** the behavior is unchanged from before this requirement: one undo step, restoring
  the pre-operation document and cursor
