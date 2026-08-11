## MODIFIED Requirements

<!-- Restated on top of `abandon-removes-only-the-place`'s own version of this requirement,
     which is complete but not yet synced into the main spec. That change must be synced or
     archived first; the paragraph on abandonment below is its text, carried through unedited. -->

### Requirement: Provisional positions
An accepted structural keypress MAY leave the cursor on a blank or whitespace-only line that
belongs to no node's own lines. Such a line is a PROVISIONAL POSITION: it holds the place
where a node, or a node's continuation line, materializes as soon as text is typed there,
and until then it is blank space in the file.

A provisional position is a cursor position, not a node. The OUTLINE — the tree this plugin
presents, decorates, and operates on — SHALL have the same nodes before and after the keypress
that created a position, and for as long as the position is open. This holds in both
directions, and each has a shape that reaches it:

- A position SHALL add no node. An end-of-node position is blank-separated or adjacent to the
  node above, and in neither case does the blank line itself parse as content.
- A position SHALL remove no node, and SHALL move no line out of the node it belonged to. A
  position opened INTERIOR to a node — Shift+Enter at the end of a line that is not that
  node's last — writes a blank line between lines that were the node's own. The RAW PARSE of
  the buffer does gain a node there: a blank line ends a node's own lines, so the lines below
  the position re-parse as a separate node, one level deeper where the bisected node is a list
  item. That is a property of the encoding, not of the outline, and typing one character
  reverses it. The outline SHALL be the one the position stands for, in which those lines are
  still the node's own.

The two kinds SHALL be distinguishable from the DOCUMENT ALONE, with no editor state and no
record of which key was pressed:

- Enter's provisional position SHALL be blank-separated from the content above it and below
  it, so text typed there parses as a node distinct from both neighbours.
- Shift+Enter's provisional position SHALL be ADJACENT to the node above it, so text typed
  there parses as that node's own continuation line.

This is the reason an end-of-node Enter widens a gap by two lines rather than reusing the
single blank line that already separates two nodes. The narrower encoding was evaluated and
is provably ambiguous: at the end of a top-level paragraph both keys leave the cursor at
column 0 of the line below, and the only remaining difference is gap width, which
`node-edit-enforcement` forbids reading editing intent from. Resolving it would require
remembering which key ran — the editor state this design does not have.

The same reading answers the interior position without a new rule. Nothing separates the line
below an interior position from the position itself, so a character typed there joins the two:
in the MATERIALIZED parse — the parse of the document with the position's own line filled in,
which is the outline the position stands for — that line is one of the node's own lines,
exactly as the position's own line is. The RAW parse of the buffer, with the position still
blank, is the one that says otherwise, and it is that discrepancy the outline resolves.

A provisional position SHALL behave as the empty node it stands for whenever the user acts on
it as one. Moving the cursor away without typing, and deleting it with Backspace or Delete,
both remove the position and everything the operation that opened it did — and NOTHING the
same keypress did before that operation — rather than leaving debris or editing the
surrounding gap by one line. Where the keypress removed a non-empty selection first, that
removal stands. `structural-history-integration`'s "An unused structural keypress has its
place removed" states the rule, including the case where the position is not opened but left
behind as the residue of leaving a list, which is removed rather than reversed.

A structural keypress dispatched WHILE a position is open SHALL act on the outline above, not
on the raw parse. Which node a key targets, which lines move with it, and which lines a
node-granular selection covers SHALL all be what they would be with no position open.

#### Scenario: The keypress creates no node
- **WHEN** Enter is pressed at the end of a childless paragraph
- **THEN** the document's node count is unchanged, and the cursor sits on a blank line with
  a blank line between it and each neighbour

#### Scenario: An interior position removes no node either
- **WHEN** Shift+Enter is pressed at the end of the first line of a two-line list item
- **THEN** the outline still holds one list item whose own lines are both the first line and
  the line below the position, and no paragraph child exists

#### Scenario: Typing materializes a new node
- **WHEN** text is typed on Enter's provisional position
- **THEN** it becomes a node distinct from the nodes above and below it, with no further
  keypress and no rewrite

#### Scenario: Typing materializes a continuation line
- **WHEN** text is typed on Shift+Enter's provisional position
- **THEN** it becomes the second line of the node above it, which stays one node

#### Scenario: Typing on an interior position rejoins the whole node
- **WHEN** text is typed on a position opened interior to a multi-line node
- **THEN** the node holds every one of its own lines again — the lines above the position, the
  typed line, and the lines below it — as one node, with no further keypress and no rewrite

#### Scenario: The two are distinguishable without state
- **WHEN** the same document position is reached by Enter and by Shift+Enter at the end of
  the same top-level paragraph
- **THEN** the two documents differ, and typing the same character into each yields a new
  node in the first case and a continuation line in the second

#### Scenario: A position opened over a selection is abandoned without restoring it
- **WHEN** a non-empty selection is replaced by a provisional position, and the cursor is then
  moved away with nothing typed
- **THEN** the position is gone in full and the selection stays removed

#### Scenario: A structural key acts on the node the position is in
- **WHEN** a position is open interior to a list item that has no children, and Tab, Shift+Tab,
  or a move is pressed
- **THEN** the operation treats the item's lines below the position as the item's own, moving
  or re-indenting them with it and never as a child subtree, and the result is what the same
  key produces on the same item with no position open

#### Scenario: Node-granular selection sees one node
- **WHEN** a position is open interior to a node and the selection is extended by one node
- **THEN** the selection covers that whole node, its lines below the position included, rather
  than stopping at the position
