## MODIFIED Requirements

### Requirement: Structural key bindings
In outline mode, high-precedence bindings SHALL map Tab → indent node, Shift+Tab →
outdent node, Alt+ArrowUp → move node up, Alt+ArrowDown → move node down, targeting the
node at the cursor line. Each accepted operation SHALL dispatch as one CM6 transaction
(annotated with a `userEvent`) forming a single undo step. Rejections SHALL show the
transient cue and change nothing.

The dispatched selection SHALL come from `caret-placement-policy`, the same procedure the
command palette and the enforcement rewrite path use. This requirement states which case
each binding falls into; it does not restate the rule.

Move up and move down are SUBJECT placements — the moved node's own new location, which is
not recoverable by mapping the pre-operation cursor through the change set. A moved
heading's caret sits at column 0, before its `#` characters, per that capability's single
content-start definition. Indent and outdent are DERIVED placements — the pre-operation
cursor mapped forward through their (minimal) change set, preserving the column the user
was at rather than resetting to the node's content start, falling back to the subject
placement when the mapped position would not be caret-addressable.

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

#### Scenario: Moving a heading lands the caret at column 0
- **WHEN** Alt+ArrowUp or Alt+ArrowDown moves a heading
- **THEN** the caret is at column 0 of the heading's line, before the `#` characters,
  matching where Home lands on that line
