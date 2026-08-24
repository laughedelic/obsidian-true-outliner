## Why

A renumbered run keeps its START NUMBER, and the code recovers that number as the MINIMUM
STILL PRESENT in the run. For a REMOVAL the spec already knows that reading is unsafe and
qualifies it: the start is read from "the first one present beforehand, not the first one
positionally", because a removal can take the member that carried it. For an INSERTION or a
PERMUTATION the spec asserts the opposite — that the minimum present "IS the number the run
began with, since these shapes remove no run member" — and both halves of that reasoning are
false:

- An insertion can ADD a member that was never in the list. A node arriving from another
  level brings its old level's number, and if that number is lower than the destination run's
  start, the arrival becomes the start.
- A permutation can JOIN two runs. Swapping a non-ordered separator past an ordered item makes
  two runs into one, and the minimum present is then the swallowed run's start — the case the
  removal branch already decides the other way ("the joined run SHALL keep the SURVIVOR's own
  start").

Either way the rewritten marker sits ABOVE the operand: a line the caller did not select, in a
run they did not touch. The reported shape is an outdent — on `- L0` / `2. L1` / `1. L2` /
`- L3` / `# L4`, outdenting `1. L2` produces `1. L1` / `2. L2` where `2. L1` / `3. L2` is what
the run asks for. The arriving item's inherited `1.` became the top-level run's start.

Five call sites reach the unqualified rule, and all five were reproduced:

| shape | before | after | expected |
| --- | --- | --- | --- |
| outdent arrival (reported) | `2. L1` / `..1. L2` | `1. L1` / `2. L2` | `2. L1` / `3. L2` |
| indent arrival | `..5. a` / `..6. b` / `1. x` | `1. a` / `2. b` / `3. x` | `5.` / `6.` / `7.` |
| outdent adopting a following sibling | `..5. c1` / `..6. c2` / `1. s1` | `1.` / `2.` / `3.` | `5.` / `6.` / `7.` |
| `insertSubtrees` of a pasted `1.` | `5. a` / `6. b` / `7. c` | `1. a` … | `5. a` / `6. pasted` … |
| reorder joining two runs | `5. a` / `- x` / `1. c` | `1. a` / `2. c` | `5. a` / `6. c` |

A sixth outcome changes at the same site without having been a defect: a reorder that SPLITS a
run — a separator moving in between two members — now leaves each fragment on the start of the
run it came from (`1. a` / `2. b` / `- x` / `1. c`, where the minimum-present reading left
`3. c`). That is what a removal already does to the fragment it leaves behind, so the change is
the two shapes agreeing rather than a new behavior.

Measured on the labelled generator, seed 42, 3000 runs per operation, restricted to documents
whose ordered runs are already consecutive — the filter that separates this defect from the
legitimate normalization a renumbering performs on an inconsistently numbered source:

| operation | accepted | with an ordered marker above the operand | markers rewritten above it |
| --- | --- | --- | --- |
| indent | 1057 | 968 | 11 |
| outdent | 1768 | 1482 | **63** |
| move up | 1037 | 766 | 2 |
| move down | 1064 | 790 | 3 |

`insertSubtrees` is not an operation the generator drives; its shape is reproduced by example.

This is the fourth finding of Q33's technique — assert what an operation PROMISES — and the
one that table names as unfixed: "a node ABOVE the operand keeps its own first line".

## What Changes

- **One rule replaces the case analysis.** A run's start number is read from the run's first
  member that was ALREADY IN the sibling list before the operation, for every shape — removal,
  insertion, permutation alike. The minimum still present survives only as the FALLBACK for a
  run with no such member (an entirely pasted run), which is where it was always correct.
- The two-branch structure exists because the removal branch was derived first, from the
  removal bugs; the insertion branch was reasoned about rather than measured, and the argument
  it rests on has the two holes above. Collapsing the branches removes the reasoning along with
  the case analysis: the start is always read from the list as it was, and no shape needs to be
  classified before renumbering.
- `renumberOrdered` (minimum-present) is DELETED. `renumberOrderedAfterRemoval` loses the
  `AfterRemoval` from its name and becomes the single entry point, taking the before-list at
  each of the fifteen call sites.
- `structural-operations`' "Ordered-run renumbering" requirement states the single rule and
  gains scenarios for the arrival side of indent and outdent, for a pasted run, and for a
  reorder that joins two runs.
- `tests/ops.test.ts` gains the five reproduced shapes. A property asserts the general
  statement — on a document whose runs are already consecutive, no marker ABOVE the operand is
  rewritten — over indent, outdent and both reorders.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-operations`, one requirement: "Ordered-run renumbering". Its two shape-dependent
  branches become one rule over all shapes, and the qualification the removal branch already
  carries ("the first one present beforehand, not the first one positionally") becomes the
  whole of it. The requirement's other clauses — marker width carrying the subtree, joined runs
  taking the earlier start, renumbering as closure's one documented exception — are unchanged
  in substance; the joined-run clause stops being a removal-only special case and follows from
  the general rule.

## Impact

- `src/ops.ts` only: `renumberOrdered` deleted, `renumberOrderedAfterRemoval` renamed and given
  the before-list at every call site. No change to `parse.ts`, `encode.ts`, `reencode.ts`, or
  any rejection path — nothing is refused that was accepted, and no acceptance rate moves.
- Fifteen call sites. Nine held the minimum-present helper, and five of those change behavior:
  the arrival sides of indent and outdent, outdent's adoption of a following sibling into its
  own child list, `insertSubtrees`, and a reorder that joins two runs. The other four insert a
  node into a list where every run member was already present, so the two readings agree there;
  the six removal sites take the rename only. All fifteen are converted so that one helper
  covers the file rather than two whose choice depends on a shape argument that just proved
  unreliable.
- Measured cost to the existing suite: **0 tests**. Measured twice — 823 on the base the spike
  was written against, and 835 once `reorder-absorption` landed underneath — with `tsc --noEmit`
  and `eslint` clean both times.
- The four generator-driven operations go to 0 violations on the property above, with the
  accepted-case and ordered-marker-above counts unchanged — the fix does not buy its zero by
  rejecting or by skipping cases.
- Stacked on `reorder-absorption` (#57), which refuses some reorders outright. The two reorder
  violations measured here are joins across a BULLET separator, which that change does not
  refuse, so this defect survives it — confirmed after it landed: the reorders' accepted counts
  fell (1057 → 1037, 1098 → 1064) while their violation counts stayed at 2 and 3. The two
  changes touch different decisions in `moveSurgery`'s vicinity — a rejection before the
  surgery, a start number inside it — and neither depends on the other having landed.
