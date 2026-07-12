# structural-operations Specification

## Purpose
TBD - created by archiving change mapping-core. Update Purpose after archive.
## Requirements
### Requirement: Operation results are total and typed
Every structural operation (indent, outdent, moveUp, moveDown) SHALL be a pure function
returning either an accepted result — the new tree plus a minimal list of line-range edits —
or a typed rejection (e.g. `at-h6-bound`, `no-previous-sibling`, `at-top-level`). Operations
SHALL never throw for algebra reasons and a rejection SHALL leave the document unchanged.

#### Scenario: Rejection is a value, not an exception
- **WHEN** an operation cannot be expressed in markdown (e.g. indenting an h6 heading)
- **THEN** the function returns a typed rejection identifying the reason, and the tree and
  document text are unchanged

### Requirement: Heading indent and outdent shift levels
Indent on a heading SHALL increase its level by one and outdent SHALL decrease it by one,
rewriting the heading markers of the node and its entire heading subtree (level shift is
recursive), touching only heading-marker characters. The tree SHALL re-derive from the new
levels. Indent SHALL be rejected at h6; outdent SHALL be rejected at h1.

#### Scenario: Demote with subtree
- **WHEN** indent is applied to `## Budget` which contains `### Transport`
- **THEN** the document now reads `### Budget` and `#### Transport`, all non-heading lines
  are byte-identical, and `Budget` re-parses as a child of the preceding `##` heading

#### Scenario: Outdent consumes a level skip before changing hierarchy
- **WHEN** outdent is applied to `### Monday` whose parent is `# Log`
- **THEN** it becomes `## Monday`, still a child of `# Log` (level normalized, hierarchy
  unchanged), and a second outdent produces `# Monday` as a sibling of `# Log`

#### Scenario: Demote may create a skip
- **WHEN** indent is applied to `### Electronics` whose parent is `## Packing` and which has
  no `###` sibling context requiring otherwise
- **THEN** it becomes `#### Electronics`, remaining a child of `## Packing` (a styling-only
  edit; tree position unchanged)

#### Scenario: Bound rejections
- **WHEN** indent is applied to an h6 heading, or outdent to an h1 heading
- **THEN** the operation is rejected with `at-h6-bound` / `at-h1-bound` respectively

### Requirement: Non-heading indent reparents under previous sibling
Indent on a non-heading node SHALL make it the last child of its previous sibling, and SHALL
be rejected with `no-previous-sibling` when none exists. The node's subtree moves with it.

#### Scenario: Paragraph indented under paragraph
- **WHEN** indent is applied to top-level paragraph `Second thought.` whose previous sibling
  is paragraph `First thought.`
- **THEN** the document encodes `Second thought.` as a list item (`- Second thought.`)
  following the intact `First thought.` paragraph, and it re-parses as that paragraph's child

#### Scenario: Indented node joins an existing child list
- **WHEN** indent is applied to paragraph `B.` whose previous sibling paragraph `A.` already
  has list-item children
- **THEN** `B.` becomes the last item of that existing list

### Requirement: Non-heading outdent moves brother to uncle
Outdent on a non-heading node SHALL make it the next sibling of its former parent
(brother→uncle), subtree included, and SHALL be rejected with `at-top-level` when the node
has no parent to escape.

#### Scenario: Outdent with children keeps the subtree attached
- **WHEN** outdent is applied to list item `x` (child of paragraph `Para.`) where `x` has
  child `y`
- **THEN** `x` becomes `Para.`'s next sibling with `y` still its child, expressed via the
  attachment rule

### Requirement: Context-determined encoding on reparent (provisional rule)
A reparented non-heading node's markdown encoding SHALL be recomputed as a pure function of
its new surroundings: it takes the block type of its nearest preceding sibling under the new
parent; if none, the following sibling; if it has no siblings, it encodes as a paragraph
under a heading or the root, and as a list item under any other parent. This rule SHALL be
implemented behind an isolated strategy function.

#### Scenario: Indent then outdent restores a paragraph
- **WHEN** a top-level paragraph is indented under a paragraph and then outdented back
- **THEN** it is re-encoded as a paragraph (nearest sibling at the destination is a
  paragraph) and the document is byte-identical to the original

#### Scenario: Nested-list documents never flatten
- **WHEN** outdent is applied to any item in a document consisting entirely of nested list
  items
- **THEN** the item remains a list item at its new depth (all destination siblings are list
  items)

### Requirement: Sibling reordering
MoveUp/moveDown SHALL swap a node (with its entire subtree) with its previous/next sibling,
and SHALL be rejected when no such sibling exists. Node types and encodings are unchanged by
reordering, except ordered-list markers which are renumbered.

#### Scenario: Heading section swap
- **WHEN** moveUp is applied to `## Budget` preceded by sibling `## Packing`
- **THEN** the two sections (headings plus all descendant content) swap positions and every
  moved line is byte-identical to before, merely relocated

### Requirement: Atoms move as opaque units
Structural operations on leaf atoms (code fences, tables, callouts, quotes, HTML blocks)
SHALL move or re-indent the whole block as one unit without ever treating its internal lines
as nodes.

#### Scenario: Code fence indented under a list item
- **WHEN** indent is applied to a code fence whose previous sibling is a list item
- **THEN** every line of the fence is re-indented uniformly as list-item continuation
  content and the fence's internal text is otherwise unchanged

### Requirement: Operation closure over the mapping
For every accepted operation, encoding the resulting tree SHALL produce valid markdown that
re-parses to an identical tree, and the emitted edit list applied to the original text SHALL
equal that encoding. Edits SHALL touch only lines the operation semantically requires, with
one documented exception: ordered-list marker renumbering of affected siblings.

#### Scenario: Closure property test
- **WHEN** any generated operation is applied to any generated tree
- **THEN** either it is rejected, or `parse(encode(result.tree))` equals `result.tree` and
  applying `result.edits` to the source text yields `encode(result.tree)`

