# structural-operations Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
