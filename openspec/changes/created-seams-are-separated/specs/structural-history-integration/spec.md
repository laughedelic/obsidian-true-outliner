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
  SHALL state the REMOVAL OF THAT LINE instead, together with the blank lines it wrote beside the
  place. What remains between the place's neighbours is what the note held around the dissolved
  item, unless that is empty and outside a list: that seam is at the dissolve's edit site, per
  `structural-operations`' `A seam at an operation's edit site is separated`, and it holds one blank line. Reversing such an operation would restore
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
  where it was beyond what the removal writes, and the document is exactly what the removal alone
  would have produced

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
- **THEN** no blank line remains in any of the three beyond the one blank line the seam below the list takes at the edit site, even though the operation that dissolves the item differs between them

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

### Requirement: A carried place is declined like a fresh one

A place that still has a removal record when a structural key CARRIES it — in the sense "An open
place stays known for as long as it is open" gives the word — SHALL still have one after the carry.
Tab, Shift+Tab, the empty-item ladder's outdent and unwrap, and the equivalent commands all carry
in this sense. Each begins with the caret on the place and acts on the node the place stands for or
belongs to. A key that opens a SECOND place beside the first, such as Shift+Enter on an empty item,
does not carry the first: it creates a place of its own, as "An unused structural keypress has its
place removed" states. The rule holds across any run of carries, since each one leaves the place
with a record for the next.

Every gesture that declines a fresh place SHALL decline a carried one the same way. That means
moving the caret away with nothing typed, Backspace, Delete, Enter on the place, and any other
gesture whose selection leaves it.

What the removal does depends on what the place was when it was OPENED, not on the key, and not on
what a carry has since turned it into:

- A place opened as a PROVISIONAL POSITION SHALL be removed as its line, together with the blank
  lines its opening keypress wrote beside it to separate it (`structural-operations`' `A seam at an
  operation's edit site is separated`, and "Provisional positions" in `outline-keyboard-grammar`). The
  opening keypress records those lines, and a carry keeps them with the position's line. What the carrying keys did to the node the
  position belongs to SHALL stand: the item stays where Tab put it.
- A place opened as an EMPTY NODE is the only thing the carrying keys acted on. Declining it SHALL
  therefore return the document to what it was before the keypress that opened it. That holds even
  where a carry dissolved the node into a blank line, as the ladder's outdent does under a
  paragraph. The carries are reverted along with
  the node, and so is everything they did on the way: siblings an outdent re-parented under the
  empty node, runs a carry renumbered, blank lines the user wrote around it. Removing only the
  node's own line or subtree was measured to lose blank lines and to re-parent or delete siblings
  (`docs/research/carried-place-removal`).

This adds to the two removal forms "An unused structural keypress has its place removed" states,
and for a place opened as an empty node it takes precedence over the dissolution form. When the
empty-item ladder dissolves an item that Enter has just made, declining the residue reverts the
dissolve along with the Enter. The item still does not come back, since it did not exist before
the Enter, but a sibling the dissolve moved goes back where it was. The dissolution form still
governs an empty item nothing just opened. Where the reversal cannot be composed with the record
it follows, the dissolution form applies as before. Its
removal is still stated by the operations involved and never derived from the resulting document.
A position's line is stated by the carrying operation against its own result. A node's reversal is
the carrying operation's own reversal, composed with the removal the place held before that carry.
The removal a place was opened with SHALL NOT simply be mapped through a carry. A carry's change
set is the minimal change of the whole operation, and a removal mapped through it misses what the
carry wrote into the place's line. Measured, the carry's new indentation is left on the end of the
item's line as trailing spaces (`docs/research/carried-place-removal`).

A carry keeps a removal record only where one was live on the place the carry began on. It SHALL
NOT make one where there was none. The one reachable case is a place brought back by UNDO: the undo
changes the document, which ends both records, so the place it restores cannot be declined. That
extends "Known limitation — a redone place cannot be declined again" to undo.

Backspace on a carried place SHALL return the caret to where the keypress that OPENED the place
started, carried through every key since. That includes a Shift+Tab over a gap position, which
the creating test also names. A key that opened a second place is that place's opening key, so
Backspace on it returns to where that key started, as it does today. Delete SHALL go to the content start of the node below.
Moving away SHALL leave the caret where the gesture sent it.

The removal SHALL be its own history entry, as every removal is. One undo SHALL therefore return to
the carried place, not to the place as it stood before the carry.

#### Scenario: One Backspace removes a position Tab carried
- **WHEN** Shift+Enter at the end of a list item opens a position, Tab indents the item, and
  Backspace is pressed on the position
- **THEN** the position's line is gone, the item stays indented, and the caret is at the end of the
  item's own text

#### Scenario: Walking away removes a position Tab carried
- **WHEN** Shift+Enter at the end of a list item opens a position, Tab indents the item once or
  twice, and the caret is then moved away with nothing typed
- **THEN** no line of whitespace is left in the file, and the item stays where the Tabs put it

#### Scenario: Enter on a carried position moves past it and removes it
- **WHEN** Shift+Enter at the end of a list item opens a position, Tab indents the item, and Enter
  is pressed on the position
- **THEN** the position's line is gone and the caret is at the content start of the node below, as
  it is for a position no key carried

#### Scenario: Backspace after Shift+Tab returns to where the position was opened
- **WHEN** Shift+Enter at the end of a nested list item that has a sibling list item after its
  parent opens a position, Shift+Tab outdents the item, and Backspace is pressed on the position
- **THEN** the position's line is gone and the caret is at the end of the item's own text, not in
  the node below

#### Scenario: An empty bullet item Tab carried is removed on leaving
- **WHEN** Enter at the end of a list item creates an empty item, Tab indents it under the item
  above, and the caret is then moved away with nothing typed
- **THEN** the document is what it was before the Enter

#### Scenario: An empty ordered item Tab carried leaves its run numbered as before
- **WHEN** Enter at the end of `1. a`, above `2. b`, creates an empty item, Tab indents it under
  `a`, and the caret is then moved away
- **THEN** the list reads `1. a` `2. b`

#### Scenario: An empty ordered item Shift+Tab carried is removed from the run it joined
- **WHEN** Enter at the end of a nested ordered item creates an empty item, Shift+Tab outdents it
  into its parent's run ahead of a later item, and the caret is then moved away
- **THEN** the document is what it was before the Enter, the later item's number included

#### Scenario: The empty-item ladder's outdent carries the item too
- **WHEN** Enter at the end of a nested list item creates an empty item, a second Enter outdents
  it, and the caret is then moved away
- **THEN** the document is what it was before the first Enter

#### Scenario: An item dissolved under a paragraph puts its adopted sibling back
- **WHEN** under a paragraph, Enter at the end of a nested list item that has a following sibling
  creates an empty item, a second Enter dissolves it into a blank line and moves the sibling out
  to the paragraph's level, and the caret is then moved away
- **THEN** the document is what it was before the first Enter, the sibling back in its list

#### Scenario: A second place beside the first is declined on its own
- **WHEN** Enter at the end of a list item creates an empty item, Shift+Enter on it opens a
  position below, and Backspace is pressed on the position
- **THEN** the position is gone, the caret is on the empty item, and the empty item is still there

#### Scenario: Siblings an outdent adopted go back where they were
- **WHEN** Enter at the end of a nested list item that has a following sibling creates an empty
  item, a second Enter or Shift+Tab outdents it so that the following sibling becomes its child,
  and the caret is then moved away
- **THEN** the document is what it was before the first Enter, and the sibling is back under its
  original parent

#### Scenario: Declining a carried item keeps the blank lines around the list
- **WHEN** the list the empty item was created in is followed by a blank line and a paragraph, the
  item is carried by Tab or by the ladder's outdent, and the caret is then moved away
- **THEN** the blank line is still there and the paragraph is still its own node

#### Scenario: One undo returns to the carried place
- **WHEN** a carried place is removed on abandonment and undo is pressed once
- **THEN** the place is back where the carry left it

#### Scenario: A carried place that was typed on is left alone
- **WHEN** Tab carries a position, text is typed on it, the text is deleted, and the caret moves
  away
- **THEN** nothing is removed — typing ended the removal record, and nothing restored it
