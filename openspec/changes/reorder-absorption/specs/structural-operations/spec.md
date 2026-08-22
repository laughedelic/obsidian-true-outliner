## MODIFIED Requirements

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
