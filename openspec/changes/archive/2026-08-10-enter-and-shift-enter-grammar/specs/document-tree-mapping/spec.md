## ADDED Requirements

### Requirement: A list item's own lines, and what its children may be
A list item's OWN LINES SHALL be its marker line together with the immediately following
non-blank lines that are indented to at least its content column and do not themselves start
a block. A BLANK LINE ends a list item's own lines. Any block indented to at least the item's
content column after that point SHALL be a CHILD of the item, and a block indented less
SHALL close the item.

A list item's children SHALL NOT be restricted to list items. A paragraph, a fenced code
block, a table, a callout — any block kind — may be a child, and this is what the taxonomy
requires: every block is exactly one node, so a block that belongs to a list item but is not
part of its text can only be represented as its child.

The consequence worth stating plainly, because it is the source of two behaviors that read
as surprises, is that ONE BLANK LINE decides between the two readings of the same indented
text:

```
- item          - item
  more text
                  more text
```

On the left, `more text` is a continuation LINE of the item and the tree holds one node. On
the right it is a paragraph CHILD and the tree holds two. Both are correct; the blank line is
the only difference, and nothing in the rendered outline shows which one a document has.

This rule was implemented from the beginning and never written down. It is documented here
rather than changed: it follows the block taxonomy above and matches how markdown itself
nests blocks inside a list item.

#### Scenario: A blank line turns a continuation line into a child
- **WHEN** `- item` is followed directly by an indented line of text, and separately when it
  is followed by a blank line and then the same indented text
- **THEN** the first parses as ONE list-item node of two lines, and the second parses as a
  list-item node with a paragraph child

#### Scenario: An indented atom is a child either way
- **WHEN** a fenced code block, a table or a callout is indented to a list item's content
  column, with or without a blank line before it
- **THEN** it parses as a CHILD of that item, never as part of the item's own lines — a
  block that starts a block is never a continuation line

#### Scenario: Less indentation closes the item
- **WHEN** a block indented below the item's content column follows it
- **THEN** the item is closed and the block is not its child

#### Scenario: Both readings round-trip byte-identically
- **WHEN** either document above is parsed and re-encoded
- **THEN** the output is byte-identical to the input, as the lossless round-trip requirement
  demands of every shape
