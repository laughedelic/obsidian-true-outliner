## MODIFIED Requirements

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
payload the document itself wrote in that unit SHALL come back byte-identical.

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
root. A destination with no separation SHALL gain none, and a copied gap line SHALL be written as
an EMPTY line, a place line's own indentation saying nothing where it is copied to.

A blank line the PARSE requires is added independently, by the boundary normalization every
operation runs, and is not what this rule provides: a callout followed by a paragraph needs no
blank to parse, so the separation a reader sees there is this one.

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
- **WHEN** a run is inserted between two list items with no blank line between them
- **THEN** no blank line is added on either side of the run

#### Scenario: A run at the end of the document takes over the terminating newline
- **WHEN** a run is inserted after the document's last node
- **THEN** the file ends in exactly one newline, and the run is separated from the node above it
  by that scope's own separation

*(Amendment 2026-09-19, `paste-lands-where-it-is-pointed`: the run's own final gap was stripped
and the anchor's was moved onto it, which left the run flush against a neighbour wherever the
parse required no blank line — measured in `docs/research/paste-across-encoding-regimes`, M6.)*

*(Amendment 2026-09-25, `a-paste-writes-the-document-unit`: the levels below a pasted root were
carried in the payload's own characters, so a clipboard from outside the vault left the
document indented two ways — measured in `docs/research/paste-indent-convergence`.)*
