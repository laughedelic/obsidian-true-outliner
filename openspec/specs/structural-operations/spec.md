# structural-operations Specification

## Purpose
Defines the structural operations (indent, outdent, moveUp, moveDown) that edit the block
tree from document-tree-mapping: their per-node-kind algebra (heading level-shift vs.
reparent), rejection semantics for inexpressible edits, and the closure/minimal-edit
guarantees that keep every accepted operation's output re-parseable and diff-minimal.
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
has no parent to escape. If the node has following siblings under the same former parent, they
SHALL be re-parented as the outdented node's own trailing children — appended, in their
original relative order, after any children the node already had — rather than remaining
under the former parent. Re-parented following siblings SHALL have their encoding recomputed
by the same context-determined rule used for the outdented node itself (Requirement:
Context-determined encoding on reparent), evaluated against their new parent (the outdented
node).

#### Scenario: Outdent with children keeps the subtree attached
- **WHEN** outdent is applied to list item `x` (child of paragraph `Para.`) where `x` has
  child `y`
- **THEN** `x` becomes `Para.`'s next sibling with `y` still its child, expressed via the
  attachment rule

#### Scenario: Outdent re-parents following siblings as the node's own children
- **WHEN** outdent is applied to the middle item of `- p\n\t- x\n\t- y\n\t- z\n` (outdenting
  `x`, which has no children of its own, where `y` and `z` are `x`'s former following
  siblings under `p`)
- **THEN** `x` becomes `p`'s next sibling, and `y`/`z` become `x`'s own children in that
  order (`- p\n- x\n\t- y\n\t- z\n`), rather than `x` jumping out past `y`/`z` while they
  remain under `p`

#### Scenario: Re-parented following siblings append after the node's pre-existing children
- **WHEN** outdent is applied to a node `x` that already has child `w`, and `x` has following
  siblings `y`, `z` under its former parent
- **THEN** `x`'s children become `[w, y, z]` in that order — `y`/`z` are appended after `w`,
  not inserted before it

#### Scenario: Outdent with no following siblings is unaffected
- **WHEN** outdent is applied to a node that is the last child of its former parent (no
  following siblings)
- **THEN** the result is byte-for-byte identical to outdent's existing behavior — no siblings
  are re-parented because none exist

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

### Requirement: Fallback indent unit for brand-new indentation
When a structural operation must materialize indentation with no existing evidence in
the document to infer a unit from (no destination-sibling list item to copy
whitespace from, and no other indented list item anywhere in the document —
`destinationIndent`'s existing-document-inference steps both come up empty), the
operation SHALL accept an optional caller-supplied fallback indent unit and use it
instead of an unconditional default. When no fallback is supplied, the existing
two-space default SHALL still apply, so this is purely additive: no existing behavior
changes unless a caller opts in. Existing-document inference SHALL still take priority
over the fallback whenever it has evidence to act on — the fallback only ever governs
the true no-evidence case.

#### Scenario: No fallback supplied keeps the existing two-space default
- **WHEN** a node is indented under a list-item parent with no existing indented list
  item anywhere in the document, and no fallback indent unit is supplied
- **THEN** the new indentation is two spaces, exactly as before this requirement existed

#### Scenario: A supplied fallback governs brand-new indentation
- **WHEN** the same indent is performed with a caller-supplied fallback of a tab
  character (or a specific space width)
- **THEN** the new indentation uses that exact unit instead of the two-space default

#### Scenario: Existing document indentation still wins over the fallback
- **WHEN** the document already has an indented list item using tabs elsewhere, and a
  node is indented under a list-item parent with no fallback OR a spaces-based
  fallback supplied
- **THEN** the new indentation still infers tabs from the existing document content —
  the fallback never overrides an already-established indentation style

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

### Requirement: Node split
`splitNode(doc, nodeId, position)` SHALL split a paragraph or list-item node at a
document position within its text. For a node WITH children, the remainder SHALL
become the node's new FIRST CHILD — the position content-adjacent to the split point
— encoded per the child scope's kind rules (a paragraph parent's new child becomes a
list item when its existing children are list items, per the attachment rule). For a
node with NO children, the remainder becomes the next sibling of the same kind, as
before: list items reuse the original's marker style (ordered runs renumber);
paragraphs gain the separating blank line the boundary rules require; an
end-of-paragraph split yields only the blank separation with the cursor on it (an
empty paragraph has no markdown encoding). Headings and atoms SHALL be rejected with
`cannot-split`. The operation SHALL satisfy the same contract as all structural
operations: typed rejection or `{tree, edits, cursor}` where the result re-parses
identically from its own encoding, edits reproduce the encoding, untouched nodes
keep verbatim lines, and `cursor` points at the remainder's content start.

*(Amended 2026-07-21, real-vault manual pass: the original children-stay-up sibling
split made the new node visually jump over the whole subtree — unnatural in content
space.)*

#### Scenario: Splitting a parent puts the remainder before the children
- **WHEN** `- alpha beta` with a child `- gamma` is split after `alpha `
- **THEN** the tree is `- alpha ` with children `- beta` then `- gamma` — the
  remainder is the first child, not a sibling below the subtree

#### Scenario: Mid-text split of a list item
- **WHEN** a childless `- alpha beta` is split after `alpha `
- **THEN** the encoding contains sibling items `- alpha ` and `- beta`, and
  re-parsing yields exactly that tree

#### Scenario: End-of-node split
- **WHEN** a childless node is split at the exact end of its text
- **THEN** for a list item the new sibling is an empty item node (`- `) with the
  cursor after its marker; for a paragraph — whose empty form has no markdown
  encoding — the split yields only the blank separation with the cursor on it,
  and the sibling node materializes when text is typed

#### Scenario: Atom split rejected
- **WHEN** splitting is attempted at a position inside a code fence
- **THEN** the operation is rejected with `cannot-split` and nothing changes

### Requirement: Subtree deletion
A `deleteSubtrees` operation SHALL remove a contiguous run of whole sibling subtrees
from the tree, including each removed subtree's trailing gap lines, returning the
typed result form the existing operations use. Deleting every node SHALL yield a
valid empty (or preamble-only) document. Non-contiguous or partial-subtree inputs
SHALL be rejected, not partially applied.

#### Scenario: Deletion takes the trailing gap
- **WHEN** `deleteSubtrees` removes a paragraph node that owns one trailing blank
  line
- **THEN** the paragraph's lines and its blank line are both removed, and the
  surviving neighbors' own lines and gaps are byte-identical to before

#### Scenario: Heading deletion removes its section
- **WHEN** `deleteSubtrees` targets a heading node
- **THEN** the heading and every node in its subtree are removed together

### Requirement: Adjacent-node merge
A `mergeNodes` operation SHALL join a node (`first`) with its immediately following
content-space neighbor (`second`) under a per-kind algebra, appending `second`'s
content directly to the end of `first`'s content — never leaving a continuation-line
remnant standing where the old separation was — consuming `first`'s trailing gap,
and re-parenting `second`'s children under the merged node. Joins that would absorb
a heading (and thereby its section's positional anchor), involve an atom on either
side, or produce markdown that re-parses to a different structure than the merged
tree SHALL be rejected with a typed reason.

*(Amended 2026-07-21 from the original conservative table, per the real-vault manual
pass: cross-kind content joins ARE the expected behavior — a list item's text merges
into its parent paragraph — and children re-parent rather than reject, matching
content-space outliner semantics. See node-edit-enforcement's chrome-transparency
requirement.)*

Re-parented children's indentation SHALL be shifted to match the merged node's ACTUAL
child indentation — sampled from a real surviving sibling child when one exists —
rather than an assumed marker-width-aligned column formula. Many documents (tab-
indented ones especially) indent children further than the formula assumes (e.g. a
full tab past the marker rather than exactly its width), and shifting by the wrong
delta corrupts a pure-tab-indented subtree with spaces at the fractional remainder.

"Immediately following content-space neighbor" is the node's document-order
successor: its own first child if it has one, else its next sibling, else the
nearest ancestor's next sibling (`rawSuccessorPath`) — the same node whose content
begins nearest below `first`'s content end, regardless of intervening gap lines.

Preconditions checked before the kind table: no following neighbor at all (last
node in the document) rejects with `no-following-neighbor`.

The per-kind merge table (rows = `first`, columns = `second`), pinned by
implementation and exercised by the property suite:

| First ＼ Second | paragraph / list-item | heading | atom |
|---|---|---|---|
| **paragraph / list-item** | join: `second`'s first content line (marker stripped) appends to `first`'s last content line; `second`'s continuation lines become `first`-kind continuations; `first` keeps its own kind and marker; `second`'s children re-parent under the merged node at `second`'s former position, re-encoded for the new scope | reject `merge-not-expressible` — absorbing a heading destroys its section's positional anchor | reject `merge-not-expressible` — atoms are opaque units |
| **heading** | join iff `second`'s content is a single line: it appends to the heading's text line, and `second`'s children re-parent as section children; multi-line content rejects `merge-not-expressible` (a markdown heading cannot hold continuation lines) | reject `merge-not-expressible` | reject `merge-not-expressible` |
| **atom** | reject `merge-not-expressible` | reject `merge-not-expressible` | reject `merge-not-expressible` |

#### Scenario: Paragraph merge appends at content end
- **WHEN** `mergeNodes` joins two paragraphs separated by a blank gap line
- **THEN** the result is one paragraph node whose last content line is the direct
  concatenation of the two texts, the gap is gone, and all other lines are
  byte-identical

#### Scenario: Cross-kind join keeps the survivor's encoding
- **WHEN** `mergeNodes` joins a paragraph with its first child list item
- **THEN** the item's text (marker stripped) appends to the paragraph's text, the
  merged node stays a paragraph, and the item's children re-parent under it

#### Scenario: Children re-parent instead of rejecting
- **WHEN** `mergeNodes` absorbs a node that has children of its own
- **THEN** those children keep their order and relative structure under the merged
  node, re-encoded for the new scope, and the result re-parses to exactly that tree

#### Scenario: Single-line content joins a heading
- **WHEN** `mergeNodes` joins a heading with a following single-line paragraph
- **THEN** the paragraph's text appends to the heading's title line; a multi-line
  paragraph in the same position is rejected with `merge-not-expressible`

#### Scenario: Tab-indented grandchildren survive a merge without space corruption
- **WHEN** `mergeNodes` absorbs a list item whose own children are indented a full
  tab past the marker (not exactly the marker's own width), and those children have
  further-nested tab-indented children of their own
- **THEN** every re-parented line's indentation is shifted by whole tab units to
  match the merged node's real child column — no line ends up with a mix of spaces
  and tabs, and every re-parented node still parses as the same kind it was before

### Requirement: Subtree insertion at a boundary
An `insertSubtrees` operation SHALL splice a parsed sequence of whole subtrees into
the tree at a node boundary (before or after an anchor node), re-encoded at a depth
valid for the anchor's scope per the mapping algebra (heading levels bounded,
list/paragraph depth encodings converted as the existing reparenting rules require).
Sequences inexpressible at the target scope SHALL be rejected rather than inserted
in corrupted form. When no kind conversion is needed (the common case — the
sequence's own top-level kind already matches the destination context), each
subtree's original indent characters SHALL carry through verbatim beyond its own
top-level prefix, re-rooted at the destination depth — not expressed as a flat
numeric width delta, which can introduce a mismatched indent unit (e.g. spaces
inserted into an otherwise all-tab subtree) at any depth beyond the first level.

#### Scenario: List items pasted under a deeper scope re-indent
- **WHEN** `insertSubtrees` places two top-level list-item subtrees after a list item
  nested two levels deep
- **THEN** the inserted items are re-encoded at the anchor's depth with their
  internal relative structure preserved

#### Scenario: A single node's nested children keep a consistent indent unit at any target depth
- **WHEN** `insertSubtrees` places ONE top-level list-item subtree — itself with a
  child two levels deep, all tab-indented — after an anchor at a depth different
  from where the subtree was originally encoded
- **THEN** every line in the inserted subtree, at every depth, uses the SAME indent
  character the anchor's own context uses — no mix of the original tabs with
  newly-added spaces at any level

#### Scenario: Insertion never splices mid-node
- **WHEN** `insertSubtrees` is invoked with any anchor
- **THEN** every existing node's own lines remain contiguous and byte-identical —
  inserted content only ever lands between nodes

### Requirement: New operations uphold the existing operation guarantees
`deleteSubtrees`, `mergeNodes`, and `insertSubtrees` SHALL satisfy the same contracts
as the existing operations: total typed results (accepted or typed rejection, never
exceptions), closure over the mapping (every accepted result re-parses to the
operation's declared output tree), and minimal edits (untouched nodes' lines are
byte-identical). These SHALL be verified by extending the existing property-test
suite to the new operations.

#### Scenario: Property suite covers the new operations
- **WHEN** the structural-operations property tests run over generated documents
- **THEN** closure, totality, and minimal-edit properties hold for delete, merge, and
  insert exactly as for indent/outdent/move/split

