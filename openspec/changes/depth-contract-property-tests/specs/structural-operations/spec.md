## ADDED Requirements

### Requirement: A non-heading subject lands at a stated depth in the result

For a NON-HEADING subject, an accepted structural operation SHALL place that subject at a stated
depth in the RESULT tree — the tree the caller receives, after the emitted encoding has been
re-parsed — measured against the depth the subject held before the operation:

- indent: exactly one level deeper,
- outdent: exactly one level shallower,
- move up: unchanged.

The guarantee is about the RESULT, not about the tree the operation's own surgery built. Those two
can disagree: markdown cannot express every tree, so an encoding can re-parse with the subject
attached somewhere other than where the surgery put it — absorbed into a neighbour's list, or
adopted by a preceding paragraph. An operation whose surgery is right and whose encoding re-parses
elsewhere has not performed the gesture the caller asked for, and states a depth it did not
deliver.

This is not implied by operation closure. Closure holds that the result tree equals the parse of
its own encoding; it says nothing about whether that tree is the one the algebra produced, so an
operation can satisfy closure while placing the subject at the wrong depth.

The group forms carry the same contract PER COVERED ROOT, each root measured against its own prior
depth. A cover whose roots sit at different depths moves every root by the same delta; it does not
bring them to a common depth. The group forms are not covered by the single-node statement: they
compose every root's surgery and re-parse once for the whole operand, so a root can be absorbed at
a re-parse the single-root path never performs.

Headings are excluded because their algebra is a level shift: an indented heading's tree depth
follows the surrounding heading context rather than the operation, so a fixed delta is not their
contract. Move down carries the same unchanged-depth contract as move up in principle; it is
stated once the defect that violates it is fixed.

#### Scenario: Indent deepens the subject by exactly one level

- **WHEN** indent is accepted on a non-heading node at depth `d`
- **THEN** that node sits at depth `d + 1` in the result document, with its subtree still beneath
  it

#### Scenario: Outdent raises the subject by exactly one level

- **WHEN** outdent is accepted on a non-heading node at depth `d`
- **THEN** that node sits at depth `d - 1` in the result document

#### Scenario: A reorder leaves the subject's depth alone

- **WHEN** move up is accepted on a non-heading node at depth `d`
- **THEN** that node sits at depth `d` in the result document — a reorder changes the subject's
  position among its siblings and nothing about its depth

#### Scenario: Every root of a group operation moves by the operation's own delta

- **WHEN** a group form of indent, outdent or move up is accepted on a cover whose roots sit at
  several different depths
- **THEN** each covered root sits at its own prior depth plus the operation's delta in the result
  document, and no root is brought to another root's depth

#### Scenario: A subject absorbed by the re-parse is a defect, not an outcome

- **WHEN** an operation's encoding re-parses with the subject at a depth other than the contracted
  one — a moved node adopted by the paragraph it landed after, say
- **THEN** the operation has violated this requirement; the accepted result must place the subject
  at the contracted depth, or the operation must reject
