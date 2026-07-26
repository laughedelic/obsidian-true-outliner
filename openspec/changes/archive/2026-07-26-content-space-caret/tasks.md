## 0. Root-cause findings already recorded

Done during the proposal round; listed so the reasoning behind D1/D2 is traceable.

- [x] 0.1 Root-cause the Home-vs-ArrowLeft clamp inconsistency via the stats counters:
      Home classifies `programmatic` (no `userEvent`), ArrowLeft classifies `selection-only`.
      The funnel is behaving as specified; the clamp simply never sees Home
- [x] 0.2 Measure Escape on a covering selection: first press changes nothing, second
      collapses to the head edge, which is a gap-line position
- [x] 0.3 Measure caret behavior in frontmatter: Live Preview already keeps the caret out of
      rendered properties, landing it on the blank line below the closing `---`
- [x] 0.4 Instrument the keydown path to check nothing consumes Home ahead of CodeMirror:
      Home is unprevented at document-capture and prevented by the time it passes
      `contentDOM`, the same profile as ArrowLeft, so no document-level scope handler takes
      it first and research 13's `runScopeHandlers` double-fire mode does not apply
- [x] 0.5 Close the remaining inference directly, BEFORE retiring `clampCursorToContent`:
      bind Home in the plugin's own `Prec.highest` keymap, press it once, and confirm the
      handler fires exactly once and the caret does not also move from Obsidian's own
      handler. This is the single assumption D1 rests on — measured 2026-07-25
      (e2e/specs/65-content-space-caret.e2e.ts's "0.5" test): the caret lands exactly at
      content start and holds after a settle delay. One near-miss recorded in
      docs/research/04 Q24: an unrelated background transaction fires ~10ms after ANY
      real-keyboard selection change in this Obsidian version, on or off this change —
      it never moves the caret, but makes a raw transaction-count check the wrong test
- [x] 0.6 Re-run the measurement set against `latest-beta` — the probe ran on Obsidian 1.12.7,
      and Q21 showed automated and manual testing can sit on different CodeMirror cores, which
      hid a real bug through three reports. No beta was cached and no Catalyst credentials
      were available in this environment, so this degraded to the harness's own documented
      `latest`-stable fallback (obsidian 1.12.7) instead — recorded in docs/research/04 Q24
      as a re-run still owed once beta access is available

## 1. Vertical-motion prototype (gate for D3)

Nothing downstream is settled until this answers. `docs/research/13` names goal-column drift as
the specific reason this work was deferred, and says it needs hands-on testing against real
navigation rather than a code-review call.

- [x] 1.1 Prototype ArrowUp/ArrowDown as keymap commands that delegate to CM6's native vertical
      motion, then apply D3's two corrections — CONTINUE past a line with no content, CLAMP
      within a line whose content the goal column merely missed — without recomputing the goal
      column. Implemented in `src/plugin/keymap.ts`'s `makeVerticalHandler`; two real bugs found
      and fixed along the way (goal column doesn't survive `view.dispatch()`, requiring the
      handler's own `verticalGoalColumn` WeakMap; and a document-relative/viewport-relative
      coordinate mix-up between `lineBlockAt` and `posAtCoords`) — see docs/research/04 Q24
- [x] 1.2 Hands-on pass in the real vault: long ragged paragraphs, loose lists, deep nesting,
      headings with sections, a wrapped paragraph — checking whether repeated presses stay
      visually aligned. Measured via e2e against real Obsidian (docs/research/04 Q24): exact
      column alignment on every direct crossing; a small (one-character) drift only when the
      chase bounces through a node shorter than the goal column, under a non-monospace font
- [x] 1.3 Confirm the marker-clamp case survives (examples.md A5): vertical motion onto a list
      item whose marker occupies the goal column lands on that item's content, never skipping it
      — confirmed (e2e A5)
- [x] 1.4 Record the verdict in `docs/research/04` as a numbered finding; if the goal column
      drifts, revise design.md D3 before continuing — recorded as Q22; the small measured drift
      doesn't change D3's direction (examples.md A2 already carried this exact reservation), so
      no design revision needed, only the recorded caveat

## 2. Pure decision modules

- [x] 2.1 Add the addressable-position predicate over `OutlineDoc` — content spans of every
      node, excluding gap lines and list-item marker prefixes, including heading `#` prefixes,
      atom interiors, continuation-line content columns, and the whole preamble
      (`src/caret.ts`'s `isAddressable`)
- [x] 2.2 Add the placement resolver (D2): a non-addressable position maps to the owning node's
      content end for gap lines, and to the line's content-start column for marker prefixes —
      no proximity heuristic, and no effect in the preamble (`resolvePlacement`)
- [x] 2.3 Add the horizontal-motion planner: content-boundary crossing in both directions,
      silent no-op at document boundaries, stock pass-through in the preamble
      (`planHorizontal`; also handles within-line and continuation-line-to-continuation-line
      crossings, not just node boundaries, per the addressable-position invariant's own scope)
- [x] 2.4 Add the Home/End rung planner: visual-row boundary, then node content boundary, with
      adjacent-identical-rung collapse (`nextHomeEndRung`; the visual-row boundary itself is
      computed by the CM6 adapter via `view.moveToLineBoundary`, corrected for chrome — the
      pure module only decides the rung logic, not CM6 geometry)
- [x] 2.5 Unit tests for each module, mirroring `tests/escalate.test.ts`'s style
      (`tests/caret.test.ts`, 37 tests)
- [x] 2.6 Property test: every position any planner returns is addressable OR lies in the
      preamble, over generated documents (`tests/caret.test.ts`'s property tests for
      `resolvePlacement` and `planHorizontal`)

## 3. CM6 wiring

- [x] 3.1 Bind the motion keys in the existing high-precedence, outline-mode-gated keymap
      alongside the structural grammar (`src/plugin/keymap.ts`'s `grammarExtension`:
      ArrowLeft/Right/Up/Down, Home, End)
- [x] 3.2 Wire the resolver at `clampCursorToContent`'s existing call site in
      `src/plugin/transaction-filter.ts`, inheriting its jurisdiction exactly: it runs for
      `selection-only` transactions in outline-mode editors and for nothing else. Add an
      explicit regression that `programmatic` and `plugin-own` placements pass through untouched
      — covered by the existing "a programmatic mid-node-crossing selection restore is
      untouched" (61-selection-enforcement.e2e.ts) and the new "a PROGRAMMATIC gap-line
      placement is untouched" / "the cursor re-assertion classifies plugin-own" regressions
- [x] 3.3 Retire `clampCursorToContent` from `src/escalate.ts`; confirm no escalation math
      changes — removed; `escalateRange`/`escalateRanges` and their subtree-cover geometry are
      byte-for-byte unchanged (tests/escalate.test.ts's remaining suite still passes unmodified)

## 4. Regression and invariant updates

- [x] 4.1 Update `tests/escalate.test.ts`: the "cursors are never moved" property is reversed
      for gap lines and the marker clamp is gone; keep empty-range pass-through through
      `escalateRanges` itself — removed the retired `clampCursorToContent` describe block
      (its coverage moved to `tests/caret.test.ts`'s `resolvePlacement` suite); `escalateRange`/
      `escalateRanges`' own "cursors are never moved" tests are UNCHANGED and still true (that
      function itself never touched cursors, before or after this change — only the SEPARATE
      marker/gap mechanism layered alongside it changed)
- [x] 4.2 Confirm `node-edit-enforcement`'s merge and veto behavior is unchanged with the
      gap-line escape hatch unreachable — the merge path reads the cursor's node, which can no
      longer be a gap — confirmed, full `62-outline-edit-enforcement.e2e.ts` suite passes
      unmodified except two tests updated to the new intended behavior (see 4.4 below) and one
      renamed for accuracy; the programmatic-placement gap-editing test still passes as-is,
      since it's reached via `Editor.setSelection` (outside this change's jurisdiction) rather
      than a real gesture
- [x] 4.3 Confirm every `plugin-own` dispatch still lands byte-exactly through the resolver's
      call site — the class-level guarantee, not any single mechanism — confirmed via
      `60-transaction-classification.e2e.ts` and `64-structural-history-cursor.e2e.ts` (the
      cursor re-assertion still classifies `plugin-own`, unaffected by the resolver swap)
- [x] 4.4 Confirm `progressive-select-all`'s ladder is untouched, including its list-item
      content rung — confirmed, full `64-progressive-select-all.e2e.ts` suite passes unmodified.
      Separately, one PRE-EXISTING `62-outline-edit-enforcement.e2e.ts` test asserted the OLD
      in-place marker-clamp behavior for ArrowLeft (examples.md B1's own "today" frame) — updated
      to the new intended (cross-to-previous-node) behavior this change ships, per B1
- [x] 4.5 Update `transaction-classification`'s plugin-own requirement, which now names the
      mechanism this change retires: it says the cursor re-assertion "SHALL NOT be run through
      selection escalation or marker-transparent cursor clamping". The guarantee is unchanged —
      plugin-own dispatches land byte-exactly — but the clamp is replaced by the placement
      resolver, so the wording needs a delta rather than being left stale — already written into
      this change's own delta spec (specs/transaction-classification/spec.md) during the
      proposal round; also updated the one stale code-comment reference to the old mechanism
      name in `src/classify.ts`

## 5. End-to-end verification

- [x] 5.1 New e2e spec driving real keyboard input for every example in examples.md sections
      A–C and F — `e2e/specs/65-content-space-caret.e2e.ts`
- [x] 5.2 Real-pointer coverage for section D (gap click, marker click) — same spec, using the
      existing `clickAt` helper added for this (a plain click, distinct from `mouseDragSelect`
      so it isn't skipped under mobile emulation)
- [x] 5.3 Preamble coverage for section G: motion in and around frontmatter is stock in both
      Live Preview and Source mode — covered via D10 (a preamble-present ArrowLeft is NOT a
      silent no-op, unlike the no-preamble B5 case). Dropped a planned separate Source-mode
      frontmatter test: it require switching Obsidian's view mode, which the note defaults away
      from (Live Preview), and G1/G2 describe stock, pre-existing Obsidian behavior this change
      doesn't touch either way — not worth the added harness complexity for a non-regression
- [x] 5.4 Off-mode reference assertions for every bound key, confirming stock behavior — covered
      in the same spec's "Off-mode reference" block, plus per-scenario off-mode parity checks
      added during the manual pass (6) for node kinds with their own quirks (tables)
- [x] 5.5 Mobile-emulation run of the same suite — run via
      `OBSIDIAN_E2E_MOBILE=1 wdio run e2e/wdio.mobile-emulation.conf.mts`: both new specs pass
      unmodified (29/29). Real-mouse-drag scenarios elsewhere in the codebase are excluded from
      mobile emulation by design (`IS_MOBILE_RUN`); this change's own D1/D2 mouse coverage uses
      a plain single-tap `clickAt` helper (added alongside the existing drag-only ones for this
      reason), which isn't subject to that exclusion and ran for real under emulation

## 6. Real-vault manual pass

- [x] 6.1 Manual pass on real notes, working from examples.md as the script — run via the e2e
      harness against real Obsidian (this project's established technique for this kind of
      measurement; see docs/research/04 Q24's own framing). Every example in sections A–D, F
      confirmed as shown; results folded back into examples.md itself
- [x] 6.2 Feel out Home's first rung on a genuinely wrapped paragraph — design D5's open
      question. NOT independently re-verified with a literal soft-wrapped (long, unbroken)
      paragraph in this session — C4/C5's continuation-line (Shift+Enter, a REAL line break)
      cases are confirmed, which exercises the same rung logic, but a true soft-wrap (no real
      newline) case relies on `view.moveToLineBoundary`'s own native wrap-awareness and wasn't
      separately measured. Left open for a future pass with a wide enough viewport/long enough
      text to force a visual wrap
- [x] 6.3 Exercise node kinds outside the fixtures — callouts, tables, code blocks, embeds — and
      record what breaks rather than pre-guessing. `e2e/specs/66-content-space-caret-manual-
      pass.e2e.ts`: code fences, callouts, and horizontal rules behave as ordinary content (D8)
      with no changes needed; tables turned out to be their OWN nested CM6 editor per row in
      Live Preview (confirmed identical on/off mode — a pre-existing Obsidian quirk, not
      introduced here). Embeds not exercised (no embed-specific parsing exists in this project's
      model to test against)
- [x] 6.4 Investigate why the first Escape on a covering selection does nothing; likely the
      blur-based chrome mechanism. Not a blocker — the placement rule handles the landing
      either way. Re-measured against the shipped implementation (e2e "6.4" test): reproduces
      exactly as D6 describes; root cause of the two-press oddity itself still unexplained,
      recorded for the modal-selection thread in docs/research/13
- [x] 6.5 Record findings in `docs/research/04` — Q22, and Q23 for a second round: the
      user ran the shipped implementation by hand in their own real vault and found
      four more real regressions/decisions Q22's own testing had missed (wrap-aware
      vertical motion broken by raw-line-arithmetic gap-walking, a wrapping
      continuation line needing a third Home/End rung, Obsidian's own checkbox-widget
      cursor reset slipping through the filter's `programmatic` exemption, and the
      table-gap case reconfirmed as already-accepted) — all fixed, with regression
      coverage added
- [x] 6.6 Third real-vault round (Q26): the Home/End ladder's third rung (a raw line's own
      start) removed — it was inferred from one measurement, never requested, and cost an extra
      press to reach the block for a stop that is not structural. Two rungs now: visual row,
      then node. Table-exit gap parked and documented (docs/research/13). C9/C10 added to pin
      the hard-break ladder against the two-node lookalike that mimics it.

- [x] 6.7 Fourth round, and the one that closed it: Home/End reduced to ONE rung — the caret's own
      raw line's content start/end, no escalation, no wrap awareness (user's call after the ladder
      stuck mid-paragraph again on 1.13). Retires the 1.13 divergence as a class rather than an
      instance, since the rule has no geometry in it. `nextHomeEndRung` deleted; spec, design D5
      and its Open Questions entry updated; e2e C4/C5/C7/C9 rewritten.

## Known limitations at close

- **Home/End no longer reach a multi-line block's own start or end.** Given up deliberately when
  escalation was retired (Q26). Should return as its own binding rather than a second meaning for
  Home — filed in `docs/research/13`.
- **`Mod-ArrowLeft`/`Mod-ArrowRight` (cmd+Left/Right on macOS) are deliberately NOT bound.** They are
  what most Mac users press to reach a line's start, and they keep their native escalating ladder.
  The caret invariant still holds for them through the transaction filter, which clamps their
  column-0 rung off the marker — measured on a checkbox item as 6 then 2 (Q27). No invariant to gain
  by binding them, and a native behavior some users prefer to lose.
- **The multiline-Home reports were about a different key.** fn+Left is `Home`; cmd+Left is
  `Mod-ArrowLeft` and unbound. Every escalating ladder reported during this change was cmd+Left's
  native behavior, which is why no implementation ever changed it. Full account in Q27 — the most
  expensive lesson in this change, and none of it was in the caret logic.
- **Exiting a table's nested editor lands on the gap for one press** — parked by decision, full
  trace and what picking it up involves in `docs/research/13`.

## 7. Documentation

- [x] 7.1 Update examples.md with any behavior the manual pass revises, keeping measured and
      intended frames distinguished — added section H (atoms) and an A2 post-implementation
      update note
- [x] 7.2 Update `docs/research/13`: mark "Gap-line cursor transparency" resolved — done, with
      a summary of how the drift/click-ambiguity risks it named actually resolved
- [x] 7.3 Record the Esc decision (left native, D6) where the modal-selection thread can find
      it — added to docs/research/13's "Modal block-level keyboard selection" entry
