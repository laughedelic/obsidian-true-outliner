## MODIFIED Requirements

### Requirement: Structural pastes splice at node boundaries
A paste or text drop whose inserted content parses as a STRUCTURAL block sequence — more than
one top-level block, OR a single top-level block that itself has children (a whole one-node
subtree copy) — and whose target position is inside a node SHALL be rewritten to insert the
parsed subtrees at the nearest node boundary of the target scope, re-indented to a valid depth
for that scope, preserving the copied content's own relative nesting exactly regardless of the
target's depth relative to the original. When the payload's encoding regime differs from the
destination's — a heading-rooted payload into a list scope, or the reverse — the payload SHALL
re-encode as a whole subtree per `structural-operations`' cross-regime rule, rather than each
block being re-encoded independently. Inserted content parsing as a single CHILDLESS block or as
bare continuation lines SHALL pass through unmodified. When the target node is an EMPTY anchor —
no content of its own and no children — the paste SHALL replace that node with the pasted
subtrees rather than splicing after it and leaving it stranded.

*(Amendment 2026-07-25, `paste-heading-section-reencoding`: the cross-regime case was assumed by
this requirement's "preserving the copied content's own relative nesting exactly" but had no
rule behind it. Observed in real use: a pasted heading section lost its `#` while its
descendants kept their original encoding and landed at inconsistent depths.)*

#### Scenario: A heading section pasted into a list lands coherently
- **WHEN** a heading with its paragraphs and nested lists is pasted inside a list scope
- **THEN** the whole subtree lands under one consistent encoding at the target depth, with its
  internal relative nesting preserved

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

#### Scenario: Pasting into an empty list item replaces it
- **WHEN** a multi-block sequence is pasted with the cursor on a list item that has no content
  and no children
- **THEN** the empty item is replaced by the pasted subtrees
