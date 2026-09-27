## MODIFIED Requirements

### Requirement: Minimal re-encoding after tree edits
When a tree is modified and re-encoded, all lines belonging to unmodified nodes SHALL be
byte-identical to the original; only nodes the modification touched may produce new lines. A
node whose trailing gap holds a seam the modification created is one it touched, and gains the
blank line `structural-operations`' `A seam an operation creates is separated` writes there.

#### Scenario: Untouched siblings unaffected
- **WHEN** one node's text or position is changed and the document is re-encoded
- **THEN** every line outside the changed node's (old and new) spans is byte-identical to
  the input document, save for the one blank line a seam the change created gains
