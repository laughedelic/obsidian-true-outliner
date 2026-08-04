## 1. Cover-sequence module

- [x] 1.1 Add a pure module computing, for an (anchor node, direction) pair, the ordered
      sequence of covers — anchor's own subtree first, then each successive node in content
      order, built on `escalate.ts`'s exported `forestCoverOf`, with cover-preserving steps
      omitted. No new cover math: this is the fifth consumer of that one computation
- [x] 1.2 Add the anchor lookup (design D8): read it off the normalized cover's ROOTS — first
      root when forward, last when backward, and for a single-root cover the root ITSELF, which
      re-seats the anchor after an upward ancestor swallow. No stored state. `coveredForestOf`
      returning `null` is the not-a-cover case 1.2b handles
- [x] 1.2c Implement the step: with ≥2 roots the opposite direction drops the far root; with
      exactly one root there is nothing to shrink to, so BOTH directions grow. Unit-test the
      re-seat trace directly — `[c1] → ⇧↑ → [P] → ⇧↓ → [P,Q] → ⇧↑ → [P]` — since this is the
      case the original design got wrong and the one a reader will most doubt
- [x] 1.2b Normalize a non-cover input to the ANCHOR NODE'S subtree cover (design D6) — NOT via
      `escalateRange`/`escalateRanges`, both measured to leave a within-node content range
      untouched, which is correct for them and useless here. Where normalization changes the
      selection it IS the step; do not also advance. Test that it is the IDENTITY on every range
      that is already a cover, or it is silently changing the normal path too
- [x] 1.3 Unit tests mirroring `tests/escalate.test.ts`'s style, including the cross-scope case
      that must NOT pull in a parent
- [x] 1.4 Property tests: consecutive covers are strictly nested; opposite presses are mutual
      inverses OVER COVERS **while the cover has ≥2 roots** (the single-root base is excluded by
      D8 — state the exclusion in the property, do not silently filter it out, or the property
      passes vacuously on documents where every cover is single-rooted); every dispatched cover
      is exact, so escalation would leave it unchanged — assert rung-in equals rung-out the way
      `selection-as-subtree-set`'s task 2.4 does for the ladder
- [x] 1.5 NO-FIXPOINT property, the one that would have caught today's bug: for every document
      and every cover with a further element in the pressed direction, the press CHANGES the
      selection. Negative control — run it against a walk that reuses the native-extend-then-
      escalate path and confirm it fails on the loose-list and heading-section shapes

## 2. CM6 wiring

- [x] 2.1 Bind Shift+ArrowUp/Shift+ArrowDown in the existing high-precedence keymap, gated
      through `outlinePathOf` — the shared helper, which also excludes nested editors. NOT a
      private `editorInfoField` + `isOutline` check: that is the defect #35 fixed after it bit
      twice, and the keymap's module comment requires every binding to route through the one gate
- [x] 2.2 Implement the shape discriminator: one range extends as a block, several ranges extend
      per-range independently. Mirror `makeSelectAllHandler`'s shape (map over every range,
      leave a range with nowhere to go in place, preserve `mainIndex`). Do NOT use `soleCursor`
      — the motion keys decline on multi-range for a reason that does not apply here (design D7)
- [x] 2.3 Verify dispatches pass through the transaction filter uncorrected, the way
      `progressive-select-all`'s rungs already do

## 2b. Focus policy (design D9)

- [x] 2b.1 Replace `SelectionDecorationPlugin`'s three focus sites with one policy: focused iff
      NOT `allRangesCovered`. Keep the `setTimeout` deferral on the blur direction and the
      `isActiveEditor` guard — both are recorded fixes for real bugs, neither is what D9 changes
- [x] 2b.2 Reorder `onDocumentKeyDown`: run `runScopeHandlers` FIRST, focus only when no command
      matched. Today's unconditional `contentDOM.focus()` before the replay is the flicker's
      direct cause. Keep the existing `preventDefault`/`stopPropagation`-only-when-handled rule
      — it fixed the double-Backspace and Tab-focus-steal bugs and is independent of this
- [x] 2b.3 CHECKED, and NOT subsumed — the mouse-completion trigger is kept. `update()` is
      guarded on `!mouseDown` because blurring mid-drag breaks the browser's native drag-select,
      and a drag's last settling transaction can commit while `mouseDown` is still true, so
      nothing re-triggers `update()` afterward. What collapsed is the DECISION, not the trigger:
      `applyFocusPolicy` is one method invoked from two places. Two triggers for one policy is
      the honest end state, not the "three sites become one" the task assumed
- [ ] 2b.4 Negative control: disable the reorder in 2b.2 and confirm the flicker assertion in
      4.4a fails. A visual regression that passes both ways is testing nothing

## 3. Regression

- [ ] 3.1 Move keyboard-crossing coverage out of `61-selection-enforcement.e2e.ts` — after this
      change Shift+Arrow no longer reaches escalation, so an assertion left there documents a
      mechanism that no longer runs. Concretely one test, `Shift+ArrowDown crossing a boundary
      escalates both nodes in full` (line 77): `selection-as-subtree-set`'s task 6.1 left it in
      place on purpose, for this change to take
- [x] 3.2 Confirm `progressive-select-all`'s ladder is untouched, including multi-range
      independence
- [x] 3.2b Pin design D10's composition in `tests/select-all-ladder.test.ts`: `nextRung` over
      extension-shaped selections — a sibling run, a cross-scope mixed-depth forest, and a
      backward cover — asserting the measured answers (nearest enclosing run, else the parent,
      orientation preserved). These pass today; the point is that this change alters which
      selections exist for the ladder to climb from, so nothing should silently move
- [x] 3.2c Round-trip property: for any cover, `Mod-A` then extension, and extension then
      `Mod-A`, both agree with performing the second gesture from that selection directly — the
      how-did-we-get-here independence D10 guarantees, stated as a property rather than examples
- [ ] 3.3 Confirm block-selection chrome renders for extension-produced covers
      (`escalated-selection-decoration` reads covers, not their provenance)

## 4. End-to-end verification

- [ ] 4.1 New e2e spec for every example in examples.md
- [ ] 4.2 Cross-scope scenario: extending out of a subtree does not add the parent, and
      reversing returns to the child
- [ ] 4.2b Re-seat scenario (design D8, examples E7): `⇧↑` from a FIRST child in a heading
      section and again in a loose list — the two shapes measured as fixpoints today — then
      `⇧↓`, which must GROW to the parent's next sibling rather than leaving the selection
      unchanged or dropping to the parent's last child
- [ ] 4.3 Multi-cursor scenario: two cursors extend independently and do not collapse into one
      whole-document range. `selection-as-subtree-set`'s e2e 6.2 already pins the ONE-press case
      under the new geometry; extend it to repeated presses and to cursors at different depths
      rather than duplicating it
- [ ] 4.3b Nested-editor scenario: Shift+Arrow inside a table cell's editor falls through to
      native, with no outline sequence computed from the outer note (task 2.1's gate — the
      failure mode #35 documents is that a private check looks right and is not)
- [ ] 4.3c Undo-restored selection scenario (design D6): perform a structural op over a block
      selection, undo, then press Shift+Arrow — the restored range is mapped forward and need
      not be a cover, and the press must still produce one
- [ ] 4.4 Multi-cursor overlap scenario: two cursors ONE node apart, extended three times in the
      same direction — press 1 leaves two touching ranges (which do not merge), press 2 makes
      them overlap and merge, press 3 must then extend the merged range as a single block. This
      is design D4's edge, and one press is not enough to reach it
- [ ] 4.4a Focus-policy scenario: assert `document.activeElement` does NOT change across a
      cover-to-cover extension press — the mechanism, not the appearance. Asserting "no flicker"
      by screenshot would pass for the wrong reasons; the claim is that no focus transition
      occurs at all
- [ ] 4.4b Input-still-lands scenarios, the failure mode D9 risks: type an ordinary character
      over a keyboard-built block selection; press Backspace over one; press a bound structural
      key over one. Each must behave as it does today — this is what `onDocumentKeyDown` exists
      for and the reorder must not regress it
- [ ] 4.4c Mouse-path regression: a drag settling into a cover still ends blurred with chrome,
      and a click into text still focuses. `onMouseUp`'s case (2b.3) is the one at risk
- [ ] 4.4d Ladder-handoff scenarios (D10): Mod-A once then Shift+ArrowDown equals Shift+ArrowDown
      from a bare caret (the non-cover rung, D6); Mod-A up to a subtree then Shift+ArrowDown
      grows from it; Shift+Arrow sideways then Mod-A climbs to the enclosing run. Assert the
      resulting SELECTIONS match the direct route, not merely that something changed
- [ ] 4.5 Off-mode reference assertions
- [ ] 4.6 Mobile-emulation run — including the focus policy, where there is no mouse path at all
      and a wrong blur would leave the on-screen keyboard with nowhere to type

## 5. Real-vault manual pass

- [ ] 5.1 Extend and shrink across real notes, especially deeply nested lists and heading
      sections
- [ ] 5.2 Reach D4's merge edge deliberately — two cursors a couple of nodes apart, extended
      until their ranges OVERLAP rather than merely touch — and judge whether the switch to
      block semantics reads as abrupt
- [ ] 5.3 Judge whether losing the caret's exact offset on the first press is felt
- [ ] 5.3b Judge D8's irreversible swallow: `⇧↑` from a first child, then try to get back. If it
      reads as a trap rather than as "the parent is now the thing selected", the fallback is the
      stored origin D8 rejected — reopen that decision rather than patching around it
- [ ] 5.3c Confirm the flicker is gone in the real vault, and that the blurred state does not
      feel inert — D9 keeps the editor blurred across a whole extension gesture, which is longer
      than it stays blurred today. Watch specifically for a key that silently does nothing
- [ ] 5.4 Record findings in `docs/research/04`

## 6. Documentation

- [ ] 6.1 Update examples.md with anything the manual pass revises
- [ ] 6.2 Update `docs/research/13`'s "Modal block-level keyboard selection" entry: record what
      the shape discriminator settled, that block selection is now a DERIVED mode (D9), and what
      a STORED modal design would still be for — the two were previously one entry and the
      distinction is what let D9 stay in scope
- [ ] 6.3 Record in `docs/research/04` the three measurements this change's design rests on, so
      none is re-derived: the gap-line fixpoint and its mechanism; that the keyboard flicker is
      the focus round-trip and NOT the two-transaction escalation flash; and that neither
      escalation helper normalizes a within-node range, which is why D6 names `subtreeCoverOf`
