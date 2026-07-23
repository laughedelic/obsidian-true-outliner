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
      guides/markers already needed it) — this also incidentally fixed the table
      "notch" from section 4.3 (it was `contain: paint` clipping the rightward reach,
      not a table-layout limitation as first diagnosed).
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
