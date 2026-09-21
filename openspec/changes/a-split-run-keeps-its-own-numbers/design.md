## Context

See proposal.md — Why. The mechanics that shape the approach:

- `renumberRuns(nodes, startOf)` (src/ops.ts) walks the maximal runs of consecutive ordered items
  in one sibling list and renumbers each from `startOf(run)`. It also carries a marker's WIDTH
  change into the item's subtree. Neither is touched here.
- `renumberOrderedAgainst(before, after)` is the only `startOf` policy left after
  `2026-08-24-ordered-run-start-on-arrival`. It builds a `nodeId → run start` map over the BEFORE
  list, reads the start off the resulting run's first member that appears in it, and falls back
  to `lowestNumber` when no member does.
- Node ids survive a surgery — `updateSiblings` rebuilds spines by spreading — and every
  renumbering runs on the surgery tree, before `finalize` re-parses. So `before` and `after` are
  comparable by id, which is what makes any of this decidable.
- Ten call sites reach the helper. None of them classifies the transformation any more; that
  classification is what the 2026-08-24 change removed, and this change does not bring it back.

## Goals / Non-Goals

**Goals.** Stop rewriting ordered markers that the operation's own span does not reach. Keep every
outcome the 2026-08-24 change established. Keep the decision inside the helper, so no call site
learns a shape again.

**Non-Goals.** The `listStyle` a converted heading adopts (#159's first question). Any change to
what `orderedRuns` reads as a run. Any change to the width-carrying behaviour.

## Decisions

### D1. A start is recovered only where it was lost

The rule that replaces "the start of the run the first member present beforehand belonged to,
always" is: recover a start only where the fragment's own numbers cannot stand.

- **Removal.** The members that carried the start are gone. The fragment is a remainder, has no
  numbering left to stand on, and reads the run's own start — `1. 2. 3.` minus its first two
  leaves `1.`, exactly as before.
- **Split.** Nothing is gone. An earlier member of the run is still in the sibling list, in
  another fragment, still carrying the start. The tail keeps its own numbers: its start is the
  number its earliest surviving member already carried, counted back over whatever now precedes
  it in the fragment.

The counting-back matters because a fragment can GAIN members as it is cut off — a paste that
lands a bullet and an ordered item together. The member that was already there stays on its own
number and the arrival takes the one above it, which is the same "an arriving number does not
become the run's start" the 2026-08-24 change established, read from the other end.

*Alternative rejected:* fencing the renumbering at the operation's own span, which is how #159
frames the question. That would need the span threaded to all ten call sites, and it would
suppress renumbering that is correct — an ordered item inserted mid-run must push the items below
it. The defect is not that renumbering reaches below the operand; it is that a run was declared
to have ended when nothing about its numbering had.

### D2. "Outside this fragment", not "still present"

Read as "an earlier member of the run survived anywhere", D1 fires on a plain reorder: a swap
WITHIN a run moves its members past one another and cuts nothing, yet every earlier member is
still present. Measured, that renumbered `1. one` / `2. two` / `3. three` to `2.` / `3.` / `4.`
on a moveDown — three existing unit tests caught it. The earlier member has to be in a DIFFERENT
fragment for the run to have been divided.

Membership is of the sibling list, not of the tree: a node the operation moved to another level
left this run as surely as a deleted one did, and what it leaves behind is a remainder.

### D3. A fragment that also JOINS stays under the join rule

A separator moving in can cut a run and merge the tail into the run below in one gesture. One
list carries one sequence, so whatever start that fragment is handed renumbers the members it
absorbed — there is no reading that leaves them alone, and "keep your own numbers" has nothing
left to protect. Handing it its own numbers moves every absorbed member by one, which rewrites
MORE than `main` did: measured over the labelled generator before this guard, 20 cases preserved
fewer source lines than `main`, all of this shape and all reversed by it.

So the condition is two-sided, and the guard states the principle rather than patching the
measurement: a start is recovered where the fragment's own numbers cannot stand — because the
members carrying them are gone, OR because members from elsewhere have arrived beside them.

## Risks / Trade-offs

**A divided run now reads with a gap in it.** `1. a` / `- x` / `2. b` renders as 1, then 2 — the
numbering continues past the interruption instead of restarting. That is what the document said
before the operation, and what CommonMark's `start` attribute exists to express.

**The reach is wide.** 7 591 differing (operation, operand) pairs over 3 000 generated documents,
concentrated in `outdent` and the two reorders. The differential measures the DIRECTION of every
one of them, not a sample: all 7 591 preserve strictly more of the source's own lines than `main`,
none preserves fewer, and the count of neutral cases is zero. The change only ever subtracts
rewriting.

**One recorded outcome is reversed.** `2026-08-24-ordered-run-start-on-arrival`'s split scenario
asserted `1. a` / `2. b` / `- x` / `1. c`; it now asserts `3. c`, which is what the reading that
change replaced produced. That proposal recorded the outcome as carried along rather than
intended, so what is reversed is the collateral, not the fix.
