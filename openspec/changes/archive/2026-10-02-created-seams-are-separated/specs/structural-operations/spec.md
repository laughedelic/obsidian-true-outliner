## ADDED Requirements

### Requirement: A seam at an operation's edit site is separated
A SEAM is the boundary between two blocks: the last content line of the block above it (its UPPER block) and
the first content line of the block below it (its LOWER block), with whatever blank lines stand between them.

A block is judged on what the outline shows of it, not on its text. A block is WRITTEN by an operation when it is
new, or when its kind as it will re-parse or its content changed. Content sets aside indentation, list marker,
ordinal number, a heading's level, and a block id, whether attached, trailing its text or on a line of its own
within the block. A heading's level decides only where it sits, which its parent and previous sibling state.

Renumbering an ordered run, shifting a section's heading levels, re-indenting a run and attaching a block id
therefore write no block. Parents and previous siblings are those of the note the operation writes, with each
heading's section read off the levels as the re-parse reads it, not those of the tree the operation assembled.

A structural operation's EDIT SITE is every seam where:
- the lower block was written, its previous sibling changed, or it has no previous sibling and its parent
  changed;
- the upper block was written; or
- the two blocks were not consecutive before the operation, so something that stood between them was removed
  or moved away.

A moved run's inner seams are not at the edit site: each of its blocks but the first keeps its previous
sibling, and a first child inside the run keeps its parent. Only the seams at its edges are. Every block of a pasted payload
is new, so every seam inside the payload is at the edit site. A paste of a single childless block that reaches
the editor natively is not a structural operation.

An empty seam at the edit site SHALL gain one blank line. Every reader of the note but our own parse continues
a line written flush under a quote, a callout or a list item into that block
(`docs/research/lazy-continuation-at-seams`), and a blank line settles every reader. So the rule separates every
seam at the edit site rather than the ones some reader would continue: a writer that knew which lines each reader
continues would need that table kept current for every reader.

How many blank lines stand at a seam, for every structural operation:

| the seam | blank lines |
| --- | --- |
| at the edit site, outside a list, empty | one |
| at the edit site, outside a list, already separated | what it holds |
| at the edit site, inside a list | what `Subtree insertion at a boundary`, `Node split` and the parse write |
| at the edit site, below a lone block-id line or above a block four columns in | none, unless the parse requires one |
| away from the edit site | what it held before the operation, unless the parse requires one |
| beside a place | what the keypress writes |

Every structural operation inherits this table, a new one included. A requirement for one operation states which
blocks it writes, moves or removes, and names this requirement for the blank lines at its seams rather than
stating them again.

Four limits bound it:

- **Inside a list the rule adds nothing.** A LIST is a maximal run of adjacent sibling list items under one
  parent, judged by kind as written, whatever their markers. A seam is INSIDE A LIST when its lower block is one
  of the list's items or lies inside one, and its upper block lies inside the same list. That covers:
  - an item and its child blocks
  - two child blocks of one item
  - an item's last block and the next item
  - an item and its nested list

  Those seams SHALL be written as `Subtree insertion at a boundary`, `Node split` and the parse require, and this
  rule SHALL NOT add to them. A blank line there makes the list loose in every reader
  (`lazy-continuation-at-seams`, "Measured: loose lists"), and whether a list is tight or loose is the user's to
  choose. The seams between a list and a block outside it are not inside the list: a paragraph or heading
  directly above the list, and the block directly below the list's last line.
- **A seam is never widened.** A seam at the edit site that already holds one or more blank lines SHALL keep
  exactly what it holds.
- **A seam away from the edit site is not touched.** It SHALL keep its separation as written, however flush,
  unless the parse requires a separator there (`Boundary separation is judged on the kind the re-parse will
  read`). The parse's requirements include one that reaches seams away from any edit: a list item is separated
  from a flush quote, callout or `- - -` first child on any operation (#255).
- **A blank line never changes what a block is.**
  - An attached block-id line SHALL NOT be separated from the block it names. It is part of that block's
    encoding, and the separator is written after it.
  - A lone block-id line the parse reads as a node of its own SHALL stay flush above the block below it, since a
    blank line there would attach it to the block above. The parse's own requirements still apply: above a
    paragraph, the id line would otherwise join the paragraph's text.
  - No blank line SHALL be written above a block indented four or more columns past its container's margin, which
    CommonMark would then read as indented code. The parse's own requirements still apply there too.

The cost of the first limit is that some shapes stay ambiguous inside a tight list. A paragraph written directly
under a quote, or under a nested item, is continued into that block by reading mode.

A PLACE is not a block: a provisional position, an empty list item or heading an operation opens, or the empty
line an operation leaves where it dissolved a node. The rule writes nothing beside a place and judges no seam
across one: its lines are the ones `outline-keyboard-grammar`'s `Provisional positions` states. `docs/research/created-seam-detection`
records the other rules for deciding which seams an operation owns that were reviewed, and the cases each failed
on.

#### Scenario: A pasted quote is separated from the paragraph below it
- **WHEN** `    first` / blank / `    > quote` is pasted at the end of `## H` in a note holding `## H`
  directly above `below`
- **THEN** the note reads `## H` / blank / `first` / blank / `> quote` / blank / `below`

#### Scenario: A paste after a line that repeats in the payload is still separated
- **WHEN** `x` / blank / `z` is pasted at the end of `> quote` in `> quote` / `x` / blank / `y`
- **THEN** a blank line stands between `> quote` and the pasted `x`

#### Scenario: A drag that ends a list above a paragraph separates them
- **WHEN** `- kid`, whose child is a paragraph `<div>`, is dragged out of `- other` to the top of
  `- item` / `- other` / `  - kid` / blank / `    <div>` / blank / `after`
- **THEN** a blank line stands between `- other` and `after`, as well as around `<div>`

#### Scenario: A removal that joins a quote and a paragraph separates them
- **WHEN** the rule between `> q` and `after` is deleted from `> q` / `---` / blank / `after`
- **THEN** the note reads `> q` / blank / `after`

#### Scenario: A run of list items lands in a tight list tight
- **WHEN** a list item is inserted between two list items with no blank line between them
- **THEN** no blank line is added on either side of it

#### Scenario: A code block dropped into a tight list keeps the list tight
- **WHEN** a fenced code block is dropped as the last child of `- b` in the tight list `- a` / `- b`
  / `- c`
- **THEN** no blank line is written above or below the code block, and the list stays tight

#### Scenario: A heading split separates the new child
- **WHEN** a heading is split mid-title and the remainder becomes a paragraph child
- **THEN** a blank line separates the heading from that child

#### Scenario: A split separates the blocks it wrote
- **WHEN** Enter is pressed mid-text in `para text`, written directly between `# H` and `> q`
- **THEN** the note reads `# H` / blank / `para` / blank / `text` / blank / `> q`

#### Scenario: A merge separates the merged block from its flush neighbours
- **WHEN** `para` is merged into `- a` in `- a` / blank / `para` / `> q`, where `para` sits directly above `> q`
- **THEN** a blank line stands between the merged item and `> q`

#### Scenario: A type-over separates its payload
- **WHEN** `x` is typed over a selected `para` in `# A` / `para` / `# B`, written with no blank lines
- **THEN** the note reads `# A` / blank / `x` / blank / `# B`

#### Scenario: An outdent that takes a quote out of a list separates it from the list
- **WHEN** Shift+Tab is pressed on `  > q`, the child of `- b` in `- a` / `- b` / `  > q`
- **THEN** the quote is written at the root with a blank line between `- b` and `> q`

#### Scenario: A reorder separates the flush seams at the moved block's edges
- **WHEN** `## Budget` is moved up past `## Packing` in `## Packing` / `x` / `## Budget` / `y`, written with no
  blank lines
- **THEN** the note reads `## Budget` / `y` / blank / `## Packing` / `x`, and `## Budget` stays directly above
  `y`

#### Scenario: Renumbering writes no block
- **WHEN** `1. a` is deleted from `1. a` / `2. b` / `3. c` / `para`, written with no blank lines
- **THEN** the note reads `1. b` / `2. c` / `para`

#### Scenario: A level shift writes only the heading it moves
- **WHEN** Tab is pressed on `## B` in `# A` / `## B0` / `## B` / `text` / `### C` / `body`, written with no
  blank lines
- **THEN** the note reads `# A` / `## B0` / blank / `### B` / `text` / `#### C` / `body`

#### Scenario: A level shift at the root writes only the heading it moves
- **WHEN** Tab is pressed on `## Budget` in `## Packing` / `x` / `## Budget` / `### Transport` / `bus`, written
  with no blank lines
- **THEN** the note reads `## Packing` / `x` / blank / `### Budget` / `#### Transport` / `bus`

#### Scenario: A level-skip outdent writes no block
- **WHEN** Shift+Tab is pressed on `### Monday` in `# Log` / `### Monday` / `text`, written with no blank lines
- **THEN** the note reads `# Log` / `## Monday` / `text`

#### Scenario: A remainder's heading is separated, and so is the original's first child
- **WHEN** Shift+Enter carries `bar` out of `## Foo bar`, written directly above its child `text`
- **THEN** the note reads `## Foo ` / blank / `text` / blank / `## bar`

#### Scenario: A merge separates the merged paragraph from the list it heads
- **WHEN** `- list parent1` is merged into `paragraph` above it, where the item has its own list children
- **THEN** a blank line stands between the merged paragraph and its first child item

#### Scenario: A seam away from the edit site is left alone
- **WHEN** a document contains `> q` directly followed by `body`, and a structural operation runs
  on some unrelated node
- **THEN** the quote's own lines and trailing gap are byte-identical afterwards

#### Scenario: A reorder leaves the seams between the blocks it passed as written
- **WHEN** `## h3` is moved to the top of `| t1 | b |` / `| --- | --- |` / blank / blank / `> q2` / `## h3` / `x`
- **THEN** `| --- | --- |` and `> q2` are still separated by two blank lines

#### Scenario: A seam inside a moved run is left as written
- **WHEN** the run `> q` / `body`, two sibling blocks written with no blank line between them, is dragged from
  under `## A` to the end of `## B`
- **THEN** `> q` and `body` are still written with no blank line between them

#### Scenario: An existing separated boundary is not widened further
- **WHEN** an operation's edit site includes a seam that already holds one blank line
- **THEN** the seam holds exactly one blank line afterwards

#### Scenario: A block id stays on its block
- **WHEN** a list item carrying an attached block id on its own line is inserted at the root above a
  paragraph
- **THEN** the id's line stays directly under the item, and the blank line the seam gains is written
  below the id

#### Scenario: A lone id line stays flush above the block below it
- **WHEN** `> q` is deleted from `Lead.` / blank / `^id3` / `> q` / `# H`
- **THEN** `^id3` stays directly above `# H`, and remains a node of its own rather than attaching to
  `Lead.`

#### Scenario: Dropping a lone id writes no block
- **WHEN** the lone `^id` is dropped onto `Lead.` in `Lead.` / `- a` / blank / `^id`
- **THEN** `- a` stays directly below `Lead.`'s id line

#### Scenario: A block indented four columns is not preceded by a blank line
- **WHEN** a payload of `para` over `    - a`, a list indented four columns under it, is pasted
- **THEN** no blank line is written between `para` and `    - a`

## MODIFIED Requirements

### Requirement: Heading indent and outdent shift levels
Indent on a heading SHALL increase its level by one and outdent SHALL decrease it by one,
rewriting the heading markers of the node and its entire heading subtree (level shift is
recursive), touching only heading-marker characters, save for the blank line an empty seam gains at its edit site (`A seam at an operation's edit site is separated`): a heading whose section changes has a new parent or previous sibling, and a level shift alone writes no block. The tree SHALL re-derive from the new
levels. Indent SHALL be rejected at h6; outdent SHALL be rejected at h1.

#### Scenario: Demote with subtree
- **WHEN** indent is applied to `## Budget` which contains `### Transport`
- **THEN** the document now reads `### Budget` and `#### Transport`, all non-heading lines
  are byte-identical, a blank line above `### Budget` aside where it was written flush, and `Budget` re-parses as a child of the preceding `##` heading

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

### Requirement: Sibling reordering
MoveUp/moveDown SHALL swap a node (with its entire subtree) with its previous/next sibling,
and SHALL be rejected when no such sibling exists. Node types and encodings are unchanged by
reordering, except ordered-list markers which are renumbered, and the blank line an empty seam at
the edges of the swapped nodes gains outside a list (`A seam at an operation's edit site is separated`).

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

### Requirement: Operation closure over the mapping
For every accepted operation, encoding the resulting tree SHALL produce valid markdown that
re-parses to an identical tree, and the emitted edit list applied to the original text SHALL
equal that encoding. Edits SHALL touch only lines the operation semantically requires, with
one documented exception: ordered-list marker renumbering of affected siblings. The blank line an
empty seam gains at the operation's edit site is a line the operation requires
(`A seam at an operation's edit site is separated`).

#### Scenario: Closure property test
- **WHEN** any generated operation is applied to any generated tree
- **THEN** either it is rejected, or `parse(encode(result.tree))` equals `result.tree` and
  applying `result.edits` to the source text yields `encode(result.tree)`

### Requirement: Subtree deletion
A `deleteSubtrees` operation SHALL remove a contiguous run of whole sibling subtrees
from the tree, including each removed subtree's trailing gap lines, returning the
typed result form the existing operations use. Deleting every node SHALL yield a
valid empty (or preamble-only) document. Non-contiguous or partial-subtree inputs
SHALL be rejected, not partially applied.

ONE gap line is not the removed run's to take: a document's terminating newline is an
empty gap line on its LAST node rather than a property of the document, and it
separates that node from nothing. Where the removal takes the node holding it, the node
that now ends the document SHALL take it over, appended to whatever gap that node
already owns. It SHALL be restored and never invented — a note written without a final
newline SHALL NOT be given one — and a gap line carrying whitespace is content rather
than a terminator, so the question is whether the gap's LAST line is empty.

The seam a removal leaves between the node above the run and the node below it is at its edit site.
Outside a list it SHALL gain one blank line where it would otherwise be empty, per `A seam at an operation's edit site is separated`. When the caller will splice content into the place the removal leaves, or open a place in it, that seam is
not a seam of the result, and the removal SHALL NOT separate it: the insertion's edit site decides, or the place
is written as `outline-keyboard-grammar`'s `Provisional positions` states.

A caller that will splice content into the place the removal leaves — a type-over, or a
paste onto an empty anchor — SHALL say so, and the terminator SHALL NOT be restored
there: it travels with the gap the removed run hands to that insertion, and restoring
it as well would separate the survivor from what lands beside it.

#### Scenario: Deletion takes the trailing gap
- **WHEN** `deleteSubtrees` removes a paragraph node that owns one trailing blank
  line
- **THEN** the paragraph's lines and its blank line are both removed, and the
  surviving neighbors' own lines and gaps are byte-identical to before — save for the
  terminating newline below, which the document's new last node takes over, and the one blank
  line the node above gains where the removal leaves it flush against the node below outside a
  list

#### Scenario: A deletion inside a tight list leaves it tight
- **WHEN** `deleteSubtrees` removes the middle item of `- a` / `- b` / `- c`
- **THEN** the note reads `- a` / `- c`

#### Scenario: A deletion at the end keeps the note's terminating newline
- **WHEN** `deleteSubtrees` removes the run that ends a note, with no blank line
  separating it from the node above
- **THEN** the note still ends in a newline, carried by the node that now ends it

#### Scenario: A note without a terminating newline is not given one
- **WHEN** the same deletion runs on a note whose last line ends flush
- **THEN** the result ends flush too

#### Scenario: Heading deletion removes its section
- **WHEN** `deleteSubtrees` targets a heading node
- **THEN** the heading and every node in its subtree are removed together

### Requirement: Subtree insertion at a boundary
An `insertSubtrees` operation SHALL splice a parsed sequence of whole subtrees into
the tree at a node boundary (before or after an anchor node), re-encoded at a depth
valid for the anchor's scope per the mapping algebra (heading levels bounded,
list/paragraph depth encodings converted as the existing reparenting rules require).
Sequences inexpressible at the target scope SHALL be rejected rather than inserted
in corrupted form. When no kind conversion is needed (the common case — the
sequence's own top-level kind already matches the destination context), each
subtree SHALL be written in the DOCUMENT's indent unit at every level, whatever unit
the payload arrived in: a list item under a list item takes its parent's new
indentation plus one unit, padded with spaces to the parent's content column where
the unit falls short of it, which is what an indent writes there. The unit is the
one an indent reads from the document, falling back to the editor's own setting. A
payload the document itself wrote in that unit SHALL come back with its own lines byte-identical;
only a seam between its blocks outside a list may gain a blank line, per `A seam at an operation's edit site is separated`.

A node's own lines below its first, and a child that is not a list item, SHALL keep
their offset from the node's indentation, written after its new indentation: the
characters the payload wrote past the node's indentation are kept where they are
spaces, or tabs in a tab document, and land on the same column; otherwise the offset
is written in spaces. A line that does not open with its node's indentation SHALL move
with the block by the swap of the block root's own prefix, and SHALL be carried as it was
where it does not open with that either. A child that is not a list item SHALL be written at its parent's
content column wherever its offset would reach the content column of the list item
before it. An atom's lines are content and SHALL move as a unit by its first
line's prefix, keeping the tabs inside it. A child list of a paragraph SHALL keep its
offset from the paragraph, since it attaches by adjacency at any column.

A block whose lines, so written and read back on their own, parse as a different tree
from the block's own SHALL instead keep its own characters past its root's prefix,
re-rooted at the destination depth.

When a block's kind converts for its destination, its own lines SHALL be converted as
before, and its children SHALL be written in the document's unit: under a paragraph at the
paragraph's own indentation, and under a list item as any list item's children are.

A paste into a note that holds no node SHALL be written as the root's children through the
same re-encode, at a caret on any blank line past the note's frontmatter or over a selection
lying wholly on such lines. The frontmatter SHALL NOT be touched, and a selection reaching into
it SHALL be left to the native paste.

The document's unit SHALL be read from the step between a bullet item and its first
indented child where the document has one. The step under a numbered item is also the
width its child needs to reach the content column, so it is not evidence of the unit.
A move SHALL read the unit from the document before the moved run is removed.

The inserted run SHALL carry the SEPARATION of the boundary it lands in on both sides of
itself. A gap is a boundary's separation and an insertion turns one boundary into two: the node
above the insertion point keeps its own gap, and the run's last block takes a copy of it. Where
that node is the document's LAST, its gap is the file's terminating newline rather than a
separation — the run SHALL take that over, and what separates the run from the node now above it
SHALL be that scope's own separation: the parent's trailing gap, or the boundary above it at the
root. A copied gap line SHALL be written as an EMPTY line, a place line's own indentation saying
nothing where it is copied to.

Both seams an insertion makes are at its edit site. Inside a list the carried separation is the seam's whole separation, so a destination with none gains none there, save what the parse requires: a quote, callout or `- - -` landing flush as an item's first child is separated by the parse (#255). At every other seam a destination with no
separation gains one blank line, per `A seam at an operation's edit site is separated`, and a carried
separation of one or more blank lines stands as it is. A blank line the PARSE requires is added by
the boundary normalization every operation runs, independently of both.

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

#### Scenario: Every spelling of one tree lands in the same bytes
- **WHEN** one tree, spelled with tabs, with two spaces, with four spaces, or with a mix, is
  pasted under a tab-indented list item, a two-space one, or a four-space one, or at the root
  of a tab or a two-space document
- **THEN** every spelling lands in the same bytes at each destination, every level in the
  destination document's unit

#### Scenario: A copy from the document comes back unchanged
- **WHEN** a list item's subtree is copied from a document indented consistently with tabs,
  two spaces or four spaces, including one whose first nested item sits under `1.`, and pasted
  back after itself
- **THEN** the pasted copy is byte-identical to the original, apart from an ordered root's number

#### Scenario: A continuation keeps its offset in the document's characters
- **WHEN** `- a` / `  x` is pasted under a tab-indented list item
- **THEN** it lands as `\t- a` / `\t  x`
- **AND** `- a` / `\tx` pasted under a two-space list item lands with `x` four columns past its
  item, in spaces

#### Scenario: A fenced block keeps the tabs inside it
- **WHEN** a list item holding a fenced block whose code is indented with tabs is pasted into a
  two-space document
- **THEN** the fence opens at the offset it had from its item, in spaces, and no tab inside the
  code is converted

#### Scenario: A block after a nested item stays its parent's child
- **WHEN** `- Step 1` / `    - detail` / a fenced block at four columns is pasted under a
  two-space list item
- **THEN** the fence is written at `Step 1`'s content column and remains its child, not
  `detail`'s

#### Scenario: A block that would read as another tree keeps its own
- **WHEN** a payload's converged lines would turn a lazy line into a quote or a table
- **THEN** the payload is written with its own characters past its root's prefix, and its tree
  is unchanged

#### Scenario: A list pasted after a paragraph converts with its list in the unit
- **WHEN** a list in any spelling is pasted at the end of a paragraph in a tab-indented vault
- **THEN** its root becomes a paragraph, its list follows at the paragraph's indentation, and
  every nested level below that is written with tabs

#### Scenario: The first paste into an empty note converges
- **WHEN** a two-space list is pasted into an empty note in a tab-indented vault
- **THEN** it lands with tabs at every nested level

#### Scenario: Select-all over an empty note converges too
- **WHEN** a two-space list is pasted over a selection of every line of a note that holds only
  blank lines, in a tab-indented vault
- **THEN** it lands with tabs at every nested level, as a caret paste there does

#### Scenario: A paste below a template's frontmatter leaves the frontmatter alone
- **WHEN** a list is pasted on the blank line below the frontmatter of a note with no node
- **THEN** the list is written below the frontmatter in the vault's unit, and the frontmatter's
  lines are unchanged

#### Scenario: A move keeps the document's unit
- **WHEN** a run holding the document's only nested list items is moved under another item
- **THEN** its levels are written in the unit the document had before the move, not the
  editor's setting

#### Scenario: Insertion never splices mid-node
- **WHEN** `insertSubtrees` is invoked with any anchor
- **THEN** every existing node's own lines remain contiguous and byte-identical —
  inserted content only ever lands between nodes

#### Scenario: A run landing in a separated boundary is separated on both sides
- **WHEN** a run whose last block is a callout is inserted before a paragraph that a blank line
  separated from the node above it
- **THEN** a blank line stands between the run and that paragraph, as well as above the run,
  although the parse would read the two as separate nodes without one

#### Scenario: A tight destination gains no separation
- **WHEN** a run of list items, or of blocks inside a list item other than a quote, callout or `- - -`
  landing as an item's first child, is inserted between two list items with no blank line between them
- **THEN** no blank line is added on either side of the run

#### Scenario: A tight destination outside a list separates the run
- **WHEN** a paragraph is inserted between a heading and a code block with no blank line between
  them
- **THEN** a blank line stands above and below the paragraph

#### Scenario: A run at the end of the document takes over the terminating newline
- **WHEN** a run is inserted after the document's last node
- **THEN** the file ends in exactly one newline, and the run is separated from the node above it
  by that scope's own separation, or by one blank line where that separation is none and the seam
  lies outside a list

*(Amendment 2026-09-19, `paste-lands-where-it-is-pointed`: the run's own final gap was stripped
and the anchor's was moved onto it, which left the run flush against a neighbour wherever the
parse required no blank line — measured in `docs/research/paste-across-encoding-regimes`, M6.)*

*(Amendment 2026-09-25, `a-paste-writes-the-document-unit`: the levels below a pasted root were
carried in the payload's own characters, so a clipboard from outside the vault left the
document indented two ways — measured in `docs/research/paste-indent-convergence`.)*

### Requirement: Group forms of indent, outdent and reordering

Indent, outdent, move up and move down SHALL each have a GROUP form taking a forest of covered
roots — one contiguous sibling run per parent, in document order, the same input shape
`deleteSubtreeGroups` takes — and returning the same typed result the single-node forms return.

A group operation SHALL preserve the RELATIVE DOCUMENT ORDER of its covered roots, at every
cover shape. "Move these three up" means the three arrive above their neighbour still in the
order the user selected them; an operation that returns them shuffled has not performed the
gesture, whatever else it got right.

Subject to that, the group form's output tree SHALL BE, with blank lines set aside, the tree
produced by applying the SINGLE-NODE form to each covered root IN TURN, each step evaluated
against the tree the previous step produced. Its blank lines are the edit-site rule's for the
whole gesture (`A seam at an operation's edit site is separated`), judged once against the note
before the gesture: a step's own edit site includes seams that the roots after it restore, such
as a seam between two selected roots that each step parts and the next rejoins. The order is:

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
  produces for that same root, blank lines included

#### Scenario: Group closure
- **WHEN** any group operation is applied to any generated cover of any generated tree
- **THEN** either it is rejected, or `parse(encode(result.tree))` equals `result.tree`,
  applying `result.edits` to the source text yields `encode(result.tree)`, and `result.tree`
  equals, with blank lines set aside, the tree the sequential single-node composition produces

#### Scenario: A group move keeps a seam between two selected roots
- **WHEN** `a` and `> b`, written flush under `# X` below `> p`, are block-selected and moved up
  together
- **THEN** `a` and `> b` are still written with no blank line between them

### Requirement: Boundary separation is judged on the kind the re-parse will read
The boundary normalization every operation runs SHALL choose each seam's separator from the kind
the node's lines PARSE AS where they are written, not from the kind the tree holds for them.

The two differ wherever an operation has moved a node's column. `hr`, `quote`, `callout`, `html`
and an ATX heading open a block only within three columns of the left margin — `HR_RE`,
`QUOTE_RE`, `CALLOUT_RE`, `HTML_OPEN_RE` and `ATX_RE` are all written `^ {0,3}` — and a setext
heading carries that anchor on its UNDERLINE rather than on its first line. `code` and `table`
have no such limit. The margin is the one the parser measures from: column 0 outside every list
item, and inside one the content column of the innermost item holding the node, so a node's
children are judged at their parent's content column when the parent is a list item and at the
parent's own margin otherwise. A heading and an HTML block are judged at column 0 wherever they
sit, as the parser reads them. Normalization runs on the TREE and encoding runs after it, so a node a
re-encode has pushed past that margin is separated as the kind it was and read back as the kind
its new column makes it. Measured, a `quote` needs no separator before a paragraph and the
paragraph it becomes at column 4 does: the two nodes come back as one, and the payload the
operation inserted is a node short.

This rule decides what the PARSE requires at a seam, and it is the floor under every seam. A seam away from the operation's edit site, such as one inside a moved run whose column the move changed,
is separated exactly when this rule requires it, and so is every seam inside a list. A seam at the edit
site outside a list is separated whatever the parse requires, per `A seam at an operation's edit site is separated`, and this rule is not what decides it there.

Within that floor the rule both adds and removes separators, for one reason in both directions:
the rule that applies is the rule for the node the document will contain. Where that node claims
the line below it and the tree's kind did not, a separator is added; where the tree's kind claimed
a line the written kind does not — an `html` block's unconditional separator below a node that is
no longer an HTML block — the parse asks for no separator.

What a demoted line becomes SHALL be read off the line rather than assumed to be a paragraph.
`LIST_ITEM_RE` carries no margin, so a rule spelled `- - -` or `* * *` is an `hr` at column 3 and
a LIST ITEM at column 4, where `---` is a paragraph; a list item claims nothing and needs no
separator. Treating every demoted line as a paragraph writes a blank line for a node that is not
there.

The seam BELOW a node SHALL be judged on the block its LAST line lands in where written, and the
seam above it on the block its first line opens. The two differ for a demoted node of more than
one line: an `html` block runs to a blank line whatever its lines hold, so past the margin its
later lines open blocks of their own, and the seam below it is the last of those.

A table SHALL be separated from any following node whose first line contains a `|`. The table's
own loop claims every such line, of whatever kind, so a separator chosen only against another
table leaves a list item or a paragraph carrying a wikilink alias to be read as a row.

#### Scenario: A quote re-indented into a heading scope keeps the node below it
- **WHEN** a payload whose last root is a quote is inserted before a tab-indented paragraph in a
  heading's children, so the quote is written at column 4
- **THEN** a blank line stands between the quote's line and that paragraph, and the result holds
  both payload nodes and the section's own paragraph

#### Scenario: A separator that described a block the document no longer contains is not written
- **WHEN** a payload ending in an HTML block is re-encoded at a list item's child column and the
  next sibling is a list item, in a tight list
- **THEN** no blank line is written between them, since the seam lies inside the list, and the
  re-parse reads the same nodes as it would with one

#### Scenario: A rule spelled with a marker becomes a list item, not a paragraph
- **WHEN** a payload ending in `- - -` is re-encoded past the margin above an existing node
- **THEN** no blank line is written between the rule and the list item above it, since both are
  list items as written, every node survives, and the rule's line re-parses as a list item

#### Scenario: A demoted html block is separated below by its last block
- **WHEN** a payload holding an `html` block of `<div>` over a table is re-encoded past the
  margin before an existing table
- **THEN** a blank line stands between the payload's table rows and the existing table, and the
  existing table re-parses with exactly its own rows

#### Scenario: A table is separated from a line that carries a pipe
- **WHEN** a payload ending in a table lands before a list item reading `- see [[a|b]]` with no
  separation between them
- **THEN** a blank line stands between the table and the list item, and the list item
  re-parses as a list item

#### Scenario: A seam inside the margin is unchanged
- **WHEN** the same payload lands in a scope whose content sits at column 0
- **THEN** the quote is still a quote, and the blank line below it is the one the edit-site rule writes, not one this rule requires

#### Scenario: An atom at a list item's child column keeps its kind across the seam
- **WHEN** a payload of `## H` over `---` is pasted after `  - two` below `- one`, so the rule is
  written at column 4, the converted item's child column
- **THEN** a blank line stands between `  - ## H` and the rule, and the rule re-parses as an `hr`,
  a child of that item

### Requirement: A run moves to a named destination as one operation

The algebra SHALL offer an operation that moves a forest of whole subtrees to a NAMED destination —
a parent and a position among its children — and returns a single result, in the same total and
typed form every other operation returns.

The destination SHALL be expressible as a parent and an index, including the index zero of a
parent that has no children at all. An insertion stated only against an anchor SIBLING cannot name
that destination, and it is the commonest reparenting destination there is: "make this the first
child of that". The operation SHALL NOT be built on a private variant kept elsewhere for the case.

The operation SHALL be the one place the move is expressed. A caller SHALL NOT compose it out of a
removal followed by an insertion: both halves carry gap ownership and ordered-run renumbering, the
destination's anchor moves when the run is removed from above it, and a second call site that
half-remembers those rules is the failure mode the shared re-encoding call site already exists to
prevent.

The moved run SHALL be re-encoded for its destination by the SAME rule an insertion at that
destination uses, so a run that lands in a different scope, at a different depth, or under a
different encoding regime arrives encoded as that destination's own content — with the run's
internal relative nesting preserved exactly.

The result SHALL be rejected, rather than partially applied, whenever the destination cannot hold
the run: a destination inside the run's own subtrees, a destination the insertion rule declines,
or a destination that no longer exists. A rejection SHALL leave the document untouched.

A move that begins and ends in ONE scope SHALL be a reorder. The run SHALL keep its own encoding,
because a run that has not left its scope is already encoded for it, and the blank lines between
that scope's members SHALL stay with the POSITIONS rather than with the nodes at the seams the reorder
writes — the last position ends the file whichever node occupies it. A reorder's edit site is the seams at the
moved run's edges and the seam its removal joins, per `A seam at an operation's edit site is separated`: the
positions' blank lines stay there, and an empty seam gains one. A seam between two members the reorder left
consecutive is away from its edit site, and keeps its own blank lines. Re-encoding such a run against the siblings the removal
leaves behind reads the scope's regime off the very evidence the run was counter-evidence to.

A move whose destination is the run's CURRENT place SHALL produce no document change.

#### Scenario: A run moves across the document as one result
- **WHEN** two sibling subtrees are moved to a destination several levels deeper, elsewhere in the
  document
- **THEN** one result carries the whole change: both subtrees are gone from their old place, both
  sit at the destination in their original order, and every descendant keeps its depth relative to
  its own root

#### Scenario: The run re-encodes for where it lands
- **WHEN** a run is moved into a scope whose encoding differs from its own
- **THEN** it arrives encoded as that scope's content, by the same rule an insertion there would
  apply, with its internal nesting unchanged

#### Scenario: A moved heading absorbs what follows it, as an inserted one does
- **WHEN** a heading-rooted run is moved among siblings that are followed by more content at the
  same depth
- **THEN** that content re-parses as part of the moved heading's section, bounded by the
  destination scope's end — the same result the insertion rule already states, reached by a move
  rather than by a paste

#### Scenario: Gaps are repaired on both sides
- **WHEN** a run is moved out from between two siblings and into a destination between two others
- **THEN** the place it left and the place it arrived at are each separated per `A seam at an operation's edit site is separated` — no blank line is doubled. Inside a list, a seam keeps the separation the insertion carries to it, which at a list's edge can loosen the list (#272)

#### Scenario: Ordered runs renumber on both sides
- **WHEN** an ordered item is moved out of one ordered run and into the middle of another
- **THEN** both runs are numbered consecutively afterwards, and the moved item takes its new run's
  numbering rather than carrying its old number

#### Scenario: A childless parent is a destination
- **WHEN** a run is moved to be the first child of a node that has no children
- **THEN** the move is accepted and the run lands there, re-encoded for that scope

#### Scenario: A leaf is not a destination
- **WHEN** the named parent is an atom — a code fence, a table or another leaf the algebra does
  not give children
- **THEN** the operation is rejected and the document is unchanged, by the same guard every other
  insertion path runs, rather than by a condition restated at this call site

#### Scenario: A destination inside the run is rejected
- **WHEN** the named destination lies inside one of the subtrees being moved
- **THEN** the operation is rejected and the document is unchanged

#### Scenario: A destination the insertion rule declines is rejected
- **WHEN** the named destination is one the insertion rule refuses — a run whose own roots include
  an atom, moved into a paragraph's children
- **THEN** the operation is rejected, with the same reason the insertion would have given, and the
  document is unchanged

#### Scenario: A destination too deep for the run's own headings is rejected
- **WHEN** a heading-rooted run is moved into a heading-bearing scope deep enough that the run's
  DEEPEST heading would re-level past the last level markdown has
- **THEN** the operation is rejected with the same reason the insertion gives, and the document is
  unchanged — including where the run's ROOT alone would have fitted

#### Scenario: A run that does not leave its scope keeps its own encoding
- **WHEN** a list item is moved to another position among the same parent's children, in a scope
  whose other members are paragraphs
- **THEN** it is still a list item, and the blank lines between the scope's members are where they
  were — a tight list stays tight and the file's terminating newline stays at the end

#### Scenario: A move to the current place changes nothing
- **WHEN** a run is moved to the destination it already occupies
- **THEN** the result carries no document change

## REMOVED Requirements

### Requirement: An operation that creates a heading's first paragraph child separates them
**Reason**: `A seam at an operation's edit site is separated` states the rule for every seam an operation
writes, and this convention is one case of it. Its claim to be "the one place this codebase widens separation" no longer
holds.
**Migration**: The heading's first-child separation, the untouched user boundary and the unwidened gap are
scenarios of the new requirement. A heading's first paragraph child is separated as before. A list inserted as
a heading's first child is now separated from it too, since that seam lies outside the list and the
insertion creates it.
