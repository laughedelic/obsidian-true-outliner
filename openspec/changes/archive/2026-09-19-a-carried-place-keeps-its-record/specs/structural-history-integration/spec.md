## ADDED Requirements

### Requirement: An open place stays known for as long as it is open

WHICH LINE holds an open place is a fact this plugin SHALL keep for as long as the place is open,
and SHALL keep separately from whether the keypress in front of it created one. The operation path
reads the first (`outline-keyboard-grammar`, "Provisional positions"); the removal-on-abandonment
above reads the second. A single answer serving both was measured to scope the first to one
keypress: the second structural key on the same place read it as an ordinary blank line and edited
the document accordingly (`docs/research/decoration-follow-ups`).

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
- **WHEN** a place is carried by Tab and the caret is then moved away with nothing typed
- **THEN** nothing is removed — the removal record does not survive the carrying key, exactly as it
  does not survive any other document change

#### Scenario: A document change drops the place
- **WHEN** anything other than a dispatch that creates or carries a place changes the document
- **THEN** the place fact is gone and the next structural key reads an ordinary blank line
