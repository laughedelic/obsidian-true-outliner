# Spec Delta

## ADDED Requirements

### Requirement: An attached block id travels with its node
A block id attached to a node (`document-tree-mapping`, "A lone block id belongs to the node it
names") SHALL stay attached to that node through every accepted operation, and SHALL leave the
document with it:

- Move up, move down and their group forms SHALL carry the id with the node, and so SHALL moving
  subtrees to a named destination, the operation a drag makes.
- Deleting a node's subtree SHALL delete its id with it.
- A node's subtree cover SHALL include its id, so copying or cutting a block selection takes the
  id along.
- An operation that re-indents or re-encodes a node — indent, outdent, a paste, a conversion
  between paragraph and list item, unwrapping a list item — SHALL re-indent the id line with the
  node, to the node's content column when it is a list item and to the node's own column
  otherwise, so the id is still attached when the result is re-parsed. The exception is a node
  other than a list item that lands inside a list item: Obsidian names the enclosing item there,
  so its id is written at the node's column and re-parses as a misplaced id
  (`misplaced-block-ids`), which offers attaching it to that item.
- A split SHALL leave the id attached to the node that keeps the original's first line.
- A merge SHALL keep the id of whichever of the two nodes carried one, and SHALL be rejected with
  `merge-not-expressible` when both did.
- Where an operation puts a node directly under an attached id, the seam SHALL hold a blank line
  when the id's node is not a list item, since a block directly under the id detaches it; below
  a list item's id, the seam SHALL be the one below a paragraph line of the item, since text
  directly under the id joins it. The same holds for a node's first child directly under its
  own id.

The closure guarantee holds with ids included: every accepted result re-parses to a tree whose
attached ids are the ones the operation's result states.

#### Scenario: Moving a table takes its id
- **WHEN** a paragraph `Intro.`, a table with `^t1` attached and a paragraph `Outro.` are
  siblings, and the table moves up
- **THEN** the result reads the table, a blank line, `^t1`, a blank line, `Intro.`, a blank line,
  `Outro.`, and `^t1` is still attached to the table

#### Scenario: Dragging a table takes its id
- **WHEN** the same table is moved to the end of the note as a drag moves it
- **THEN** the result reads `Intro.`, a blank line, `Outro.`, a blank line, the table, a blank
  line and `^t1`, and `^t1` is still attached to the table

#### Scenario: A node moved under an attached id is separated from it
- **WHEN** `## H` has `^h3` attached directly under it, and a list item `- x` moves to become the
  heading's first child
- **THEN** a blank line separates `^h3` from `- x`, and `^h3` is still attached to the heading

#### Scenario: Deleting a node deletes its id
- **WHEN** a callout with `^c1` attached is deleted
- **THEN** no line of the result holds `^c1`

#### Scenario: A block selection's copy includes the id
- **WHEN** the table with `^t1` attached is block-selected
- **THEN** the selection's range ends at the end of the `^t1` line

#### Scenario: Indenting a paragraph keeps its id attached
- **WHEN** a paragraph with `^p3` attached is indented under the paragraph above it and becomes a
  list item
- **THEN** `^p3` sits at the new item's content column after a blank line, and is attached to the
  item

#### Scenario: A table moved into a list item gives its id up to the mark
- **WHEN** a table with `^t` attached is moved to be the first child of `- A`
- **THEN** the table is `A`'s child, `^t` is a paragraph after it at the table's column, and it is
  marked as misplaced with the reading that it names `A`

#### Scenario: A split leaves the id where it was
- **WHEN** a paragraph with `^p3` attached is split in the middle of its text
- **THEN** `^p3` is attached to the first half

#### Scenario: A merge of two nodes with ids is rejected
- **WHEN** two paragraphs that both carry attached ids are merged
- **THEN** the merge is rejected with `merge-not-expressible` and the document is unchanged

#### Scenario: Closure with ids
- **WHEN** the operation property suites run over generated documents that include attached and
  unattached lone ids
- **THEN** every accepted result re-parses to the tree it states
