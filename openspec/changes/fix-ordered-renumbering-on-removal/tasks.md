## 1. Reproduce, at the operation layer (design D4)

- [ ] 1.1 Failing tests in `tests/ops.test.ts` for the two catalogued measurements, driven
      through `deleteSubtrees` rather than the helper: the first two of `1. 2. 3.` removed
      must leave `1. c` (records `3. c` today), and the first of `5. 6. 7.` removed must
      leave `5. b` / `6. c` (records `6. b` / `7. c`). Assert the whole encoded document,
      not the marker digits alone — the point is that nothing else moved
- [ ] 1.2 MEASURE, do not infer, whether `indent` and `unwrapListItem` reach the same
      defect: indent `1. one` whose previous sibling is `- bullet`, with `2. two` after it;
      unwrap an empty ordered first item. Record what each actually produces. If either is
      unreachable, say so here and drop its scenario from the delta spec rather than
      asserting a behavior nothing can produce
- [ ] 1.3 Pin the permutation case BEFORE touching the helper: `moveDown` on the first of a
      `5. 6. 7.` run leaves the run reading `5. 6. 7.` with the content exchanged. This is
      the behavior the minimum rule exists for, and it must be green both before and after

## 2. The removal-aware rule (design D1, D2, D3)

- [ ] 2.1 Extract the run walk in `renumberOrdered` into an internal helper parameterized by
      how a run's start is chosen. `renumberOrdered(nodes)` keeps its exact current meaning
      and its doc comment's reasoning — verify by running the suite before adding any caller
- [ ] 2.2 Add `renumberOrderedAfterRemoval(before, after)`: build the ordered-node-id → run
      start map from `before`, choose each surviving run's start by its FIRST member's id,
      and fall back to the minimum present when the id is absent. Document at the definition
      why the fallback is the OLD rule (a mis-routed caller degrades to today's behavior,
      not to a third one)
- [ ] 2.3 Document both functions against each other: which transformation shape each is
      for, and the one-line reason the other exists. The defect was a correct rule applied
      to the wrong shape, so the comment that prevents a repeat is the shape, not the math

## 3. Route the removal call sites (design D1 Context)

- [ ] 3.1 `deleteSubtreeGroups`: pass the pre-filter sibling list as `before`. Note that
      several ranges are filtered in ONE pass per parent — `before` is that parent's list as
      it entered the pass, not per range
- [ ] 3.2 `indent`'s departure side, and `unwrapListItem` — each only if 1.2 measured the
      defect there. Leave the arrival side of `indent` and `outdent` on `renumberOrdered`:
      they are insertions
- [ ] 3.3 Leave `move`, `splitNode`, `insertSubtrees`, `mergeNodes` and `normalizeBoundaries`
      untouched, and confirm by grep that every remaining `renumberOrdered` call is a
      permutation or an insertion. A removal site missed here is the defect still shipping

## 4. Verification

- [ ] 4.1 Turn 1.1's and 1.2's failing tests green, and re-run 1.3 unchanged
- [ ] 4.2 Negative control: revert `deleteSubtreeGroups` to `renumberOrdered` and confirm
      1.1 fails with exactly `3. c` and `6. b` / `7. c` — the recorded outputs. A test that
      passes either way is asserting nothing
- [ ] 4.3 Cover the run-merging removal (D3): a paragraph standing between `1. 2.` and
      `5. 6.` is deleted, the survivors become one run, and it starts at 1
- [ ] 4.4 Cover the removals that must NOT change: deleting from the middle of a run, and
      deleting a whole run so nothing remains to renumber
- [ ] 4.5 Run `tests/closure.test.ts` and read its output rather than assuming silence —
      the property suite already generates removals over generated trees and is this
      change's broadest check that renumbered markers still re-parse to the same tree
- [ ] 4.6 Run the full unit suite, `npm run build` and `npm run lint`

## 5. Record

- [ ] 5.1 Update the catalogue's C2 entry
      (`docs/research/15-enter-and-shift-enter-catalogue.md`) to point at this change for
      the ordered-run finding, in one line. Leave the measured outputs themselves intact —
      they are the pre-change record, and rewriting them destroys the evidence
