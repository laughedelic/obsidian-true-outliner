## 1. The refusal

- [ ] 1.1 Add `reorder-not-expressible` to `RejectionReason` (src/result.ts) and its cue to
      `REJECTION_MESSAGES` (src/plugin/messages.ts) — the map is exhaustive over the union, so
      the build fails until both exist. The cue names what would otherwise have happened, in the
      table's existing voice (D5).
- [ ] 1.2 In `moveSurgery` (src/ops.ts), before the swap, refuse when either relocated root
      would come to rest as a SECTION-LEVEL list item whose new preceding sibling is a paragraph
      (D2, D3, D4). Decide it from the operand's sibling array, the way `rejectAcrossScopes`
      decides its own, so a refusal runs no surgery.
- [ ] 1.3 Comment the refusal as intended for deletion (D7): name the mapping question, name
      `docs/research/17-list-paragraph-mapping.md`, and state that under two of the four
      candidate readings the branch is unreachable. Explain the mechanism — why the arrangement
      has no encoding — and not the measurements.

## 2. The guard

- [ ] 2.1 In `tests/depth-contract.test.ts`, add a reorder property that compares EVERY label's
      depth before and against the result, for move up and move down and their group forms
      (D6). This is the property that sees the bystander; the subject-only table cannot.
- [ ] 2.2 Add the deferred move-down row to the contract table and remove the deferral comment
      at the top of the file, with coverage floors set the way the existing rows set theirs.
- [ ] 2.3 Update the sentence in `openspec/changes/depth-contract-property-tests/` that defers
      move down "until the defect that violates it is fixed" — the two changes ship stacked, and
      leaving it would state a gap that no longer exists.
- [ ] 2.4 Behavioural tests in `tests/ops.test.ts`, in the block that owns sibling reordering:
      a list item refused moving down past a paragraph, a paragraph refused moving up above a
      list item, and a reorder among a list item's own children still accepted past a sibling
      paragraph (the scope boundary in D4).

## 3. Prove the guard and the scope

- [ ] 3.1 Negative control: disable the refusal and confirm the 2.1 property FAILS for both
      directions, and that the move-up failure is a bystander's depth rather than the subject's.
      Confirm the 2.4 tests fail on the rejection reason, not on text.
- [ ] 3.2 Negative control the other way: widen the refusal past section level and confirm the
      2.4 nested-reorder test fails, so that test guards the scope rather than riding along.
- [ ] 3.3 Re-run the predicate measurement described in design D2 and confirm it still fires
      exactly on the violating cases — no false positives, no false negatives — on the current
      generator.

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
