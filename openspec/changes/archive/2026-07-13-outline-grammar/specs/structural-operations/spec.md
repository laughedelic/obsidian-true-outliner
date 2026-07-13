## ADDED Requirements

### Requirement: Node split
`splitNode(doc, nodeId, position)` SHALL split a paragraph or list-item node at a
document position within its text into two adjacent siblings of the same kind: the
original node keeps the text before the position (and all children); a new sibling of
the same kind holds the text after it (empty if the position is at the node's end). List
items reuse the original's marker style (ordered runs renumber); paragraphs gain the
separating blank line the boundary rules require. Headings and atoms SHALL be rejected
with `cannot-split`. The operation SHALL satisfy the same contract as all structural
operations: typed rejection or `{tree, edits, cursor}` where the result re-parses
identically from its own encoding, edits reproduce the encoding, untouched nodes keep
verbatim lines, and `cursor` points at the new sibling's content start.

#### Scenario: Mid-text split of a list item
- **WHEN** `- alpha beta` is split after `alpha `
- **THEN** the encoding contains sibling items `- alpha ` and `- beta`, any children
  remain under the first, and re-parsing yields exactly that tree

#### Scenario: End-of-node split
- **WHEN** a node is split at the exact end of its text
- **THEN** for a list item the new sibling is an empty item node (`- `) with the cursor
  after its marker; for a paragraph — whose empty form has no markdown encoding — the
  split yields only the blank separation with the cursor on it, and the sibling node
  materializes when text is typed

#### Scenario: Atom split rejected
- **WHEN** splitting is attempted at a position inside a code fence
- **THEN** the operation is rejected with `cannot-split` and nothing changes
