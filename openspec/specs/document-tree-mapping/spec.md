# document-tree-mapping Specification

## Purpose
TBD - created by archiving change mapping-core. Update Purpose after archive.
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

