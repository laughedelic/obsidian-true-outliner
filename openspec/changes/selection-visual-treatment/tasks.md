## 1. Cover-membership query (`src/escalate.ts`)

- [x] 1.1 Add a pure `coveredSubtreeRoots(doc, range): OutlineNode[] | null` query:
      returns the ordered top-level subtree roots a non-empty range exactly covers
      (single node, or a contiguous sibling run), or `null` if the range isn't an exact
      cover. Reuses `startLineOf`/`subtreeCoverOf`/`subtreeContentEnd`, no new
      tree-walking logic.
- [x] 1.2 Empty ranges (cursors) and preamble-jurisdiction ranges always return `null`.
- [x] 1.3 Unit tests in `tests/escalate.test.ts` (or a sibling file): single-node exact
      cover, multi-sibling exact cover, partial-content non-cover, cursor, preamble
      range — mirroring the existing property-test style for escalation.

## 2. Selection-decoration ViewPlugin (`src/plugin/decorations.ts`)

- [x] 2.1 Add a `SelectionDecorationPlugin` (`PluginValue`) following the exact
      construction pattern of `DecorationsPlugin`/`MarkersPlugin`: outline-mode gated via
      `editorInfoField`, nested-editor guarded via `isNestedEditor`, recomputed on every
      `update()`.
- [x] 2.2 Compute its `DecorationSet` by calling `coveredSubtreeRoots` for each non-empty
      range in `view.state.selection.ranges`, then building a
      `Decoration.line({ class: 'to-decor-node-selected' })` for every real `.cm-line`
      spanned by each returned cover (own lines, descendants, and interior gap lines
      between covered siblings — using the same line span the matched range itself
      reports, via the shared `selectedNodeLines` helper).
- [x] 2.3 Register the plugin's `provide` alongside the existing three in the
      extension-assembly function at the bottom of the file.
- [x] 2.4 Extend `MarginCompensation`'s existing widget-atom DOM-patch pass (tables,
      callouts, HTML, hr) to also toggle the `to-decor-node-selected` class on a mounted
      widget element when it falls within a covered range — reusing that pass's
      idempotence/no-thrash guard rather than adding a fifth plugin.

## 3. Styling (`styles.css`)

- [x] 3.1 Add `to-decor-node-selected` chrome (background/border), following the
      existing `--to-*`/`to-decor-*` naming convention, layered under text (`z-index:
      -1`). (Superseded by section 6: native selection is now suppressed rather than
      layered with the chrome, per user review.)
- [x] 3.2 Verify composition with existing indentation (`to-decor-block`/`to-decor-atom`/
      `to-decor-list`), guide-line gradients (`to-decor-guides`), and marker gutter
      styling — no layer should visually disappear when the new class is also present.
      (Confirmed by e2e coverage in section 4, which exercises the chrome together
      with indented/guided/widget lines.)

## 4. Coverage

- [x] 4.1 New e2e spec `e2e/specs/63-selection-visual-treatment.e2e.ts`: escalated
      drag-past-boundary gets chrome; native whole-line-text match gets chrome;
      within-node partial selection gets none; cursor gets none; multi-range selection
      (uniform escalation, each range independently); off-mode note gets no chrome.
      (The spec's originally-envisioned "one covering + one partial range in the SAME
      selection" scenario is unreachable through the real filter — the uniform
      multi-range rule always forces every range to at least its own node's cover once
      any range escalates — so that mixed case is unit-tested instead, at
      `coveredSubtreeRoots`'s own per-range level in tests/escalate.test.ts.)
- [x] 4.2 Extend the e2e spec with a widget-replaced-atom fixture (table) inside an
      escalated cover, verifying the DOM-patch path applies the chrome class, alongside
      the declarative path on the heading/paragraph in the same selection; plus a
      regression check that the class clears once the selection no longer covers it.
- [x] 4.3 Manual visual pass (screenshots via the e2e harness, both bundled themes):
      nested-list + guides + gap-line-trigger, a heading section spanning a table, a
      single-leaf gap-trigger, and an exact single-line leaf match. Both open design
      questions confirmed reading as intended (gap-line chrome reinforces ownership;
      leaf-match reads as signal, not noise) — see design.md's "Open Questions —
      resolved." Surfaced one real, previously-unanticipated finding at the time: a
      table's own chrome box was only as wide as its rendered content, a visible
      "notch" — initially parked in docs/research/12's "Known gaps," then actually
      FIXED (not just diagnosed) by section 6 below as a side effect of the
      root-anchoring redesign; the docs/research/12 entry was removed once resolved.

## 5. Validation

- [x] 5.1 `npm run test` (287 passed) and the full e2e suite pass. (Two pre-existing
      e2e failures — `53-decoration-contracts` and `60-transaction-classification`'s
      table-drag-handle interactability — reproduce identically on a clean stash of
      this change, confirmed unrelated.)
- [x] 5.2 `npm run build` (tsc --noEmit), `tsc --noEmit -p e2e`, and `npm run lint` all
      pass clean.

## 6. User review follow-up: native selection, root-anchored geometry

User review of the first version's screenshots surfaced three real problems: native
character-level selection visually overlapped the chrome (confusing, competing cues);
block-selection background was missing under nested content's own indentation for
lists/code/callouts/tables/blockquotes; and block-selection didn't respect outline
structure (selecting an H3 section should tint from H3's own column, not reach into
H1/H2's territory). All three traced to the same root design gap: chrome was anchored
to each line's OWN box (`inset: 0`) instead of the covered subtree's ROOT column.

- [x] 6.1 Add `plainOwnShiftExpr(fact)` (decorations.ts) — extracted shared helper for
      "how far has this line's own box been shifted," replacing the inline duplicated
      logic in `lineDecoration()`.
- [x] 6.2 Replace `selectedNodeLines` (a `Set<number>` of covered lines) with
      `selectedLineRootTargets(state): ReadonlyMap<number, string>` — maps each covered
      line to its cover's ROOT column expression (`calc(rootDepth * UNIT)` for a
      block/atom/heading root, or the root's own line-shift for a list-item root, which
      has no additive column of its own — list guides are already deferred to native
      rendering).
- [x] 6.3 `computeSelectionDecorations` sets `--to-selected-left: calc(rootTarget -
      thisLine'sOwnShift)` per line, verified CM6's `combineAttrs` actually merges style
      strings (not just classes) across independent line decorations at the same
      position before relying on it (checked `@codemirror/view`'s own source, not
      assumed).
- [x] 6.4 `MarginCompensation`'s widget-atom loop computes the same `--to-selected-left`
      using its OWN live-measured `ownShiftExpr` (more precise than the generic formula)
      against the shared root target.
- [x] 6.5 `styles.css`: `to-decor-node-selected::before`'s `left` changed from `0`
      (`inset: 0`) to `var(--to-selected-left, 0px)`; added explicit `width: auto` after
      a real regression was found live — Obsidian's native `.HyperMD-quote::before`
      (blockquote side-bar) sets `width: 1px`, which silently won the cascade for that
      one unset property, shrinking the whole chrome box to an invisible sliver on any
      blockquote line. Extended the existing widget-atom `contain: none !important;
      overflow: visible !important` override to include `.to-decor-node-selected`
      (needed now that the chrome reaches outside a widget's own box, same reason
      guides/markers already needed it). (This was NOT actually the fix for the table
      "notch" from section 4.3, despite looking like it at the time — see section 8,
      which found and fixed the real cause: a widget-specific right-edge overhang.)
- [x] 6.6 Add `allRangesCovered(state): boolean` and toggle `to-decor-block-selecting`
      on `view.dom` (`SelectionDecorationPlugin`). Investigated live which mechanism
      actually renders Obsidian's selection (CM6's `drawSelection()` background layer
      never mounts here — confirmed via the e2e harness, not assumed) before writing
      the fix: a scoped `.cm-editor.to-decor-block-selecting .cm-content ::selection {
      background-color: transparent; color: inherit; }` in styles.css.
- [x] 6.7 New e2e coverage in `63-selection-visual-treatment.e2e.ts`: native-selection
      suppression (covered/partial/cursor/off-mode, 4 scenarios); root-anchored
      geometry across a heading root with a nested list/blockquote/code-fence
      descendant, verifying every covered line's resolved chrome position shares one
      absolute column and shallower ancestors get none; a dedicated blockquote
      width-regression guard.
- [x] 6.8 Fresh manual visual pass confirming all three fixes together (nested list,
      table-in-section, and a genuinely mixed H1>H2>H3>{list,blockquote,code} fixture),
      both themes — one clean rectangle, no native-highlight overlap, correctly bounded
      on the left.
- [x] 6.9 Re-ran full unit suite (287 passed), typecheck (main + e2e), lint, and the
      full e2e suite (79+ passing across all decoration/selection/edit-enforcement
      specs) — no regressions from this round's changes.

## 7. Second round of user review: marker clearance, the real table notch, color, two deferred findings

A second round of screenshots surfaced four more items: the chrome's left edge ran
through the middle of the covered root's own marker icon (compare Logseq's convention —
block selection there is wider on the left, reaching the next level, not the node's own);
the table notch from section 4.3/6.5 was still visible despite the `contain: none` fix;
the chrome color (an accent tint at low opacity) was hard to see and not obviously
theme-consistent; and, incidentally, two things the user flagged as worth a cursory
look but not necessarily in scope — a Minimal-theme base-indentation issue, and a
gap-line escalation question.

- [x] 7.1 `selectedLineRootTargets` now targets the PARENT's column (one level shallower
      than the root's own — `calc((rootDepth - 1) * UNIT)`, or the root's own line-shift
      minus one `UNIT` for a list-item root), not the root's own column. Clears the
      root's own marker (centered on its own column) instead of bisecting it.
- [x] 7.2 Chrome color: `MarginCompensation.measureSelectionColor()` resolves
      `--text-selection` live (from `contentDOM`, never itself `.is-selected`) into a new
      `--to-selected-bg` property, consumed by the chrome rule instead of a direct
      `var(--text-selection)` reference. A real bug found live: Obsidian's own
      `.cm-table-widget.is-selected { --text-selection: transparent; }` (avoiding a
      double selection render inside table cells) silently inherited into the chrome too
      when referenced directly, since a `var()` reference re-resolves at its use site,
      not where an ancestor last set it — made the chrome fully invisible on any table
      under an escalated selection, found only via a live pixel-color check (the
      computed CSS values looked completely correct).
- [x] 7.3 The real table-notch fix: `MarginCompensation`'s widget loop computes
      `--to-selected-right` per widget by live-measuring a reference plain line's own
      right edge (`nativeContentRightPx`, mirroring `nativeMarginBasePx`'s pattern) and
      pulling the widget's own (wider) box in to match. Two real bugs caught while
      building this (see design.md's own doc comment on this decision for the full
      story): a wrong assumption that a positioned descendant's containing block is
      inset by PADDING (it's inset by BORDER width only), and a sign error (CSS `right`
      pushes INWARD as it increases, the opposite of `left`) that an extreme-value sanity
      test (`-300px` looking identical to `-16px`) exposed.
- [x] 7.4 Cursory investigation of two items flagged for "record if extensive, fix if
      obvious" — both diagnosed live, neither obvious/low-risk, both deferred:
      - Minimal theme (kepano's, confirmed already present in the test vault via the
        existing e2e infrastructure, activated via `obsidianPage.setTheme('Minimal')`):
        boxed atoms (callouts, code blocks) overflow the reading column once indented at
        all — a base-indentation issue (`MarginCompensation`), not this change's own
        scope. Full diagnosis in docs/research/12's "Known gaps."
      - A same-node selection reaching a node's own text doesn't yet include that node's
        owned trailing gap — only dragging INTO the gap does. This is
        `node-selection-enforcement`'s own escalation math (`D4`'s
        `subtreeContentEnd`), a different capability's spec — not touched here. Full
        diagnosis in docs/research/13's "Escalation math re-examination candidate."
- [x] 7.5 Re-ran full unit suite, typecheck, lint, and the targeted e2e specs
      (63/50/51/52) plus a dedicated visual pass across four fixtures (top-level,
      nested-heading-with-marker, table, and the full mixed H1>H2>H3>{list,blockquote,
      code} fixture) confirming all of 7.1–7.3 together, both bundled themes — no
      regressions.

## 8. Third round of user review: blockquote border, code-block tinting

A third round of live screenshots surfaced one confirmed bug (not experimental) and one
user-flagged "experiment, might be reverted" request that turned out to be a genuine,
root-cause-understood correctness fix rather than something fragile.

- [x] 8.1 Blockquote regression: a selected blockquote's native colored side-bar (a
      `border-inline-start` on the same `::before` this rule's `left` also targets) was
      visibly dragged out to wherever the chrome's own `left` pointed — the broader the
      selection, the further displaced. A first fix (`border-inline-start: none`, the
      same technique as the earlier `width: 1px` leak) stopped the relocation but traded
      it for a different regression on user re-review: the bar just vanished entirely
      while selected, instead of staying at its own native position. The real fix
      reproduces the bar as a `background-image` (flat-color `linear-gradient`) sized
      from Obsidian's own `--blockquote-border-thickness`/`--blockquote-border-color`
      variables (confirmed live via `document.styleSheets` that native's rule references
      these directly — no separate JS measurement needed), positioned via
      `background-position-x: calc(-1 * var(--to-selected-left))` — since a
      background-image's position (unlike a border) isn't tied to the box's own edge,
      this lands the stripe back at its native absolute position regardless of how far
      the box itself shifts for any given cover. Scoped to a `.HyperMD-quote`-specific
      rule layered on the shared one (which now uses `background-color`, not the
      `background` shorthand, so it doesn't reset this layer). New e2e regression
      coverage (`blockquoteStripeAbsoluteX`/`blockquoteStripeWidthPx` helpers,
      `63-selection-visual-treatment.e2e.ts`) confirms the stripe's absolute position is
      IDENTICAL across two covers with very different shift amounts on the same
      blockquote line, sits well clear of the chrome's own left edge (not fused with it),
      and never appears on non-blockquote lines.
- [x] 8.2 Code-block tinting (user-flagged experiment): investigated why a selected code
      fence showed no chrome tint at all while a selected callout already did, despite
      both measuring correct `background-color`/`z-index: -1` on the chrome pseudo.
      Root cause: `position: relative` with `z-index: auto` (this rule's original
      declaration) never makes a line its own stacking-context root, so its `z-index: -1`
      pseudo hoists to whichever ANCESTOR establishes one and paints behind everything
      there — including this same line's own opaque background (a code line sets one
      directly; a callout's colored background lives on a nested child, not the widget's
      own box, so it never competed the same way). Fixed with one added property,
      `z-index: 0`, alongside the existing `position: relative` — confirmed live
      (screenshot across callout/code/blockquote/list/table together, both themes) with
      no regressions to any other kind. New e2e regression coverage asserts the
      resolved `z-index` directly (a computed-background-color check alone wouldn't have
      caught this bug, since that value looked correct even while the paint order was
      wrong).
- [x] 8.3 Re-ran full unit suite (287 passed), typecheck (main + e2e), lint, the full
      `63-selection-visual-treatment` spec (19 passing after 8.1's corrected fix), and the
      broader decoration suite (50/51/52 all passing; 53's one failure is the
      pre-existing, already-documented table-drag-handle flake from section 5.1,
      unrelated) — no regressions from either fix.
- [x] 8.4 On user re-review, 8.1's first attempt (discarding the border via
      `border-inline-start: none`) was found too blunt — the bar shouldn't just vanish
      while selected. Corrected as described in 8.1 above (reproduced via a positioned
      `background-image` instead of a border); re-validated with the corrected e2e
      coverage.
- [x] 8.5 Visual-polish experiment (user-gated "only if simple"): a slim border + slight
      corner rounding around the selection rectangle. Prototyped the direct approach —
      `border`/`border-radius` on the existing shared chrome rule — and found it live via
      screenshot: since that rule is a SEPARATE `::before` per covered LINE, not one box
      for the whole cover, this produces a visibly wrong result (a stack of individually
      rounded/bordered boxes with a double-seam at every line boundary, not one clean
      rectangle). A correct version needs each line to know if it's the first/last line
      of its own cover — new state needing threading through both the declarative CM6
      path and the widget DOM-patch path, plus new edge-case coverage (multi-range
      selections, a widget atom as a cover's first/last line) — crossing out of "simple"
      per the user's own stated bar. Reverted; not implemented. Full diagnosis in
      design.md's "Tried and reverted" section.

## 9-10. Fourth round: Live Preview stays rendered during a block-covering selection (CSS approach — tried, then reverted; see section 11)

A user-requested "significant UX improvement": stop Obsidian's normal raw-markdown
reveal from kicking in for lines that are part of a block-covering selection. Investigated
the reveal mechanism live (selection-overlap-driven, asynchronous, no plugin-facing hook
to intercept it at the source) and implemented a CSS-based fix keyed off Obsidian's own
`.cm-formatting` class, refined across two real-vault review rounds to exclude marks
whose "hidden" form is a widget CSS can't restore (list bullets, task checkboxes,
code-fence badges, callout titles) and to add a wiki-link-specific rule. Validated with
27 e2e scenarios and full unit/typecheck/lint passes at the time.

**Reverted in section 11** after a second real-vault review found the exception list
still growing (aliased wiki links, underline loss, blockquote content sticking to the
border) with no sign it would stop — full detail of everything found and fixed along the
way (exact class names, every regression, the reasoning behind each exclusion) is
preserved in docs/research/13-selection-follow-ups.md's "Live Preview raw-markdown
reveal during block selection" section, not repeated here.

## 11. Reverted the CSS approach; kept a blur-based approach instead

- [x] 11.1 Implemented and manually verified (in the user's real vault, not via e2e — see
      11.4) a structurally different mechanism: `SelectionDecorationPlugin`
      (`decorations.ts`) now blurs `view.contentDOM` on `mouseup` whenever the resulting
      selection is a whole-block cover, deferred by one tick so the drag's own
      escalation transaction has time to commit. This reproduces the same DOM effect a
      manual "click outside the text area" already produces.
- [x] 11.2 Removed the CSS-based approach entirely: the `.cm-formatting`/`.cm-url`/
      `.cm-formatting-link-start`/`-link-end` hide rules from `styles.css`, the
      corresponding "Live Preview stays rendered..." describe block and its
      `formattingMarkDisplay`/`waitForFormattingMark` helpers from
      `63-selection-visual-treatment.e2e.ts`, and the matching spec.md requirement.
- [x] 11.3 Recorded the full investigation (both attempts, every regression found, the
      reasoning behind each) in docs/research/13-selection-follow-ups.md, and condensed
      design.md's own decision section to a short pointer there.
- [x] 11.4 Confirmed working by the user in their real vault: dragging over blocks shows
      only the selection background as a visual change, staying fully rendered
      (including callout widget, real checkboxes, round bullets — everything the CSS
      approach couldn't restore) with no raw-markdown flash at all.
- [x] 11.5 Confirmed the real, unresolved cost: with focus removed, typing over the
      selection, Backspace, Delete, and arrow-key navigation are all silently ignored —
      manually clicking away and testing the same interactions reproduces identically,
      confirming this is inherent to losing focus, not the blur trigger itself. Cmd+C/
      Cmd+X DID still work unfocused — a real clue that some interaction paths don't
      require contentEditable focus, worth investigating to restore the rest.
      Deliberately no e2e coverage was added for this mechanism: focus/blur timing
      interacting with real drag gestures was flagged as unlikely to test reliably
      through the automated harness.
- [x] 11.6 Re-ran full unit suite (287 passed), typecheck (main + e2e), and lint after
      the revert — no regressions. (63's e2e count drops from 27 back to 20, matching
      the removed describe block; not re-verified against a fresh e2e run at this
      exact commit, since the removal is purely subtractive.)


## 12. Recovered keyboard interaction, confirmed working, checkpoint

- [x] 12.1 Implemented the recovery mechanism: a `document`-level `keydown` listener
      (capture phase) on `SelectionDecorationPlugin` that, when a keystroke lands with
      nothing meaningfully focused while this view is the one blurred due to a covering
      selection, refocuses `view.contentDOM` and replays the event through
      `@codemirror/view`'s `runScopeHandlers(view, event, 'editor')` — a public CM6 API
      for running a view's installed keymap against an event that didn't originate on
      its own DOM. Deliberately not implemented by hand-calling `@codemirror/commands`
      functions directly, which would bypass this project's own higher-precedence
      keymap (the structural-edit rewriting, marker-transparent cursor placement).
- [x] 12.2 A real bug found on the first manual test round, then fixed: matching and
      running a command via `runScopeHandlers` didn't stop the ORIGINAL event's own
      native default action from ALSO firing — a second, generic contentEditable
      deletion for Backspace/Delete (confirmed live: one Backspace on a selected
      subtree needed two undos, with the surviving cursor position matching exactly
      what a redundant extra deletion from the correct post-command cursor would
      produce), and the browser's native focus-cycling for Tab (stealing focus to a
      toolbar button). Fixed with `event.preventDefault()`/`stopPropagation()`, but
      only when `runScopeHandlers` reports a command actually matched — an unmatched
      key (plain typing) must stay unprevented, or the native `beforeinput` insertion
      that makes typing work stops firing too.
- [x] 12.3 Confirmed working by the user, in their real vault, after the fix: typing,
      arrows, Backspace, Delete (single keystroke, correct result, one undo), and
      copy/cut/paste all behave correctly with the selection staying fully rendered
      throughout.
- [x] 12.4 A separate, real gap surfaced during this same testing round, explicitly
      NOT part of this change: with a covering selection spanning several sibling
      subtrees, Tab (indent) only indents the LAST selected node, not all of them —
      the user's own assessment is this is a pre-existing gap in the structural
      keymap's own commands (likely extending to Shift-Tab and Cmd+Up/Down too), not
      something the keyboard-recovery work introduced, and needs its own design
      (what should a structural command do when the operand is "several whole
      subtrees," not one cursor). Filed in docs/research/13-selection-follow-ups.md's
      Track 2 for a future selection-UX change.
- [x] 12.5 Documented three known, accepted residual limitations, none observed in
      practice: a multi-pane conflict if two outline-mode panes are both blurred/
      block-selected simultaneously; keyboard-only block selection (no mouse) never
      triggers the blur at all; IME composition is untested.
- [x] 12.6 Re-ran full unit suite (287 passed), typecheck (main + e2e), lint, and the
      full `63-selection-visual-treatment` e2e spec (19 passing) after the fix — no
      regressions.
- [x] 12.7 Updated design.md's Goals/Decisions/Risks and
      docs/research/13-selection-follow-ups.md to reflect the mechanism as confirmed
      working, not merely "kept, still being refined" — this is the checkpoint to
      commit from.

## 13. Second round of manual testing: multi-pane, keyboard-selection, IME

- [x] 13.1 Fixed the multi-pane conflict: with two outline-mode panes both blurred/
      block-selected, typing always landed in whichever view's listener registered
      first, regardless of which pane the user had clicked into (`document.
      activeElement === document.body` is equally true for both once both are
      blurred; `stopPropagation` doesn't stop OTHER listeners on the SAME node from
      also running). Fixed by adding `isActiveEditor()`, requiring
      `app.workspace.activeEditor` to identify THIS view's own `MarkdownFileInfo` —
      Obsidian tracks this independently of raw DOM focus, correctly surviving this
      plugin's own blur calls.
- [x] 13.2 Made keyboard-driven block selection consistent with mouse-driven: a
      block cover reached via Shift+Arrow (no mouse) previously never triggered the
      blur at all. Hooked `ViewUpdate.selectionSet` in `update()` instead of adding a
      new keymap binding — reuses `allRangesCovered`, guarded by a `mousedown`/
      `mouseup`-tracked `mouseDown` flag so an in-progress mouse drag (which also
      dispatches one `selectionSet` update per pointer move) can't get blurred
      mid-drag, which would risk interrupting the browser's own native drag-select
      gesture. `onMouseUp`'s own separate deferred check remains necessary for the
      mouse-completion case (the last relevant transaction may commit while
      `mouseDown` is still true, and nothing later re-triggers `update()`).
- [x] 13.3 Investigated IME composition (tested live: Chinese Pinyin) — confirmed
      broken: the first keystroke of a composition sequence is dispatched as a
      literal Latin character, only engaging correct composition from the second
      keystroke onward. Root cause: an input method's decision to compose is tied to
      focus state at the moment the OS delivers the keystroke to its input
      pipeline — our refocus, reacting to that SAME keydown, is structurally too
      late to influence it. No earlier, reliable "about to type" signal exists to
      preemptively refocus on without defeating the point of staying blurred (e.g.
      hovering the mouse would refocus far too eagerly). NOT fixed — recorded as a
      known, accepted limitation rather than attempting a speculative workaround
      untestable across IMEs/platforms.
- [x] 13.4 Re-ran full unit suite (287 passed), typecheck (main + e2e), lint, and the
      full `63-selection-visual-treatment` e2e spec (19 passing) after 13.1/13.2 — no
      regressions.
- [x] 13.5 Updated design.md and docs/research/13-selection-follow-ups.md with both
      fixes and the IME limitation — this is the checkpoint to commit from.
