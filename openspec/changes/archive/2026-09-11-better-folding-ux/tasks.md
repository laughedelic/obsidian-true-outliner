## 1. Gate: what the provider actually changes

Design D1 rests on one claim the spike did not put on the instrument, and one behaviour we are
about to take over. Nothing in section 3 onward is built until 1.4 records a verdict.

- [x] 1.1 Throwaway `foldService` provider registered at `Prec.high` in the dev vault, answering
      from the cached parse for EVERY node with children. Verify through a probe spec that
      `foldable()` returns our range on a heading, on each list notation (bullet, ordered, task)
      and on a paragraph with attached children — the same instrument
      `docs/research/28-fold-mechanics.md` used, which is `browser.executeObsidian` against the
      CM6 exports reached from the plugin instance
- [x] 1.2 **What survives our `null`.** Declining to answer is not a veto: `foldable()` falls
      through to the providers below us and then to syntax folding. Probe every atom kind — code
      fence, table, callout, quote, raw HTML, rule — and record which the editor still calls
      foldable. Measured already for the PR-review pass: raw HTML is one, and no chevron is
      painted for it. The rule that follows is stated in `outline-folding` and
      `outline-decorations` — our affordance follows OUR fold, never the editor's — so this task
      is the test that keeps it, plus a check that nothing we draw appears on such a line

- [x] 1.3 **The settings question — UNRESOLVED, and recorded as such.** Driving "Fold heading"
      and "Fold indent" from the harness produced three mutually exclusive readings, including one
      where the configuration plainly never applied (docs/research/28 has the table).
      `vault.setConfig` + `updateOptions()` is not equivalent to changing the setting in
      Obsidian's own UI. No code reads those settings and no spec now claims anything about them;
      the affordance test removes Obsidian's indicators from the DOM instead, which is the same
      condition and deterministic. Answering it properly needs the manual pass (10.3)
- [x] 1.4 **What we take over.** Diff native fold extents against ours across the `test-vault/`
      corpus: heading sections (with and without a trailing gap), nested lists, a list under a
      paragraph, ordered lists, tasks.

      Atoms are covered by 1.2, not here: we answer `null` for them, so what matters is what
      the editor still does underneath us, not what changes. Any divergence that is not clearly an improvement is a reason to
      narrow D1's precedence, and that decision belongs here, not in review
- [x] 1.5 Verdict appended to `docs/research/28-fold-mechanics.md` under a dated heading: what
      held, what did not, and whether D1 stands as written

## 2. Fold model

- [x] 2.1 `src/plugin/fold-model.ts`: node → fold range (D2 — ends at the last descendant's last
      content line, trailing gaps stay visible), node → hidden-descendant count, and line →
      nearest foldable node at or above it (the escalation the commands use). Pure functions over
      the parsed tree, unit-tested in `tests/` against fixture documents; negative control —
      returning the subtree cover INCLUDING the trailing gap must fail the gap test
- [x] 2.2 `foldService` provider built on 2.1, registered from `main.ts`, gated on outline mode
      exactly as the other editor extensions are. Verify with an e2e that a paragraph with
      attached children folds through Obsidian's own `editor:toggle-fold`; negative control —
      unregistering the provider must make that test fail
- [x] 2.3 Fold-state read/write helpers (`is this node folded`, `fold`, `unfold`, `toggle`) over
      `foldedRanges` / `foldEffect` / `unfoldEffect`, so no call site touches CM6's fold API
      directly. Verify a fold produces no document change and no undo entry (spec: "Folding
      leaves the document byte-identical")

## 3. Commands and hotkeys

- [x] 3.1 Fold node, unfold node, toggle fold — resolving the operand through
      `selection-structural-ops` and escalating to the nearest ancestor with children (D3).
      Default hotkeys `Mod+Alt+ArrowUp` / `Mod+Alt+ArrowDown` / `Mod+Alt+Period`, declared in
      `addCommand` so Settings > Hotkeys can rebind them. Verify with an e2e per scenario in
      `outline-folding`, including the leaf-escalation one; negative control — removing the
      escalation must fail the "toggle from a leaf" test
- [x] 3.2 A caret inside the range about to be hidden moves to the folded node's line, and any
      operation that would place the caret inside a folded range opens that fold first (spec: "A
      caret never lands inside hidden content"). Verify both directions in one e2e
- [x] 3.3 Fold all / unfold all / fold one level more / fold one level less, scoped to the zoom
      scope when one is active. Verify fold-all reaches a paragraph with children, which
      Obsidian's own fold-all does not; negative control — delegating to `editor:fold-all` must
      fail that test
- [x] 3.4 Commands declined outside outline mode and under a multi-range selection, matching the
      structural commands' rule. Verify with `commandAvailable`

## 4. Fold state through structural operations

- [x] 4.1 The carry as a transaction filter (D4, revised): every fold restated from the lines it
      hid, with indentation ignored, following them wherever the change put them and opening when
      they are gone. Covers both dispatch sites at once, because both produce ordinary
      transactions. The second spec must be marked `sequential` or its effects are mapped through
      the change set twice
- [x] 4.1a No `invertedEffects` after all (D4a, revised): folding stays out of the history
      entirely, and undo restores a fold because undoing a move re-inserts the same hidden lines,
      which 4.1's rule follows. Verified by an e2e that folds, moves, undoes and REDOES, reading
      text and fold state at each step
- [x] 4.2 E2E per scenario in the `editor-structural-commands` delta: move a folded node, move a
      node containing folded children, group-move a mixed selection, indent and outdent a folded
      node. Negative control — dropping the reapply must fail the move test while leaving the
      indent test passing, which is exactly the asymmetry
      `docs/research/28-fold-mechanics.md` measured
- [x] 4.3 One undo step still means one: a folded node moved and undone restores text, selection
      and fold together, with no intermediate state where the text has moved back and the fold has
      not. `structural-history-integration` is the contract this must not break

## 5. Affordance and folded-state chrome

- [x] 5.1 Folded-marker treatment chosen from `docs/research/28-fold-marker-mockup.html`: the
      kind's own glyph in a solid weight, plus the count. Design D6 records why the six
      alternatives lost
- [x] 5.2 The solid-weight folded marker in `decorations.ts` + `styles.css`: same glyph, same box,
      both themes, nothing drawn around it. Verify with an e2e asserting the folded and unfolded
      marks differ in a stated property and NOT in their box (the never-assert-glyph-widths rule
      applies — assert the relationship, not pixels)
- [x] 5.3 Hidden-descendant count as a widget after the node's text, `contenteditable="false"`,
      absent from copied text. Settle where it sits when the text wraps (design — Open Questions). Verify by folding a node with a nested subtree, copying it, and
      asserting the clipboard has no count; negative control — rendering the count as document
      text must fail it
- [x] 5.3a The count becomes the line's ONLY tail control (D6b): it carries the placeholder's
      ellipsis and its click, and Obsidian's own placeholder is hidden wherever ours is drawn.
      Verify that a folded line shows exactly one control after its text and that clicking it
      unfolds; negative controls — leaving the native placeholder visible, and a count that takes
      no click, must each fail one of those
- [x] 5.4 Our own fold affordance wherever a node we fold has no native chevron (D5). Task 1.3
      measured where that is: NOT the default configuration, where Obsidian's indicator follows
      the provider onto every line we claim — but with "Fold heading" and "Fold indent" off,
      where it paints none anywhere. Verify in both configurations: exactly one affordance per
      foldable line in each, the same column for every kind, and none on a table or on a line
      only the editor calls foldable. The one-affordance-per-line assertion is what catches a
      double-draw on headings
- [x] 5.5 Mobile pass: the affordance is reachable without hover, on a touch target that is not
      the 14px glyph. Verify under `--mobile`

## 6. The guide gesture

- [x] 6.1 Extend `zoom-click.ts`'s capture-phase `pointerdown` (D7): mark first, then guide
      column by x-offset against `depth × unit`, within a tolerance narrower than half a unit and
      never on the node's own text. No new listener
- [x] 6.2 Toggle semantics per the spec — any child unfolded means fold them all; all folded
      means unfold — acting on the children of the node the guide belongs to
- [x] 6.3 E2E: a click on the band folds the branch; a second click reopens it; a click past the
      tolerance places a caret and folds nothing; with guides turned off nothing folds. Negative
      control — widening the tolerance past half a unit must fail the caret test
- [x] 6.4 Mobile run of 6.3, since the hit band may need to be wider there (design — Open
      Questions). **Answer: no.** Every case passes under mobile emulation at the desktop
      tolerance — the gesture is a `pointerdown` on a column, not a drag, and a third of a unit is
      already wider than a touch's own precision on the outline's grid. Left as one number for
      both, and the spec states a tolerance rather than a platform

## 7. Persistence

- [x] 7.1 Verify (do not build) that fold state round-trips through Obsidian's own fold manager
      once the provider is registered, including a fold on a paragraph: close the leaf, reopen,
      assert the same folds. This is the measured behaviour; the task is the test that keeps it
- [x] 7.2 The setting (D8), default ON, declared in both places `TrueOutlinerSettingTab` requires.
      With it OFF, a note's editor opens with our jurisdiction unfolded. Verify both states;
      negative control — ignoring the setting must fail the OFF test
- [x] 7.3 Assert the note file is byte-identical after folding, unfolding and saving — the
      clean-files invariant, stated as a test rather than as a promise

## 8. Backlinks footer

- [x] 8.1 Row fold state keyed by node id in `ViewState`, so a row that HAS a subtree keeps its
      affordance after expansion (D9) — the `truncatable` shape, for the same reason
- [x] 8.2 Delete `to-backlinks-fold` and its `styles.css` rule; the row's affordance becomes the
      editor's fold chrome, and a folded row's marker takes the folded treatment from 5.2. The
      chrome is what changes, never the semantics: the control stays a real `button` with an
      accessible label and an `aria-expanded` that tracks BOTH states, since a footer row has no
      keyboard command behind it the way an editor line does
- [x] 8.3 E2E per the `backlinks-footer` delta: an expanded row folds again, a folded row is
      distinguishable from a leaf, and the control is reachable by Tab and operable by Enter and
      Space with `aria-expanded` correct in both states. Negative controls — restoring the
      `foldedCount > 0` condition must fail the fold-again test, and swapping the `button` for a
      non-interactive element must fail the keyboard test

## 9. Editing grammar

- [x] 9.1 Enter at the end of a folded node creates a sibling after the whole subtree with the
      fold intact; Enter mid-text unfolds first. A MERGE turned out to need no rule — the general
      "a fold follows the lines it hid" rule already carries the children to the node that now
      owns them, and the spec was revised rather than the code bent to it
      (`outline-keyboard-grammar` delta). Verify each as its own e2e; negative control — removing the folded-node branch must
      reproduce the measured behaviour, where the new node lands inside the revealed subtree
- [x] 9.2 Confirm deletion needs no new rule: a selection covering a folded node still escalates
      to the whole subtree through `node-edit-enforcement`. A test, not a change

## 10. Land

- [x] 10.1 Full e2e sweep, desktop and mobile, via a pushed checkpoint; `.obsidian-cache/e2e-summary.json`
      clean. The folding group itself runs clean on both locally (7 spec files, 40 tests); the
      whole matrix is CI's to prove on the pushed checkpoint
- [x] 10.2 Add the folding group's label to `scripts/spec-groups.mjs` so the new decade reports
      under a name rather than its prefix
- [x] 10.3a What the manual pass found, fixed with a test and a negative control each: a native
      fold closing over the caret is reopened by the reveal rule (D4 note) — the caret moves out
      instead; a multi-line node's tail control resolved no node; the chevron is anchored on the
      midpoint between guide and marker for both controls (D5); the footer's chevron pointed up
      when folded; and one visual language for marker and chevron across kinds (D6c)
- [x] 10.3b Second manual round: the native chevron's horizontal place measured per line, on
      the vault note that showed it wandering (a folded paragraph takes Obsidian's list padding,
      the caret's line none, so one global sample put every paragraph's chevron onto its icon or
      a level away); the folded marker's treatment is contrast alone, not a heavier stroke, which
      a heading's filled glyph could not carry. Tests and negative controls for both
- [x] 10.3c Third manual round: Up/Down step over a folded node instead of opening it (our raw-line
      walk landed on the first hidden line, and CodeMirror's fold state dropped the fold there),
      and Shift+Down keeps it folded (the reveal rule counted the fold's own end as hidden);
      leaving a zoom folds again what it opened (D7a, an `outline-zoom` delta); the guide gesture
      shows its band under the pointer. Tests and negative controls for each
- [x] 10.3d Fourth manual round: a fold outside a zoom painted its collapsed indicator on the
      scope's edge (opened for the zoom, restored on leaving); the guide gesture names its owner
      by the level the zoom draws it at, takes a press left of the line box, keeps its band after
      the press that folds under it, and reaches nearly half a unit to the left. Tests and negative
      controls for each
- [x] 10.3e Fifth manual round: the lit guide is editor state painted by the decoration pass
      (a per-line style was rewritten by every rebuild), thickened under the caret's accent and
      through the gap above a first child; the hand is on the editor root; a guide press with
      nothing to fold no longer places the caret. Tests and negative controls
- [x] 10.3 Manual pass in a real vault against the proposal's bullets, one by one, including the
      two the measurements found (a moved folded node, Enter on a folded node) — and the one the
      harness could not settle: fold with Obsidian's "Fold heading" and "Fold indent" turned off
      in the real settings UI, which is the only place they can be trusted to apply (task 1.3).
      Five rounds (10.3a–e above), each against a real vault note, closed with the reader's own
      sign-off
- [x] 10.4 Update `docs/research/12-decoration-follow-ups.md`: close the guide-click entry, the
      footer fold-chrome entry and the one-way-row-fold entry, and record anything this change
      deliberately left in the parking lot
- [x] 10.5 `openspec validate better-folding-ux --strict`
