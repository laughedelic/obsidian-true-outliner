## 1. Spike

- [ ] 1.1 Probe many visible spans through the hiding builder on a real instance: an e2e probe
      that dispatches a test-only set of spans into `zoom-decorations` on a thousand-line note
      with fifty spans, asserting hidden lines take no height, visible lines keep their chrome,
      and the trailing-gap rule holds at every boundary; record the findings in
      `docs/research/31` under a new section. Verified by the section
- [ ] 1.2 Walk `docs/research/26`'s gesture catalogue under a frozen anchor set: for each row,
      record whether mapping the anchors gives the visible set the spec expects, and which rows
      need an anchor added (design D2); record the table in the same section. Verified by the
      table
- [ ] 1.3 Decide from 1.1 and 1.2 whether the design's D1 and D2 stand; if either changes,
      update design.md before any implementation task starts

## 2. The hiding builder

- [ ] 2.1 Generalise `hiddenOffsetRanges` to a sorted list of visible spans (design D1), with
      zoom passing its one span; verify the zoom e2e specs in the `clipboard` group and
      `tests/` for zoom offsets pass unchanged, and a new unit test covers three spans with a
      one-line island between two gaps. Negative control: merge adjacent spans wrongly and
      confirm the island test fails
- [ ] 2.2 Let `zoom-decorations` take the filter's spans intersected with the zoom scope's
      (design D4); verify a unit test on the pure intersection

## 3. The filter state

- [ ] 3.1 Create `src/plugin/filter-state.ts`: the query, the anchors mapped through changes,
      the derived visible spans, the gates (design D2, D7), and effects to set and clear the
      query; verify unit tests: anchors survive an edit inside a match, an anchor deleted with
      its node is dropped, a new sibling from a visible node is visible, changing the query
      recomputes. Negative control: store node ids instead of anchors and confirm the
      edit-survival test fails
- [ ] 3.2 Register the visible-bounds resolver for the filter (design D3) so caret placement
      lands on the nearest visible span; verify unit tests for down and up across a gap.
      Negative control: unregister the resolver and confirm the down-arrow test fails
- [ ] 3.3 Mark decorations from the field (design D6); verify a unit test that a mark follows an
      edit and vanishes when the text no longer contains the query while the node stays visible

## 4. The panel and the command

- [ ] 4.1 Create `src/plugin/filter-panel.ts`: the top panel with the field, the count, the
      no-matches message, the close control, Escape handling (design D5); verify it renders in
      the markdown view and the grammar ignores keys typed in it
- [ ] 4.2 Register "Filter outline" in `main.ts` through the same outline-mode-gated command
      shape the zoom commands use; verify the command is absent outside outline mode
- [ ] 4.3 Styles for the panel and the hidden-child rendering decided in design's open question;
      verify by screenshot in both themes

## 5. End-to-end

- [ ] 5.1 Add `e2e/specs/8x-outline-filter.e2e.ts` in the zoom group covering: the command is
      absent outside outline mode; a deep match keeps its path and hides siblings; a match's
      children are hidden; hidden lines take no space and the caret skips them; marks; title,
      properties and footer stay; editing a match away keeps it; Enter from a visible node
      creates a visible node; re-running the query re-decides; moving a node carries hidden
      children; filter inside a zoom searches the scope; zooming while filtered keeps it;
      clearing keeps the zoom; no matches shows the note whole with the message; closing
      restores everything. Negative controls: for the frozen-set tests, re-run the query on
      every change; for the caret tests, unregister the resolver; for the composition tests,
      skip the intersection
- [ ] 5.2 Run the spec under the mobile config; verify it passes
- [ ] 5.3 Manual pass in a real vault under both themes, filtered and zoomed; record findings
      in `docs/research/31`

## 6. Docs and validation

- [ ] 6.1 Record in `docs/research/31` what the spike changed in the design, if anything, and
      close its open question 3 with the frozen-set decision
- [ ] 6.2 `openspec validate in-note-outline-filter --strict`
