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

## MODIFIED Requirements

### Requirement: Context-determined encoding on reparent (provisional rule)
A reparented non-heading content node SHALL keep its own encoding wherever its destination can
hold that encoding, and SHALL be re-encoded only where the destination cannot:

- A PARAGRAPH landing in a list scope — under a list item or a paragraph, whose children are list
  items, or beside list items (nearest content sibling, preceding first, else following) — SHALL
  become a list item, since a paragraph written among list items ends the list.
- A LIST ITEM landing immediately after a paragraph SHALL become a paragraph, since the attachment
  rule would otherwise make it that paragraph's child rather than the sibling the destination
  names. A list item landing anywhere else — as a heading's first child, after another list item,
  after an atom or a heading — SHALL stay a list item; the reader who wants a paragraph has
  outdent for it.
- A TASK ITEM SHALL never be written as a paragraph, since its checkbox is part of its list
  marker. Where the rule above would convert one, the operation SHALL be rejected with
  `insertion-not-expressible`, and a destination that would be rejected SHALL NOT be offered by
  any surface that previews destinations.

A node CREATED at a destination — the first child a split materialises — takes the scope's own
content kind: the nearest content sibling's, preceding first, else following; with none, a
paragraph under a heading or the root and a list item under any other parent. These rules SHALL
be implemented behind isolated strategy functions.

A HEADING node reaching a new destination — which only an insertion or a move can do, since the
level-shifting operations move a heading by level rather than by reparenting — SHALL take its
encoding from the same function, with one arm per kind of destination:

- In a HEADING-BEARING scope (the root, or a heading's children) it SHALL remain a heading, and
  re-level to the destination's own depth. That level SHALL be taken from the destination's
  heading SIBLINGS — nearest preceding, else following — and only from the parent (one past its
  level, or 1 at root) where the scope has no heading sibling to copy. Reading the parent alone
  is wrong wherever a scope SKIPS a level: the payload lands shallower than the siblings it is
  placed among and opens a section that swallows them. Both readings are defensible there; the
  sibling one is kept because it never takes in content nobody pointed at, and paste and move
  SHALL agree on it. A move whose destination names a level of its own (`node-dragging`'s
  shallower columns) writes that level instead.
- In a LIST scope it SHALL become a list item, carrying its own `#` run verbatim into that
  item's text.

Where the re-levelling would need a level markdown does not have — judged on the payload's
DEEPEST heading, not its root — the insertion SHALL be rejected with `at-h6-bound`, the reason
and the reading `indent` already uses for the same shape. Neither alternative keeps the
payload's own tree: clamping puts two of its levels onto one, and converting to content at
section level hands the run to the attachment rule.

#### Scenario: Indent then outdent restores a paragraph
- **WHEN** a top-level paragraph is indented under a paragraph and then outdented back
- **THEN** it is re-encoded as a list item under the paragraph, whose children are list items,
  and as a paragraph again on the way back, where it lands right after that paragraph — and the
  document is byte-identical to the original

#### Scenario: Nested-list documents never flatten
- **WHEN** outdent is applied to any item in a document consisting entirely of nested list
  items
- **THEN** the item remains a list item at its new depth

#### Scenario: A list item keeps its kind under a heading
- **WHEN** a list item is moved to be a heading's first child, or to follow another list item
  among a heading's children
- **THEN** it is written as a list item there

#### Scenario: A list item right after a paragraph becomes a paragraph
- **WHEN** a list item is moved to the position immediately after a paragraph among a heading's
  children
- **THEN** it is written as a paragraph, so that it is the paragraph's sibling and not its child

#### Scenario: A task is refused where it would have to become a paragraph
- **WHEN** a task item is moved to the position immediately after a paragraph
- **THEN** the operation is rejected with `insertion-not-expressible` and the document is
  unchanged; moved to a heading's first child instead, it stays a task

#### Scenario: A heading takes its level from the siblings it lands beside
- **WHEN** an `h2` section is moved among the children of another `h2` whose only child is an
  `h5` section
- **THEN** it is written as an `h5` on either side of that section, beside it rather than over
  it

#### Scenario: A heading inserted into a list scope becomes a list item carrying its rank
- **WHEN** a heading-rooted subtree is inserted below a list item
- **THEN** the heading encodes as a list item whose text begins with its original `#` run,
  and outdenting that item back to a heading scope restores a heading of the original rank

#### Scenario: A heading inserted into a heading scope re-levels
- **WHEN** a heading-rooted subtree is inserted among a heading's children
- **THEN** it remains a heading, at the level the destination's depth requires, with every
  heading in the payload shifted by the same delta

#### Scenario: A payload deeper than the destination has room for is refused
- **WHEN** a heading-rooted subtree whose own deepest heading would land past `h6` is inserted
  into a heading-bearing scope
- **THEN** the insertion is rejected with `at-h6-bound` and the document is unchanged — even
  where the payload's ROOT alone would have fitted
