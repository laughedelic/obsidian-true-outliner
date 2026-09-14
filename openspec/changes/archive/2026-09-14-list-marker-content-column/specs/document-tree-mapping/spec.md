## MODIFIED Requirements

### Requirement: A list item's own lines, and what its children may be

A list item's CONTENT COLUMN SHALL be the column at which its text begins: past its
indentation, its marker, and the whole whitespace run after the marker, a tab in that run
advancing to the next tab stop. `- a` has content column 2 and `-  a` has 3, as Obsidian's
own reader and CommonMark measure them. A marker with nothing, or whitespace only, after it
SHALL take the column one space past the marker, where a child would need to sit: an item
that starts blank has no run its text begins after, and CommonMark measures it the same way.

A list item's OWN LINES SHALL be its marker line together with the immediately following
non-blank lines that are indented to at least its content column and do not themselves start
a block. A BLANK LINE ends a list item's own lines. Any block indented to at least the item's
content column after that point SHALL be a CHILD of the item, and a block indented less
SHALL close the item.

A list item's children SHALL NOT be restricted to list items. A paragraph, a fenced code
block, a table, a callout — any block kind — may be a child, and this is what the taxonomy
requires: every block is exactly one node, so a block that belongs to a list item but is not
part of its text can only be represented as its child.

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

#### Scenario: Whitespace after the marker widens the content column

- **WHEN** `-  a` (two spaces after the marker) is followed by `  - b` and, in a second
  document, by `   - b`
- **THEN** the first `b` is a SIBLING of `a` — two columns fall short of `a`'s content column
  of three — and the second is its CHILD, matching what Obsidian renders for each

#### Scenario: An empty item's trailing whitespace is not a run

- **WHEN** `-  ` (a marker and two trailing spaces) is followed by `  - b`
- **THEN** `b` is a CHILD of the empty item, whose content column is two, exactly as for `-`
  alone

#### Scenario: Both readings round-trip byte-identically

- **WHEN** either document above is parsed and re-encoded
- **THEN** the output is byte-identical to the input, as the lossless round-trip requirement
  demands of every shape
