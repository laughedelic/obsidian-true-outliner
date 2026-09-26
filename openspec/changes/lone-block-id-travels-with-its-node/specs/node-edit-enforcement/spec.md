# Spec Delta

## ADDED Requirements

### Requirement: The blank lines before a pasted attached id are written empty
A structural paste SHALL write the blank lines between a pasted node's own lines and its attached
block id (`document-tree-mapping`) as EMPTY lines, as it writes the blank lines between the
payload's nodes. They are blank lines of the same kind, and their whitespace says no more.

#### Scenario: A clipboard's blank line above an id lands empty
- **WHEN** `- p` with `^idp` attached after a line of two spaces is pasted into a tab-indented
  list
- **THEN** the line between `- p` and `^idp` lands empty, and `^idp` is still attached to `- p`
