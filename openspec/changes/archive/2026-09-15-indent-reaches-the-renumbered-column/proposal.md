## Why

`tests/depth-contract.test.ts` failed on one CI seed and passed on the next: §1.2 and §1.3
both reported indent leaving its subject at the depth it started from, after 407 of 3000
cases. Shrunk, the counterexample is three lines — `9. a` / `9. b` / `- c` — and the cause is
an ordering. Indenting `- c` renumbers the run it leaves, which makes the target `10. b` and
moves its content column from three to four; the subject had already been encoded for its
destination against the `9. b` the operation found, so it was written at three columns and
the re-parse handed it back to the top level. The operation reported success and consumed an
undo step while moving nothing. The narrowing direction strands a node a column too deep
instead, which keeps the tree and so fails no depth measurement at all. Measured in
[docs/research/indent-under-a-renumbered-marker.md](../../../docs/research/indent-under-a-renumbered-marker.md),
including that the defect dates from the property's own first commit rather than from any
recent change.

## What Changes

- The content column an indent reaches is the destination parent's AS THE OPERATION LEAVES
  IT. `indentSurgery` renumbers the departure level first and encodes the subject against the
  target that renumbering produces, so both directions come out exact: `- c` at four columns
  under `10. b`, and at three under `2. b`.
- The two three-line documents are pinned as deterministic cases beside the properties that
  found them (`tests/depth-contract.test.ts` §1.5). A property drawing a random seed finds a
  shape once and then hides it, so what it finds is kept by something that does not depend on
  a seed.
- `FC_SEED` replays a property run. fast-check prints the seed with every failure and has no
  supported way to take it back; a setup file reads it from the environment, so a failed job
  is reproduced with `FC_SEED=<seed> npm test -- <file>` and nothing has to be written to do it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-operations`: "Fallback indent unit for brand-new indentation" states that the
  content column reached is the destination parent's as the operation leaves it, and gains a
  scenario for each direction of a renumbering that changes the target's marker width.

## Impact

- `src/ops.ts` — `indentSurgery`'s order: the departure renumbering, then the destination
  encoding against its result.
- `tests/depth-contract.test.ts` — §1.5, the pinned counterexamples.
- `tests/fast-check-seed.ts`, `vitest.config.ts` — the `FC_SEED` setup file.
- `docs/research/indent-under-a-renumbered-marker.md`.

## Non-goals

- **Pinning the seed in CI.** A property run from a fixed seed is 3000 fixed documents and
  can never find anything it did not find the day the seed was chosen; this defect survived
  every run of the property until the seed that drew it came up. The intermittency costs the
  REPRODUCTION, which `FC_SEED` answers, not the coverage.
- **A repair pass over every parent-child column.** The fix is an ordering inside the one
  operation that had it wrong. A pass that widened any child short of its parent's column
  would also hide the next operation that writes one.
- **Outdent, and the reorders.** Their destinations are a parent's own INDENTATION rather
  than its content column, which a renumbering never moves, and the properties accept them at
  the same rates as before with no violations over the seeds measured.
