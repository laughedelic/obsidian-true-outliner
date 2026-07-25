## 1. Cover-sequence module

- [ ] 1.1 Add a pure module computing, for an (anchor node, direction) pair, the ordered
      sequence of covers — anchor's own subtree first, then each successive node in content
      order, using `selection-as-subtree-set`'s forest-span geometry, with cover-preserving
      steps omitted
- [ ] 1.2 Add the position lookup: given the current selection, find its index in the sequence
      from the cover and the range's orientation, with no stored state
- [ ] 1.3 Unit tests mirroring `tests/escalate.test.ts`'s style, including the cross-scope case
      that must NOT pull in a parent
- [ ] 1.4 Property tests: consecutive covers are strictly nested; opposite presses are mutual
      inverses OVER COVERS; every dispatched cover is exact, so escalation would leave it
      unchanged

## 2. CM6 wiring

- [ ] 2.1 Bind Shift+ArrowUp/Shift+ArrowDown in the existing high-precedence, outline-mode-gated
      keymap
- [ ] 2.2 Implement the shape discriminator: one range extends as a block, several ranges extend
      per-range independently
- [ ] 2.3 Verify dispatches pass through the transaction filter uncorrected, the way
      `progressive-select-all`'s rungs already do

## 3. Regression

- [ ] 3.1 Move keyboard-crossing coverage out of `61-selection-enforcement.e2e.ts` — after this
      change Shift+Arrow no longer reaches escalation, so an assertion left there documents a
      mechanism that no longer runs
- [ ] 3.2 Confirm `progressive-select-all`'s ladder is untouched, including multi-range
      independence
- [ ] 3.3 Confirm block-selection chrome renders for extension-produced covers
      (`escalated-selection-decoration` reads covers, not their provenance)

## 4. End-to-end verification

- [ ] 4.1 New e2e spec for every example in examples.md
- [ ] 4.2 Cross-scope scenario: extending out of a subtree does not add the parent, and
      reversing returns to the child
- [ ] 4.3 Multi-cursor scenario: two cursors extend independently and do not collapse into one
      whole-document range
- [ ] 4.4 Multi-cursor overlap scenario: two cursors ONE node apart, extended three times in the
      same direction — press 1 leaves two touching ranges (which do not merge), press 2 makes
      them overlap and merge, press 3 must then extend the merged range as a single block. This
      is design D4's edge, and one press is not enough to reach it
- [ ] 4.5 Off-mode reference assertions
- [ ] 4.6 Mobile-emulation run

## 5. Real-vault manual pass

- [ ] 5.1 Extend and shrink across real notes, especially deeply nested lists and heading
      sections
- [ ] 5.2 Reach D4's merge edge deliberately — two cursors a couple of nodes apart, extended
      until their ranges OVERLAP rather than merely touch — and judge whether the switch to
      block semantics reads as abrupt
- [ ] 5.3 Judge whether losing the caret's exact offset on the first press is felt
- [ ] 5.4 Record findings in `docs/research/04`

## 6. Documentation

- [ ] 6.1 Update examples.md with anything the manual pass revises
- [ ] 6.2 Update `docs/research/13`'s "Modal block-level keyboard selection" entry: record what
      the shape discriminator settled and what a modal design would still be for
