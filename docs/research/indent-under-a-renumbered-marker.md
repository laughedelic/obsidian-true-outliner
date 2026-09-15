# Indenting under a target the same operation renumbers

Measured 15 September 2026 against `62acd39`, with `tests/depth-contract.test.ts` and direct
calls into `src/ops.ts`.

Two properties in `tests/depth-contract.test.ts` failed on one CI run — §1.2 "indent moves a
non-heading subject by 1" and §1.3 "indent moves each covered root by 1, from where it was",
both after 407 of 3000 cases, seed `-675483783`
([run 35019251347](https://github.com/laughedelic/obsidian-true-outliner/actions/runs/35019251347/job/104550487936)).
The pull request it surfaced on changed documentation only. fast-check draws a fresh seed per
run, so the failure moved from one open branch to the next as each of them re-ran.

## What the property found

The generated counterexample is a fifty-eight-node document. Shrunk by hand to the smallest
document that still shows it, it is three lines, and the subject is the last of them:

```
9. a
9. b
- c
```

`indent` on `- c` produced

```
9. a
10. b
   - c
```

and the re-parse reads `- c` at three columns as a TOP-LEVEL item again: `10. b`'s content
column is four. The property's own comment separates the two defects it can report, and this
is the milder one — the subject's label is present in the result, at the depth it started
from, so the operation reported success and consumed an undo step while moving nothing.

## Why the marker moved at all

`- c` leaving the top level renumbers the ordered run it leaves, per the ordered-run
requirement, and that run is `9.` and `9.`. Renumbering it consecutively from its start makes
the second item `10.` — one column wider, so its content column moves from three to four
while the line the marker sits on does not.

The source's numbering is what puts the digit boundary there, and it is ordinary written
markdown: `9.` twice is what markdown itself renders as 9 and 10, which is why the
requirement normalizes it on any operation that touches the run. The generator reaches the
same shape by another route — it emits each list numbered from 1, and a document whose top
level holds several such lists with no non-ordered item between them is ONE run to the
renumbering, so `1. 2. 3. 1. 2. 3. 1. 2. 1. 2.` renumbers to `1.` through `10.`. That is the
counterexample: the subject followed the tenth.

`renumberRuns` already carries a widening marker's subtree with it (`shiftBelowMarker`), and
the requirement states that clause and the measurement behind it. What neither covers is a
node arriving in the same surgery: `indentSurgery` encoded the subject for its destination
FIRST, against the target as the operation found it, and renumbered the departure level
after. The content column the encoding reached was three — `9. b`'s — and the item the node
landed under was `10. b`.

## The mirror, which the property cannot see

The same ordering strands a node the other way when the renumbering NARROWS the target:

```
1. a
10. b
- c
```

renumbers to `1.` and `2.`, and `- c` was written at `10. b`'s four columns where `2. b`
requires three. Four still clears three, so the node is the child the operation promised and
every depth measurement agrees. What drifts is the indentation — the same drift
`shiftBelowMarker` repairs for a subtree an item already has, and the same reason to fix both
directions at once rather than only the one a depth property can fail on.

## How old, and how rare

The defect is not a regression from `8eae5ad` (a list item's content column counts the
whitespace after its marker), the most recent commit to both the property and `src/ops.ts`
before the failure. The three-line reproduction was run against `8eae5ad^` and against
`974ff84`, the commit that introduced the depth property itself, and produces `   - c` under
`10. b` at both. The property has been able to draw this shape since the day it was written
and drew it now.

Its rarity is why. Running both depth properties for all four operations, in both their
single and group forms, over 200 random seeds at the suite's own 3000 cases each, against the
unfixed operation, found it ONCE — seed `1024385450`, the single-node indent property. That
counterexample is the same defect reached by the generator's other route: the target renumbers
to `10. L56`, its own children shift to four columns with it, and the arriving node alone is
written at three.

So a run of the property has roughly one chance in two hundred of drawing the shape, which is
why it has been passing since the property was written. It needs an ordered run whose
numbering is not already consecutive from its start, the renumbering to cross a digit
boundary, and the subject to sit immediately after the item it crosses on.

## What follows

`indentSurgery` renumbers the departure level FIRST and encodes the subject against the
target as that renumbering leaves it. Both directions come out exact: `- c` lands at four
columns under `10. b`, and at three under `2. b`. The same 200-seed run over both properties,
all four operations and both forms — the run that found the second counterexample above —
reports no violations against the fixed operation, and both seeds that did fail now pass.

The three-line documents are pinned as deterministic cases beside the properties
(`tests/depth-contract.test.ts` §1.5). A property whose seed is random per run finds a shape
once and then hides it, so the case it found has to be kept by something that does not depend
on a seed.

Pinning the SEED instead was considered and rejected. A property run from a fixed seed is
3000 fixed documents, and can never again find anything it did not find the day the seed was
chosen — this defect survived every run of the property until the seed that drew it came up.
What the intermittency actually costs is the reproduction, and that is cheap to fix: fast-check
prints the seed with every failure, and `tests/fast-check-seed.ts` lets `FC_SEED` put it back,
so a failed job is replayed with `FC_SEED=<seed> npm test -- <file>` and nothing has to be
written to reproduce it.
