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

*(Amendment 2026-09-16, `paste-lands-where-it-is-pointed`: the cross-regime case was assumed by
this requirement's "preserving the copied content's own relative nesting exactly" but had no
rule behind it, and the guard that refused what could not be expressed ran on two of the three
insertion paths. Measured in `docs/research/paste-across-encoding-regimes`.)*

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
- **WHEN** a multi-range block-level copy (whole subtrees) is pasted with the cursor
  mid-paragraph
- **THEN** the subtrees are inserted after that paragraph node at its depth, and the paragraph's
  own text is not merged with the pasted content

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
