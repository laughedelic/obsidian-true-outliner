## 1. The depth property

- [ ] 1.1 Add `tests/depth-contract.test.ts` with a depth reader built on `forEachNodeWithLine`
      that returns a labelled node's depth in a given tree (D1), and the operation table pairing
      each single-node form with its group form and its delta: indent `+1`, outdent `-1`, move up
      `0` (D4).
- [ ] 1.2 Assert the single-node contract over `arbLabeledDoc()`: pick a non-heading subject,
      read its depth, apply the operation, and require its depth in `result.value.doc` to be the
      prior depth plus the delta. A subject whose label is absent from the result fails the
      property rather than skipping the case (D3).
- [ ] 1.3 Assert the group contract over the same generator: build the operand with
      `forestCoverOf` + `groupRootsByParent` the way `group-ops.test.ts` does, skip covers with a
      heading root (D7), and require EVERY covered root to land at its own prior depth plus the
      delta.
- [ ] 1.4 Name the excluded move-down row in a comment that states the defect, its minimal case
      (`- L0` / blank / `L1`), and the change that will add the row (D6).

## 2. Coverage guards

- [ ] 2.1 Count accepted cases per operation SEPARATELY for each form, and fail below a floor set
      well under the measured numbers at 3000 runs — single-node: indent 1258, outdent 1994, move
      up 1258; group: 938 / 889 / 428. One shared counter would let the single-node half pass
      vacuously on the group half's cases, since the two accept at very different rates (D5).
- [ ] 2.2 Count accepted MULTI-ROOT group operands per operation and guard them on their own
      floor — measured 697 / 572 / 195 — so the group property cannot degrade into the
      single-root case unnoticed.

## 3. Prove the property catches the bug class

- [ ] 3.1 Negative control: temporarily add the move-down row and confirm the property FAILS,
      with the counterexample shrinking to the absorption shape. Record the observed failure count
      in the PR description, then remove the row.
- [ ] 3.2 Confirm the property passes with move down excluded, and that the failure in 3.1 came
      from the depth assertion rather than from a lost label or a rejected-case miscount.

## 4. Integrate

- [ ] 4.1 Measure the new file's wall time and keep `numRuns` in the 1500–3000 band the
      neighbouring property suites use (Risks).
- [ ] 4.2 Run `npm test`, `npm run lint` and `npm run build`; the full suite stays green.
- [ ] 4.3 Cross-reference the new suite from docs/research/04-open-questions.md Q33, where the
      technique is recorded, so the permanent guard is findable from the finding that motivated
      it.
