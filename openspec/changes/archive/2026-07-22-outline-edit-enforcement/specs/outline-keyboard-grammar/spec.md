# outline-keyboard-grammar Delta

*(Added by amendment 2026-07-21, real-vault manual pass — see design.md's
amendment log and structural-operations' modified "Node split" requirement.)*

## MODIFIED Requirements

### Requirement: Enter splits the node
In outline mode, Enter SHALL split the node at the cursor. For a node WITH
children, the remainder becomes the node's new FIRST CHILD — content-adjacent to
the split point, never jumping over the existing subtree — encoded per the child
scope's kind rules. For a node with NO children, the remainder becomes a sibling of
the same kind (empty lower half when the cursor is at the node's end), as before.
The cursor lands at the remainder's content start. On a heading line, Enter SHALL
instead create an empty paragraph as the heading's first child. On an atom's
interior, Enter SHALL decline the key (stock newline).

#### Scenario: Split a list item mid-text
- **WHEN** Enter is pressed with the cursor inside a childless `- alpha beta`,
  after "alpha "
- **THEN** the text becomes two sibling items `- alpha ` and `- beta` and the
  cursor sits after the new item's marker (narrowed by this change: a list item
  WITH children splits differently — see the scenario below)

#### Scenario: Split a parent lands the remainder as first child
- **WHEN** Enter is pressed mid-text in a list item that has children
- **THEN** the remainder becomes the item's new first child, sitting directly
  below the split point and above the existing children

#### Scenario: Enter at end creates an empty sibling
- **WHEN** Enter is pressed at the end of a childless list item's text
- **THEN** a new empty sibling item appears below and the cursor sits on it
