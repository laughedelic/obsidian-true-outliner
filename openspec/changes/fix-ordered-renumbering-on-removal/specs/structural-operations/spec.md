## ADDED Requirements

### Requirement: Ordered-run renumbering
When an operation changes the membership or order of a sibling list, every maximal run of
consecutive ordered list items among those siblings SHALL be renumbered consecutively from
that run's START NUMBER, and only the marker digits SHALL change — the rest of each item's
line, its children, and its trailing gap are untouched.

A run's start number is the number the run began with, NOT a number re-derived from the
items that happen to remain. Concretely:

- For a PERMUTATION or an INSERTION — reordering siblings, splitting a node into two,
  merging one into its neighbour, or inserting subtrees — the start number SHALL be the
  minimum still present in the run. A `5. 6. 7.` list keeps starting at 5, and a swap
  SHALL NOT let the run inherit the moved item's own number.
- For a REMOVAL of whole subtrees from a sibling list — subtree deletion, unwrapping a
  list item, and the departure side of an indent — the start number SHALL be taken from
  the sibling list AS IT WAS BEFORE the removal: the start number of the run that the
  surviving run's FIRST member belonged to. Deriving it from the survivors is wrong
  exactly when the removal took the item that carried the run's start.

Where a removal deletes a non-ordered node standing between two ordered runs, the
survivors become one run and SHALL take the EARLIER run's start number. A run whose
members are all removed contributes nothing.

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
