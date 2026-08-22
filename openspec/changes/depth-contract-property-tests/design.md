## Context

See proposal.md — Why. The mechanics that matter for the approach:

- `finalize` returns `parse(encode(surgery))`, so node IDs DO NOT SURVIVE an operation and the
  result tree is by definition the parse of its own encoding. Any property comparing those two is
  vacuous; any property tracking a subject by id across the call is impossible.
- `tests/group-oracle.ts` already solves the tracking problem for the composition oracle: its
  generator writes a unique `L<n>` token into every node's own text, and structural operations
  rewrite MARKERS (indentation, `#` runs, ordered digits) but never a node's text. Label survival
  is itself asserted, in `tests/group-composition.test.ts:73`.
- `forEachNodeWithLine` (src/locate.ts) hands every visited node its depth, 0 at top level. Depth
  is therefore readable from the public traversal with no new helper.
- `tests/group-ops.test.ts` builds group operands from a pair of node indices via `forestCoverOf`
  plus `groupRootsByParent`. That is the same operand shape the group forms take.

## Goals / Non-Goals

**Goals:**

- One property suite that fails when an operation's emitted markdown re-parses with the subject at
  a depth the operation did not promise.
- Coverage the suite can be trusted on: enough accepted cases, and enough MULTI-ROOT accepted
  cases for the group forms, that a green run means something.
- A demonstrated catch — the property is shown to fail against a known-defective operation before
  it is trusted as a guard.

**Non-Goals:**

- Fixing any operation. This change adds no `src/` edit; the two defects the technique exposes are
  fixed in the changes stacked on top of it.
- Asserting anything about WHERE the subject lands beyond its depth — sibling order, encoding
  style and the roots' contiguity are already covered by the composition and closure suites.
- A general "assert the promise" harness for every operation. This change asserts one promise
  well; other promises (the above-operand line property from Q33, for instance) come with the
  changes that need them.

## Decisions

### D1. Depth is read from the RESULT tree via the existing traversal

The property measures the subject's depth before the call and again in `result.value.doc`, both
through `forEachNodeWithLine`. Measuring in the result is the entire point: the surgery tree is
what the operation believes it built, and the disagreement between the two is the bug class.

Alternative considered: compute depth as `findPath(...).length`. It needs a lookup by id, which is
exactly what does not survive the re-parse, so the label traversal is both necessary and cheaper.

### D2. Subjects are tracked by label, on labelled documents

The suite generates with `arbLabeledDoc()` from `tests/group-oracle.ts` rather than `arbTree()`
from `tests/generators.ts`. `arbTree` reaches more adversarial LINE shapes, which is what a
segmentation property wants; this property is about tree geometry across a re-parse, and it needs a
subject identity that survives one. Labels give that for free and are already load-bearing
elsewhere in the suite.

Consequence to accept: `arbLabeledDoc` generates a narrower set of documents, so the suite's reach
is bounded by that generator. D5 addresses it directly.

### D3. A lost label fails the property; it does not skip the case

Structural operations never rewrite a node's text, so a subject whose label cannot be found in the
result has been destroyed — a strictly worse defect than a wrong depth. Treating it as "cannot
measure, skip" is how a property quietly stops testing.

### D4. Single-node and group forms are one table-driven property, delta as data

Each operation contributes `(single form, group form, delta)`; one property body walks that table.
The group forms are asserted per covered root against that root's own prior depth, not against a
common depth, per the spec's group scenario.

Alternative considered: assert only the group forms and rely on the existing "a single-root group
is the single-node operation" property (§2.10) to carry the single-node case. Rejected — that
property equates their OUTPUTS, so it transfers the depth guarantee only as long as it itself
holds; chaining a new guarantee through an old property makes a failure two hops from its cause,
and the single-node body is a few lines.

### D5. Coverage is asserted, not assumed

The property counts accepted cases and fails below a floor — the same guard
`group-ops.test.ts` uses for its operands. The two forms are counted SEPARATELY: they accept at
very different rates (a group operand is rejected whenever any one of its roots is), so a single
shared counter lets the leaner form pass vacuously on the other's cases. The group forms
additionally count accepted MULTI-ROOT operands, without which the group property degrades into
the single-node one.

Measured on the current generator at 3000 runs per operation:

| | single-node accepted | group accepted | of those, multi-root |
|---|---|---|---|
| indent | 1258 | 938 | 697 |
| outdent | 1994 | 889 | 572 |
| move up | 1258 | 428 | 195 |

Floors are set well under those numbers, so ordinary generator drift does not turn the suite red
while a change that guts its reach does.

This is the mitigation for D2's narrower generator: a suite whose reach silently collapses to
"every case was rejected, therefore green" is the failure mode this whole change exists to close.

### D6. Move down is excluded here, with the gap named in the test file

Move down violates the contract today: a node moved down past a paragraph is absorbed into that
paragraph's list at the re-parse. Minimal case, from the property's own shrinker:

```
- L0            L1
                - L0     <- depth 0 -> 1, absorbed as L1's child
L1
```

Measured on the labelled generator: 25 violations in 2000 single-node attempts, and 82 violations
across 427 accepted group operands (both with the same shape). The change that fixes it adds its
depth assertion — one table row and the deferral comment removed.

Alternative considered: land the row now under `it.fails`. Rejected because `it.fails` passes while
the bug is present AND while the property is broken; it cannot distinguish the two. A named gap in
a comment is honest about the same fact without a green check standing over a red one.

### D7. Headings are excluded on their algebra, not for convenience

Indent on a heading shifts its level, and the resulting tree depth follows the surrounding heading
context — `### E` under `## P` stays P's child when it becomes `#### E` (a depth-0 change), while a
different context makes it a depth change. There is a heading contract to state, but it is about
LEVELS, not tree depth, and the existing heading requirements already cover level shifts. Mixed
covers containing a heading root are skipped for the same reason.

## Risks / Trade-offs

- **The property passes because the generator never produces the shape that breaks it.** → D5's
  coverage floors, plus the negative control in task 3: the property is run with move down included
  and must fail, which proves it catches this bug class on this generator.
- **`arbLabeledDoc`'s narrower shapes miss a defect `arbTree` would reach.** → Accepted for this
  change. The PR #51 shape (indent under an ordered parent) is reachable — its markers are
  generated — and the labelled generator is the only one that makes the subject trackable at all.
  Widening the generator is a separate change, not a prerequisite.
- **Runtime.** Three operations × two forms × property runs, on a suite that already spends most of
  its time in fast-check. → Keep `numRuns` in the 1500–3000 band the neighbouring suites use, and
  measure the file's wall time before merging.
- **The excluded move-down row is forgotten.** → The stacked change that fixes the absorption
  carries adding it as a task, and the comment in the test file names that change.
