## MODIFIED Requirements

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
  STARTED; after Delete it goes to the content start of the node below. Without this, Delete
  would shrink the separation that makes the position typeable and leave a caret on a blank
  line that silently joins its neighbour.

  Where the keypress started is a fact about the KEYPRESS, not about the resulting document,
  and SHALL be treated as one. It is the content end of the node above the place for the
  common shapes, and that coincidence SHALL NOT be relied on: a drafted sibling heading is
  written after the original heading's whole section, so the node above the place is that
  section's last node while the keypress started at the heading. Where the keypress had NO
  caret to start from — it replaced a non-empty selection — there is nothing to return to,
  and the caret SHALL go to the content end of the node above the place instead.

A REMOVAL, not an undo of the keypress. Undoing was specified first and withdrawn: it
reverts everything the keypress did, and a keypress can do more than open a place — Enter
over a block selection removes the selection AND opens one, so undoing it brought the
deleted text back. Removal also leaves a real history entry, so ONE undo returns to the
empty place, which is what a user who changes their mind twice expects.

THE REMOVAL EDIT IS STATED BY THE OPERATION THAT MADE THE PLACE, from the document as that
operation found it, and carried to the point of removal. It SHALL NOT be derived from the
resulting document — not from how many lines the transaction grew by, not from where the
caret came to rest, not from the shape of the change set.

Deriving it is not merely fragile, it is impossible in the general case. A keypress may do
more than open a place, and what reaches the editor is a MINIMAL DIFF of the whole
transformation, in which a removal and an insertion touching the same lines are one
replacement. The two steps cannot be recovered from it afterwards; they exist separately
only while the operation is being composed.

Two forms, chosen by what the operation MEANT and not by which key ran:

- An operation whose PURPOSE was to open the place SHALL state its own REVERSAL — the edit
  returning the document to the text that operation acted on. Everything that operation did
  goes, INCLUDING any renumbering or re-indentation it performed on its way in; everything
  the same keypress did BEFORE it stands. Stating it in bytes is what makes this exact
  without anything having to decide which of those effects counts as part of the place.
- An operation that DISSOLVED A NODE into a blank line, leaving the place as its residue,
  SHALL state the REMOVAL OF THAT LINE instead. Reversing such an operation would restore
  the node the user deliberately dissolved — the item they pressed Enter to leave — which is
  the opposite of abandoning the blank it left behind.

Where a keypress removed a non-empty selection before acting, abandoning SHALL return the
document to the state THE REMOVAL produced, not to the state before the keypress. The
selection stays deleted; only the place opened over it goes.

The removal SHALL be exact wherever the place sits, including on the document's last line
and in a file that does not end with a line break. Neither is a special case to be handled
by its own arithmetic: a stated edit already describes the bytes it removes.

WHICH DISPATCHES CREATE A PLACE is decided by where the caret lands, not by which key ran.
A dispatch of this plugin's that leaves the caret on a GAP LINE necessarily created that
position — a gap line is a place and not a node, so there was nothing there to land on. An
EMPTY NODE is different: it can pre-exist the keypress, so only the dispatches that
materialize one qualify, or an outdent that merely moved an already-empty item would be
recorded and then removed out from under the user.

This test SHALL remain independent of whether an operation stated a removal edit. The two
answer different questions — one whether a place was left, the other how to remove it — and
where they disagree the result SHALL be no cleanup, which is the safe direction.

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
the empty place rather than past the keypress. This holds for a removal that RESTORES bytes
as well as one that only deletes them.

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

#### Scenario: A place opened over a block selection leaves the removal standing
- **WHEN** whole subtrees are block-selected, Enter replaces them with one empty position,
  and the caret is then moved away with nothing typed
- **THEN** the selected subtrees are still gone, the position is gone with no blank line left
  where it was, and the document is exactly what the removal alone would have produced

#### Scenario: Removal restores an ordered run's numbering
- **WHEN** Enter at the end of `1. a` in a `1.` `2.` `3.` list creates an empty item, which
  renumbers the items below it, and the position is then abandoned
- **THEN** the list reads `1.` `2.` `3.` again, not `1.` `3.` `4.` — the renumbering the
  keypress performed is part of what the removal reverses

#### Scenario: A place at the document's end is removed too
- **WHEN** the place occupies the document's last lines, whether or not the file ends with a
  line break, and it is abandoned
- **THEN** the file is byte-identical to what it was before the keypress — the removal is
  never a no-op and never leaves a blank line behind

#### Scenario: Leaving a list leaves no blank line, whatever the list's parent
- **WHEN** a run of Enters walks an item out of a list and past it, for a list at the top
  level, under a heading, and under a paragraph
- **THEN** no blank line remains in any of the three, even though the operation that
  dissolves the item differs between them

#### Scenario: Leaving a list is not undone by abandoning its residue
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

#### Scenario: Backspace after drafting a sibling heading returns to the heading
- **WHEN** Shift+Enter at the end of a heading that HAS a section drafts the next heading
  after that section, and Backspace is pressed on the empty heading it made
- **THEN** the caret is at the content end of the ORIGINAL heading, where the keypress
  started — not at the end of the section's last node, which is the node above the place

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

## ADDED Requirements

### Requirement: Known limitation — a redone place cannot be declined again
One shape is NOT covered, found by real-vault use. It is recorded rather than specified
away: knowing which shapes the guarantee holds for is worth more than a requirement that
quietly overstates it. It SHALL NOT be read as permitted behaviour — it is a defect with a
known cause, and the requirement above continues to state what the removal is FOR.

A place restored by REDO cannot be declined a second time. Abandoning it once removes it;
redoing brings it back with the caret in it, and abandoning again does nothing, leaving a gap
that ordinary caret motion skips over. The recorder re-arms only for this plugin's own
dispatches, and a redo is not one — it replays the changes without the removal edit the
original dispatch carried. Two ways to recognise it were tried — the editor's own `redo`
user event, and a history-depth test — and neither fired, which suggests the host's redo does
not run through the editor library's history command at all.

#### Scenario: A redone place cannot be declined again
- **WHEN** an abandoned place is restored by redo and abandoned a second time
- **THEN** nothing happens, and removing it requires an explicit undo

## REMOVED Requirements

### Requirement: Known limitations of place removal
**Reason**: It recorded two limitations and one of them is closed by this change — a place
opened OVER A BLOCK SELECTION is now removed cleanly, because the removal edit is stated by
the operation that made the place, computed where the intermediate state is still known,
which is exactly what that limitation named as its fix. A requirement that lists known
limitations cannot keep a scenario asserting a defect that no longer reproduces, so it is
replaced rather than edited.

**Migration**: The surviving limitation is carried through verbatim as "Known limitation — a
redone place cannot be declined again", with its scenario unchanged. The block-selection
behaviour it described is now specified positively, by the "A place opened over a block
selection leaves the removal standing" scenario of "An unused structural keypress has its
place removed".
