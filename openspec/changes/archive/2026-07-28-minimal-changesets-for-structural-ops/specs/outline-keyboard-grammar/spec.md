## MODIFIED Requirements

### Requirement: Structural key bindings
In outline mode, high-precedence bindings SHALL map Tab → indent node, Shift+Tab →
outdent node, Alt+ArrowUp → move node up, Alt+ArrowDown → move node down, targeting the
node at the cursor line. Each accepted operation SHALL dispatch as one CM6 transaction
(annotated with a `userEvent`) forming a single undo step. Rejections SHALL show the
transient cue and change nothing.

Move up and move down SHALL place the selection at the operation's explicit cursor
result, since their resulting position (the moved node's own new location) is not
recoverable by mapping the pre-operation cursor through the change set. Indent and
outdent SHALL instead place the selection at the pre-operation cursor mapped forward
through their (minimal) change set, preserving the column the user was at rather than
resetting to the node's content start — falling back to the operation's own cursor when
that mapped position would not be caret-addressable. See `minimal-change-dispatch`,
which owns that rule and its reasons.

The mapping SHALL be computed and stated explicitly rather than left to the editor's own
default: the default and the mapping the undo history uses to restore a redo disagree at
an exact change boundary, which is where Tab most often puts the caret.

#### Scenario: Tab indents against core default
- **WHEN** Tab is pressed with the cursor on a list item that has a previous sibling
- **THEN** the mapping-core indent op's edits are applied as one transaction and the
  cursor stays at the same relative column within the indented text, not reset to the
  node's content start

#### Scenario: Rejection changes nothing
- **WHEN** Tab is pressed on a node with no previous sibling
- **THEN** the document, selection, and undo history are unchanged and the cue appears

#### Scenario: Move places the cursor at the moved node's content start
- **WHEN** Alt+ArrowUp or Alt+ArrowDown moves a node
- **THEN** the transaction states the moved node's own resulting cursor explicitly, and
  the selection lands there
