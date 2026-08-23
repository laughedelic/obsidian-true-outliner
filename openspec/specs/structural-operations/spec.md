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

Under a LIST-ITEM parent, whatever the chosen unit, the resulting indentation
SHALL REACH that parent's content column. Every source of the unit — a sibling,
the document, the fallback — is evidence about width alone, and none of it knows
how wide the destination parent's marker is: a two-space unit under an ordered
parent whose content column is three left the new node SHORT of the column, so
the re-parse kept it a SIBLING of that parent. The operation reported success and
consumed an undo step while changing nothing structurally. This is the mirror of
the too-deep case above, and only a shortfall is repaired — indentation that
already clears the column keeps the unit the evidence chose.

A list item is the only parent whose content column the parse REQUIRES a child to
reach, and the rule SHALL NOT extend past it. A paragraph's child list attaches by
ADJACENCY, so its column is free: an indented paragraph may own a flush-left list,
and widening a new sibling to the paragraph's own indent buries it under that list
instead of placing it beside it. Under a paragraph, heading, or root destination
the chosen indentation therefore stands as the evidence gave it.

#### Scenario: Indentation short of the destination's content column is widened
- **WHEN** a node is indented under a LIST-ITEM parent whose content column is wider
  than the unit the document infers (an ordered item, a wide marker)
- **THEN** the new indentation reaches that content column, and the re-parsed tree
  has the node as a CHILD of that parent rather than its sibling

#### Scenario: Indentation that already clears the column keeps its unit
- **WHEN** the inferred or supplied unit is wider than the destination parent's
  content column
- **THEN** that unit is used unchanged rather than narrowed to the column

#### Scenario: A paragraph destination keeps its sibling's indentation
- **WHEN** a node is indented under a paragraph that is itself indented and already
  owns a flush-left child list
- **THEN** the new node takes that child list's own indentation and lands BESIDE it,
  not widened to the paragraph's indent and nested underneath it

#### Scenario: A destination sibling's indentation wins, whatever its kind
- **WHEN** a node is placed among children that are indented with a tab and none
  of them is a list item
- **THEN** the new node is indented with that same tab, and every existing sibling
  keeps its own depth in the re-parsed tree

#### Scenario: No fallback supplied keeps the existing two-space default
- **WHEN** a node is indented under a bulleted list-item parent with no existing
  indented list item anywhere in the document, and no fallback indent unit is supplied
- **THEN** the unit chosen is two spaces, exactly as before this requirement existed,
  and it is also the final indentation — a bullet's content column is two, so there
  is nothing to pad

#### Scenario: A supplied fallback governs brand-new indentation
- **WHEN** the same indent is performed with a caller-supplied fallback of a tab
  character (or a specific space width)
- **THEN** the unit chosen is that exact unit instead of the two-space default, and
  under a bulleted parent it is the final indentation unchanged

#### Scenario: A chosen unit narrower than the content column is padded, not replaced
- **WHEN** either of the two scenarios above is performed under an ORDERED parent,
  whose content column is wider than the chosen unit
- **THEN** the chosen unit still governs — the fallback is not overridden by some
  other unit — and the final indentation is that unit padded out to the content
  column, because a unit that stops short of it does not nest the node at all

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

A reorder SHALL be rejected when the swap would place a SECTION-LEVEL list item directly after
a paragraph sibling. That arrangement has no markdown encoding: a list item whose preceding
sibling is a paragraph is read as that paragraph's CHILD, so the emitted document says
something the surgery did not. Since reordering rewrites no node's encoding, refusing is the
only outcome available to it — the unifying principle's other branch, the minimal encoding of
the new tree, requires a rewrite this operation does not perform.

The check SHALL cover BOTH nodes the swap relocates, not the subject alone. A swap moves two
subtrees, and either can come to rest after a paragraph: the subject at its new slot, or the
displaced sibling at the slot the subject left. Measured, the second case is the whole of move
up's exposure and none of it is visible to the subject.

"Section level" is the whole of the rule's reach: the attachment it guards against fires only
among the children of the root or of a heading. Among a list item's own children a paragraph
does not adopt a following list, so a reorder there is never refused on this ground.

An accepted reorder SHALL leave EVERY node's depth unchanged in the result tree, not only the
subject's. A reorder permutes two subtrees at one level and moves nothing between levels, so
any depth change anywhere in the document is an encoding that re-parsed differently from the
tree the operation built.

#### Scenario: Heading section swap
- **WHEN** moveUp is applied to `## Budget` preceded by sibling `## Packing`
- **THEN** the two sections (headings plus all descendant content) swap positions and every
  moved line is byte-identical to before, merely relocated

#### Scenario: A list item refuses to move down past a paragraph
- **WHEN** moveDown is applied to a top-level list item whose next sibling is a paragraph
- **THEN** the operation is rejected and the document is unchanged — landing after that
  paragraph would make the item its child, which is not the sibling swap that was asked for

#### Scenario: A paragraph refuses to move up above a list item
- **WHEN** moveUp is applied to a top-level paragraph whose previous sibling is a list item
- **THEN** the operation is rejected, because the list item would be left directly after the
  paragraph and adopted by it — a node the caller never selected, changing depth

#### Scenario: The displaced sibling is checked, not just the subject
- **WHEN** a reorder would leave either relocated subtree's root as a section-level list item
  directly after a paragraph
- **THEN** the operation is rejected, whichever of the two it is

#### Scenario: A reorder inside a list item is unaffected
- **WHEN** moveDown is applied to a list item among a list item's own children, past a sibling
  paragraph there
- **THEN** the operation is accepted and both nodes keep their depth — a paragraph nested
  inside a list item does not adopt a following list, so no encoding is lost

#### Scenario: An accepted reorder moves no node between levels
- **WHEN** any reorder is accepted, in its single-node or group form
- **THEN** every node in the result document sits at the depth it sat at before, the subject
  and every bystander alike

### Requirement: Ordered-run renumbering
When an operation changes the membership or order of a sibling list, every maximal run of
consecutive ordered list items among those siblings SHALL be renumbered consecutively from
that run's START NUMBER, and only the marker digits SHALL change — the rest of each item's
line and its trailing gap are untouched.

Where the new digits differ in COUNT from the old ones, the marker changes WIDTH, and the
item's content column moves while the line the marker sits on does not. The item's
continuation lines and its whole subtree SHALL move with that column. Leaving them behind
breaks the closure this requirement already demands: measured, `9.` renumbered to `10.`
left the item's children a column short, so they no longer reached it and the re-parse
returned them as its SIBLINGS — the subtree the operation never touched, silently
reshaped. Narrowing (`10.` to `9.`) strands them a column too deep instead, which keeps
the tree and drifts the indentation. This clause and "its children are untouched", as the
requirement first read, cannot both hold at a digit boundary; the implementation followed
the narrower one and lost the tree.

A run's start number is the number the run began with. How that number is recovered depends
on the SHAPE of the transformation, and the two cases differ precisely because a permutation
or an insertion cannot lose it while a removal can:

- For a PERMUTATION or an INSERTION — reordering siblings, splitting a node into two, or
  inserting subtrees — the start number SHALL be the minimum still present in the run,
  which IS the number the run began with, since these shapes remove no run member. A
  `5. 6. 7.` list keeps starting at 5, and a swap SHALL NOT let the run inherit the moved
  item's own number.
- For a REMOVAL of nodes from a sibling list — subtree deletion, unwrapping a list item,
  the departure side of an indent, and the absorbed side of a merge — the start number
  SHALL be taken from the sibling list AS IT WAS BEFORE the removal: the start number of
  the run that the surviving run's first member THAT WAS ALREADY THERE belonged to.
  Deriving it from the survivors is wrong exactly when the removal took the item that
  carried the run's start.

  A run may begin with nodes that were not in the list before — a merge adopts `second`'s
  own children into it, carrying their old level's numbers — so the member the start is
  read from SHALL be the first one present beforehand, not the first one positionally.

A merge is a removal for this purpose in all three of its shapes, and none of them is
saved by the survivor keeping its index. Absorbing a non-ordered node standing between two
runs JOINS them, and the joined run SHALL keep the SURVIVOR's own start rather than adopt
the lower number of the run it swallowed. Absorbing a node's own first child removes that
child from the CHILD list, which SHALL renumber from the same pre-merge start. And a node
absorbed from an outer scope may head a run whose predecessor at that level is not part of
it, so having a predecessor is not the same as keeping a run's head.

Where a removal deletes a non-ordered node standing between two ordered runs, the
survivors become one run and SHALL take the EARLIER run's start number. A run whose
members are all removed contributes nothing.

The rule above is stated over removals in general, and all three named shapes are measured
to reach it. A removal that truncates a sibling list to a PREFIX — the level an outdent
leaves — is covered by the same rule and is indistinguishable under it, since the survivors
always retain the run's own head.

Renumbering is the one documented exception to "edits touch only the lines the operation
semantically requires", and renumbered output SHALL still satisfy operation closure: the
encoded run re-parses to the same tree.

#### Scenario: A widening marker carries its subtree
- **WHEN** a renumbering makes an item with children `10.` where it was `9.`
- **THEN** the children are re-indented to the item's new content column and remain its
  children in the re-parsed tree

#### Scenario: A narrowing marker brings its subtree back in
- **WHEN** a renumbering makes an item with children `9.` where it was `10.`
- **THEN** the children are re-indented to the narrower content column rather than being
  left a column deeper than the item requires

#### Scenario: Deleting the head of an ordered run
- **WHEN** `deleteSubtrees` removes the first two items of `1. a` / `2. b` / `3. c`
- **THEN** the surviving item is `1. c`, not `3. c`

#### Scenario: Deleting the head of a run that does not start at one
- **WHEN** `deleteSubtrees` removes the first item of `5. a` / `6. b` / `7. c`
- **THEN** the survivors are `5. b` and `6. c` — the run keeps the start number it was
  written with

#### Scenario: Deleting from the middle of an ordered run
- **WHEN** `deleteSubtrees` removes the second item of `1. a` / `2. b` / `3. c`
- **THEN** the survivors are `1. a` and `2. c`

#### Scenario: Indenting the head of an ordered run away from its level
- **WHEN** `indent` is applied to `1. one` whose previous sibling is `- bullet`, with
  `2. two` following it
- **THEN** the item left behind at the original level is `1. two`

#### Scenario: Unwrapping the head of an ordered run
- **WHEN** `unwrapListItem` removes the empty first item of an ordered run
- **THEN** the surviving items renumber from the run's original start number, and the
  blank line left in the item's place is unchanged by the renumbering

#### Scenario: A merge absorbs a separator and joins two runs
- **WHEN** `mergeNodes` joins `5. a` with the `- x` that separates it from `1. c`
- **THEN** the result is `5. ax` and `6. c` — the survivor keeps its own start rather than
  taking the swallowed run's `1.`

#### Scenario: A merge absorbs a node's ordered first child
- **WHEN** `mergeNodes` joins `- p` with its first child `1. a`, leaving `2. b` and `3. c`
- **THEN** the remaining children renumber to `1. b` and `2. c`

#### Scenario: A merge reaches its neighbour from an outer scope
- **WHEN** `mergeNodes` joins a nested `- kid` with the top-level `1. a` that follows it,
  where `1. a`'s own predecessor is a bullet
- **THEN** the item left at the top level is `1. b`

#### Scenario: A swap does not inherit the moved item's number
- **WHEN** `moveDown` swaps the first two items of a `5. 6. 7.` run
- **THEN** the run still reads `5. 6. 7.` in document order, with the two items' content
  exchanged

#### Scenario: Renumbered output re-parses unchanged
- **WHEN** any accepted removal renumbers an ordered run
- **THEN** encoding the resulting tree and re-parsing it yields an identical tree, and the
  emitted edits touch no lines beyond the removed subtrees and the renumbered markers

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
`splitNode(doc, nodeId, position)` SHALL resolve a document position within a paragraph,
list-item, or heading node into ONE of two outcomes: a SPLIT at that position, or — when
the position is the node's own content start — an INSERTION BEFORE the node, which divides
nothing. Both are specified below, and which one applies is a function of the position
alone. The operation's name predates the second outcome; the two are one operation because
a caller cannot tell in advance which its position will produce, and because both answer
the same question, "what does a line break mean here".

For an INTERIOR position, the node is split. For a paragraph or list-item node WITH
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

### Requirement: A new first child adopts the child scope's list style
Where an operation materializes a node in a parent's CHILD scope and that scope's kind
resolves to `list-item` because an existing child donated it, the new node SHALL take that
donor's LIST STYLE as well as its kind — bullet character, ordered delimiter, and an
unchecked task marker where the donor carries one. It SHALL NOT be encoded as a plain
bullet when the donor is an ordered item.

The kind and the style come from the same donor because they answer the same question: the
new node is joining a list that is already there. Taking only the kind produced a bullet at
the head of an ordered run — the same key writing `1. ` beside an item and `- ` above it,
which is the shape-dependence the empty-position rule exists to remove.

A new ordered first child SHALL take the run's start number, and the existing items SHALL
renumber after it, per the insertion half of the renumbering contract above.

#### Scenario: An empty position at the end of a heading above an ordered list
- **WHEN** `splitNode` acts at the content end of `# H` whose children are `1. a` / `2. b`
- **THEN** the new first child is `1. ` and the existing items become `2. a` and `3. b`

#### Scenario: The donor's delimiter and bullet character carry over
- **WHEN** the donating child is `1) a`, or `* a`
- **THEN** the new first child is `1) `, or `* ` — not `- `

#### Scenario: A run that does not start at one
- **WHEN** the donating children are `5. a` / `6. b`
- **THEN** the new first child is `5. ` and the existing items become `6. a` and `7. b`

#### Scenario: A task donor
- **WHEN** the donating child is `- [x] a`
- **THEN** the new first child is `- [ ] ` — the same unchecked carry-over a new SIBLING
  item already makes

#### Scenario: A bullet list is unaffected
- **WHEN** the donating children are plain `- ` items
- **THEN** the new first child is `- `, exactly as before

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

When `first` is a heading, the merged node's trailing gap SHALL instead be whichever
of `first`'s or `second`'s own trailing gap has MORE lines, rather than
unconditionally `second`'s. A heading's own gap is its established separation from
its content — a section-level property, not a property of whichever node happened to
be absorbed — and SHALL NOT be silently shrunk merely because the absorbed node's own
gap happened to be smaller (e.g. two adjacent list items needing no separation from
each other). This preserves the ordinary (non-heading `first`) convention unchanged:
only a heading `first` triggers the comparison, and even then `second`'s gap still
wins whenever it is the longer of the two (e.g. when `second` is the document's own
terminal node and carries the file's trailing-newline representation).

*(Amended 2026-07-21 from the original conservative table, per the real-vault manual
pass: cross-kind content joins ARE the expected behavior — a list item's text merges
into its parent paragraph — and children re-parent rather than reject, matching
content-space outliner semantics. See node-edit-enforcement's chrome-transparency
requirement.)*

*(Amended 2026-07-24, found via manual testing of the heading-Enter-splits-paragraph
change: merging content into a heading then later splitting back out was silently
shrinking the heading's own gap to whatever the absorbed node's gap happened to be —
root cause predates that change, surfaced by it.)*

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

#### Scenario: A heading absorbing content keeps its OWN gap when it is the longer one
- **WHEN** a heading with a real blank-line gap before its content absorbs a child
  whose own trailing gap is empty (e.g. the child was itself tightly adjacent to a
  following sibling)
- **THEN** the merged heading's trailing gap is the heading's own original gap, not
  the absorbed child's — whatever follows stays separated from the heading exactly
  as it was before the merge

#### Scenario: A heading absorbing its own terminal child still keeps that child's gap
- **WHEN** a heading with NO gap of its own absorbs a child that is the document's
  own last node (whose trailing gap carries the file's trailing-newline
  representation)
- **THEN** the merged heading's trailing gap is the absorbed child's (the longer of
  the two), unchanged from before this amendment

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

### Requirement: An operation result states a structural anchor, not a caret
An accepted operation's result SHALL carry a structural ANCHOR — where the operation's
subject, or the surviving neighbour it leaves behind, landed in the result tree — and
SHALL NOT be read as the caret. The caret is decided by `caret-placement-policy` from the
anchor and the surrounding facts.

The anchor is load-bearing beyond caret placement, which is why it is stated as its own
output rather than dropped. Operations return a FRESHLY RE-PARSED tree, so node identity
does not survive an operation; composing code that must locate a node across that
boundary — the enforcement layer's delete-then-splice, which needs the surviving neighbour
in the post-deletion tree — locates it by the anchor's line. Reading the caret for that
purpose conflates a decision with a fact, and makes the caret convention unchangeable
without silently changing which node a paste or type-over splices against.

The anchor's value for each operation is unchanged by the RENAME: the subject's own landing
line for indent, outdent, move and heading level shifts; the interior position for split,
merge and insertion; and, for deletion, the surviving neighbour the operation selects.

One deletion case does change, and direct `OpOutput` consumers should not rely on the old
value. The neighbour SHALL be a node that survives the COMBINED removal. The preference
order is unchanged — the following sibling, then the preceding one, then the nearest
ancestor — but a candidate removed by another group is skipped rather than named, so a
multi-group deletion can anchor on a farther sibling or an ancestor than before. Previously
the first group's following sibling was named even when a later group removed it, and the
anchor then degraded to line 0, which reads as a legitimate position and points at whatever
occupies it (in a note with frontmatter, the preamble). When nothing in scope survives, the
anchor SHALL be the end of what remains rather than a coordinate past the document.

#### Scenario: A multi-group deletion anchors on a survivor
- **WHEN** two adjacent sibling runs are removed as separate groups, so the first group's
  following sibling is itself removed by the second
- **THEN** the anchor names a node that still exists in the result, not the removed
  neighbour and not a degraded line 0

#### Scenario: Emptying the document yields a position inside it
- **WHEN** a deletion removes every node from a note whose frontmatter has no trailing
  blank line
- **THEN** the anchor is a real position in the resulting text — the end of what remains —
  rather than one line past its end

#### Scenario: Anchor and caret can differ
- **WHEN** a structural deletion runs
- **THEN** the result's anchor identifies the surviving neighbour, while the caret is
  placed by `caret-placement-policy` at the preceding node's content end, and the two need
  not coincide

#### Scenario: Composing operations read the anchor
- **WHEN** a type-over deletes a covered range and splices replacement content against the
  surviving neighbour
- **THEN** it locates that neighbour by the deletion result's anchor, and its behaviour is
  unaffected by any change to the caret convention

#### Scenario: Operations state no caret
- **WHEN** any structural operation is called directly, outside the editor
- **THEN** its result describes the new tree, the minimal edits, and the anchor — and
  makes no claim about where a caret should go

### Requirement: A subtree payload's roots normalize to the destination level
When a payload of whole subtrees is inserted at a destination, its ROOTS SHALL become
siblings at the destination's depth, regardless of the depths they occupied at their
source, and each root's own internal relative structure SHALL be preserved exactly. A
payload whose roots came from different depths SHALL NOT attempt to preserve the depth
differences between roots — with the roots' common ancestor absent from the payload,
those differences have nothing to be relative to.

#### Scenario: Roots from two different depths land as siblings
- **WHEN** a payload consisting of a deeply nested item's subtree followed by a top-level
  item's subtree is inserted at some destination depth
- **THEN** both roots appear at the destination depth as siblings, each with its own
  descendants at their original relative offsets beneath it

#### Scenario: A single root is unaffected
- **WHEN** a payload of exactly one subtree is inserted
- **THEN** the behavior is the existing one — the root takes the destination depth and its
  descendants keep their relative structure

### Requirement: An operation that creates a heading's first paragraph child separates them
An operation that ATTACHES a new paragraph as a heading's first child SHALL leave a blank
line between the heading and that paragraph. `# Head` immediately followed by `line` parses
correctly, so this separation is required by CONVENTION, not by the parse: it is the one
place this codebase widens separation beyond what the encoding demands, adopted because an
operation that omits it produces markdown a reader would call malformed.

The rule SHALL be applied by the OPERATION THAT CREATES the boundary, and SHALL NOT be added
to global boundary normalization. Normalization runs on every operation's result, and the
list-item version of this rule is safe there only because a list item with a gap-0 paragraph
child cannot come from the parser at all — without the blank line the indented text is a
CONTINUATION LINE of the item and there is no child. A heading with a gap-0 paragraph child
is ordinary parsed markdown, so a global rule would rewrite boundaries the user wrote,
anywhere in the file, on any unrelated edit. "Minimal re-encoding after tree edits" forbids
exactly that: a heading's trailing gap is part of its own encoding, and the heading was not
the node being operated on.

Every other gap SHALL stay at its minimum, so "a blank line is here because something needs
it" remains true of the encoding as a whole.

#### Scenario: A heading split separates the new child
- **WHEN** a heading is split mid-title and the remainder becomes a paragraph child
- **THEN** a blank line separates the heading from that child

#### Scenario: A boundary the user wrote is left alone
- **WHEN** a document contains `# H` directly followed by `body`, and a structural operation
  runs on some unrelated node
- **THEN** that heading's own lines and trailing gap are byte-identical afterwards — the
  operation normalizes nothing it did not create

#### Scenario: An existing separated boundary is not widened further
- **WHEN** a heading already has a blank line before its first paragraph child and an
  operation attaches nothing there
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

### Requirement: A provisional position carries its destination scope's indentation

Where a split opens a provisional position instead of materializing a node — the end-of-node
case whose destination scope's kind has no empty encoding — the line the anchor points at
SHALL carry the indentation that scope requires, by the same indentation rule every other
operation uses to place a node at a destination, and the anchor SHALL point after that
indentation rather than at column 0.

The scope is the one the widened gap already serves: the CHILD scope for a node that has
children, and for a heading; the node's own level otherwise. For a destination at the top
level, or directly under a heading, the required indentation is empty and the operation's
output is byte-identical to a plain blank line. For a destination inside a list item it is
that item's own content indentation, which is what makes text typed there parse as a node in
the intended scope.

Without it, a provisional position whose destination lies inside a list item materializes
outside it: text typed at column 0 after a list item starts a new top-level block, which
places the new node at the wrong depth AND detaches the item's existing children, since they
then follow a top-level sibling instead of the item.

Everything else about a provisional position is unchanged: the keypress SHALL still leave the
node count untouched, the position SHALL still be blank-separated or adjacent exactly as
before, and it SHALL still be removable in full — indentation included — by the
undo-on-abandon rule, leaving no trace in the file.

#### Scenario: A position inside a list item materializes as that item's child
- **WHEN** a list item that has a paragraph child is split at the end of its own text, and a
  character is then typed at the resulting anchor
- **THEN** the typed text becomes the item's new FIRST child, placed before the existing
  paragraph child, and that existing child remains a child of the same item

#### Scenario: A top-level position is byte-identical to before
- **WHEN** a childless top-level paragraph is split at the end of its text
- **THEN** the widened gap's lines carry no indentation at all and the anchor sits at column
  0, exactly as with no destination indentation to apply

#### Scenario: A position beside an indented paragraph stays at its level
- **WHEN** a paragraph that is itself a child of a list item is split at the end of its text,
  and a character is typed at the resulting anchor
- **THEN** the typed text becomes a sibling of that paragraph, at the same depth, still inside
  the list item

#### Scenario: Abandoning removes the indentation too
- **WHEN** a provisional position carrying destination indentation is abandoned
- **THEN** the document is byte-identical to what it was before the keypress, with no
  whitespace-only line left behind

**Covered by**: `tests/split.test.ts` (the indented provisional position for each destination
scope, and the re-parse of the materialized node including its siblings' attachment);
`tests/undo-on-abandon.test.ts` (byte-identical abandonment of an indented position);
`e2e/specs/30-keyboard-grammar.e2e.ts` (the live keypress-then-type sequence on a list item
with a paragraph child).

### Requirement: Group forms of indent, outdent and reordering

Indent, outdent, move up and move down SHALL each have a GROUP form taking a forest of covered
roots — one contiguous sibling run per parent, in document order, the same input shape
`deleteSubtreeGroups` takes — and returning the same typed result the single-node forms return.

A group operation SHALL preserve the RELATIVE DOCUMENT ORDER of its covered roots, at every
cover shape. "Move these three up" means the three arrive above their neighbour still in the
order the user selected them; an operation that returns them shuffled has not performed the
gesture, whatever else it got right.

Subject to that, the group form's output tree SHALL BE the tree produced by applying the
SINGLE-NODE form to each covered root IN TURN, each step evaluated against the tree the
previous step produced:

- Indent, outdent and move up apply their roots in DOCUMENT ORDER.
- Move down applies its roots in REVERSE document order, because a forward-order move would
  swap a selected root past another selected root rather than past the run's own neighbour.
- Groups apply in document order, topmost first. Groups are independent by construction: a
  forest cover is a document-order interval closed under descendants, so no group's parent can
  be a member of another group.

Move up and move down SHALL additionally require the operand to be a SINGLE group — one
contiguous sibling run under one parent — and SHALL reject a multi-parent forest with
`cannot-reorder-across-scopes`. Indent and outdent carry no such restriction and apply to a
forest of any shape.

The asymmetry is measured, not stylistic. A reorder moves each group WITHIN ITS OWN SCOPE, so
a cover whose roots sit at different depths is scattered rather than moved: on

    L0
    - L1
      - L2
      - L3   <- covered
      - L4   <- covered

    L5       <- covered

move up carries `L5` to the top of the document while `L3` and `L4` shuffle inside `L1`. The
roots end up separated by content that was never selected, which is not a weaker version of
the requested gesture but a different one. Measured over generated documents (20 000 runs per
operation): every accepted multi-parent move up left the roots torn apart (3100 of 3100), while
indent and outdent left them adjacent in every accepted case (3723 and 2577 respectively, none
torn). Multi-parent move down was never accepted at all in 8141 attempts — its last root is its
scope's last child — so it is restricted on the same rule rather than on its own evidence.

Indent and outdent are unaffected because their destination is derived per group from that
group's own previous sibling or parent, and a group's roots stay adjacent under it.

Stating the algebra as a composition rather than as new rules is what keeps the two-regime
per-kind algebra intact without restating it. A heading root still level-shifts and a
non-heading root still reparents under the run's previous sibling; a sibling run mixing the
two gets each root's own rule, with no new rejection for the mixture.

Where the composition would NOT preserve the roots' order, the ORDER rule governs and the
composition does not define the result. The two can conflict because a composition moves one
root at a time, and an intermediate tree need not be REPRESENTABLE: markdown has no encoding
for a list item that follows a paragraph as its sibling, so the re-parse between two steps can
reshape the document under the steps that have not run yet.

For a REORDER, that unrepresentability is now decided before either rule applies. "Sibling
reordering" refuses a swap that would place a section-level list item directly after a paragraph
sibling, and because a group reorder IS the composition above, it inherits that refusal at every
step: a step the single-node form refuses is a composition that does not exist, so the group
operation is refused as a whole. A run whose intermediate step is refused is therefore refused
even where the arrangement it would finally have emitted is expressible; that follows from
defining the group form as the composition, and group rejection is already atomic.

So the order rule governs among the runs a reorder accepts, and the shape where the two rules
disagree is refused rather than resolved in the order rule's favour. The measurement below is
retained because it is why the order rule is stated first and the composition subordinate to
it; it now describes a case that is rejected.

Measured on `- L0` / `L1` / `L2`, moving the run `[L1, L2]` up. Step one swaps `L1` above
`- L0`; that encoding re-parses with `- L0` as L1's own child, so step two finds L2's previous
sibling to be `L1` and swaps past it — yielding `L2 / L1 / - L0`, the run reversed. Acting on
the whole run at once yields `L1 / L2 / - L0`, which is the requested gesture.

Every measured disagreement between the two rules has this shape — 49 of 49, always with the
composition losing the order and the whole-run result keeping it, never the reverse — which is
why the order rule is stated first and the composition is subordinate to it rather than the
other way round.

Group forms SHALL emit ONE minimal edit list for the whole transformation, satisfying the
existing minimal-edit guarantee against the ORIGINAL document: lines no root's transformation
semantically requires SHALL be byte-identical, with ordered-run renumbering the same documented
exception it already is. An implementation MAY perform the surgery in one pass rather than
literally re-parsing between steps, but its output tree SHALL equal the composition above.

A group of exactly one root SHALL produce a result identical to the single-node form, edits
included, so no existing behaviour changes when the operand resolves to one node.

#### Scenario: A sibling run indents as a block
- **WHEN** the group indent of `- a` / `- b` / `- c` is invoked for the run `[b, c]`
- **THEN** `b` and `c` both become children of `a`, in that order, after any children `a`
  already had

#### Scenario: A run moves down past its own neighbour, not past itself
- **WHEN** the group move down of `- a` / `- b` / `- c` is invoked for the run `[a, b]`
- **THEN** the result is `- c` / `- a` / `- b` — the run moved below `c` as a unit, with `a`
  and `b` keeping their relative order

#### Scenario: A run moves up past its own neighbour
- **WHEN** the group move up of `- a` / `- b` / `- c` is invoked for the run `[b, c]`
- **THEN** the result is `- b` / `- c` / `- a`

#### Scenario: A run keeps its order where a step-at-a-time composition would reverse it
- **WHEN** the group move up is invoked for the run `[L1, L2]` in `- L0` / `L1` / `L2`, where
  `L1` and `L2` are paragraphs — the shape in which the composition reverses the run, because
  the arrangement the group would emit places `- L0` as a paragraph's following sibling and
  has no markdown encoding
- **THEN** the operation is rejected and the document is unchanged; the run's order is never at
  risk here because the run does not move. Emitting `L1` / `L2` / `- L0` would re-parse with
  `- L0` as `L2`'s child — a node the cover never named, carried a level deeper — which
  "Sibling reordering" refuses for the same reason the single-node move up on this shape does

#### Scenario: A run is refused when one of its steps is refused
- **WHEN** a group reorder's composition reaches a step the single-node form refuses, even
  though the arrangement the run would finally have emitted is expressible — a run of an atom
  followed by a list item, moving down past a paragraph
- **THEN** the whole group operation is rejected, with the same typed reason the single-node
  step gave, and nothing is moved. The group form is the composition, so a step that cannot be
  performed is a composition that does not exist

#### Scenario: A heading run level-shifts
- **WHEN** the group indent is invoked for a run of two sibling headings
- **THEN** each heading and its whole heading subtree shifts one level deeper, exactly as the
  single-node indent does for each

#### Scenario: A mixed-kind run applies each root's own rule
- **WHEN** the group indent is invoked for a run holding both a paragraph and a heading
- **THEN** the paragraph reparents under the run's previous sibling and the heading shifts
  level, matching what applying the single-node operation to each in document order produces

#### Scenario: A mixed-depth cover operates group by group
- **WHEN** the group outdent is invoked for a cover whose roots sit at two different depths,
  so the operand holds two groups
- **THEN** each group outdents within its own parent's scope, and the result equals applying
  the single-node outdent to every root in document order

#### Scenario: A reorder across scopes is rejected
- **WHEN** the group move up is invoked for a cover whose roots sit under two different
  parents
- **THEN** the operation is rejected with `cannot-reorder-across-scopes` and the document is
  unchanged — neither group is moved within its own scope

#### Scenario: A reorder within one scope is unaffected
- **WHEN** the group move up or move down is invoked for a cover whose roots are one
  contiguous sibling run, and the arrangement it would emit is expressible
- **THEN** the run moves as a unit exactly as the composition prescribes

#### Scenario: A single-root group is the single-node operation
- **WHEN** any group form is invoked with exactly one root
- **THEN** its tree, its edits and its anchor are identical to those the single-node form
  produces for that same root

#### Scenario: Group closure
- **WHEN** any group operation is applied to any generated cover of any generated tree
- **THEN** either it is rejected, or `parse(encode(result.tree))` equals `result.tree`,
  applying `result.edits` to the source text yields `encode(result.tree)`, and `result.tree`
  equals the tree the sequential single-node composition produces

### Requirement: A group operation is accepted in full or rejected in full

If ANY step of the composition above rejects, the group operation SHALL reject with THAT step's
typed reason — the first such step in application order — and SHALL leave the tree and document
text unchanged. A group operation SHALL NEVER apply to a subset of its roots.

An empty forest SHALL be rejected with `empty-selection`, the reason multi-root deletion
already uses for the same input.

Partial application is refused for the same reason `deleteSubtrees` refuses a partial-subtree
input: the user issued one gesture over one selection, and a result where some of the selected
nodes moved and others did not is neither what was asked for nor recoverable in one undo of
anything they could name.

#### Scenario: One inexpressible root rejects the whole group
- **WHEN** the group outdent is invoked for a cover holding one top-level root and one nested
  root
- **THEN** the operation is rejected with `at-top-level` and the document is unchanged — the
  nested root is not outdented on its own

#### Scenario: A run already at the head of its scope rejects
- **WHEN** the group move up is invoked for a run whose first root is its parent's first child
- **THEN** the operation is rejected with `no-previous-sibling` and nothing changes

#### Scenario: A heading at the bound rejects the group
- **WHEN** the group indent is invoked for a run containing an h6 heading
- **THEN** the operation is rejected with `at-h6-bound` and no other root in the run is
  indented

#### Scenario: An empty forest is rejected
- **WHEN** any group operation is invoked with no roots
- **THEN** it is rejected with `empty-selection`

### Requirement: An operation result states the span its subjects occupy

An accepted operation's result SHALL additionally state a SUBJECT SPAN: the line range in the
RESULT document that the operation's subjects and their subtrees occupy, from the first
subject's own start line through the last subject's whole-subtree cover end. For a single-node
operation the span is that node's own subtree cover; for a group operation it spans every
moved root.

The span is stated rather than derived because node identity does not survive an operation —
results are freshly re-parsed — so a caller holding pre-operation ids cannot locate the moved
nodes afterward. It is the multi-node counterpart of the existing ANCHOR, which names one
landing position, and it does not replace it: the anchor still answers where a caret would go,
the span answers which nodes the operation acted on.

The span SHALL be CONTIGUOUS and SHALL be an exact whole-subtree cover of the result tree, so a
caller can dispatch it directly as a selection with no further computation.

Contiguity is a CONSEQUENCE of the operand rules above, not an independent hope. For indent and
outdent it holds at any cover shape: each group's roots keep their relative order and stay
adjacent under their destination parent. For the reorders it holds because they accept only a
single sibling run, which is exactly the restriction that rules out the scattering case — the
one shape measured to break it.

#### Scenario: The span covers every moved root
- **WHEN** a group indent moves three sibling subtrees under a previous sibling
- **THEN** the result's span runs from the first moved root's start line through the last
  moved root's subtree cover end

#### Scenario: The span is an exact cover
- **WHEN** any accepted operation reports a span
- **THEN** the range it names is an exact whole-subtree cover under the selection geometry —
  escalating it returns it unchanged

#### Scenario: A single-node operation states its own subtree
- **WHEN** a single node is moved
- **THEN** the span is that node's whole-subtree cover in its new position, and the anchor is
  unchanged from what the operation reported before this requirement existed

### Requirement: A non-heading subject lands at a stated depth in the result

For a NON-HEADING subject, an accepted structural operation SHALL place that subject at a stated
depth in the RESULT tree — the tree the caller receives, after the emitted encoding has been
re-parsed — measured against the depth the subject held before the operation:

- indent: exactly one level deeper,
- outdent: exactly one level shallower,
- move up: unchanged,
- move down: unchanged.

The guarantee is about the RESULT, not about the tree the operation's own surgery built. Those two
can disagree: markdown cannot express every tree, so an encoding can re-parse with the subject
attached somewhere other than where the surgery put it — absorbed into a neighbour's list, or
adopted by a preceding paragraph. An operation whose surgery is right and whose encoding re-parses
elsewhere has not performed the gesture the caller asked for, and states a depth it did not
deliver.

This is not implied by operation closure. Closure holds that the result tree equals the parse of
its own encoding — which the result tree, being a parse output already, satisfies whenever
encoding and parsing are stable. It says nothing about whether that tree is the one the algebra
produced, so an operation can satisfy closure while placing the subject at the wrong depth.

The group forms carry the same contract PER COVERED ROOT, each root measured against its own prior
depth. A cover whose roots sit at different depths moves every root by the same delta; it does not
bring them to a common depth. The group forms are not covered by the single-node statement: they
compose every root's surgery and re-parse once for the whole operand, so a root can be absorbed at
a re-parse the single-root path never performs.

Headings are excluded because their algebra is a level shift: an indented heading's tree depth
follows the surrounding heading context rather than the operation, so a fixed delta is not their
contract.

Move down was previously deferred here, pending the fix for the defect that violated it. It now
carries the same unchanged-depth contract as move up, on the same terms.

#### Scenario: Indent deepens the subject by exactly one level

- **WHEN** indent is accepted on a non-heading node at depth `d`
- **THEN** that node sits at depth `d + 1` in the result document, with its subtree still beneath
  it

#### Scenario: Outdent raises the subject by exactly one level

- **WHEN** outdent is accepted on a non-heading node at depth `d`
- **THEN** that node sits at depth `d - 1` in the result document

#### Scenario: A reorder leaves the subject's depth alone

- **WHEN** move up or move down is accepted on a non-heading node at depth `d`
- **THEN** that node sits at depth `d` in the result document — a reorder changes the subject's
  position among its siblings and nothing about its depth

#### Scenario: Every root of a group operation moves by the operation's own delta

- **WHEN** a group form of indent, outdent, move up or move down is accepted on a cover with
  several roots
- **THEN** each covered root sits at its own prior depth plus the operation's delta in the result
  document

#### Scenario: A multi-depth cover moves each root by the delta, not to a common depth

- **WHEN** a group indent or outdent is accepted on a cover whose roots sit at several different
  depths — the forest shapes only these two accept, since a reorder takes a single sibling run,
  whose roots share a depth by construction
- **THEN** each root moves by the operation's delta from where it was, and no root is brought to
  another root's depth

#### Scenario: A subject absorbed by the re-parse is a defect, not an outcome

- **WHEN** an operation's encoding re-parses with the subject at a depth other than the contracted
  one — a moved node adopted by the paragraph it landed after, say
- **THEN** the operation has violated this requirement; the accepted result must place the subject
  at the contracted depth, or the operation must reject
