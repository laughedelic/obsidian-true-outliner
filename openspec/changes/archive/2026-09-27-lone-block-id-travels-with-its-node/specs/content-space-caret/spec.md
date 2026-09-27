# Spec Delta

## ADDED Requirements

### Requirement: An attached block id's line is content
The line of a block id attached to a node (`document-tree-mapping`) SHALL be part of that node's
content for every rule of this capability: the caret may occupy any position on it, vertical and
horizontal motion reach it like any other content line, and a placement on it stays where it is.
The blank lines between the node's own lines and the id SHALL be gap lines, resolved like every
other gap line.

#### Scenario: Down from a table's last row lands on its id
- **WHEN** the caret is on the last row of a table with `^t1` attached after a blank line, and
  ArrowDown is pressed
- **THEN** the caret lands on the `^t1` line in one press

#### Scenario: The blank line before the id is not a place
- **WHEN** a click lands on the blank line between a table and its attached `^t1`
- **THEN** the caret resolves as it does for any gap line, and does not rest on the blank line

#### Scenario: The id can be edited
- **WHEN** the caret is placed at the end of an attached `^t1` and `x` is typed
- **THEN** the line reads `^t1x`, and the renamed id is still attached to the table
