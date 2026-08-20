## 1. Verify the assumptions before building on them

- [ ] 1.1 Property test the CONTIGUITY assumption (design D3): over generated documents and
      generated covers, apply each single-node operation to every covered root in turn and assert
      the moved subtrees occupy one contiguous whole-subtree cover in the result. This gates the
      one-range after-state rule — if it fails, stop and revisit the spec's after-state
      requirement before writing any dispatch code
- [ ] 1.2 Characterize today's behaviour as an e2e probe on `20-structural-commands` /
      `30-keyboard-grammar`: Tab over a three-item cover selected downward and upward, recording
      the exact resulting buffers, so the pre-change behaviour is documented rather than
      described (and so the negative control for §5 exists)
- [ ] 1.3 Confirm `groupRootsByParent`'s output is the shape the group ops want for a mixed-depth
      cover — one contiguous run per parent, groups independent — against a hand-built example
      with roots at three depths

## 2. Core group operations (`src/ops.ts`)

- [ ] 2.1 Add the subject SPAN to `OpOutput` and populate it for the existing single-node
      operations, asserting it equals that node's whole-subtree cover; leave `anchor` untouched
- [ ] 2.2 Write the naive composition oracle (loop the single-node op over the roots, re-parsing
      between steps) as a test helper — it is the property test's oracle per design D1, not
      production code
- [ ] 2.3 Implement `indentGroups` in one surgery pass, with the same-parent single-filtering-pass
      discipline `deleteSubtreeGroups` documents
- [ ] 2.4 Implement `outdentGroups`, including the existing following-sibling re-parenting rule
      per root
- [ ] 2.5 Implement `moveGroupsUp` and `moveGroupsDown`, the latter applying roots in REVERSE
      document order (design D1)
- [ ] 2.6 Atomic rejection: pre-check the whole composition and return the first failing step's
      typed reason in application order, leaving the tree unchanged (design D7);
      `empty-selection` for an empty forest
- [ ] 2.7 Property test each group op against the oracle from 2.2 — equal trees — over generated
      documents and covers
- [ ] 2.8 Extend `tests/closure.test.ts` to the group ops: closure, totality, and minimal edits
      (a node lying between two groups is byte-identical)
- [ ] 2.9 Direct unit tests in `tests/ops.test.ts` for the ordered-run renumbering cases: a group
      indent that removes a run's head, a group move within an ordered run, and a mixed-depth
      group that renumbers at two levels — renumbering computed once over the final membership,
      not per step (design D2 risk)
- [ ] 2.10 Unit tests for the single-root equivalence: every group op with one root produces the
      single-node op's tree, edits and anchor byte-identically

## 3. Operand resolution, shared by both entry points

- [ ] 3.1 Promote `coverGroupsOf` out of `enforce.ts` (design D5) so the grammar and the command
      path call the same function; the deletion path keeps using it unchanged
- [ ] 3.2 Add the operand rule: empty selection → node at the caret line; non-cover range →
      escalate to its node's cover; exact cover → its grouped roots; out of jurisdiction →
      declined
- [ ] 3.3 Unit tests that the operand is identical for a forward and a backward selection of the
      same subtrees, and for the same cover reached by extension, by Mod+A, and by drag

## 4. Keyboard path (`src/plugin/grammar.ts`, `src/plugin/keymap.ts`)

- [ ] 4.1 Add a cover branch to `planKey` for indent/outdent/move-up/move-down, beside the
      existing `planOverSelection` branch, routing to the group ops
- [ ] 4.2 Plan the after-state per design D4: a cover operand dispatches the result's subject span
      as a selection; a caret or within-node operand keeps `caret-policy.ts` exactly as today
- [ ] 4.3 Widen `makeHandler`'s `actsOnSelection` past split/continue, keeping the multi-range
      decline and updating the comment that records why the head was used
- [ ] 4.4 Keep one cue per rejected group operation
- [ ] 4.5 Unit tests in `tests/grammar.test.ts`: Tab and Shift+Tab over multi-root covers,
      mixed-depth covers, mixed-kind runs, rejections, and the unchanged single-node cases
- [ ] 4.6 Assert in `tests/caret-placement.test.ts` that a cover dispatch states a selection and
      no caret, and that a within-node-range dispatch is byte-identical to today's

## 5. Command path (`src/plugin/main.ts`)

- [ ] 5.1 `runOp` resolves its operand from `editor.listSelections()` through the shared function
      from 3.1, replacing the `getCursor()` lookup
- [ ] 5.2 `editorCheckCallback` returns false when the selection holds more than one range, so
      the command is unavailable (design D6)
- [ ] 5.3 Dispatch the resulting cover in the SAME transaction as the change, keeping the
      re-assertion that preserves undo granularity
- [ ] 5.4 Test that palette and keyboard produce an identical document AND an identical selection
      for the same cover — the parity the existing "Both entry points agree" scenario asserts for
      carets

## 6. Integration with the shipped selection machinery

- [ ] 6.1 Assert the dispatched cover needs no escalation: run it through the transaction filter
      and confirm the settled selection is byte-identical to what was dispatched
- [ ] 6.2 Confirm `needsRecording` records the cover when mapping would not reproduce it, and
      that redo restores it — no change to `record-decision.ts` expected, so this is a test that
      must be negative-controlled to be worth anything
- [ ] 6.3 Confirm the block-selection chrome and focus policy behave across the operation: the
      editor stays in block-selection mode when a cover in, cover out (no focus round trip)

## 7. End-to-end and manual verification

- [ ] 7.1 E2E in `30-keyboard-grammar`: Tab and Shift+Tab over a three-item cover, over a
      mixed-depth cover, and the repeated-press case (two Tabs in a row acting on the same nodes)
- [ ] 7.2 E2E in `20-structural-commands`: Mod+Shift+Arrow moving a multi-node cover, one undo
      reverting the whole group, redo restoring the cover
- [ ] 7.3 Negative-control every new test added in §2, §4 and §7 — disable the group path and
      confirm each fails (the project's standing rule; three past tests could not fail)
- [ ] 7.4 Real-vault manual pass on the shapes from the original 2026-07-24 report

## 8. Close the record

- [ ] 8.1 Update the Track 2 entry in `docs/research/13-selection-follow-ups.md` — mark the
      structural-keymap item resolved, with what was measured
- [ ] 8.2 Record any finding that contradicted this design (especially 1.1) in
      `docs/research/04` as a numbered entry
