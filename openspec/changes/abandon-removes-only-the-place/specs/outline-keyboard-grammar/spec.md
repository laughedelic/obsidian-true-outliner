## MODIFIED Requirements

### Requirement: Provisional positions
An accepted structural keypress MAY leave the cursor on a blank or whitespace-only line that
belongs to no node's own lines. Such a line is a PROVISIONAL POSITION: it holds the place
where a node, or a node's continuation line, materializes as soon as text is typed there,
and until then it is blank space in the file. A provisional position is a cursor position,
not a node — the tree SHALL have the same node count before and after the keypress that
created it.

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

A provisional position SHALL behave as the empty node it stands for whenever the user acts on
it as one. Moving the caret away without typing, and deleting it with Backspace or Delete,
both remove the position and everything the operation that opened it did — and NOTHING the
same keypress did before that operation — rather than leaving debris or editing the
surrounding gap by one line. Where the keypress removed a non-empty selection first, that
removal stands. `structural-history-integration`'s "An unused structural keypress has its
place removed" states the rule, including the case where the position is not opened but left
behind as the residue of leaving a list, which is removed rather than reversed.

#### Scenario: The keypress creates no node
- **WHEN** Enter is pressed at the end of a childless paragraph
- **THEN** the document's node count is unchanged, and the cursor sits on a blank line with
  a blank line between it and each neighbour

#### Scenario: Typing materializes a new node
- **WHEN** text is typed on Enter's provisional position
- **THEN** it becomes a node distinct from the nodes above and below it, with no further
  keypress and no rewrite

#### Scenario: Typing materializes a continuation line
- **WHEN** text is typed on Shift+Enter's provisional position
- **THEN** it becomes the second line of the node above it, which stays one node

#### Scenario: The two are distinguishable without state
- **WHEN** the same document position is reached by Enter and by Shift+Enter at the end of
  the same top-level paragraph
- **THEN** the two documents differ, and typing the same character into each yields a new
  node in the first case and a continuation line in the second

#### Scenario: A position opened over a selection is abandoned without restoring it
- **WHEN** a non-empty selection is replaced by a provisional position, and the caret is then
  moved away with nothing typed
- **THEN** the position is gone in full and the selection stays removed
