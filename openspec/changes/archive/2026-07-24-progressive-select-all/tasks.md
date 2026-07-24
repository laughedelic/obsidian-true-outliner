## 1. Ladder module

- [x] 1.1 Create `src/select-all-ladder.ts`: pure, no CM6 imports, mirroring
      `src/escalate.ts`'s style (types, doc comments referencing design.md decisions).
- [x] 1.2 Implement per-node rung computation: content rung (marker-transparent for list
      items via `contentColumnCh`, column 0 for headings/paragraphs), subtree rung
      (reuse/export `subtreeCoverOf`/`subtreeContentEnd` from `escalate.ts` rather than
      duplicating), ancestor-subtree rungs (walk `findPath`'s ancestor chain outward),
      whole-outline-body rung.
- [x] 1.3 Implement "next rung for a range" selection: given a range and its computed
      ladder, return the smallest rung that contains the range and strictly differs from
      it; return `null`/sentinel when the range already equals the top (whole-outline)
      rung, signaling fall-through to native Select All.
- [x] 1.4 Implement multi-range entry point: map each range through 1.3 independently,
      return the resulting array of ranges (no merging — leave that to CM6).
- [x] 1.5 Handle edge cases per design.md: leaf node (content rung == subtree rung
      collapse), top-level node (no ancestor rungs, next stop is whole-outline body),
      empty/cursor ranges (still produce a content-rung selection, since Mod-A always
      starts from a cursor position), preamble-only cursor position.

## 2. Keymap wiring

- [x] 2.1 Add a `Mod-a` binding to the existing `Prec.highest` keymap extension in
      `src/plugin/keymap.ts`, gated on outline mode via `editorInfoField` the same way
      `makeHandler` already does for Tab/Enter.
- [x] 2.2 Convert the current CM6 selection's ranges to `LinePos`/`LineRange` (reusing
      existing conversion helpers if `transaction-filter.ts` already has them), call the
      ladder module, and convert the result back to CM6 offsets for dispatch.
- [x] 2.3 When the ladder module signals "already at the top," return `false` from the
      handler so native Select All runs unmodified.
- [x] 2.4 Dispatch the escalated multi-range selection via `view.dispatch` with an
      appropriate `userEvent` (or none, matching how selection-only changes are
      typically dispatched elsewhere in this codebase) and `scrollIntoView` as
      appropriate.

## 3. Tests

- [x] 3.1 Unit tests for the ladder module mirroring `tests/escalate.test.ts`'s
      structure: content rung for list items excludes marker, content rung for
      headings/paragraphs is the full first line, subtree rung matches
      `subtreeCoverOf`'s existing output, ancestor chain climbs correctly through 2-3
      levels of nesting, whole-outline-body rung covers all top-level nodes, top-of-
      ladder signal fires correctly at the last rung.
- [x] 3.2 Property test (if feasible, matching the existing property-test style in
      `tests/escalate.test.ts`): repeatedly applying "advance to next rung" from any
      starting selection eventually reaches the whole-outline-body rung in a bounded
      number of steps equal to the node's depth plus a small constant.
- [x] 3.3 Multi-range unit tests: two ranges in different nodes/depths advance
      independently; two ranges whose advanced covers overlap merge correctly once
      handed to CM6 (covered at the e2e/manual level per 4.x, since range merging is a
      CM6-level behavior).

## 4. Manual verification (real vault)

- [x] 4.1 Verify the full ladder in a real vault: repeated Mod-A on a paragraph inside
      nested headings climbs content → subtree → each ancestor → whole outline → whole
      document (frontmatter included), matching native Select All at the top.
      Covered by `e2e/specs/64-progressive-select-all.e2e.ts` against a real Obsidian
      instance (not just the pure unit/property tests) — no focus/timing subtlety here
      unlike the blur-based decoration work, so automated real-app e2e substitutes for a
      separate hands-on pass.
- [x] 4.2 Verify list-item content rung excludes the marker, and that this is usable as
      the single-node keyboard selection path for tight lists (docs/research/13's
      motivating case — no gap-line drag trigger available there). Covered by
      `e2e/specs/64-progressive-select-all.e2e.ts`.
- [x] 4.3 Verify statelessness: press once, click elsewhere or edit the document, return
      to the same node, press again — ladder restarts from content rung, not stuck or
      skipping. Covered by `e2e/specs/64-progressive-select-all.e2e.ts`.
- [x] 4.4 Verify multi-range behavior: make a multi-cursor/multi-range selection across
      different nodes, confirm each range escalates independently and overlapping
      results merge as expected. Independent-climb case covered by
      `e2e/specs/64-progressive-select-all.e2e.ts`; overlap-merge is CM6's own
      `EditorSelection` normalization, already exercised for the same mechanism by
      `e2e/specs/61-selection-enforcement.e2e.ts`'s multi-range escalation test.
- [x] 4.5 Verify outside outline mode: Mod-A behaves exactly as stock Obsidian. Covered
      by `e2e/specs/64-progressive-select-all.e2e.ts`.
- [x] 4.6 Verify interaction with escalated-selection-decoration (block-cover chrome):
      each rung above "own content" should render with the same whole-node selection
      chrome already shipped for drag-escalated selections. Covered by
      `e2e/specs/64-progressive-select-all.e2e.ts` ("own-content rung gets no block-cover
      chrome; the subtree rung above it does").
      Also fixed two pre-existing e2e tests whose single-press "Select All is stock"
      assumption this change intentionally supersedes:
      `e2e/specs/61-selection-enforcement.e2e.ts` (2 tests) and
      `e2e/specs/62-outline-edit-enforcement.e2e.ts` (1 test), via a new
      `h.selectAllToStock()` helper that presses Mod-A until the selection stabilizes.
      Full suite (`npx wdio run e2e/wdio.conf.mts`, all 14 spec files) passes with no
      other regressions.

## 5. Documentation

- [x] 5.1 Update any user-facing docs/README section listing keyboard shortcuts, if one
      exists, to mention progressive Select All. Checked: README.md has no keyboard-
      shortcuts reference or table at all — not even for the already-shipped Tab/Shift-
      Tab/Alt-Arrow grammar commands — so there is no existing section to update. Nothing
      changed here.
