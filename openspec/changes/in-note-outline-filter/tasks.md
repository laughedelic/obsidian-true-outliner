## 1. Spike

- [x] 1.1 Probe many visible spans through the hiding builder on a real instance: an e2e probe
      that dispatches a set of spans into `zoom-decorations` on a thousand-line note with fifty
      spans, asserting hidden lines take no height, visible lines keep their chrome, and the
      trailing-gap rule holds at every boundary; record the findings in
      `docs/research/outline-filter-spike.md`, with its one row in `docs/research/index.md`.
      Verified by the note
- [ ] 1.1a What a mark decoration draws over source Live Preview hides — a list marker, a line's
      indentation, the target inside an aliased link. Split from 1.1 because it needs marks
      (3.4) rather than the hiding builder, so it probes after the matcher lands, not before
- [x] 1.2 Walk `docs/research/zoom-editing-boundary`'s gesture catalogue under a frozen anchor
      set: for each row, record whether mapping the anchors gives the visible set the spec
      expects, and which rows need an anchor added rather than mapped (design D2); record the
      table in the same note. Verified by the table
- [x] 1.3 Decide from 1.1 and 1.2 whether the design's D1 and D2 stand; if either changes,
      update design.md before any implementation task starts. D1's preamble rule dropped (1.1);
      D2's added-anchor rule stated from the catalogue rather than asserted, plus the
      whole-note fallback when the last anchor goes (1.2)

## 2. The hiding builder

- [x] 2.1 Generalise `hiddenOffsetRanges` to a sorted list of VISIBLE spans whose gaps it
      returns (design D1), with zoom passing its cover; verify the zoom e2e specs in the
      `clipboard` group pass with no edit, `tests/zoom-offsets.test.ts` passes with the same
      expectations under the new signature, and a new unit test covers three spans with a
      one-line island between two gaps. Negative control: merge adjacent spans wrongly and
      confirm the island test fails
- [x] 2.2 Let `zoom-decorations` build from the union of both surfaces' spans, intersected with
      the zoom scope's cover when one is active (design D1, D4), and leave `ZOOMED_CLASS` on the
      zoom alone; verify unit tests on the pure intersection, and the e2e assertions in 1.1's
      probe that a filtered, unzoomed note still renders its title and properties block — and
      that it does so with the preamble hidden, which is what pins the rule to `ZOOMED_CLASS`
      rather than to a span

## 3. The filter state

- [x] 3.1 Create `src/plugin/outline-filter-state.ts`: the query, the anchors `matchNodes`' ids
      resolve to at the parse that produced them, their mapping through changes, the derived
      visible spans, and effects to set and clear the query (design D1, D2, D8), with the
      nested-editor gate split into `outline-filter-scope.ts` so the derivation stays reachable
      from the unit suite; verify unit tests: anchors survive an edit inside a match, an anchor
      deleted with its node is dropped, a moved match brings its new ancestors, changing the
      query recomputes, a miss holds the last view. Negative control: re-derive the anchors per
      transaction — what node ids force — and confirm the frozen-set tests fail
- [x] 3.1a Add an anchor for a node a transaction CREATES from a visible one (design D2); verify
      the catalogue walk's three rows flip and the deleted-subtree row does not. Negative
      control: drop the whole-line test and confirm a deleted subtree resurrects its follower
- [x] 3.2 Step the caret over a hidden run (design D3): `keymap.ts`'s vertical walk skips one the
      way it already skips a fold, and `transaction-filter.ts`'s selection clamp lands any other
      caret on the nearest visible line; verify unit tests for down and up across a gap, at the
      document's ends, and with a zoom having narrowed the set, plus an e2e case that Down from a
      match lands on the next one and Up returns. Negative control: drop the skip and confirm the
      down-arrow e2e fails
- [x] 3.3 Refuse a selection that would span a gap (design D3): `would-cross-a-filter-gap` in
      `src/result.ts` with its cue in `messages.ts`, guarded in `keymap.ts` beside the two
      gestures that dispatch a selection programmatically and in `transaction-filter.ts` for
      every other one, raised once per gesture; verify unit tests for the crossing rule and e2e
      that a held Shift+Down leaves the selection unchanged and says so once, and that Select All
      stops at the visible run. Negative control: allow the extension and confirm both fail —
      Select All reaches the document's last line rather than staying on the run
- [ ] 3.4 Mark decorations from the field, cut with `matchRanges` and declared
      `{ tagName: 'mark', class: 'to-match' }` (design D6); verify unit tests over the decoration
      RANGES, which need no DOM — `docs/research/open-questions` Q37 defers a DOM environment for
      the unit suite — that a mark follows an edit, vanishes when the text no longer contains the
      query while the node stays visible, and does not move when a query matches nothing
- [ ] 3.5 Leave the anchors alone when a query matches nothing, so the view and its marks stay
      the last matching query's, and flag the query as unmatched (design D8); verify unit tests
      that a miss changes neither the visible spans nor the marks, that removing the missing
      character restores the earlier set, and that a miss with nothing yet to keep renders the
      note whole

## 4. The panel and the command

- [ ] 4.1 Create `src/plugin/outline-filter-panel.ts`: the field, the count, the no-matches
      message, the close control and Escape handling, mounted through `showPanel` with
      `top: true` (design D5); verify it renders in the markdown view above the title and the
      properties block, holds focus while the content is empty, and that the grammar ignores keys
      typed in it
- [ ] 4.2 Register "Filter outline" in `main.ts` through `addZoomCommand`'s outline-mode-gated
      shape, toggling the panel; verify the command is absent outside outline mode
- [ ] 4.3 Decide the design's two rendering questions — whether a match's hidden children show a
      fold count or nothing, and how the query field shows that it matches nothing — from a
      mockup drawn at real geometry, as `fold-count-mockup.html` was, and record both verdicts in
      the design; then the styles for the panel and those renderings, as a new
      `styles/70-outline-filter.css` part, and de-scope the `to-match` rule out of the footer's
      part into `styles/10-editor.css` — `.to-backlinks-content mark.to-match` becomes
      `mark.to-match`, all five declarations intact (design D6); verify by screenshot in both
      themes, and that the footer's own marks render exactly as they did, since the move widens
      the selector rather than copying it

## 5. End-to-end

- [ ] 5.1 Add `e2e/specs/81-outline-filter.e2e.ts`, with its own helpers beside it as
      `e2e/outline-filter.ts`, and a label for its decade in `scripts/spec-groups.mjs` so the CI
      check is named for the feature rather than `8x`. Covering: the command is absent outside
      outline mode; a deep match keeps its path and hides siblings; a match's children are
      hidden; hidden lines take no space and the caret skips them; marks; title, properties and
      footer stay unzoomed, and stay hidden zoomed; editing a match away keeps it; Enter from a
      visible node creates a visible node; a moved match brings its new ancestors; re-running the
      query re-decides; moving a node carries hidden children; a selection refuses to cross a gap
      and says so, through the notice recorder rather than a command's return
      (`docs/research/refused-commands-in-e2e`); Select All stops at the visible run; filter
      inside a zoom searches the scope; zooming while filtered keeps it; zooming out re-decides;
      clearing keeps the zoom; a query matching nothing holds the view and its marks still while
      the panel and the field both say so, and removing the missing character returns the
      matches; Escape and the close control restore everything. Negative
      controls: for the frozen-set tests, re-run the query on every change; for the caret tests,
      drop the resolver's intersection; for the selection test, allow the extension; for the
      composition tests, skip the intersection
- [ ] 5.2 Run the spec under the mobile config; verify it passes
- [ ] 5.3 Manual pass in a real vault under both themes, filtered and zoomed; record findings in
      `docs/research/outline-filter-spike.md`, and in particular the five the design left to it:
      whether the field's signal carries when the view is answering an earlier query; how often
      the selection refusal is met and what was wanted instead; whether a Backspace merge showing
      a node that never matched reads as right or as leakage; whether the note returning whole
      when the last match is edited away reads as a restore or as the filter breaking; and
      whether a filtered view grows uncomfortably as nodes are created in it, since each one
      stays

## 6. Docs and validation

- [ ] 6.1 Record in `docs/research/outline-filter-spike.md` what the spike changed in the design,
      if anything, and close `docs/research/search-surfaces`' open question 3 with the
      frozen-set decision
- [ ] 6.2 `openspec validate in-note-outline-filter --strict`
