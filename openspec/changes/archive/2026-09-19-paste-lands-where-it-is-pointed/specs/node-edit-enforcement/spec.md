## MODIFIED Requirements

### Requirement: Structural pastes splice at node boundaries
A paste or text drop whose inserted content parses as a STRUCTURAL block sequence — more than
one top-level block, OR a single top-level block that itself has children (a whole one-node
subtree copy) — and whose target position is inside a node SHALL be rewritten to insert the
parsed subtrees at the nearest node boundary of the target scope, re-indented to a valid depth
for that scope, preserving the copied content's own relative nesting exactly regardless of the
target's depth relative to the original. When the payload's encoding regime differs from the
destination's, the payload SHALL re-encode as a whole subtree per `structural-operations`' rule
for a payload landing in the other regime, rather than each block being re-encoded
independently. Inserted content parsing as a single CHILDLESS block or as bare continuation
lines SHALL pass through unmodified. When the target node is an EMPTY anchor — no content of
its own and no children — the paste SHALL replace that node with the pasted subtrees rather
than splicing after it and leaving it stranded.

A payload the target scope cannot express SHALL be VETOED with the transient cue naming the
reason, on every insertion path. It SHALL NOT fall through to the native insertion: the native
result concatenates the payload's first line onto the anchor's and leaves the remainder at its
source indentation, which is not the "editable text" the conservative default assumes.

The "nearest node boundary" a paste splices at is the one immediately AFTER the anchor's own
lines: BEFORE its first child where it has children, and after the node itself where it has none.
A node's trailing gap sits immediately before its first child, so a caret on a blank line the node
owns names the same boundary — and the outline draws that line as a slot nested under the node.
The boundary SHALL NOT be read as after the anchor's whole SUBTREE, which for a note's own top
heading is the end of the note.

On a GAP line the caret's COLUMN MAY ask for the shallower reading: to the left of the node's
child column the payload lands after the node, as a sibling. On the node's OWN lines there is no
such choice to express, the column there being a position in the node's text.

A pasted run SHALL keep the separation of the boundary it lands in, on both sides of itself, per
`structural-operations`' rule for a subtree insertion. A TYPE-OVER reaches its destination through
a deletion, which takes the replaced run's own gap with it, so its replacement SHALL inherit the
separation that run had rather than whatever gap the payload's own text ended with.

A gap the caret was in and that is WIDER than a single blank line SHALL collapse to one with the
insertion. A structural Enter opens a place there and widens the gap by two — a separator on each
side is what makes the place parse as a node rather than a continuation line — and the paste that
fills the place consumes it. A gap of none or one SHALL be left as it is: that is the separation
the document already had. This is chrome maintenance, not an editing semantic: the resulting tree
is the same either way.

*(Amendment 2026-09-16, `paste-lands-where-it-is-pointed`: the cross-regime case was assumed by
this requirement's "preserving the copied content's own relative nesting exactly" but had no
rule behind it, and the guard that refused what could not be expressed ran on two of the three
insertion paths. Measured in `docs/research/paste-across-encoding-regimes`. Amendment 2026-09-18,
real-vault manual pass: "the nearest node boundary" resolved to after the anchor's whole subtree,
so a paste on the blank line under a note's `h1` landed at the bottom of the note re-levelled to
`h1`, and a paste with the caret on a heading's own line landed past that heading's section; and
the place a structural Enter opens survived the paste that filled it, leaving three blank lines
above the pasted content.)*

#### Scenario: A paste on the blank line under a node lands inside it
- **WHEN** a structural payload is pasted with the caret on the blank line between a node's own
  lines and its first child, at or past that node's child column
- **THEN** it lands as that node's first child — at the depth and, in a heading scope, the level
  that position gives it — rather than after the node's whole subtree

#### Scenario: A caret left of the child column still means a sibling
- **WHEN** the caret is on the same blank line but to the left of the node's child column
- **THEN** the payload lands after the node, the reading it has always had

#### Scenario: A paste with the caret on a heading's own line lands inside its section
- **WHEN** a structural payload is pasted with the caret anywhere on a heading's own line and
  that heading has content under it
- **THEN** it lands as that heading's first child, opening a section there, rather than after the
  heading's whole section

#### Scenario: A type-over keeps the separation of what it replaced
- **WHEN** a structural payload replaces a selection covering every node of a scope
- **THEN** the run is separated from what follows it exactly as the replaced run was — no blank
  line in a tight list, the document's terminating newline where that run ended the file

#### Scenario: A paste onto a place leaves no widened gap behind
- **WHEN** a structural Enter opens a place and a structural payload is pasted onto it
- **THEN** the gap the place widened collapses to a single blank line, and the buffer holds no
  more blank lines above the pasted content than the document had before the Enter

#### Scenario: A heading section pasted into a list lands coherently
- **WHEN** a heading with its paragraphs and nested lists is pasted inside a list scope
- **THEN** the whole subtree lands as list items at their own relative depths, each heading
  carrying its `#` run into its item's text, with the payload's hierarchy preserved

#### Scenario: A heading section pasted under a heading lands at the depth pointed at
- **WHEN** a heading section is pasted among the children of a heading several levels deeper
  than the payload's own
- **THEN** the payload re-levels to that depth rather than landing at the level it was written
  with

#### Scenario: An inexpressible payload is refused rather than passed through
- **WHEN** a payload that the target scope cannot express is pasted at a caret
- **THEN** the edit is vetoed and the cue is shown — the buffer is unchanged, and the payload
  is not inserted as raw text

#### Scenario: The insertion path does not change the answer
- **WHEN** one payload is pasted at one destination, at a caret, over a selection with a
  surviving sibling, and over a selection consuming the whole scope
- **THEN** all three produce the same verdict and the same resulting tree

#### Scenario: Block copy pasted mid-paragraph
- **WHEN** a multi-range block-level copy (whole subtrees) is pasted with the cursor mid-paragraph
  and that paragraph has NO children
- **THEN** the subtrees are inserted after that paragraph node at its depth, and the paragraph's
  own text is not merged with the pasted content

#### Scenario: Block copy pasted mid-paragraph, where the paragraph has children
- **WHEN** the same paste is made mid-paragraph and that paragraph DOES have children
- **THEN** the subtrees are inserted before its first child — the boundary after its own lines —
  rather than after its whole subtree

#### Scenario: A single node with nested children is still spliced and re-indented
- **WHEN** a copy of exactly one node that itself has children is pasted at a target depth
  different from where it was copied from
- **THEN** the whole subtree re-indents to the target depth, its own internal relative nesting
  preserved exactly

#### Scenario: Plain multi-line fragment stays native
- **WHEN** a multi-line plain-text fragment with no block structure is pasted mid-paragraph
- **THEN** the paste applies exactly as stock Obsidian

#### Scenario: A single CHILDLESS block also stays native
- **WHEN** a copy of exactly one list item with no children of its own is pasted
  mid-paragraph
- **THEN** the paste applies exactly as stock Obsidian — indistinguishable from
  continuation-line authoring, since there is no subtree structure to preserve

#### Scenario: Pasting into an empty list item replaces it
- **WHEN** a multi-block sequence is pasted with the cursor on a list item that has no content
  and no children
- **THEN** the empty item is replaced by the pasted subtrees

#### Scenario: An empty item WITH children still splices after it
- **WHEN** a multi-block sequence is pasted with the cursor on a list item that has
  no content of its own but DOES have children
- **THEN** the pasted subtrees are inserted after that item, which is left in place

#### Scenario: Replacing the SOLE empty child at a deep level re-indents to that depth
- **WHEN** a multi-block sequence is pasted with the cursor on an empty list item
  that is the ONLY child in its scope (no sibling before or after it to splice
  against)
- **THEN** the pasted subtrees are re-indented to the replaced item's own depth —
  never left at the pasted content's own original depth
