## ADDED Requirements

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
ends the file whichever node occupies it. Re-encoding such a run against the siblings the removal
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
- **THEN** the place it left is separated as its remaining neighbours require, and the place it
  arrived at is separated as its new neighbours require — no blank line is doubled or lost

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
  were — a tight list stays tight and the file's terminating newline stays at the end

#### Scenario: A move to the current place changes nothing
- **WHEN** a run is moved to the destination it already occupies
- **THEN** the result carries no document change
