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
absorbed — there is no reading that leaves them alone, and keeping a fragment's own numbers has nothing
left to protect. Handing it its own numbers moves every absorbed member by one, which rewrites
MORE than `main` did: measured over the labelled generator before this guard, 20 cases preserved
fewer source lines than `main`, all of this shape and all reversed by it.

So the condition is two-sided, and the guard states the principle rather than patching the
measurement: a start is recovered where the fragment's own numbers cannot stand — because the
members carrying them are gone, OR because members from elsewhere have arrived beside them.

### D4. Counting back below `1.` takes the recovered start

A fragment can be handed more prepended members than its own number leaves room for — a paste of
`- x` / `5. p` / `6. q` / `7. r` after the `1. a` of `1. a` / `2. b` would begin it at `-1`. Its
own numbers do not fit either, so this is D1's own condition reached from a third direction and
the recovered start answers. Clamping to `0.` instead would be legal CommonMark and round-trips
cleanly, but it writes a number no run in the source was written from, and it rewrites the same
line the recovered start does — so it buys nothing for the oddity it costs.

### D5. A run that cannot be written within nine digits is not renumbered

Preserving a fragment's own numbers renumbers UPWARD, which recovering a start never did: a
fragment at the parser's ceiling can now be pushed over it. `parse.ts` reads an ordered marker as
`\d{1,9}`, so a tenth digit is not a list item — measured, `999999999. c` renumbered to
`1000000000. c` re-parses as a PARAGRAPH, `markerWidthOf` falls back to 2 on the marker it can no
longer read, and the subtree is dragged nine columns left. `renumberRuns` therefore leaves any run
whose consecutive renumbering would exceed the limit exactly as it stands.

The guard sits in `renumberRuns` rather than in the start policy because the overflow is older
than this change: on `main`, `999999999. a` / `999999999. b` with a `5. z` inserted already writes
`1000000001. b` through the unchanged insertion path. This change adds a route into it, and the
guard closes both.

*Alternative rejected:* renumbering the run up to the limit and stopping. A partly renumbered run
is neither the document's own numbering nor a consecutive one, and the requirement it would be
half-satisfying is the one that cannot be satisfied here at all.

## Risks / Trade-offs

**A divided run now reads with a gap in it.** `1. a` / `- x` / `2. b` renders as 1, then 2 — the
numbering continues past the interruption instead of restarting. That is what the document said
before the operation, and what CommonMark's `start` attribute exists to express.

**The reach is wide.** 28 354 differing (operation, operand) cases over 3 000 generated documents,
across `outdent`, the two reorders and `insertSubtrees` under five payload shapes. The
differential measures the DIRECTION of every one of them, not a sample: all 28 354 preserve
strictly more of the source's own lines than `main`, and none preserves fewer.

That is the corpus, not a property. On a source whose run is NOT already consecutive, both
readings normalize it and neither leaves it alone, so which preserves more is incidental —
measured, `- t` / `8. e` / `9. n` / `9. o` / (`- kid`) with a `- x` pasted after `8. e` preserves
5 source lines on `main` and 4 here. The same restriction `renumbering-contract.test.ts` already
places on its own property, and for the same reason: on a run that is already consecutive from
its start, a renumbering that normalizes is the requirement working rather than failing.

**One recorded outcome is reversed.** `2026-08-24-ordered-run-start-on-arrival`'s split scenario
asserted `1. a` / `2. b` / `- x` / `1. c`; it now asserts `3. c`, which is what the reading that
change replaced produced. That proposal recorded the outcome as carried along rather than
intended, so what is reversed is the collateral, not the fix.
