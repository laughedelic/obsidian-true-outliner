## MODIFIED Requirements

### Requirement: Minimal re-encoding after tree edits
When a tree is modified and re-encoded, all lines belonging to unmodified nodes SHALL be
byte-identical to the original; only nodes the modification touched may produce new lines. A
node whose trailing gap holds a seam at the modification's edit site is one it touched, and gains the
one blank line `structural-operations`' `A seam at an operation's edit site is separated` writes there.

#### Scenario: Untouched siblings unaffected
- **WHEN** one node's text or position is changed and the document is re-encoded
- **THEN** every line outside the changed node's (old and new) spans is byte-identical to
  the input document, save for the blank line each seam at the change's edit site gains
