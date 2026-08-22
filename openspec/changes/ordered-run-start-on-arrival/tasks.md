## 1. One start-number policy

- [ ] 1.1 Rename `renumberOrderedAfterRemoval` to `renumberOrderedAgainst(before, after)`
      (src/ops.ts). The name has to stop naming a shape: the classification is what this change
      removes, and a helper called `AfterRemoval` invites the next call site to ask which kind of
      transformation it is (D1).
- [ ] 1.2 Convert the nine `renumberOrdered` call sites to pass the before-list. For each,
      the before-list is the sibling array the site was handed — `nodes` inside `updateSiblings`,
      `node.children` for a split's child insertion, and the operand's OWN children captured
      before the adoption loop in `outdentSurgery`. Five of them change behavior: indent's
      arrival, outdent's arrival, outdent's adopted following siblings, `insertSubtrees`, and
      `moveSurgery`.
- [ ] 1.3 Delete `renumberOrdered`. `lowestNumber` stays as `renumberOrderedAgainst`'s fallback
      for a run with no member present beforehand (D2), and is no longer reachable as a policy in
      its own right.
- [ ] 1.4 Rewrite the helper's doc comment for the single rule. State where a run's identity
      lives and why the before-list answers every shape; drop the removal-versus-permutation
      case analysis, including the sentence recording that the merge classification "got wrong
      until all three of its branches were measured" — the classification it corrects no longer
      exists. Keep the fallback's rationale and the `- p` / `5. a` / `10. kid` / `6. b` worked
      example that earned it.
- [ ] 1.5 Update the four call-site comments that justify a policy by shape — indent's
      "The node LEAVES this level: a removal … The arrival side below is an insertion", outdent's
      prefix-truncation note, the split's "An INSERTION at the head of the child list", and
      `moveSurgery`'s. Each should now say what its before-list IS, not which shape it is.

## 2. The five shapes, by example

- [ ] 2.1 In `tests/ops.test.ts`, beside the existing renumbering tests: outdent `1. L2` in
      `- L0` / `2. L1` / `1. L2` / `- L3` / `# L4` yields `2. L1` / `3. L2`, with `2. L1`
      byte-identical. This is the reported repro.
- [ ] 2.2 Indent the top-level `1. x` under a `- p` whose children are `5. a` / `6. b`, and
      assert `5.` / `6.` / `7.`.
- [ ] 2.3 Outdent a node whose own children are `5. c1` / `6. c2` and whose following sibling
      `1. s1` is adopted as its trailing child; assert `5.` / `6.` / `7.`. This is the one shape
      where both lists in play belong to the operand's own subtree.
- [ ] 2.4 `insertSubtrees` a parsed `1. pasted` after `5. a` in `5. a` / `6. b` / `7. c`; assert
      `5.` / `6. pasted` / `7.` / `8.`. Plus the fallback: a parsed `3. x` / `4. y` landing
      between bullets keeps `3.` / `4.` (D2).
- [ ] 2.5 `moveDown` the `- x` in `5. a` / `- x` / `1. c`; assert the joined run reads
      `5. a` / `6. c`. This is the shape that proves the permutation branch was wrong for a
      reason of its own — no node arrives from anywhere.

## 3. The general statement, as a property

- [ ] 3.1 Add the "nothing above the operand is rewritten" property (D3), over indent, outdent,
      move up and move down on `arbLabeledDoc`. Track nodes by their `L<n>` labels, as
      `depth-contract.test.ts` does, and compare each labelled node's own first LINE rather than
      its depth — a renumbering defect moves nothing.
- [ ] 3.2 Restrict it to documents whose every ordered run is already consecutive from its own
      start, with the filter written in the test and its reason stated: on an inconsistently
      numbered source a correct renumbering rewrites markers above the operand, so the unfiltered
      property is measuring the source, not the operation.
- [ ] 3.3 Fence "above" at the topmost node the operation RELOCATES — for a reorder, the sibling
      it swaps with, not the subject alone (D3). Without this the property reports a reorder's
      legitimate swap as a violation and is useless for the two operations that need it most.
- [ ] 3.4 Guard the property's own reach, the way the depth contract guards its floors: assert a
      floor on the accepted count AND on how many accepted cases actually had an ordered marker
      above the fence. A run of the suite where every case was rejected, or where no case had an
      ordered item above the operand, would pass having tested nothing.

## 4. Prove the guard

- [ ] 4.1 Negative control: restore the minimum-present policy at the five behavioral sites and
      confirm the 3.1 property FAILS for indent, outdent and both reorders, and that each 2.x
      example fails on its numbers. A property that passes with the fix reverted is measuring
      something else.
- [ ] 4.2 Confirm the failure is the marker assertion and not a lost label — the same distinction
      the depth contract draws — so a destroyed subject cannot be mistaken for a numbering defect.
- [ ] 4.3 Re-measure at seed 42, 3000 runs and confirm the design's numbers: violations
      11 / 63 / 2 / 3 before, 0 / 0 / 0 / 0 after, with accepted and ordered-marker-above counts
      unmoved (proposal.md — Why).

## 5. Integrate

- [ ] 5.1 Run `npm test`, `npm run lint`, `npm run build`. The existing suite is expected to be
      unchanged — 0 of 823 tests moved under the spike — so any failure here is a real
      disagreement with a documented outcome and needs reading, not adjusting.
- [ ] 5.2 Real-vault pass on the reported shape: a nested ordered item outdenting into an ordered
      run that does not start at 1, and confirm the line above it is untouched in the editor and
      that undo restores exactly one step.
