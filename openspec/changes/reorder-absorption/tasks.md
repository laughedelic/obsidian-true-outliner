## 1. The refusal

- [ ] 1.1 Add `reorder-not-expressible` to `RejectionReason` (src/result.ts) and its cue to
      `REJECTION_MESSAGES` (src/plugin/messages.ts) — the map is exhaustive over the union, so
      the build fails until both exist. The cue names what would otherwise have happened, in the
      table's existing voice (D5).
- [ ] 1.2 In `moveSurgery` (src/ops.ts), before the swap, refuse when either relocated root
      would come to rest as a SECTION-LEVEL list item whose new preceding sibling is a paragraph
      (D2, D3, D4). Decide it from the operand's sibling array, the way `rejectAcrossScopes`
      decides its own, so a refusal runs no surgery.
- [ ] 1.3 Leave it inside `moveSurgery` so a group reorder inherits it PER STEP (D2). The group
      form is specified as applying the single-node form to each root in turn, so a step the
      single-node form refuses must refuse the group; checking only the composed arrangement
      would make the group accept where the composition rejects, and break both the "Group
      closure" scenario and the oracle equality property.
- [ ] 1.4 Comment the refusal as intended for deletion (D7): name the mapping question, name
      `docs/research/17-list-paragraph-mapping.md`, and state that under two of the four
      candidate readings the branch is unreachable. Explain the mechanism — why the arrangement
      has no encoding — and not the measurements.

## 2. The guard

- [ ] 2.1 In `tests/depth-contract.test.ts`, add a reorder property that compares EVERY label's
      depth before and against the result, for move up and move down and their group forms
      (D6). This is the property that sees the bystander; the subject-only table cannot.
- [ ] 2.2 Add the deferred move-down row to the contract table and remove the deferral comment at
      the top of that file, with coverage floors set the way the existing rows set theirs. The
      requirement itself is updated in this change's delta, now that
      `depth-contract-property-tests` is archived and its requirement is live.
- [ ] 2.3 Update `tests/group-ops.test.ts` — "a run keeps its order where a step-at-a-time
      composition would reverse it" asserts the `- L0` / `L1` / `L2` absorption as an accepted
      outcome, and it now rejects (D2a). Expect `reorder-not-expressible`, and assert the
      document is byte-identical afterwards so the atomicity is pinned rather than assumed.
- [ ] 2.4 Behavioural tests in `tests/ops.test.ts`, in the block that owns sibling reordering:
      a list item refused moving down past a paragraph, a paragraph refused moving up above a
      list item, and a reorder among a list item's own children still accepted past a sibling
      paragraph (the scope boundary in D4).
- [ ] 2.5 Confirm the composition oracle still holds. `composeSequential` (tests/group-oracle.ts)
      composes the PUBLIC operations, so the per-step placement is what keeps it agreeing with
      the group form: both refuse the same shapes, with the same typed reason, and the equality
      property in `tests/group-composition.test.ts` needs no change. Expect
      `compositionKeptRootOrder` to filter nothing now that its shape is refused — leave it in
      place and record what it measures in a comment, rather than retiring a precondition this
      change did not set out to touch.

## 3. Prove the guard, the scope and the placement

- [ ] 3.1 Negative control: disable the refusal and confirm the 2.1 property FAILS for both
      directions, and that the move-up failure is a bystander's depth rather than the subject's.
      Confirm the 2.4 tests fail on the rejection reason, not on text.
- [ ] 3.2 Negative control the other way: widen the refusal past section level and confirm the
      2.4 nested-reorder test fails, so that test guards the scope rather than riding along.
- [ ] 3.3 Re-measure on the labelled generator at seed 42, 3000 runs, and confirm the numbers
      design D2 records — the predicate firing on 37 of 1285 move downs and 24 of 1239 move ups,
      with no accepted reorder left carrying a depth change.
- [ ] 3.4 Pin the placement and its cost: a group reorder whose intermediate step is
      inexpressible while its composed arrangement would have been fine — the `[atom, list item]`
      run moving down past a paragraph — is REFUSED, with the same typed reason the sequential
      composition gives. This is the test that fails if the check is ever moved to the composed
      tree, which would silently break the group form's definition (D2).

## 4. Record the question this does not answer

- [ ] 4.1 Write `docs/research/17-list-paragraph-mapping.md`: the defect that raised the
      question, the four candidate readings with their consequences, every measurement taken
      (with seeds and method, so each is reproducible), the external research on how other
      formats and tools handle a list after a paragraph, the Obsidian indent-quantization
      constraint, and the interaction with `lists-on-the-outline-grid`.
- [ ] 4.2 Add `Q34` to `docs/research/04-open-questions.md` registering the question as OPEN,
      with the one-paragraph summary and a pointer to doc 17 — the decision log is where a
      reader looks for what is undecided.
- [ ] 4.3 Add doc 17 to the table in `docs/research/README.md`.

## 5. Integrate

- [ ] 5.1 Run `npm test`, `npm run lint` and `npm run build`; the full suite stays green.
- [ ] 5.2 Real-vault pass on the refused shapes: a bullet before a paragraph, a paragraph above
      a list, and a group reorder containing either — confirm the notice appears, the document
      is untouched, and no undo step is consumed.
