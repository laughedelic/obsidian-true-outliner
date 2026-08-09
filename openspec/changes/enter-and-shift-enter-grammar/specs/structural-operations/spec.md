## MODIFIED Requirements

### Requirement: Node split
`splitNode(doc, nodeId, position)` SHALL split a paragraph, list-item, or heading
node at a document position within its text. For a paragraph or list-item node WITH
children, the remainder SHALL become the node's new FIRST CHILD — the position
content-adjacent to the split point — encoded per the child scope's kind rules (a
paragraph parent's new child becomes a list item when its existing children are
list items, per the attachment rule). For a paragraph or list-item node with NO
children, the remainder becomes the next sibling of the same kind: list items reuse
the original's marker style (ordered runs renumber, and a task marker carries over
UNCHECKED whatever the original's state); paragraphs gain the separating blank line
the boundary rules require.

A split position at the node's own CONTENT START — its first line, at or before its
content column — SHALL INSERT BEFORE the node rather than split it. The node's own
lines, children, depth and trailing gap SHALL be unchanged, and the operation's anchor
SHALL be the inserted empty position, not the node's text. Where the node's SIBLING
scope has an empty markdown encoding, an empty node SHALL be materialized there: a list
item in the original's marker style, with ordered runs renumbered, or a HEADING at the
same level. Where it has none — a paragraph — the gap ABOVE the node SHALL widen by two
blank lines, leaving a blank-separated line as the anchor. A position at the start of a
CONTINUATION line is an ordinary interior split, not a content start.

An END-of-node split SHALL place its result in the node's CHILD scope when it has
children and its SIBLING scope when it does not, and SHALL widen the relevant gap by two
blank lines whenever that scope's kind has no empty encoding — including the case where
the node HAS children and the child scope resolves to `paragraph`. It SHALL NOT fall
through to the childless sibling path there, which placed the new position after the
entire subtree: the jump-over-the-subtree shape the content-adjacent rule exists to
prevent, reachable for any node whose first child is an indented paragraph.

The horizontal whitespace run immediately following the split point SHALL be consumed for
EVERY node kind — it separated two words now on different lines and belongs to neither
half. Previously list-item remainders were trimmed and paragraph remainders were not, so a
paragraph split left an invisible leading space with the cursor behind it.

A heading node's INTERIOR split SHALL always produce a CHILD, never a sibling: a heading's
only possible sibling is another heading, and a plain-text split has no heading-sibling
encoding to produce. The content-start case above is not a split — nothing is divided, an
empty node is inserted — and an empty heading at the same level IS encodable, so that case
is exempt from this restriction. The heading keeps its own level, marker and setext-ness,
truncated to the text before the cursor; the text after the cursor becomes a new child,
encoded per the same child-scope kind rule paragraph/list-item parents use (which resolves
to `paragraph` for a heading parent when no list-item donor exists among its children).
When the split-off remainder's kind is `paragraph` and the heading's existing first child
is ALSO a paragraph, the two SHALL be separated by a blank line so they remain distinct
nodes on re-parse. Splitting is scored against a heading's title line only: a split
targeted at a setext heading's underline line SHALL be rejected with `cannot-split`. A
mid-title split of a setext heading SHALL keep the underline attached to the truncated
(upper) heading — the underline is NOT continuation content of the title and SHALL NOT
travel with the split-off remainder.

Atoms SHALL be rejected with `cannot-split`. The operation SHALL satisfy the same
contract as all structural operations: typed rejection or `{tree, edits, cursor}`
where the result re-parses identically from its own encoding, edits reproduce the
encoding, untouched nodes keep verbatim lines, and `cursor` points at the
remainder's content start.

*(Amended 2026-07-21, real-vault manual pass: the original children-stay-up sibling
split made the new node visually jump over the whole subtree — unnatural in content
space.)*

*(Amended 2026-07-24, Q17 heading-Enter decision: headings were previously rejected
outright with `cannot-split`; Enter on a heading instead always inserted a blind
blank line ignoring cursor position, at the `outline-keyboard-grammar` layer. Headings
now split like every other kind, always into a child per the mixed-containment rule.)*

*(Amended 2026-08-07, measured catalogue of 49 cursor positions: a split at a node's
content start demoted the node's own text into a child of an empty parent — for every
heading, and for any list item with children. Insert-before replaces it, and the anchor
moves to the inserted position rather than the node's text. The end-of-node fall-through
and the per-kind whitespace difference were found in the same pass.)*

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
  encoding — the gap widens by two blank lines with the cursor on the first,
  and the sibling node materializes when text is typed

#### Scenario: End-of-node split of a node whose child scope is a paragraph
- **WHEN** a list item whose first child is an indented paragraph is split at the exact
  end of its own text
- **THEN** the item's OWN trailing gap widens by two blank lines with the cursor on the
  first — between the item and that paragraph — and nothing is added after the subtree

#### Scenario: Split at a node's content start inserts an empty sibling before it
- **WHEN** `- alpha` with a child `- child` is split at its content column
- **THEN** an empty `- ` is inserted as its preceding sibling, `- alpha` keeps its own
  lines, depth and child verbatim, and the anchor is in the new empty item

#### Scenario: Split at a heading's content start inserts an empty heading
- **WHEN** `## Hello` is split at any position at or before its content column
- **THEN** an empty `## ` is inserted as its preceding sibling, `## Hello` is
  byte-identical, no child is created, and the anchor is in the new empty heading

#### Scenario: Split at a paragraph's content start widens the gap above
- **WHEN** a paragraph is split at its content start
- **THEN** the gap above it widens by two blank lines, the paragraph is byte-identical,
  and the anchor is the first of those lines

#### Scenario: A task split carries an unchecked marker
- **WHEN** `- [x] done` is split at the end of its text
- **THEN** the new sibling is `- [ ] `, and splitting it mid-text likewise produces
  `- [ ] ` plus the remainder

#### Scenario: The split point's whitespace goes with neither half
- **WHEN** a paragraph `one two` is split after "one", before the space
- **THEN** the halves are `one` and `two`, with no leading space on the second

#### Scenario: Atom split rejected
- **WHEN** splitting is attempted at a position inside a code fence
- **THEN** the operation is rejected with `cannot-split` and nothing changes

#### Scenario: Mid-text split of a childless heading
- **WHEN** a heading `# Hello world` with no children is split after "Hello "
- **THEN** the tree becomes `# Hello ` with a single new paragraph child `world`,
  separated from it by a blank line, and the cursor at the child's content start

#### Scenario: Mid-text split of a heading with existing children
- **WHEN** a heading with an existing paragraph child is split mid-text
- **THEN** the split-off remainder becomes the heading's new FIRST child, placed
  before the existing paragraph child, separated from it by a blank line so both
  remain distinct paragraph nodes on re-parse

#### Scenario: End-of-heading split widens the gap
- **WHEN** a heading whose child scope resolves to `paragraph` is split at the exact end
  of its text (empty remainder)
- **THEN** the heading's own trailing gap widens by two blank lines — the same rule a
  childless paragraph's end-of-node split uses — and the cursor lands on the first,
  blank-separated on both sides, with no child materializing until text is typed

#### Scenario: Setext underline split rejected
- **WHEN** splitting is attempted at a position on a setext heading's underline
  line (`===` or `---`)
- **THEN** the operation is rejected with `cannot-split` and nothing changes

#### Scenario: Mid-title split of a setext heading keeps the underline attached
- **WHEN** a setext heading `Hello world` (underlined `====`) with no children
  is split after "Hello "
- **THEN** the tree becomes a setext heading `Hello ` (still underlined `====`)
  with a single new paragraph child `world` — the underline stays with the
  heading, it does not become part of the remainder or get treated as a
  continuation line of the title

### Requirement: Fallback indent unit for brand-new indentation
When a structural operation materializes indentation, it SHALL take the leading
whitespace of a SIBLING AT THE DESTINATION whenever one exists — of any kind, not
list items only. Siblings share an indentation level by construction, so copying
theirs is what keeps the new node at their level; consulting only list-item siblings
made a node landing among indented siblings of another kind (an atom, a paragraph)
take the document's inferred unit instead, and a mismatch there re-parents those
siblings underneath the new node, changing the tree's shape beyond the operation.

When there is no destination sibling to copy from, the operation SHALL infer the
unit from any other indented list item in the document. When that too comes up
empty — no evidence anywhere — the operation SHALL accept an optional
caller-supplied fallback indent unit and use it instead of an unconditional default.
When no fallback is supplied, the existing two-space default SHALL still apply.
Existing-document inference SHALL still take priority over the fallback whenever it
has evidence to act on — the fallback only ever governs the true no-evidence case.

#### Scenario: A destination sibling's indentation wins, whatever its kind
- **WHEN** a node is placed among children that are indented with a tab and none
  of them is a list item
- **THEN** the new node is indented with that same tab, and every existing sibling
  keeps its own depth in the re-parsed tree

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

## ADDED Requirements

### Requirement: Required separation at a heading's content boundary
Boundary normalization SHALL insert a blank line between a heading and its first child
when that child is a paragraph, exactly as it already does for a list item whose first
child is a paragraph. The list-item case is required by the PARSE — without the blank
line the indented text is a continuation line of the item rather than a child. The
heading case is required by CONVENTION: `# Head` immediately followed by `line` parses
correctly, and every operation that produces it still produces markdown a reader would
call malformed.

This is the one place separation is widened beyond what the parse demands. Every other
gap SHALL stay at its minimum, so that "a blank line is here because something needs it"
remains true of the encoding as a whole.

#### Scenario: A heading split separates the new child
- **WHEN** a heading is split mid-title and the remainder becomes a paragraph child
- **THEN** a blank line separates the heading from that child

#### Scenario: An existing heading boundary is not widened further
- **WHEN** a heading already has a blank line before its first paragraph child and any
  structural operation runs on that subtree
- **THEN** the gap stays exactly one blank line

### Requirement: List item unwrap
`unwrapListItem(doc, nodeId)` SHALL remove a list item's marker, leaving the position it
occupied available to ordinary prose. The operation exists for the one place in the
grammar where a list must be LEFT rather than restructured: an empty item that cannot
outdent, because it is already at the top level or sits directly under a heading where
markdown has no sibling spot for it.

The item SHALL have no children — unwrapping one that does would orphan them, and is
rejected with `would-orphan-children`. A node that is not a list item, or a list item
with content of its own beyond an unchecked task marker, SHALL be rejected with
`cannot-unwrap`: this operation removes an empty item, it does not convert content
between kinds, and the reparent encoding rules own that question.

Because an empty paragraph has no markdown encoding, the result SHALL be the
blank-separated position itself, not a node: the document's node count drops by exactly
one, the surrounding nodes keep their own lines verbatim, and the operation's anchor is a
line blank-separated from the content above and below it (or bounded by the document's
start or end). Typing there produces a paragraph distinct from both neighbours.

#### Scenario: Unwrapping an empty top-level item
- **WHEN** `unwrapListItem` is applied to the empty `- ` in `- item`, `- `
- **THEN** the marker line is gone, `- item` is verbatim, the tree holds one node, and
  the anchor is a blank line separated by a blank line from `- item` above

#### Scenario: Typing on the unwrapped position makes a paragraph
- **WHEN** text is typed at the operation's anchor
- **THEN** the document holds the original item and a separate paragraph — the text does
  not join the item above or anything below

#### Scenario: An item with children is rejected
- **WHEN** `unwrapListItem` is applied to an empty item that has children
- **THEN** the operation is rejected with `would-orphan-children` and nothing changes

#### Scenario: A non-empty item is rejected
- **WHEN** `unwrapListItem` is applied to a list item that has text of its own
- **THEN** the operation is rejected with `cannot-unwrap` and nothing changes

### Requirement: Sibling heading creation
`insertSiblingHeading(doc, nodeId, remainder)` SHALL insert a heading at the SAME LEVEL
as an existing heading, directly after it, carrying `remainder` as its title — the
operation behind Shift+Enter on a heading, and the only path by which a heading gains a
sibling from a keystroke.

The new heading SHALL be written ATX at that level whatever the original's form: an empty
setext heading has no encoding, so a setext original cannot produce a setext sibling in
the common case, and one rule is better than two that differ by the original's underline.
When `remainder` is non-empty it SHALL be removed from the original heading's title, which
is otherwise unchanged in level, marker and setext-ness. The original's existing CHILDREN
stay with it: heading scope is positional, so content already under it belongs to it, and
the new sibling starts empty.

A node that is not a heading SHALL be rejected with `cannot-split`. The anchor SHALL be
the new heading's content start.

#### Scenario: A sibling heading is created empty
- **WHEN** the operation runs on `## Foo` with an empty remainder
- **THEN** `## ` follows it as a sibling at level 2, `## Foo` keeps its children, and the
  anchor is the new heading's content start

#### Scenario: A remainder moves to the sibling
- **WHEN** the operation runs on `## Foo bar` with the remainder `bar`
- **THEN** the original becomes `## Foo ` and the sibling is `## bar`

#### Scenario: A setext original produces an ATX sibling
- **WHEN** the operation runs on a setext heading underlined `====`
- **THEN** the new sibling is `# `, and the original keeps its setext encoding verbatim
