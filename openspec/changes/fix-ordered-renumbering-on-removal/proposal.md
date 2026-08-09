## Why

An ordered list misnumbers when its FIRST item is removed. Measured directly against
`deleteSubtrees`, with no keyboard grammar involved
(`docs/research/15-enter-and-shift-enter-catalogue.md`, section C2, 2026-08-09):

```
delete the first two of 1,2,3   →  "3. c"          (expected "1. c")
delete the first of 5,6,7       →  "6. b" "7. c"   (expected "5. b" "6. c")
```

`renumberOrdered` takes a run's start number as the MINIMUM of the numbers still present.
That is exactly right for a swap — a `5. 6. 7.` list must keep starting at 5 rather than
inherit the moved item's number — and it is wrong for a removal, where the number that
carried the run's start is the one that just went away. The survivors then renumber from
whatever the second item happened to be, and the list's first marker is no longer the
number it was written with.

It is reachable by plain Backspace over a block selection, so it belongs to the removal
operations' renumbering contract rather than to any one key. It was found while cataloguing
Enter/Shift+Enter and deliberately left out of `enter-and-shift-enter-grammar`, which is
this change's base.

Nothing states the renumbering rule as a requirement today. It appears only as an aside in
two others ("except ordered-list markers which are renumbered"), which is why a rule that
is correct for one operation shape and wrong for another survived unnoticed.

## What Changes

**A removal renumbers survivors from the run's PRE-removal start.** The start number is
read from the sibling list as it was BEFORE the removal — the run that the surviving run's
first member belonged to — instead of being re-derived from what is left. For
`1. 2. 3.` minus its first two, the survivor `c` was in a run that started at 1, so it is
renumbered to `1.`.

**Every removal-shaped call site takes the new rule**, not the delete operations only. The
same minimum is re-derived after any removal from a sibling list, so the same defect is
reachable through `indent` (which removes the node from its old level: indenting `1. one`
under a preceding `- bullet` leaves `2. two` behind) and through `unwrapListItem`. The
mechanism is one function's contract; fixing it for one caller and not its siblings would
be arbitrary.

**Permutations and insertions keep today's rule, deliberately.** `moveUp`/`moveDown`,
`insertSubtrees`, `splitNode` and `mergeNodes` do not remove a run's head — a swap is a
permutation of the same numbers, and a merge removes a node that always has a predecessor
at its own level. The minimum-present rule is correct for them and is what keeps a swap
from inheriting the moved item's number. Changing them is out of scope, and a test pins the
swap case against regression.

**A new FIRST CHILD takes the existing children's marker, not a fresh bullet.** Reported
from a real vault while this change was in review: selecting the first elements of a
numbered list and pressing Enter produced a bullet. Deleting the first item leaves no
preceding sibling, so the caret falls back to the ANCESTOR — the heading, the paragraph,
the parent item — and the key then acts at that node's end, placing into its CHILD scope.
That scope read the existing children for its KIND and then wrote `- ` regardless of what
they were. The donor that decides the kind now decides the style too: bullet character,
ordered delimiter, and the unchecked task marker a new SIBLING item already carries. A new
ordered first child takes the run's start and the rest renumber after it.

Reachable with no selection at all — Enter at the end of a heading whose children are an
ordered list has always produced `- ` — so it is stated as a requirement of the operation
rather than fixed in the selection path.

**The renumbering contract becomes a requirement of its own**, stating both halves — the
start a permutation or insertion keeps, and the start a removal restores — so the next
operation that touches a sibling list has a rule to read rather than a helper to imitate.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities

- `structural-operations`: a new requirement states the ordered-run renumbering contract,
  including that a removal renumbers from the run's pre-removal start. Today the rule is
  mentioned only as an exception inside "Sibling reordering" and "Operation closure over
  the mapping", and the removal case is unspecified. A second new requirement states that a
  node materialized in a CHILD scope takes the donating child's list STYLE, not only its
  kind — "Node split" says which kind the child scope resolves to and has never said what
  marker it is written with.

## Impact

- `src/ops.ts`: `renumberOrdered` keeps its current meaning for permutations and
  insertions; a removal-aware form is added alongside it and used by `deleteSubtreeGroups`
  (and therefore `deleteSubtrees`), `indent`, and `unwrapListItem`. `splitNode`'s
  child-scope branch reads its marker, task marker and style from the donating child, and
  renumbers the child list it inserts into. `emptyItemPrefix` is decomposed so the sibling
  and child paths share one marker rule instead of each having half of it.
- Tests: `tests/edit-ops.test.ts` and `tests/ops.test.ts` for the measured removal cases and
  the swap regression; `tests/split.test.ts` for the child-scope marker; `tests/grammar.test.ts`
  for the reported gesture; `tests/closure.test.ts` already exercises the delete operations
  under the property suite and must keep passing — encoding a run that starts at 5 re-parses
  as a run that starts at 5.
- `e2e/specs/30-keyboard-grammar.e2e.ts`: the reported gesture in a real vault, since what
  was reported is a keystroke and not an operation call.
- No plugin, editor, or decoration surface is touched: the change is entirely inside the
  pure operations layer, and no caller's signature changes.

## Out of scope

- **An insertion whose new node carries a LOWER number than the run it lands in** (pasting
  a `1.` into a `5. 6.` list renumbers the whole run from 1). Same helper, different
  direction, not measured, and not what the catalogue reported.
- **The other two findings recorded alongside this one** — abandoning a position opened
  over a block selection restores the selection, and a redone provisional position cannot
  be abandoned again. Both live in `provisional-cleanup.ts` and the keyboard grammar, not
  in the operations layer.
- **Whether a run's start should be preserved at all**, versus always renumbering from 1.
  That is a product decision about ordered lists; this change fixes the rule the project
  already chose, applied to a case it did not cover.
