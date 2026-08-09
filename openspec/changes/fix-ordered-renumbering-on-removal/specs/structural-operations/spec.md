## ADDED Requirements

### Requirement: Ordered-run renumbering
When an operation changes the membership or order of a sibling list, every maximal run of
consecutive ordered list items among those siblings SHALL be renumbered consecutively from
that run's START NUMBER, and only the marker digits SHALL change — the rest of each item's
line, its children, and its trailing gap are untouched.

A run's start number is the number the run began with. How that number is recovered depends
on the SHAPE of the transformation, and the two cases differ precisely because a permutation
or an insertion cannot lose it while a removal can:

- For a PERMUTATION or an INSERTION — reordering siblings, splitting a node into two,
  merging one into its neighbour, or inserting subtrees — the start number SHALL be the
  minimum still present in the run — which IS the number the run began with, since none of
  these shapes removes a run member. A `5. 6. 7.` list keeps starting at 5, and a swap
  SHALL NOT let the run inherit the moved item's own number.
- For a REMOVAL of whole subtrees from a sibling list — subtree deletion, unwrapping a
  list item, and the departure side of an indent — the start number SHALL be taken from
  the sibling list AS IT WAS BEFORE the removal: the start number of the run that the
  surviving run's FIRST member belonged to. Deriving it from the survivors is wrong
  exactly when the removal took the item that carried the run's start.

Where a removal deletes a non-ordered node standing between two ordered runs, the
survivors become one run and SHALL take the EARLIER run's start number. A run whose
members are all removed contributes nothing.

The rule above is stated over removals in general, and all three named shapes are measured
to reach it. A removal that truncates a sibling list to a PREFIX — the level an outdent
leaves — is covered by the same rule and is indistinguishable under it, since the survivors
always retain the run's own head.

Renumbering is the one documented exception to "edits touch only the lines the operation
semantically requires", and renumbered output SHALL still satisfy operation closure: the
encoded run re-parses to the same tree.

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

#### Scenario: A swap does not inherit the moved item's number
- **WHEN** `moveDown` swaps the first two items of a `5. 6. 7.` run
- **THEN** the run still reads `5. 6. 7.` in document order, with the two items' content
  exchanged

#### Scenario: Renumbered output re-parses unchanged
- **WHEN** any accepted removal renumbers an ordered run
- **THEN** encoding the resulting tree and re-parsing it yields an identical tree, and the
  emitted edits touch no lines beyond the removed subtrees and the renumbered markers

### Requirement: A new first child adopts the child scope's list style
Where an operation materializes a node in a parent's CHILD scope and that scope's kind
resolves to `list-item` because an existing child donated it, the new node SHALL take that
donor's LIST STYLE as well as its kind — bullet character, ordered delimiter, and an
unchecked task marker where the donor carries one. It SHALL NOT be encoded as a plain
bullet when the donor is an ordered item.

The kind and the style come from the same donor because they answer the same question: the
new node is joining a list that is already there. Taking only the kind produced a bullet at
the head of an ordered run — the same key writing `1. ` beside an item and `- ` above it,
which is the shape-dependence the empty-position rule exists to remove.

A new ordered first child SHALL take the run's start number, and the existing items SHALL
renumber after it, per the insertion half of the renumbering contract above.

#### Scenario: An empty position at the end of a heading above an ordered list
- **WHEN** `splitNode` acts at the content end of `# H` whose children are `1. a` / `2. b`
- **THEN** the new first child is `1. ` and the existing items become `2. a` and `3. b`

#### Scenario: The donor's delimiter and bullet character carry over
- **WHEN** the donating child is `1) a`, or `* a`
- **THEN** the new first child is `1) `, or `* ` — not `- `

#### Scenario: A run that does not start at one
- **WHEN** the donating children are `5. a` / `6. b`
- **THEN** the new first child is `5. ` and the existing items become `6. a` and `7. b`

#### Scenario: A task donor
- **WHEN** the donating child is `- [x] a`
- **THEN** the new first child is `- [ ] ` — the same unchecked carry-over a new SIBLING
  item already makes

#### Scenario: A bullet list is unaffected
- **WHEN** the donating children are plain `- ` items
- **THEN** the new first child is `- `, exactly as before

