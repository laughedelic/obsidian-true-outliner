# Spec Delta

## MODIFIED Requirements

### Requirement: Total, deterministic segmentation
Every line of the document SHALL belong to exactly one node span (or the preamble), with
blank-line runs owned as the trailing gap of the preceding node, so that encoding is pure
span concatenation. A node's own span is its own lines, then — when a lone block id is attached
to it — the blank lines between those lines and the id followed by the id's line, then its
trailing gap; its children follow its own span.

#### Scenario: Blank-line ownership
- **WHEN** two paragraphs are separated by three blank lines
- **THEN** the blank lines belong to the first paragraph's trailing gap and re-encode
  verbatim

#### Scenario: An attached id sits between a node's lines and its trailing gap
- **WHEN** a table is followed by a blank line, `^t1`, a blank line and a paragraph
- **THEN** the table's span is its rows, the blank line, `^t1` and the second blank line, the
  paragraph's span begins after it, and the document re-encodes byte-identically

## ADDED Requirements

### Requirement: A lone block id belongs to the node it names
A LONE BLOCK ID is a line holding only optional leading whitespace, `^`, and one or more letters,
digits or `-`, with nothing after them — trailing whitespace included — that the parser would
otherwise read as a paragraph of one line.

The parser SHALL attach a lone block id to the node whose own lines end immediately above it,
blank lines between skipped, when that node has no children before the id and one of these holds:

- the node is a paragraph, heading, table, quote, callout, fenced code block, thematic break or
  HTML block with no list item among its ancestors, and the id line is indented less than four
  columns;
- the node is a list item, the id line follows one or more blank lines, and it is indented to at
  least the item's content column and less than four columns past it;
- the node is a list item, the id line follows its last own line with no blank line between, and
  it is indented less than the item's content column.

These are the shapes in which Obsidian names that same node (`docs/research/lone-block-id`, "What a
lone id names"). Where two or more lone ids follow one another with only blank lines between,
none of them SHALL attach. Every lone id that does not attach SHALL parse as the paragraph it
parses as without this rule.

An attached id is part of its node the way an inline ` ^id` is: it belongs to that node's span,
and it is not one of the node's children and not a node of its own.

#### Scenario: An id after a table attaches to the table
- **WHEN** a document holds a paragraph, a blank line, a table, a blank line, `^t1`, a blank line
  and a paragraph
- **THEN** the tree holds three nodes, `^t1` belongs to the table, and no paragraph node holds it

#### Scenario: An id directly under a table or a quote attaches
- **WHEN** `^t2` follows a table's last row, or `^q2` follows a quote's last line, with no blank
  line between
- **THEN** the id belongs to the table or the quote

#### Scenario: Blank lines before the id are skipped, however many
- **WHEN** a paragraph is followed by two blank lines and `^p4`
- **THEN** `^p4` belongs to the paragraph, and both blank lines sit between the paragraph's lines
  and the id

#### Scenario: An id after a heading attaches to the heading, before its children
- **WHEN** `## Head` is followed by a blank line, `^h2`, a blank line and a paragraph
- **THEN** `^h2` belongs to the heading, and the paragraph is the heading's first child

#### Scenario: An id indented under a list item attaches to the item
- **WHEN** `- item a` is followed by a blank line and `  ^under-a`
- **THEN** `^under-a` belongs to `item a`, which has no children

#### Scenario: An id directly under the last item attaches to that item
- **WHEN** `- a`, `- b` are followed by `^l3` with no blank line between
- **THEN** `^l3` belongs to `b`

#### Scenario: An id after a list does not attach
- **WHEN** `- a`, `- b` are followed by a blank line and `^l1` at column 0
- **THEN** `^l1` is a paragraph node of its own

#### Scenario: An id after a block inside a list item does not attach
- **WHEN** `- a` holds a blank line and the indented paragraph `inner prose`, followed by a blank
  line and `  ^x3`
- **THEN** `^x3` is a paragraph node of its own

#### Scenario: An id after an item's children does not attach
- **WHEN** `- a` has the child `  - child`, followed by a blank line and `  ^x1`
- **THEN** `^x1` is a paragraph node of its own

#### Scenario: Consecutive ids do not attach
- **WHEN** a paragraph is followed by a blank line, `^y1`, a blank line and `^y2`
- **THEN** both ids are paragraph nodes of their own

#### Scenario: A line that is not an id does not attach
- **WHEN** a table is followed by a blank line and `^t4` with trailing spaces, or by a blank line,
  `^t5` and `More text.` on the line directly under it
- **THEN** neither line attaches to the table

#### Scenario: Round trip with attached ids
- **WHEN** the round-trip property runs over generated documents that include lone ids in every
  shape above
- **THEN** encoding the parse reproduces every document byte-identically
