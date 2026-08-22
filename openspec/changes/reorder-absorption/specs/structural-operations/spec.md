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
