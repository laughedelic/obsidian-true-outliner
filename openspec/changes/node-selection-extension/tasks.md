## 1. Cover-sequence module

- [x] 1.1 Add a pure module computing, for an (anchor node, direction) pair, the ordered
      sequence of covers — anchor's own subtree first, then each successive node in content
      order, built on `escalate.ts`'s exported `forestCoverOf`, with cover-preserving steps
      omitted. No new cover math: this is the fifth consumer of that one computation
- [x] 1.2 Add the anchor lookup (design D8): read it off the normalized cover's ROOTS — first
      root when forward, last when backward, and for a single-root cover the root ITSELF, which
      re-seats the anchor after an upward ancestor swallow. No stored state. `coveredForestOf`
      returning `null` is the not-a-cover case 1.2b handles
- [x] 1.2c Implement the step. CORRECTED during implementation: the task's own instruction —
      "with ≥2 roots the opposite direction drops the far root" — is WRONG and the property test
      caught it. Growing upward can ABSORB the previous leading roots into the newly added
      ancestor, so dropping that ancestor removes them too and lands several covers back
      (`[a1., # B]` grows up to `[# A, # B]` because `a1.` is inside `# A`). Both directions now
      step the far-side CANDIDATE inward and recompute, asking the same question growth asked one
      step earlier; verified by negative control. With exactly one root there is nothing to shrink
      to, so BOTH directions grow. Unit-tested the re-seat trace directly —
      `[c1] → ⇧↑ → [P] → ⇧↓ → [P,Q] → ⇧↑ → [P]`
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

- [x] 2b.1 Replace `SelectionDecorationPlugin`'s three focus sites with one policy. BOTH of this
      task's own prescriptions were later rejected by implementation findings, and D9 carries the
      corrected versions: focus is restored on the mode's EXIT EDGE, not asserted whenever
      `allRangesCovered` is false (asserting it broke caret placement on an ordinary click), and
      the blur is deferred with `requestAnimationFrame`, not `setTimeout` (a timer let one frame
      paint with chrome over a still-focused editor). The `isActiveEditor` guard did stay
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
- [x] 2b.4 Negative control: disable the reorder in 2b.2 and confirm the flicker assertion in
      4.4a fails. A visual regression that passes both ways is testing nothing

## 3. Regression

- [x] 3.1 Move keyboard-crossing coverage out of `61-selection-enforcement.e2e.ts` — after this
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
- [x] 3.3 Confirm block-selection chrome renders for extension-produced covers
      (`escalated-selection-decoration` reads covers, not their provenance)

## 4. End-to-end verification

- [x] 4.1 New e2e spec for every example in examples.md
- [x] 4.2 Cross-scope scenario: extending out of a subtree does not add the parent, and
      reversing returns to the child
- [x] 4.2b Re-seat scenario (design D8, examples E7): `⇧↑` from a FIRST child in a heading
      section and again in a loose list — the two shapes measured as fixpoints today — then
      `⇧↓`, which must GROW to the parent's next sibling rather than leaving the selection
      unchanged or dropping to the parent's last child
- [x] 4.3 Multi-cursor scenario: two cursors extend independently and do not collapse into one
      whole-document range. `selection-as-subtree-set`'s e2e 6.2 already pins the ONE-press case
      under the new geometry; extend it to repeated presses and to cursors at different depths
      rather than duplicating it
- [x] 4.3b Nested-editor scenario: Shift+Arrow inside a table cell's editor falls through to
      native, with no outline sequence computed from the outer note (task 2.1's gate — the
      failure mode #35 documents is that a private check looks right and is not)
- [x] 4.3c Undo-restored selection scenario (design D6): perform a structural op over a block
      selection, undo, then press Shift+Arrow — the restored range is mapped forward and need
      not be a cover, and the press must still produce one
- [x] 4.4 Multi-cursor overlap scenario: two cursors ONE node apart, extended three times in the
      same direction — press 1 leaves two touching ranges (which do not merge), press 2 makes
      them overlap and merge, press 3 must then extend the merged range as a single block. This
      is design D4's edge, and one press is not enough to reach it
- [x] 4.4a Focus-policy scenario: assert `document.activeElement` does NOT change across a
      cover-to-cover extension press — the mechanism, not the appearance. Asserting "no flicker"
      by screenshot would pass for the wrong reasons; the claim is that no focus transition
      occurs at all
- [x] 4.4b Input-still-lands scenarios, the failure mode D9 risks: type an ordinary character
      over a keyboard-built block selection; press Backspace over one; press a bound structural
      key over one. Each must behave as it does today — this is what `onDocumentKeyDown` exists
      for and the reorder must not regress it
- [x] 4.4c Mouse-path regression: a drag settling into a cover still ends blurred with chrome,
      and a click into text still focuses. `onMouseUp`'s case (2b.3) is the one at risk
- [x] 4.4d Ladder-handoff scenarios (D10): Mod-A once then Shift+ArrowDown equals Shift+ArrowDown
      from a bare caret (the non-cover rung, D6); Mod-A up to a subtree then Shift+ArrowDown
      grows from it; Shift+Arrow sideways then Mod-A climbs to the enclosing run. Assert the
      resulting SELECTIONS match the direct route, not merely that something changed
- [x] 4.5 Off-mode reference assertions
- [x] 4.6 Mobile-emulation run, 18/18. It caught TWO defects desktop did not. (a) The focus
      policy's focus direction regressed `65-content-space-caret` D2 — a click on a marker landed
      at `ch 1` instead of content start; root cause and the two corrections are in design D9's
      amendment. (b) Two of this change's own multi-cursor tests silently did NOTHING on mobile:
      `dispatchSelectOnlyRanges` does not focus the editor, a blurred editor never sees `keydown`,
      and `onDocumentKeyDown` correctly declines because two CURSORS are not a cover. Desktop
      passed only because the editor happened to be focused already

## 5. Real-vault manual pass

- [x] 5.1 CLEAN. Variable-depth selection behaves correctly on real notes; no findings
- [x] 5.2 Merge itself reads fine — the abruptness D4 worried about was not reported. Found a
      DIFFERENT defect instead: every covered range but the last painted a stray highlight under
      the chrome. The browser's DOM Selection holds only ONE range, so CM6 draws the rest as
      `.cm-selectionBackground` rects, which carry an unconditional base background in its theme
      with no `.cm-focused` requirement. `styles.css` suppressed only native `::selection`, and
      its comment claimed those rects "never actually mounts here" — measured on a SINGLE range,
      false for multi-cursor. Both paths suppressed now (Q32)
- [x] 5.3 ACCEPTED as designed: "a bit annoying, but not a deal-breaker." Matches Workflowy and
      Logseq. No change
- [x] 5.3b ACCEPTED: "kind of makes sense... not perfect, but understandable and tolerable." D8
      stands; the stored origin stays rejected. The question it drew — could the range preserve
      `c1+c2+P` rather than collapsing to "whole P", and doesn't the mixed-depth forest prove we
      already store state — is answered in Q32: both are the SAME span under downward closure,
      the forest is derived not stored, and what is lost was never in the range
- [x] 5.3c "Definitely much better", and no inert keys reported. One residual flicker remained
      on the FIRST switch into block mode, absent for the mouse — and it was NOT the blur, which
      lands before the next paint. `EditorView.updateAttrs` rewrites the editor's whole `class`
      attribute on a focus change, clobbering a class written with `classList`; the next update
      restored it, one frame late. Now declared through `EditorView.editorAttributes` so CM6's
      own rewrite carries it (Q32)
- [x] 5.4 Recorded as Q32

## 6. Documentation

- [x] 6.1 NOTHING to revise — the pass found no behavioral difference from the drawn examples.
      Both defects were visual (a stray highlight layer, a one-frame class drop), neither
      changing which nodes a press selects. E7's frames were already corrected during
      implementation, when the unit tests showed the swallow is the SECOND press
- [x] 6.2 Updated `docs/research/13`'s "Modal block-level keyboard selection" entry, split into
      shipped / still-open / knowingly-irreversible. ALSO corrected that file's flash entry: its
      "confirmed root cause" (a two-transaction escalation split) does not exist — CM6's
      `filterTransaction` merges an array result into one `Transaction.create`. That wrong
      mechanism is why an earlier fix attempt measured zero effect and was reverted as disproved
- [x] 6.3 Recorded as Q31, five findings rather than the three the task anticipated: the CM6
      merge fact and the cost of the wrong mechanism; that a before/after focus assertion cannot
      see a round trip; that neither escalation helper normalizes a within-node range; that
      "drop the far root" is not the inverse of an upward growth step; and D3's half-wrongness

## 7. Post-manual-pass fixes (2026-08-04)

Found by continued real-vault use after the pass in §5, and fixed here rather than filed:
both are defects this change introduced.

- [x] 7.1a INCOMPLETE FIRST FIX, corrected. The source-line rule in `select-extend.ts` handled a
      paragraph broken across two SOURCE lines but not a long paragraph that merely WRAPS — one
      source line, several rendered rows — which is the far commoner shape and the one reported.
      Whether a press stays inside a node depends on VISUAL lines, which a pure module cannot
      know, so the decision moved to the CM6 adapter and now asks
      `EditorView.moveVertically` where stock extension would actually land
- [x] 7.1 A MULTILINE node lost intra-node keyboard selection — the bound handler intercepted
      unconditionally, so the first `⇧↓` inside a two-line paragraph jumped to the node's whole
      cover where the pre-change path kept a character range. Design D11: decline while the
      selection is a character range inside one node's own content lines and the press would keep
      it there; the sequence takes over at the node boundary. Single-line nodes unchanged
- [x] 7.2 `Mod+C` broke block-selection mode — unbound, so it fell through to the unmatched-key
      refocus, putting a caret at the selection edge and showing raw markdown under the chrome.
      Measured: the DOM selection survives the blur intact, so the refocus buys copy nothing.
      Copy excluded specifically; cut and paste still refocus, since both modify the document and
      both end in a non-cover selection
- [x] 7.3 Answered the 5.3b follow-up properly in Q32. The first answer addressed only the
      single-contiguous-range representation; the fuller question — keep the underlying selection
      as a LIST OF NODES and paint the chrome wider — is the parked modal design, not a
      misunderstanding, and `mainIndex` would carry the anchor inside the selection. Recorded
      with the four things that break under the current representation
- [x] 7.4 PRE-EXISTING, established rather than assumed. `30-keyboard-grammar`'s "Tab respects
      the vault's Indent using tabs setting" fails intermittently in full desktop runs, passes in
      isolation, and reproduces in ~20s from just the four specs that precede it
      (`00-smoke`, `10-outline-mode`, `20-structural-commands`, `30-keyboard-grammar`) — so it is
      ORDER-dependent, not random. Ran that same prefix against the pre-change source
      (`git checkout ede1dc4 -- src/ styles.css`) and it fails identically, which rules this
      change out as the cause. Left for its own fix: the test flips `useTab` via `setConfig` +
      `updateOptions()` and presses Tab without waiting for the editor's `indentUnit` facet to
      actually reconfigure, which is a real race in the helper rather than in the grammar
- [x] 7.5 The entering-block-mode flicker is PARTIALLY fixed and the remainder is filed, not
      chased. Two causes found and fixed with measurements (the clobbered class, the blur landing
      after a paint); a third remains and the reporter still sees it. Recorded in
      `docs/research/13` with what has been ruled out, the leading untested hypothesis (Obsidian's
      own Live Preview re-render landing a frame after the blur, which the focus policy cannot
      reach), and the instrument that would distinguish them. The `requestAnimationFrame` change
      is KEPT — the frame it removes is a real defect independent of the symptom — with its one
      behavioural difference noted: rAF does not fire in a hidden window

## 8. PR #38 review round (2026-08-04)

- [x] 8.1 D11's gate was ALL-OR-NOTHING, so one range crossing a boundary made every other range
      block-extend — overriding D11 for ranges that had already answered "this is text". Ranges
      are planned independently now. Fixing it exposed a second bug the reviewer did not name:
      `moveVertically` is MOTION, not extension, so using it whole COLLAPSED the text range;
      corrected to keep the anchor and take its head with the goal column, as
      `@codemirror/commands`' own `extendSel` does
- [x] 8.2 Two doc comments still named `setTimeout` after the switch to `requestAnimationFrame`
- [x] 8.3 The spec's shrink algorithm still said "drop the root on the growing side", the rule
      the implementation abandoned. Restated as stepping the far-side candidate inward, with the
      measured counterexample for why root-dropping is not the inverse
- [x] 8.4 Task 1.2c carried the same rejected algorithm as a completed instruction
- [x] 8.5 The merge-edge e2e proved nothing: `afterThree.length <= afterTwo.length` passes for two
      unmerged ranges. Measured the real progression and asserted it exactly — two ranges, then
      TOUCHING and still two, then one merged range, then that range extending. Lengthened the
      fixture so the merge no longer coincides with the document end, which is what had made the
      final state unobservable
- [x] 8.6 Refocus stays a NARROW exclusion (copy), and the reviewer's suggested generalisation was
      tried and REVERTED. A positive "will this produce input" test breaks every command the host
      handles above CodeMirror's keymap: `runScopeHandlers` does not claim `Mod+Z`, so declining
      to focus dropped the keystroke and an edit made over a block selection could no longer be
      undone — caught by `62-outline-edit-enforcement` under mobile emulation, and now pinned by
      a dedicated scenario. The reviewer's own example does not reproduce either: measured, Escape
      IS claimed by `simplifySelection`, collapses the cover and leaves the mode cleanly, which
      the Escape scenario now asserts. The residual — an inert key such as F9 focusing with
      nothing to restore the blur — is recorded as a known limitation in the code

## 9. PR #38 second review round (2026-08-04)

All six suppressed comments were legitimate; two changed behavior.

- [x] 9.1 An exact cover was NOT always excluded by D11's content-line bounds. A leaf owning no
      trailing gap — a code fence with a node immediately after it, or one at the document end —
      has a cover that IS exactly its content lines (measured: `gap=0`, cover `2..4`, content
      `2..4`). It was read as text motion, so the opposite press fell through to stock extension
      and SHRANK inside the node. Covers are now rejected explicitly, before the bounds test
- [x] 9.2 Losing outline mode is a mode EXIT. `applyFocusPolicy` returned early when the note was
      no longer outline, leaving the transition flag stale and skipping the exit edge, so toggling
      the mode off over a block selection stranded the editor blurred — and `onDocumentKeyDown`
      then correctly declines, being off-mode, so nothing restored focus either
- [x] 9.3 Found while writing 9.1's test, not raised in review: at the sequence's end the handler
      DECLINED, and stock extension then moved a backward cover's head inward, shrinking it. The
      spec says the selection stays unchanged there, so the key is now consumed. `null` from the
      walk means both "not ours" and "nowhere left to go" and they need opposite answers; the
      adapter now separates them on node jurisdiction
- [x] 9.4 `applyFocusPolicy`'s doc comment still opened with "focused exactly when it is NOT [in
      the mode]", the invariant D9 had already replaced with the transition rule
- [x] 9.5 D8's own bullet still carried "shrinks by dropping the far root" — the rule the spec,
      tasks and Q31 had all been corrected away from, and the implementation abandoned
- [x] 9.6 The spec's earlier anchor-recovery sentence contradicted D8: it claimed a backward
      cover's end edge always identifies the anchor, which the ancestor swallow makes false.
      Rewritten to state the forward case as exact and defer the backward case to D8's rule
- [x] 9.7 The soft-wrap scenario returned early when the viewport did not wrap, so it could stay
      green without exercising wrapping. Now asserts at least two rendered rows

## 10. PR #38 third review round (2026-08-04)

All seven suppressed comments were legitimate; two changed behavior, and one of those was the
worst defect any round has found.

- [x] 10.1 A document EDGE was misread as intra-node row motion. `moveVertically` CLAMPS the head
      to its line's own start or end when there is nowhere to go, which lands inside the node —
      so pressing `⇧↑` in the FIRST node, or `⇧↓` in a final gapless one, fell through to stock
      extension and the anchor node's first cover became unreachable in that direction. On
      SINGLE-ROW nodes, where D11 should never fire at all. Measured: `0,0..0,5` and `2,5..2,10`
      character ranges where the spec requires a cover. D11 now requires the press to reach
      another ROW, compared by coordinates because rows are visual
- [x] 10.2 Out-of-jurisdiction ranges were not planned independently: a preamble cursor beside a
      range that advanced was returned UNCHANGED, silently suppressing its ordinary extension.
      "No jurisdiction" now classifies with "text motion" — both mean "not an outline gesture" —
      so a mixed selection moves it with the same anchor-preserving path, and the exhaustion
      branch can no longer swallow it
- [x] 10.3 Four documentation drifts, all describing behavior later rounds rejected: the handler's
      comment still said every-null falls through; `extendSelections`' contract still gave `null`
      one meaning; D11's *Cost* paragraph still claimed both meanings fall through to native,
      which is the exact regression 9.3 fixed; and task 2b.1 still prescribed both focus-policy
      choices D9 later reversed
- [x] 10.4 The undo scenario contradicted its own requirement — "taken to the nearest cover, and
      the press steps from there", where the rule says the anchor node's whole-subtree cover and
      that normalization IS the step
- [x] 10.5 Found by an intermittent mobile failure, and it was MINE rather than flaky. Before
      2b.2, `onDocumentKeyDown` focused BEFORE running the command, so the editor stayed focused
      through a delete-then-undo. The reorder removed that, leaving the editor blurred through the
      deletion with focus returning only on the deferred exit edge — racing the next keystroke,
      which this path drops because it only replays while the selection is a cover. `Mod+Z` is
      exactly such a keystroke, being unclaimed by the editor's keymap. The exit edge is now
      applied eagerly on the path that caused the exit. My earlier attribution of the same failure
      to the refocus whitelist rested on one passing run, which for an intermittent failure is
      not evidence

## 11. PR #38 fourth review round (2026-08-04)

- [x] 11.1 The exhaustion branch could still freeze a MIXED selection. `extendSelections` reports
      "nowhere to go" and "not in jurisdiction" identically, so a preamble cursor beside an
      exhausted outline range made every result `null` and the key was consumed before the
      stock-owned range got its vertical motion. A comment I had written here claimed such ranges
      could not reach this branch; they can, whenever the outline ranges beside them are
      exhausted. Consuming now requires that NO range is stock-owned; verified by negative control
- [x] 11.2 The mode's transition detector was never initialised. Chrome, highlight suppression and
      the mode class are all derived and so correct immediately, but focus is driven by
      TRANSITIONS — and none has happened yet when a view is constructed over an existing exact
      cover (plugin load, a reconfigure, a note reopened with its selection restored). Block
      chrome would show on a focused, raw-markdown editor until some later gesture moved the
      selection. The policy is now evaluated once at construction

## 12. PR #38 fifth review round (2026-08-04)

- [x] 12.1 The decoration spec promised "ENTERING the mode SHALL render no intermediate frame" —
      a normative guarantee contradicted by this change's OWN filed known issue, in which the
      reporter still sees a frame on the first switch and the cause is untested. Narrowed to what
      is verified: the mode's MARKER stays continuous, and the blur precedes the next paint. The
      residual is named in the requirement itself so the gap cannot be read as an oversight, and
      D9 now says outright that the class fix did not end the reported flicker
- [x] 12.2 `styles.css`'s comment still concluded "the fix is a scoped `::selection` override, not
      a decoration-layer suppression", immediately above a correction and a rule that DO suppress
      CM6's drawn layer. Restated as the single-range path, pointing at the second rule for the
      ranges the native selection cannot represent
