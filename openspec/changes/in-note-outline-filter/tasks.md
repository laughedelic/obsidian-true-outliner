## 1. Spike

- [ ] 1.1 Probe many visible spans through the hiding builder on a real instance: an e2e probe
      that dispatches a test-only set of spans into `zoom-decorations` on a thousand-line note
      with fifty spans, asserting hidden lines take no height, visible lines keep their chrome,
      the trailing-gap rule holds at every boundary, and the preamble kept as a visible span
      still renders its properties block; record the findings in
      `docs/research/outline-filter-spike.md`, with its one row in `docs/research/index.md`.
      Verified by the note
- [ ] 1.2 Walk `docs/research/zoom-editing-boundary`'s gesture catalogue under a frozen anchor
      set: for each row, record whether mapping the anchors gives the visible set the spec
      expects, and which rows need an anchor added rather than mapped (design D2); record the
      table in the same note. Verified by the table
- [ ] 1.3 Decide from 1.1 and 1.2 whether the design's D1 and D2 stand; if either changes,
      update design.md before any implementation task starts

## 2. The hiding builder

- [ ] 2.1 Generalise `hiddenOffsetRanges` to a sorted list of VISIBLE spans whose gaps it
      returns (design D1), with zoom passing its cover; verify the zoom e2e specs in the
      `clipboard` group pass with no edit, `tests/zoom-offsets.test.ts` passes with the same
      expectations under the new signature, and a new unit test covers three spans with a
      one-line island between two gaps. Negative control: merge adjacent spans wrongly and
      confirm the island test fails
- [ ] 2.2 Let `zoom-decorations` build from the union of both surfaces' spans, intersected with
      the zoom scope's cover when one is active (design D1, D4), and leave `ZOOMED_CLASS` on the
      zoom alone; verify a unit test on the pure intersection, and an e2e assertion that a
      filtered, unzoomed note still renders its title and properties block

## 3. The filter state

- [ ] 3.1 Create `src/plugin/outline-filter-state.ts`: the query, the anchors `matchNodes`' ids
      resolve to at the parse that produced them, their mapping through changes, the derived
      visible spans with the preamble, the gates (design D1, D2, D7), and effects to set and
      clear the query; verify unit tests: anchors survive an edit inside a match, an anchor
      deleted with its node is dropped, a new sibling from a visible node is visible, a moved
      match brings its new ancestors, changing the query recomputes. Negative control: store node
      ids instead of anchors and confirm the edit-survival test fails
- [ ] 3.2 Teach `zoom-scope.ts`'s visible-bounds resolver to intersect with the filter's spans
      (design D3) so caret placement lands on the nearest visible span; verify unit tests for
      down and up across a gap, filtered and filtered-inside-a-zoom. Negative control: drop the
      intersection and confirm the down-arrow test fails
- [ ] 3.3 Mark decorations from the field (design D6); verify a unit test that a mark follows an
      edit and vanishes when the text no longer contains the query while the node stays visible

## 4. The panel and the command

- [ ] 4.1 Create `src/plugin/outline-filter-panel.ts`: the field, the count, the no-matches
      message, the close control, Escape handling, mounted by the mechanism design D5's open
      question settles; verify it renders in the markdown view and the grammar ignores keys
      typed in it
- [ ] 4.2 Register "Filter outline" in `main.ts` through `addZoomCommand`'s outline-mode-gated
      shape, toggling the panel; verify the command is absent outside outline mode
- [ ] 4.3 Decide design's open question 5 — whether a match's hidden children show a fold count
      or nothing — from a mockup drawn at real geometry, as `fold-count-mockup.html` was, and
      record the verdict in the design; then the styles for the panel and that rendering, as a
      new `styles/70-outline-filter.css` part, and move the `to-match` rule from the footer's
      part into `styles/10-editor.css` written on the class alone (design D6); verify by
      screenshot in both themes, and that the footer's own marks are unchanged

## 5. End-to-end

- [ ] 5.1 Add `e2e/specs/81-outline-filter.e2e.ts`, with its own helpers beside it as
      `e2e/outline-filter.ts`, and a label for its decade in `scripts/spec-groups.mjs` so the CI
      check is named for the feature rather than `8x`. Covering: the command is absent outside
      outline mode; a deep match keeps its path and hides siblings; a match's children are
      hidden; hidden lines take no space and the caret skips them; marks; title, properties and
      footer stay unzoomed, and stay hidden zoomed; editing a match away keeps it; Enter from a
      visible node creates a visible node; a moved match brings its new ancestors; re-running the
      query re-decides; moving a node carries hidden children; filter inside a zoom searches the
      scope; zooming while filtered keeps it; zooming out re-decides; clearing keeps the zoom; no
      matches shows the note whole with the message; Escape and the close control restore
      everything. Negative controls: for the frozen-set tests, re-run the query on every change;
      for the caret tests, drop the resolver's intersection; for the composition tests, skip the
      intersection
- [ ] 5.2 Run the spec under the mobile config; verify it passes
- [ ] 5.3 Manual pass in a real vault under both themes, filtered and zoomed; record findings
      in `docs/research/outline-filter-spike.md`

## 6. Docs and validation

- [ ] 6.1 Record in `docs/research/outline-filter-spike.md` what the spike changed in the design,
      if anything, and close `docs/research/search-surfaces`' open question 3 with the
      frozen-set decision
- [ ] 6.2 `openspec validate in-note-outline-filter --strict`
