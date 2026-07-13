## ADDED Requirements

### Requirement: Decorations are scoped to outline mode
The decoration layer SHALL be registered as a CodeMirror extension via
`registerEditorExtension` and SHALL render node chrome only when the editor's file has
outline mode enabled (resolved through the same mode source the keyboard grammar uses).
Outside outline mode, or in the reading/preview view, the document SHALL render exactly as
stock Obsidian, with no guides, markers, or other decorations present.

#### Scenario: No chrome off-mode
- **WHEN** a note without outline mode enabled is open in the editor
- **THEN** no indentation guides or node markers are rendered; the DOM matches stock
  Obsidian live preview

#### Scenario: Toggle applies immediately
- **WHEN** outline mode is toggled on for the open note
- **THEN** guides and markers appear on the next editor render, with no reload required

### Requirement: Indentation guides reflect tree depth
Every node's lines SHALL carry an indentation-guide decoration whose depth is the node's
distance from the document root in the parsed tree, not the raw markdown indentation or
heading level. Nodes at the same tree depth SHALL render the same guide depth regardless
of whether their depth is encoded via heading level, list indentation, or paragraph
adjacency.

#### Scenario: Heading and list depth align
- **WHEN** a `### Heading` two tree-levels deep (nested under an `#` and a `##` ancestor)
  and a twice-indented list item are both visible in the same document
- **THEN** both render the same indentation-guide depth

#### Scenario: Paragraph-adjacency depth is visible
- **WHEN** a paragraph is indented under a previous-sibling paragraph (encoded as a list
  item per the mapping algebra)
- **THEN** its guide depth is one greater than its parent paragraph's, matching its tree
  position rather than its literal list-item encoding

#### Scenario: Gap lines carry no guide
- **WHEN** a node is followed by its `trailingGap` blank lines
- **THEN** the guide decoration ends at the node's own last line; the blank gap lines that
  follow render with no guide

### Requirement: Paragraph nodes render a leader marker
Every paragraph node's first line SHALL render a synthetic leader marker. List-item,
heading, and atom nodes SHALL NOT receive a synthetic marker — their existing native
rendering (list bullet/number, heading style, block chrome) is left unchanged.

#### Scenario: Flat paragraph sequence is visible as nodes
- **WHEN** a document is a flat sequence of top-level paragraphs with no lists or headings
- **THEN** each paragraph's first line renders a leader marker, distinguishing it as a
  node even though the document has no native list or heading chrome

#### Scenario: List items are unchanged
- **WHEN** a list item is rendered in outline mode
- **THEN** it shows Obsidian's native bullet/number exactly as it would outside outline
  mode, with no additional synthetic marker

### Requirement: Decorations never mutate document state
The decoration layer SHALL be a pure rendering projection: it SHALL NOT dispatch any
document-changing transaction, move the cursor/selection, or create undo history entries,
regardless of how often it recomputes.

#### Scenario: Rendering produces no transaction
- **WHEN** the decoration layer recomputes after a document change
- **THEN** no new transaction is dispatched beyond the one that triggered the recompute,
  and the document text, cursor position, and undo stack are exactly as they were left by
  that triggering change
