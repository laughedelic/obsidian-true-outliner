# document-tree-mapping Specification

## Purpose
Defines the markdown ↔ block-tree mapping: how a document's headings, paragraphs, list
items, and leaf atoms parse into a tree and encode back to markdown, with byte-identical
round-tripping as the load-bearing guarantee every later layer (structural operations, CM6
enforcement) depends on.

## Requirements

### Requirement: Lossless round-trip
The library SHALL parse any markdown document into a block tree and encode any parsed tree
back to markdown such that `encode(parse(md))` is byte-identical to `md` — including
indentation style, list markers, trailing whitespace, and blank-line runs.

#### Scenario: Arbitrary document round-trips byte-identically
- **WHEN** any markdown text (including adversarial whitespace, mixed indentation, and
  Obsidian-flavored constructs) is parsed and re-encoded without modification
- **THEN** the output is byte-identical to the input

#### Scenario: Property test over generated and corpus documents
- **WHEN** the round-trip property runs over fast-check-generated documents and the
  real-world fixture corpus
- **THEN** no counterexample exists (a failure fails the build)

### Requirement: Block node taxonomy
The parser SHALL segment a document into nodes of these types: heading, paragraph,
list item (bulleted, ordered, task), and leaf atoms (fenced code block, table, callout,
blockquote, HTML block, thematic break). YAML frontmatter SHALL be treated as an inert
document preamble, not a node. Atom internals SHALL NOT be parsed as nodes.

#### Scenario: Mixed document segmentation
- **WHEN** a document containing frontmatter, headings, paragraphs, nested lists, a code
  fence, and a callout is parsed
- **THEN** each block becomes exactly one node of the corresponding type, the frontmatter is
  attached to the document root as preamble, and the code fence and callout are single atom
  nodes regardless of their internal line content

### Requirement: Heading hierarchy derives from levels
Tree depth for headings SHALL be derived from heading levels: a heading is the child of the
nearest preceding heading of lower level (else the document root). Skipped levels (e.g. h1
followed by h3) SHALL be preserved verbatim, with the deeper heading as a direct child —
tree depth is tree position, not raw level. Content between a heading and the next heading
SHALL be children of that heading.

#### Scenario: Skipped level preserved
- **WHEN** a document contains `# Log` followed by `### Monday`
- **THEN** `### Monday` parses as a direct child of `# Log` at tree depth 2, and re-encoding
  leaves the `###` marker unchanged

### Requirement: List-after-paragraph attachment (provisional rule)
A list whose nearest preceding sibling block is a paragraph SHALL parse as the children of
that paragraph. A list directly following a heading (no paragraph between) SHALL parse as
direct children of the heading. A column-0 paragraph following a list SHALL be a sibling of
the preceding paragraph, closing the group. This rule SHALL be implemented behind an
isolated strategy function so it can be revised or made configurable.

#### Scenario: List attaches to preceding paragraph
- **WHEN** a section contains paragraph `Clothes notes.` followed by list items `shirts`
  and `socks`, followed by column-0 paragraph `Another thought.`
- **THEN** `shirts` and `socks` parse as children of `Clothes notes.`, and
  `Another thought.` parses as the next sibling of `Clothes notes.`

#### Scenario: List directly under a heading
- **WHEN** a heading is immediately followed by a list with no intervening paragraph
- **THEN** the list items parse as direct children of the heading

### Requirement: Total, deterministic segmentation
Every line of the document SHALL belong to exactly one node span (or the preamble), with
blank-line runs owned as the trailing gap of the preceding node, so that encoding is pure
span concatenation.

#### Scenario: Blank-line ownership
- **WHEN** two paragraphs are separated by three blank lines
- **THEN** the blank lines belong to the first paragraph's trailing gap and re-encode
  verbatim

### Requirement: Minimal re-encoding after tree edits
When a tree is modified and re-encoded, all lines belonging to unmodified nodes SHALL be
byte-identical to the original; only nodes the modification touched may produce new lines.

#### Scenario: Untouched siblings unaffected
- **WHEN** one node's text or position is changed and the document is re-encoded
- **THEN** every line outside the changed node's (old and new) spans is byte-identical to
  the input document

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

#### Scenario: A bare marker inside a list ends it, and the items below attach to it

- **WHEN** a list item, a line holding only a marker, and two further list items follow one
  another at the same indentation
- **THEN** the marker line is a paragraph that CLOSES the list, and the items below it become
  that paragraph's children under the list-after-paragraph rule — rendered one level in,
  under a paragraph's block marker, which is the feedback that says the shape is unfinished.
  Typing the space restores the single list

#### Scenario: The attachment happens only where a list stack can empty

- **WHEN** the same three lines sit INSIDE an item's subtree, indented under a parent
- **THEN** the items below the marker line stay its siblings: the list stack is not empty
  there, so the section-level attachment rule never runs

**Covered by**: `tests/corpus.test.ts` ("a marker needs whitespace after it to be a marker"
suite); `tests/grammar.test.ts` ("continues a bare marker as the paragraph it is, at column 0");
`tests/caret.test.ts` ("leaves a marker with no trailing space wholly addressable, being no
marker"); `e2e/specs/58-bare-marker-is-a-paragraph.e2e.ts`.
