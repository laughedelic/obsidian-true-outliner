# Spec Delta

## ADDED Requirements

### Requirement: Keys on an attached block id's line
An attached block id's line (`document-tree-mapping`) belongs to its node without being any of the
node's text, so the grammar's keys SHALL treat it as follows:

- Enter at the END of the id's line SHALL act as Enter at the node's content end: the empty
  position below the node, in its child scope when it has children and in its sibling scope when
  it does not. The id stays attached to the node.
- Enter anywhere else on the id's line, and Shift+Enter anywhere on it, SHALL be rejected with
  `cannot-split`: splitting an id's line leaves no id.
- Backspace at the START of the id's line SHALL be rejected with the cue, leaving the document
  unchanged: every join it could make either changes which block the id names or stops it being
  an id. Deleting the id's own characters is an ordinary edit.

#### Scenario: Enter after an id opens a sibling after the node
- **WHEN** the caret is at the end of `^t1`, attached to a table with no children, and Enter is
  pressed
- **THEN** the caret lands on the empty position after the table, and `^t1` is still attached to
  the table

#### Scenario: Enter inside an id is refused
- **WHEN** the caret is between `^t` and `1` on an attached id's line and Enter is pressed
- **THEN** the key is rejected with `cannot-split` and the document is unchanged

#### Scenario: Backspace at the start of an id is refused
- **WHEN** the caret is before `^` on an attached id's line and Backspace is pressed
- **THEN** the document is unchanged and the cue appears
