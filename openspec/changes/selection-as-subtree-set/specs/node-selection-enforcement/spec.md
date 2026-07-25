## MODIFIED Requirements

### Requirement: Boundary-crossing selections escalate to whole sibling subtrees
In outline mode, when a `selection-only` transaction contains a non-empty range whose
anchor and head resolve to different nodes of the parsed tree, the filter SHALL replace
that range with the FOREST SPAN of those two ends: when one end's node is an ancestor of
the other's, the ancestor's whole subtree; otherwise the span running from the start of
the outermost subtree that fully contains the first end and begins at or after it, to the
end of the outermost subtree that fully contains the last end — INCLUDING the last
subtree's own trailing gap in full.

Equivalently: take the document-order run of nodes between the two ends, close it under
descendants, and let the selection's ROOTS be the members whose parent is not itself a
member. The selection is exactly the union of those roots' subtree covers, which is a
single contiguous text span, since node order is text order and subtree covers tile the
document.

The governing invariant is DOWNWARD CLOSURE: **no node is ever selected without its whole
subtree.** A selection is always a forest of whole subtrees, and those roots MAY sit at
different depths. The filter SHALL NOT expand a crossing range outward to a common
ancestor's sibling run — crossing out of a scope no longer pulls that scope's own root
into the selection. A covered node's owned trailing gap is never partially included:
reaching any point of a node's own content is enough to pull its whole gap into the cover.

*(Amendment 2026-07-25, `selection-as-subtree-set`: the original rule expanded to the
contiguous run of children of the deepest common ancestor scope. Its recorded rationale —
that selecting a heading without its section, or an item without its children, has no
valid structural meaning — argues for downward closure only. The outward expansion was a
consequence of the common-ancestor formulation rather than a decision, and it made a
single Shift+ArrowDown from a subtree's last child select the whole document.)*

#### Scenario: Crossing out of a scope does not pull in the parent
- **WHEN** a selection runs from inside the last child of a subtree into the following
  node, which is that subtree's parent's next sibling
- **THEN** the selection covers exactly those two subtrees, and the parent's own line is
  NOT part of it

#### Scenario: Drag from mid-paragraph into the next paragraph
- **WHEN** the user drag-selects from the middle of one paragraph node into the middle
  of the next sibling paragraph
- **THEN** the selection becomes both paragraphs in full, including the second
  paragraph's own trailing gap

#### Scenario: An end inside an ancestor still covers the whole subtree
- **WHEN** a selection starts inside a heading's text and ends inside a paragraph within
  that heading's section
- **THEN** the selection covers the heading's entire subtree, since one end's node is an
  ancestor of the other's

#### Scenario: Roots may sit at different depths
- **WHEN** a selection covers a deeply nested item and a following top-level item
- **THEN** both are covered as whole subtrees at their own depths, and no common ancestor
  is added to make them siblings

#### Scenario: Reaching a node's content is enough, no second drag onto its gap needed
- **WHEN** the user drag-selects from the middle of one node's text to the middle of
  the next sibling node's text, stopping there without continuing onto that sibling's
  blank trailing gap line
- **THEN** the selection already includes the second node's whole owned trailing gap

**Covered by**: `e2e/specs/61-selection-enforcement.e2e.ts` (forward/backward drags,
heading-subtree, cross-scope crossing); `tests/escalate.test.ts` (forest-cover
computation, downward-closure property over generated trees)
