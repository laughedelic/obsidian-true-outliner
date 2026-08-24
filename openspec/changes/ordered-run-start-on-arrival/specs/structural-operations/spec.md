## MODIFIED Requirements

### Requirement: Ordered-run renumbering
When an operation changes the membership or order of a sibling list, every maximal run of
consecutive ordered list items among those siblings SHALL be renumbered consecutively from
that run's START NUMBER, and only the marker digits SHALL change — the rest of each item's
line and its trailing gap are untouched.

Where the new digits differ in COUNT from the old ones, the marker changes WIDTH, and the
item's content column moves while the line the marker sits on does not. The item's
continuation lines and its whole subtree SHALL move with that column. Leaving them behind
breaks the closure this requirement already demands: measured, `9.` renumbered to `10.`
left the item's children a column short, so they no longer reached it and the re-parse
returned them as its SIBLINGS — the subtree the operation never touched, silently
reshaped. Narrowing (`10.` to `9.`) strands them a column too deep instead, which keeps
the tree and drifts the indentation. This clause and "its children are untouched", as the
requirement first read, cannot both hold at a digit boundary; the implementation followed
the narrower one and lost the tree.

A run's start number is the number the run began with, and it SHALL be recovered from the
sibling list AS IT WAS BEFORE the operation: the start number of the run that the resulting
run's first member THAT WAS ALREADY THERE belonged to. The member the start is read from
SHALL be the first one PRESENT BEFOREHAND, not the first one positionally, and the rule is
the same for every shape of transformation — a removal, an insertion, a permutation, or any
composition of them.

One rule covers all shapes because each shape breaks the alternative reading — that the start
is whatever number is lowest among the run's members afterwards — in its own way:

- A REMOVAL can take the member that carried the start. Deleting the first two of `1. 2. 3.`
  must leave `1.`, not `3.`.
- An INSERTION can ADD a member that was never in this list. A node arriving from another
  level — the arrival side of an indent or an outdent, a sibling adopted into an outdented
  node's own child list, a subtree pasted in — carries its old level's number, and that
  number SHALL NOT become the destination run's start. Measured, an item numbered `1.`
  outdenting into a run that began at `2.` renumbered that run from `1.`, rewriting a line
  ABOVE the operand in a run the operation did not otherwise touch.
- A PERMUTATION can JOIN two runs, by moving a non-ordered separator out from between them.
  The joined run SHALL keep the EARLIER run's start rather than adopt the lower number of the
  run it swallowed — the same outcome a removal of that separator produces, and for the same
  reason: the earliest member present beforehand belonged to the earlier run. It can equally
  SPLIT one, by moving a separator in between two members, and each fragment SHALL then begin
  at the start of the run it came from — which is what a removal already does to the fragment
  it leaves behind.

A run with NO member present beforehand — an inserted sequence landing where no ordered run
was — has no start to recover, and SHALL keep the lowest number its own members carry.

A merge is covered by the general rule in all three of its shapes, and none of them is saved
by the survivor keeping its index. Absorbing a non-ordered node standing between two runs
JOINS them, and the joined run keeps the SURVIVOR's own start. Absorbing a node's own first
child removes that child from the CHILD list, which renumbers from the same pre-merge start.
And a node absorbed from an outer scope may head a run whose predecessor at that level is not
part of it, so having a predecessor is not the same as keeping a run's head. A merge also
ADOPTS `second`'s own children into the list it absorbed `second` from; those arrive carrying
their old level's numbers and were never in the list before, which is the insertion clause
above reached from the removal side.

A removal that truncates a sibling list to a PREFIX — the level an outdent leaves — is
covered by the same rule and is indistinguishable under it, since the survivors always retain
the run's own head.

Renumbering is the one documented exception to "edits touch only the lines the operation
semantically requires", and renumbered output SHALL still satisfy operation closure: the
encoded run re-parses to the same tree. Where the source document's own numbering was already
consecutive from each run's start, the exception SHALL reach only markers at or below the
TOPMOST NODE THE OPERATION RELOCATES — the operand, and for a reorder the sibling it swaps
with, whose own marker that swap legitimately rewrites. A run whose start is preserved
renumbers only the members that follow what moved.

#### Scenario: A widening marker carries its subtree
- **WHEN** a renumbering makes an item with children `10.` where it was `9.`
- **THEN** the children are re-indented to the item's new content column and remain its
  children in the re-parsed tree

#### Scenario: A narrowing marker brings its subtree back in
- **WHEN** a renumbering makes an item with children `9.` where it was `10.`
- **THEN** the children are re-indented to the narrower content column rather than being
  left a column deeper than the item requires

#### Scenario: Deleting the head of an ordered run
- **WHEN** `deleteSubtrees` removes the first two items of `1. a` / `2. b` / `3. c`
- **THEN** the surviving item is `1. c`, not `3. c`

#### Scenario: Deleting the head of a run that does not start at one
- **WHEN** `deleteSubtrees` removes the first item of `5. a` / `6. b` / `7. c`
- **THEN** the survivors are `5. b` and `6. c` — the run keeps the start number it was
  written with

#### Scenario: Deleting from the middle of an ordered run
- **WHEN** `deleteSubtrees` removes the second item of `1. a` / `2. b` / `3. c`
- **THEN** the survivors are `1. a` and `2. c`

#### Scenario: Indenting the head of an ordered run away from its level
- **WHEN** `indent` is applied to `1. one` whose previous sibling is `- bullet`, with
  `2. two` following it
- **THEN** the item left behind at the original level is `1. two`

#### Scenario: Unwrapping the head of an ordered run
- **WHEN** `unwrapListItem` removes the empty first item of an ordered run
- **THEN** the surviving items renumber from the run's original start number, and the
  blank line left in the item's place is unchanged by the renumbering

#### Scenario: A merge absorbs a separator and joins two runs
- **WHEN** `mergeNodes` joins `5. a` with the `- x` that separates it from `1. c`
- **THEN** the result is `5. ax` and `6. c` — the survivor keeps its own start rather than
  taking the swallowed run's `1.`

#### Scenario: A merge absorbs a node's ordered first child
- **WHEN** `mergeNodes` joins `- p` with its first child `1. a`, leaving `2. b` and `3. c`
- **THEN** the remaining children renumber to `1. b` and `2. c`

#### Scenario: A merge reaches its neighbour from an outer scope
- **WHEN** `mergeNodes` joins a nested `- kid` with the top-level `1. a` that follows it,
  where `1. a`'s own predecessor is a bullet
- **THEN** the item left at the top level is `1. b`

#### Scenario: A swap does not inherit the moved item's number
- **WHEN** `moveDown` swaps the first two items of a `5. 6. 7.` run
- **THEN** the run still reads `5. 6. 7.` in document order, with the two items' content
  exchanged

#### Scenario: An outdenting item does not become its destination run's start
- **WHEN** `outdent` is applied to `1. L2`, a child of `2. L1` in the top-level run
  `- L0` / `2. L1`
- **THEN** the top-level run reads `2. L1` / `3. L2` — the item that arrived takes the next
  number in the run it joined, and `2. L1` is not rewritten

#### Scenario: An indenting item does not become its destination run's start
- **WHEN** `indent` is applied to the top-level `1. x` whose previous sibling `- p` already
  has the children `5. a` / `6. b`
- **THEN** those children read `5. a` / `6. b` / `7. x`

#### Scenario: An adopted following sibling does not restart its new parent's child run
- **WHEN** `outdent` is applied to a node whose own children are `5. c1` / `6. c2` and whose
  following sibling `1. s1` is adopted as its trailing child
- **THEN** the child list reads `5. c1` / `6. c2` / `7. s1`

#### Scenario: A pasted item does not restart the run it lands in
- **WHEN** `insertSubtrees` places a parsed `1. pasted` after `5. a` in the run
  `5. a` / `6. b` / `7. c`
- **THEN** the run reads `5. a` / `6. pasted` / `7. b` / `8. c`

#### Scenario: A pasted run that lands where no run was keeps its own numbering
- **WHEN** `insertSubtrees` places a parsed `3. x` / `4. y` after the `- b` of `- a` / `- b`
  / `- c`, so the inserted run has no ordered member from the destination list
- **THEN** the inserted items read `3. x` / `4. y`

#### Scenario: A reorder that splits a run leaves the tail on the run's own start
- **WHEN** `moveUp` is applied to the `- x` following the run `1. a` / `2. b` / `3. c`
- **THEN** the document reads `1. a` / `2. b` / `- x` / `1. c` — the fragment the separator cut
  off begins where its run began, as it does when a removal cuts the run's head away

#### Scenario: A reorder that joins two runs keeps the earlier start
- **WHEN** `moveDown` is applied to the `- x` separating `5. a` from `1. c`
- **THEN** the joined run reads `5. a` / `6. c`, with `- x` below them

#### Scenario: Renumbered output re-parses unchanged
- **WHEN** any accepted operation renumbers an ordered run
- **THEN** encoding the resulting tree and re-parsing it yields an identical tree, and the
  emitted edits touch no lines beyond the ones the operation semantically requires, the
  renumbered markers, and the continuation and descendant lines that a marker's WIDTH change
  re-indents

#### Scenario: A consecutive source is not rewritten above the operand
- **WHEN** any accepted indent, outdent or reorder acts on a document whose every ordered run
  is already consecutive from its own start
- **THEN** no ordered item positioned above every node the operation relocates — the operand,
  and for a reorder the sibling it swaps with — has its marker rewritten
