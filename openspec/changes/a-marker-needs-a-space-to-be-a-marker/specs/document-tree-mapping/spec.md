## MODIFIED Requirements

### Requirement: A list item's own lines, and what its children may be

A LIST ITEM SHALL require whitespace after its marker. A line whose marker is followed by
nothing SHALL be a PARAGRAPH: the whitespace is what distinguishes a marker from a dash, a
plus or a digit that begins ordinary text, and it is the keystroke by which a user declares
the intent to make an item. `- `, `-⇥` and `-␣␣` are items; `-` and `1.` are not.

A list item's CONTENT COLUMN SHALL be the column at which its text begins: past its
indentation, its marker, and the whole whitespace run after the marker, a tab in that run
advancing to the next tab stop. `- a` has content column 2 and `-  a` has 3, as Obsidian's
own reader and CommonMark measure them. A marker with whitespace only after it SHALL take the
column one space past the marker, where a child would need to sit: an item that starts blank
has no run its text begins after, and CommonMark measures it the same way.

*(Amendment 2026-09-17, `a-marker-needs-a-space-to-be-a-marker`: the rule admitted a marker at
end of line, which CommonMark and Obsidian's reading mode also do. The mode Live Preview runs
does not — measured in `docs/research/marker-without-trailing-space` — so an ambiguous dash
acquired list structure and shifted the line, then gave both back on the next keystroke of
`-42`. Where the readers disagree we follow the surface being edited, as
`docs/research/list-marker-content-column` did for the width of a content column.)*

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

#### Scenario: A marker needs whitespace after it to be a marker

- **WHEN** a line holds a bullet or ordered marker and nothing else, and separately when the
  same marker is followed by one space
- **THEN** the first parses as a PARAGRAPH whose text is the marker, and the second as an
  empty list item

#### Scenario: A dash that begins ordinary text never becomes an item

- **WHEN** `-42 is negative` is typed one character at a time
- **THEN** no keystroke makes the line a list item, and the line's rendered position does not
  move

#### Scenario: A bare marker and the line under it are one paragraph

- **WHEN** a line holding only a marker is followed by a line of text at column 0
- **THEN** the two parse as ONE paragraph of two lines

#### Scenario: A bare marker inside a list splits it

- **WHEN** a list item, a line holding only a marker, and a second list item follow one
  another at the same indentation
- **THEN** they parse as an item, a paragraph and an item — two list runs rather than one,
  which is what the editing surface itself renders

**Covered by**: `tests/corpus.test.ts` ("a marker needs whitespace after it to be a marker"
suite); `tests/grammar.test.ts` ("continues a bare marker as the paragraph it is, at column 0");
`tests/caret.test.ts` ("leaves a marker with no trailing space wholly addressable, being no
marker"); `e2e/specs/58-bare-marker-is-a-paragraph.e2e.ts`.
