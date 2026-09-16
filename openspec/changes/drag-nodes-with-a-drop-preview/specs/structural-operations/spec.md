## ADDED Requirements

### Requirement: A run moves to a named destination as one operation

The algebra SHALL offer an operation that moves a forest of whole subtrees to a NAMED destination —
a parent and a position among its children — and returns a single result, in the same total and
typed form every other operation returns.

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

#### Scenario: Gaps are repaired on both sides
- **WHEN** a run is moved out from between two siblings and into a destination between two others
- **THEN** the place it left is separated as its remaining neighbours require, and the place it
  arrived at is separated as its new neighbours require — no blank line is doubled or lost

#### Scenario: Ordered runs renumber on both sides
- **WHEN** an ordered item is moved out of one ordered run and into the middle of another
- **THEN** both runs are numbered consecutively afterwards, and the moved item takes its new run's
  numbering rather than carrying its old number

#### Scenario: A destination inside the run is rejected
- **WHEN** the named destination lies inside one of the subtrees being moved
- **THEN** the operation is rejected and the document is unchanged

#### Scenario: A destination the insertion rule declines is rejected
- **WHEN** the named destination is a scope that cannot express the run — a heading-rooted run
  under a non-heading parent
- **THEN** the operation is rejected, with the same reason the insertion would have given, and the
  document is unchanged

#### Scenario: A move to the current place changes nothing
- **WHEN** a run is moved to the destination it already occupies
- **THEN** the result carries no document change
