## ADDED Requirements

### Requirement: A seam an operation creates is separated
A SEAM is the boundary between two blocks: the last content line of the block above it and the first
content line of the block below it, with whatever blank lines stand between them.

An operation CREATES the seams it writes as new boundaries, and states them. Each operation creates
exactly these:

| operation | seams it creates |
| --- | --- |
| an insertion, a paste, a drop, a move to another scope | the run's two outer seams, and every seam inside a pasted payload |
| a deletion, and the removal half of a move to another scope | the seam that joins the blocks around the removed run |
| a split, including one that materializes an empty item or heading | the new seam between the halves |
| a drafted sibling heading | the new heading's two seams |
| an Enter position | the position's two seams, governed by `outline-keyboard-grammar` |
| a merge, an indent, an outdent, a same-scope reorder, a lone id's drop | none |

A type-over creates only the seams inside its payload. Its outer seams stand where the replaced run's
stood.

A created seam SHALL be written with one blank line. Every reader of the note but our own parse
continues a line written flush under a quote, a callout or a list item into that block
(`docs/research/lazy-continuation-at-seams`), and a blank line settles every reader. So the rule
separates every created seam rather than the ones some reader would continue: a writer that knew which
lines each reader continues would need that table kept current for every reader.

Four limits bound it:

- **Inside a list the rule adds nothing.** A LIST is a maximal run of adjacent sibling list items under one
  parent, judged by kind as written, whatever their markers. A seam is INSIDE A LIST when its lower block
  is one of the list's items or lies inside one, and its upper block lies inside the same list. That
  covers:
  - an item and its child blocks
  - two child blocks of one item
  - an item's last block and the next item
  - an item and its nested list

  Those seams SHALL be written as `Subtree insertion at a boundary`, `Node split` and the parse require,
  and this rule SHALL NOT add to them. A blank line there makes the list loose in every reader
  (`lazy-continuation-at-seams`, "Measured: loose lists"), and whether a list is tight or loose is the
  user's to choose. The seams between a list and a block outside it are not inside the list: a paragraph
  or heading directly above the list, and the block directly below the list's last line.
- **A seam is never widened.** A created seam that already holds one or more blank lines SHALL keep exactly
  what it holds. Only an empty seam gains a line, and it gains one.
- **A seam the user wrote is not touched.** No operation creates it, so it SHALL keep its separation as
  written, however flush, unless the parse requires a separator there (`Boundary separation is judged on the
  kind the re-parse will read`). An untouched note stays byte-identical.
- **A blank line never changes what a block is.**
  - An attached block-id line SHALL NOT be separated from the block it names. It is part of that block's
    encoding, and the separator is written after it.
  - A lone block-id line the parse reads as a node of its own SHALL stay flush above the block below it,
    since a blank line there would attach it to the block above. The parse's own requirements still apply:
    above a paragraph, the id line would otherwise join the paragraph's text.
  - No blank line SHALL be written above a block indented four or more columns past its container's margin,
    which CommonMark would then read as indented code.

The cost of the first limit is that some shapes stay ambiguous inside a tight list. A paragraph written
directly under a quote, or under a nested item, is continued into that block by reading mode.

`docs/research/created-seam-detection` records the rules for telling created seams apart that were reviewed
before this one, and the cases each failed on.

#### Scenario: A pasted quote is separated from the paragraph below it
- **WHEN** `    first` / blank / `    > quote` is pasted at the end of `## H` in a note holding `## H`
  directly above `below`
- **THEN** the note reads `## H` / blank / `first` / blank / `> quote` / blank / `below`

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

#### Scenario: A split keeps the seams at the node's outer edges
- **WHEN** Enter is pressed mid-text in `para text`, written directly between `# H` and `> q`
- **THEN** the note reads `# H` / `para` / blank / `text` / `> q`

#### Scenario: A merge keeps the seam below the merged node
- **WHEN** `p2` is merged into `p1` in `p1` / blank / `p2` / `# H`, where `p2` sits directly above `# H`
- **THEN** the merged paragraph sits directly above `# H`

#### Scenario: Typing over a selected block keeps the spacing around it
- **WHEN** `x` is typed over a selected `para` in `# A` / `para` / `# B`, written with no blank lines
- **THEN** the note reads `# A` / `x` / `# B`

#### Scenario: A boundary the user wrote is left alone
- **WHEN** a document contains `> q` directly followed by `body`, and a structural operation runs
  on some unrelated node
- **THEN** the quote's own lines and trailing gap are byte-identical afterwards

#### Scenario: A seam inside a run moved to another scope is left as written
- **WHEN** a run holding `> q` directly followed by `body` is moved under another heading
- **THEN** `> q` and `body` are still written with no blank line between them

#### Scenario: An existing separated boundary is not widened further
- **WHEN** an operation creates a seam that already holds one blank line
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

#### Scenario: A block indented four columns is not preceded by a blank line
- **WHEN** a payload of `para` over `    - a`, a list indented four columns under it, is pasted
- **THEN** no blank line is written between `para` and `    - a`

## MODIFIED Requirements

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

This rule decides what the PARSE requires at a seam, and it is the floor under every seam. A seam
the operation did not create, such as one inside a moved run whose column the move changed, is
separated exactly when this rule requires it, and so is every seam inside a list. A seam the
operation created outside a list is separated whatever the parse requires, per `A seam an
operation creates is separated`, and this rule is not what decides it there.

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
- **THEN** the quote is still a quote, and the blank line below it is the one the created-seam
  rule writes, not one this rule requires

#### Scenario: An atom at a list item's child column keeps its kind across the seam
- **WHEN** a payload of `## H` over `---` is pasted after `  - two` below `- one`, so the rule is
  written at column 4, the converted item's child column
- **THEN** a blank line stands between `  - ## H` and the rule, and the rule re-parses as an `hr`,
  a child of that item

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
only a created seam between its blocks outside a list may gain a blank line, per `A seam an
operation creates is separated`.

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

Both seams an insertion makes are created. Inside a list the carried separation is the seam's whole
separation, so a destination with none gains none there. At every other seam a destination with no
separation gains one blank line, per `A seam an operation creates is separated`, and a carried
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
- **WHEN** a run of list items, or of blocks inside a list item, is inserted between two list items
  with no blank line between them
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

The seam a removal leaves between the node above the run and the node below it is created. Outside a
list it SHALL gain one blank line where it would otherwise be empty, per `A seam an operation creates
is separated`. When the caller will splice content into the place the removal leaves, that seam is
not a seam of the result, and the removal SHALL NOT create it: the insertion states the seams it
creates.

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
that scope's members SHALL stay with the POSITIONS rather than with the nodes — the last position
ends the file whichever node occupies it. A seam the reorder creates outside a list that the
positions leave empty SHALL still gain one blank line, per `A seam an operation creates is
separated`. Re-encoding such a run against the siblings the removal
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
- **THEN** the place it left and the place it arrived at are each separated per `A seam an
  operation creates is separated` — no blank line is doubled, and a list's own separation is
  neither added to nor lost

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
  were — a tight list stays tight and the file's terminating newline stays at the end — save for a
  created seam outside a list that the positions leave empty, which gains one blank line

#### Scenario: A move to the current place changes nothing
- **WHEN** a run is moved to the destination it already occupies
- **THEN** the result carries no document change

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
  moved line is byte-identical to before, merely relocated; a seam the swap creates that would be
  empty gains one blank line

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
content column — SHALL INSERT BEFORE the node rather than split it. For a list item
carrying a TASK MARKER, that content column SHALL fall after the marker: a position in
front of `[ ]`, inside it, or immediately after it all name the same intent, and none of
them divides the marker. The marker is a prefix for SPLITTING only — it remains ordinary
content to the caret, to Home, and to the selection ladder. The node's own
lines, children, depth and trailing gap SHALL be unchanged, and the operation's anchor
SHALL be the inserted empty position, not the node's text. Where the node's SIBLING
scope has an empty markdown encoding, an empty node SHALL be materialized there: a list
item in the original's marker style, with ordered runs renumbered, or a HEADING at the
same level. Where it has none — a paragraph — a provisional position SHALL open in the gap
ABOVE the node as the anchor, blank-separated from the block above it and from the node. The
position's own line is always written, and a blank line on either side only where that side lacks
one. A position at the start of a
CONTINUATION line is an ordinary interior split, not a content start.

An END-of-node split SHALL place its result in the node's CHILD scope when it has
children and its SIBLING scope when it does not, and SHALL open a provisional position in the
relevant gap, blank-separated on both sides, whenever that scope's kind has no empty encoding — including the case where
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
  encoding — a provisional position opens below it, blank-separated on both sides, with the
  cursor on it, and the sibling node materializes when text is typed

#### Scenario: End-of-node split of a node whose child scope is a paragraph
- **WHEN** a list item whose first child is an indented paragraph is split at the exact
  end of its own text
- **THEN** a provisional position opens in the item's OWN trailing gap, blank-separated from
  the item and from that paragraph, with the cursor on it, and nothing is added after the subtree

#### Scenario: Split where a task item's text begins inserts an empty item before it
- **WHEN** `- [ ] bar` with a child is split at the position its text begins — after the
  checkbox
- **THEN** an empty `- [ ] ` is inserted as its preceding sibling, `- [ ] bar` keeps its own
  line, marker, depth and child verbatim, and the anchor is in the new empty item

#### Scenario: A position inside a task marker never divides it
- **WHEN** a task item is split at any position from its list marker's end through its task
  marker's end
- **THEN** every one of them produces the same result as the scenario above, and no result
  contains a partial `[ ]`

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
- **THEN** a provisional position opens above it, blank-separated from the block above and from
  the paragraph, the paragraph is byte-identical, and the anchor is the position

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
- **THEN** a provisional position opens in the heading's own trailing gap — the same rule a
  childless paragraph's end-of-node split uses — blank-separated from the heading and from the
  heading's first child, whether that child was written flush or not, with the cursor on it and
  no child materializing until text is typed

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
the new sibling starts empty. The operation creates both of the new heading's seams, and each SHALL be
separated per `A seam an operation creates is separated`.

A node that is not a heading SHALL be rejected with `cannot-split`. The anchor SHALL be
the new heading's content start.

#### Scenario: A sibling heading is created empty
- **WHEN** the operation runs on `## Foo` with an empty remainder
- **THEN** `## ` follows it as a sibling at level 2, separated by a blank line from the section
  above it and from what follows, `## Foo` keeps its children, and the anchor is the new
  heading's content start

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
node count untouched, the position SHALL still be blank-separated or adjacent as its kind
requires, and it SHALL still be removable in full — indentation included — by the
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
`e2e-tests/specs/30-keyboard-grammar.e2e.ts` (the live keypress-then-type sequence on a list item
with a paragraph child).

## REMOVED Requirements

### Requirement: An operation that creates a heading's first paragraph child separates them
**Reason**: `A seam an operation creates is separated` states the rule for every created seam, and this
convention is one case of it. Its claim to be "the one place this codebase widens separation" no longer
holds.
**Migration**: The heading's first-child separation, the untouched user boundary and the unwidened gap are
scenarios of the new requirement. A heading's first paragraph child is separated as before. A heading's
first list-item child an operation creates is now separated too, since that seam lies outside the list.
