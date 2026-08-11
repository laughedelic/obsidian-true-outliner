## 1. Pin the defect, and measure the half that is unknown

The rendering half is already measured (proposal.md — Why). The structural-key half is not, and
design D4 makes the measurement the thing that decides the change's size. Do it before touching
any operation.

- [ ] 1.1 Add failing tests in `tests/decorate.test.ts` for the reported shapes: with the caret
      on a position opened at the end of the first line of `- foo` / `␣␣bar`, the second line's
      fact is a list-item continuation at the item's own `supplementalDepth`, not a first-line
      paragraph at depth 1. Cover the nested (`⇥`) and under-a-heading variants, and the
      two-line paragraph, where the assertion is the absent first line rather than the depth.
- [ ] 1.2 Measure each structural key with a position open, at the planner level where the tree
      is visible: Tab, Shift+Tab, Alt+Up, Alt+Down, Shift+Up / Shift+Down node extension, and
      the select-all ladder, each on a node bisected by an interior position. Record the
      document each produces beside the document the same key produces on the same node with no
      position open.
- [ ] 1.3 Apply design D4's rule to each result — defective when the two documents differ in
      anything but the position's own line — and write the table into a `## Findings` section at
      the end of this file, with the measured documents, not a summary of them.
- [ ] 1.4 Measure the same for `node-edit-enforcement`'s verdict path: a boundary-crossing edit
      made while a position is open, against the same edit with none. Record whether the verdict
      differs.
- [ ] 1.5 If 1.3 or 1.4 finds a defect, add the delta specs the proposal names as candidates
      (`structural-operations`, `node-selection-extension`, `node-edit-enforcement`) for exactly
      what was found, and extend this task list with the work. If they find none, record that as
      the finding — the grammar delta's two operation scenarios then stand as regression guards
      over behavior that is already correct.

## 2. The overlay: one accessor, scoped to what the position displaced

- [ ] 2.1 In `src/plugin/decorate.ts`, add the pure fact alongside `provisionalFact` /
      `materializeProbe`: given the document text and the caret's line and column, return the
      facts of the tree the position stands for TOGETHER WITH the line span they apply to — the
      position's own line, plus the own lines below it of the node that owns the position in
      that tree. Return nothing when the position is not interior, which is the whole of the
      "is this a bisection" test (design D1).
- [ ] 2.2 Cover it in `tests/decorate.test.ts`: the span is empty for an end-of-node position
      and for Enter's blank-separated position; it is the tail lines for each shape in 1.1; and
      a node that already has real children keeps them at their own depths, with only its own
      lines in the span.
- [ ] 2.3 Add the differential property test design D1 commits to, using `fast-check` and
      `tests/generators.ts`: for a generated document and every line a position can occupy, the
      raw facts and the resolved facts differ ONLY on the position's line and on the reported
      span. Assert `guideDepths` identical for every line as part of the same pass, which is
      design D2's claim.
- [ ] 2.4 In `src/plugin/decorations.ts`, introduce the single `factsFor(state)` accessor: raw
      `docFacts` unless a position is open, otherwise raw facts with the position's own line and
      the span from 2.1 replaced. Route the marker pass (`:776`), the line-decoration pass
      (`:884`), and `MarginCompensation`'s widget loop (`:1917`) through it, deleting the two
      ad-hoc provisional merges. Leave the escalated-selection passes on `docFacts` and say why
      in a comment — a cover and a position cannot coexist.
- [ ] 2.5 Negative control: disable the span half of 2.4 (keep only the caret line's own fact,
      which is today's behavior) and confirm every test from 1.1 and 2.2 fails for the stated
      reason, then restore it.
- [ ] 2.6 Negative control the other way: widen 2.4 to take the resolved facts for EVERY line and
      confirm the childless-heading e2e guard
      (`e2e/specs/52-block-markers-icons.e2e.ts:684`, "a neighbouring line is not rendered as
      though the node already existed") fails, then restore the scoped version. That test is the
      guard design D1 relies on; this proves it is still live.

## 3. Live coverage

- [ ] 3.1 Extend `e2e/specs/50-decorations.e2e.ts`: open an interior position on a two-line list
      item and assert the second line's rendered box and computed `margin-left` are what they
      were the instant before the keypress, measured against the same line in the same note
      before Shift+Enter rather than against a hardcoded pixel value.
- [ ] 3.2 Repeat under a heading, where the item carries a nonzero `supplementalDepth`, so the
      assertion distinguishes "kept its own margin" from "lost all margin".
- [ ] 3.3 Extend `e2e/specs/52-block-markers-icons.e2e.ts`: the displaced line carries no marker
      while the position is open, and the two-line paragraph's second line likewise gains none.
- [ ] 3.4 Assert the typing transition live: type one character on an interior position and
      confirm no line's box moves, which is the spec's "Typing changes nothing this layer
      contributes" scenario extended to the displaced lines.
- [ ] 3.5 Confirm `e2e/specs/53-decoration-contracts.e2e.ts` still holds with an interior
      position open — no transaction, no cursor movement, no history entry from the rendering.
- [ ] 3.6 Pure-list invariant: with an interior position open in a list that has no non-list
      ancestor, every line's rendered position is identical to outline-mode-off.

## 4. Whatever the measurement found

Filled in from 1.5. If the measurement pass found nothing, strike this group and say so in the
Findings.

- [ ] 4.1 Implement the fix for each defective operation, giving the grammar the resolved tree
      for its targeting decisions while edits stay expressed against the buffer's own lines
      (design D4).
- [ ] 4.2 Cover each in `tests/grammar.test.ts` against the document the same key produces with
      no position open — the comparison the measurement used, now as an assertion.
- [ ] 4.3 Negative control for each: revert the fix locally, confirm the test fails for the
      measured reason, restore it.
- [ ] 4.4 Add live coverage in `e2e/specs/30-keyboard-grammar.e2e.ts` for the gesture a real
      user reaches this through, at minimum Shift+Enter then Tab.

## 5. Close the loop

- [ ] 5.1 Add the interior position to `docs/research/15-enter-and-shift-enter-catalogue.md`
      under C2 ("The result SHALL re-parse as one (multiline) node"), beside S10 — same
      mechanism, measured at a node's middle rather than its end, with the node counts and the
      displacement table from the proposal.
- [ ] 5.2 Record the leftover blank line in `docs/research/12-decoration-follow-ups.md`: any
      document change drops the abandon record, so a structural key pressed on a position leaves
      it in the file and the node split on disk. Include that it is byte-identical to stock and
      what closing it would cost.
- [ ] 5.3 Note in the same file's "A non-list-item child of a list item is indented twice" entry
      that this change removes the transient way into that shape while the deliberate one — text
      the user themselves indented under an item, blank-separated — stays open and unchanged.
- [ ] 5.4 Record design D5's known edge there too: a blank line the user authored inside what
      would otherwise be one node renders its following line as a continuation while a caret is
      parked on it, reachable only by a programmatic placement, and closing it means giving up
      the document-and-caret-alone derivation.
- [ ] 5.5 Run `npm run build`, `npm test`, `npm run lint`, and `npm run test:e2e`; confirm the
      full suite is green.
- [ ] 5.6 Re-diff this change's `outline-keyboard-grammar` delta against the main spec before
      archiving, so nothing another change amended in the meantime is dropped by the restatement.
      `abandon-removes-only-the-place` archived on 2026-08-11 and its wording is already carried
      through; the check is for whatever lands next.
