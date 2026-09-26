## MODIFIED Requirements

### Requirement: An open place stays known for as long as it is open

WHICH LINE holds an open place is a fact this plugin SHALL keep for as long as the place is open,
and SHALL keep separately from whether the keypress in front of it created one. The operation path
reads the first (`outline-keyboard-grammar`, "Provisional positions"); the removal-on-abandonment
above reads the second. A single answer serving both was measured to scope the first to one
keypress: the second structural key on the same place read it as an ordinary blank line and edited
the document accordingly (`docs/research/decoration-follow-ups`).

The two facts are kept apart by their CONDITIONS, not by how long each lasts. A carry keeps both
where both were held: "A carried place is declined like a fresh one" states what the removal record
does across a carry. It does not let a carry start a removal record where none was held.

The two facts SHALL be established by different tests, stated over the same transaction:

- A place is CREATED by the dispatches "An unused structural keypress has its place removed" names,
  on the terms it names them. Nothing here widens that test, and an operation that merely relocated
  an already-empty item SHALL still create nothing.
- A place is CARRIED by a dispatch of this plugin's that began with the caret on the open place and
  left the caret on an empty place. A dispatch that did not begin on one SHALL NOT mark a blank
  line as a place, whatever its caret lands on.

Which keys carry SHALL be decided by measurement rather than by category, because it depends on
where the operation's own caret rule sends the caret. Indent and outdent carry: their caret follows
the place they moved (`caret-placement-policy`, "A derived caret follows the place it was on"). A
MOVE does not: its caret is its subject's content start, so it leaves no place at the caret for the
fact to be about, and the place it relocated is left behind with the node.

The two tests OVERLAP, and the overlap is not a defect to remove. Outdent is already named by the
creating test for a GAP place, so the carrying test decides nothing there; it decides only for a
NODE place, whose own line no consumer resolves today. Indent is the key whose answer any consumer
currently sees. The rule SHALL nonetheless be stated over what an operation DOES to a place, not
over which test happens to answer first, so that an operation added later inherits it.

The place fact SHALL be invalidated by a change to the DOCUMENT and by nothing else. A movement
through history that leaves the document alone leaves the place where it is. The undo-depth
backstop the removal record carries SHALL NOT be applied to it: that backstop exists because a
removal is an EDIT and the editor joins typing into the keypress's own history entry, and a fact
about which line holds a place issues no edit.

Where the fact is absent — nothing created or carried a place, or a document change dropped it — a
blank line SHALL be treated as an ordinary gap, which is what `outline-keyboard-grammar` already
requires and is always safe.

#### Scenario: A second structural key still knows the place
- **WHEN** Shift+Enter opens a position inside a list item, Tab indents the item, and Shift+Tab
  outdents it again
- **THEN** the document is what one Shift+Enter alone leaves — the position at the item's
  continuation indent, and the item's own lines below it moved with it — and the caret is on the
  position

#### Scenario: Either carrying key holds it, in either order
- **WHEN** the same position is carried by Shift+Tab first and Tab second
- **THEN** the result is the same as carrying it by Tab first and Shift+Tab second, and neither
  key leaves the position at a width the item no longer has

#### Scenario: A key that did not start on a place creates none
- **WHEN** a structural key is pressed with the caret on a node's own line, in a document that also
  holds a blank line the user authored
- **THEN** no place is recorded, and a later key on that blank line acts on the node that owns the
  gap

#### Scenario: The removal record keeps its own conditions
- **WHEN** Tab carries a place, undo is pressed once, and the caret is then moved away with nothing
  typed
- **THEN** nothing is removed — the undo changed the document, which ended both records, and the
  place it brought back has none, as a redone place has none

#### Scenario: A document change drops the place
- **WHEN** anything other than a dispatch that creates or carries a place changes the document
- **THEN** the place fact is gone and the next structural key reads an ordinary blank line

## ADDED Requirements

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

- A place opened as a PROVISIONAL POSITION SHALL be removed as its line. What the carrying keys did to the node the
  position belongs to SHALL stand: the item stays where Tab put it.
- A place opened as an EMPTY NODE is the only thing the carrying keys acted on. Declining it SHALL
  therefore return the document to what it was before the keypress that opened it. That holds even
  where a carry dissolved the node into a blank line, as the ladder's outdent does under a
  paragraph. The carries are reverted along with
  the node, and so is everything they did on the way: siblings an outdent re-parented under the
  empty node, runs a carry renumbered, blank lines the user wrote around it. Removing only the
  node's own line or subtree was measured to lose blank lines and to re-parent or delete siblings
  (`docs/research/carried-place-removal`).

This adds to the two removal forms "An unused structural keypress has its place removed" states. Its
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
