## 1. Gate: what the provider actually changes

Design D1 rests on one claim the spike did not put on the instrument, and one behaviour we are
about to take over. Nothing in section 3 onward is built until 1.4 records a verdict.

- [ ] 1.1 Throwaway `foldService` provider registered at `Prec.high` in the dev vault, answering
      from the cached parse for EVERY node with children. Verify through a probe spec that
      `foldable()` returns our range on a heading, on each list notation (bullet, ordered, task)
      and on a paragraph with attached children, and returns `null` on an atom, which can never
      be a parent — the same instrument
      `docs/research/24-fold-mechanics.md` used, which is `browser.executeObsidian` against the
      CM6 exports reached from the plugin instance
- [ ] 1.2 **The settings question.** Turn Obsidian's "Fold heading" and "Fold indent" OFF and
      re-run 1.1's fold path through the affordance, `editor:toggle-fold`, and a direct
      `foldEffect`. Record which of the three still works. If the native paths gate on the
      settings, the spec's "Folding works with Obsidian's own fold settings off" scenario is
      satisfied by our own commands and the native chevron degrades — say so in the note rather
      than discovering it in review
- [ ] 1.3 **What we take over.** Diff native fold extents against ours across the `test-vault/`
      corpus: heading sections (with and without a trailing gap), nested lists, a list under a
      paragraph, ordered lists, tasks.

      Atoms are not in the diff and do not need to be: `parse` gives them no children, so
      `foldable()` returns `null` and nothing changes for them. Any divergence that is not clearly an improvement is a reason to
      narrow D1's precedence, and that decision belongs here, not in review
- [ ] 1.4 Verdict appended to `docs/research/24-fold-mechanics.md` under a dated heading: what
      held, what did not, and whether D1 stands as written

## 2. Fold model

- [ ] 2.1 `src/plugin/fold-model.ts`: node → fold range (D2 — ends at the last descendant's last
      content line, trailing gaps stay visible), node → hidden-descendant count, and line →
      nearest foldable node at or above it (the escalation the commands use). Pure functions over
      the parsed tree, unit-tested in `tests/` against fixture documents; negative control —
      returning the subtree cover INCLUDING the trailing gap must fail the gap test
- [ ] 2.2 `foldService` provider built on 2.1, registered from `main.ts`, gated on outline mode
      exactly as the other editor extensions are. Verify with an e2e that a paragraph with
      attached children folds through Obsidian's own `editor:toggle-fold`; negative control —
      unregistering the provider must make that test fail
- [ ] 2.3 Fold-state read/write helpers (`is this node folded`, `fold`, `unfold`, `toggle`) over
      `foldedRanges` / `foldEffect` / `unfoldEffect`, so no call site touches CM6's fold API
      directly. Verify a fold produces no document change and no undo entry (spec: "Folding
      leaves the document byte-identical")

## 3. Commands and hotkeys

- [ ] 3.1 Fold node, unfold node, toggle fold — resolving the operand through
      `selection-structural-ops` and escalating to the nearest ancestor with children (D3).
      Default hotkeys `Mod+Alt+ArrowUp` / `Mod+Alt+ArrowDown` / `Mod+Alt+Period`, declared in
      `addCommand` so Settings > Hotkeys can rebind them. Verify with an e2e per scenario in
      `outline-folding`, including the leaf-escalation one; negative control — removing the
      escalation must fail the "toggle from a leaf" test
- [ ] 3.2 A caret inside the range about to be hidden moves to the folded node's line, and any
      operation that would place the caret inside a folded range opens that fold first (spec: "A
      caret never lands inside hidden content"). Verify both directions in one e2e
- [ ] 3.3 Fold all / unfold all / fold one level more / fold one level less, scoped to the zoom
      scope when one is active. Verify fold-all reaches a paragraph with children, which
      Obsidian's own fold-all does not; negative control — delegating to `editor:fold-all` must
      fail that test
- [ ] 3.4 Commands declined outside outline mode and under a multi-range selection, matching the
      structural commands' rule. Verify with `commandAvailable`

## 4. Fold state through structural operations

- [ ] 4.1 Capture-and-reapply in the structural dispatch path (D4): fold state of the operand's
      subtree recorded as node paths before the change, re-applied from the operation's own
      result paths, in the SAME transaction as the edit and the selection
- [ ] 4.2 E2E per scenario in the `editor-structural-commands` delta: move a folded node, move a
      node containing folded children, group-move a mixed selection, indent and outdent a folded
      node. Negative control — dropping the reapply must fail the move test while leaving the
      indent test passing, which is exactly the asymmetry
      `docs/research/24-fold-mechanics.md` measured
- [ ] 4.3 Undo after a move restores both the text and the fold state as one step. Verify by
      folding, moving, undoing, and reading both

## 5. Affordance and folded-state chrome

- [x] 5.1 Folded-marker treatment chosen from `docs/research/24-fold-marker-mockup.html`: the
      kind's own glyph in a solid weight, plus the count. Design D6 records why the six
      alternatives lost
- [ ] 5.2 The solid-weight folded marker in `decorations.ts` + `styles.css`: same glyph, same box,
      both themes, nothing drawn around it. Verify with an e2e asserting the folded and unfolded
      marks differ in a stated property and NOT in their box (the never-assert-glyph-widths rule
      applies — assert the relationship, not pixels)
- [ ] 5.3 Hidden-descendant count as a widget after the node's text, `contenteditable="false"`,
      absent from copied text. Settle where it sits when the text wraps (design — Open Questions). Verify by folding a node with a nested subtree, copying it, and
      asserting the clipboard has no count; negative control — rendering the count as document
      text must fail it
- [ ] 5.4 Our own fold affordance wherever a foldable line has no native chevron (D5) — today
      the paragraph — in the marker column, with the native chevron's hover/persist behaviour.
      Verify exactly one affordance per foldable line, the same column for every kind, and none
      on a table; the one-affordance-per-line assertion is what catches a double-draw on
      headings
- [ ] 5.5 Mobile pass: the affordance is reachable without hover, on a touch target that is not
      the 14px glyph. Verify under `--mobile`

## 6. The guide gesture

- [ ] 6.1 Extend `zoom-click.ts`'s capture-phase `pointerdown` (D7): mark first, then guide
      column by x-offset against `depth × unit`, within a tolerance narrower than half a unit and
      never on the node's own text. No new listener
- [ ] 6.2 Toggle semantics per the spec — any child unfolded means fold them all; all folded
      means unfold — acting on the children of the node the guide belongs to
- [ ] 6.3 E2E: a click on the band folds the branch; a second click reopens it; a click past the
      tolerance places a caret and folds nothing; with guides turned off nothing folds. Negative
      control — widening the tolerance past half a unit must fail the caret test
- [ ] 6.4 Mobile run of 6.3, since the hit band may need to be wider there (design — Open
      Questions). Record the answer

## 7. Persistence

- [ ] 7.1 Verify (do not build) that fold state round-trips through Obsidian's own fold manager
      once the provider is registered, including a fold on a paragraph: close the leaf, reopen,
      assert the same folds. This is the measured behaviour; the task is the test that keeps it
- [ ] 7.2 The setting (D8), default ON, declared in both places `TrueOutlinerSettingTab` requires.
      With it OFF, a note's editor opens with our jurisdiction unfolded. Verify both states;
      negative control — ignoring the setting must fail the OFF test
- [ ] 7.3 Assert the note file is byte-identical after folding, unfolding and saving — the
      clean-files invariant, stated as a test rather than as a promise

## 8. Backlinks footer

- [ ] 8.1 Row fold state keyed by node id in `ViewState`, so a row that HAS a subtree keeps its
      affordance after expansion (D9) — the `truncatable` shape, for the same reason
- [ ] 8.2 Delete `to-backlinks-fold` and its `styles.css` rule; the row's affordance becomes the
      editor's fold chrome, and a folded row's marker takes the folded treatment from 5.2
- [ ] 8.3 E2E per the `backlinks-footer` delta: an expanded row folds again, and a folded row is
      distinguishable from a leaf. Negative control — restoring the `foldedCount > 0` condition
      must fail the fold-again test

## 9. Editing grammar

- [ ] 9.1 Enter at the end of a folded node creates a sibling after the whole subtree with the
      fold intact; Enter mid-text and a merging Backspace unfold first (`outline-keyboard-grammar`
      delta). Verify each as its own e2e; negative control — removing the folded-node branch must
      reproduce the measured behaviour, where the new node lands inside the revealed subtree
- [ ] 9.2 Confirm deletion needs no new rule: a selection covering a folded node still escalates
      to the whole subtree through `node-edit-enforcement`. A test, not a change

## 10. Land

- [ ] 10.1 Full e2e sweep, desktop and mobile, via a pushed checkpoint; `.obsidian-cache/e2e-summary.json`
      clean
- [ ] 10.2 Add the folding group's label to `scripts/spec-groups.mjs` so the new decade reports
      under a name rather than its prefix
- [ ] 10.3 Manual pass in a real vault against the proposal's bullets, one by one, including the
      two the measurements found (a moved folded node, Enter on a folded node)
- [ ] 10.4 Update `docs/research/12-decoration-follow-ups.md`: close the guide-click entry, the
      footer fold-chrome entry and the one-way-row-fold entry, and record anything this change
      deliberately left in the parking lot
- [ ] 10.5 `openspec validate better-folding-ux --strict`
