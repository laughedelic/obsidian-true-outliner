## 1. Measure

- [ ] 1.1 Measure the cold whole-vault tree resolution inside Obsidian: an e2e probe on a
      generated vault of a few thousand notes timing the first sweep through the shared tree
      cache and the second; record both figures in `docs/research/31` (open question 1) and
      decide there whether background warming (design D5) is added. Verified by the figures
      being in the note

## 2. The shared renderer

- [ ] 2.1 Create `src/plugin/lineage-list.ts` and move into it the footer's group head, row
      renderer, marker helpers, glyphs, `renderInline`, `unwrapBlocks` and the match-marking
      walk, parameterised by the per-surface options in design D2; make the footer call it.
      Verify `npm run test:e2e:narrow -- 73-footer-render`, `74-footer-chrome-pass` and
      `79-footer-appearance` pass unchanged
- [ ] 2.2 Point `zoom-trail.ts` at the shared module for `renderInline` and the segment glyphs;
      verify the zoom trail's e2e tests pass unchanged
- [ ] 2.3 Add the `descendantDepth` option to `buildRows` (design D3), defaulting to the
      footer's level; verify `tests/footer-model.test.ts` gains a case where zero emits no
      descendant rows and no fold counts. Negative control: filter descendants out after the
      fact and confirm the fold-count assertion fails

## 3. The search

- [ ] 3.1 Expose the backlink index's tree cache as `ensureTree(file)` (design D4); verify a unit
      test shows the same `OutlineDoc` instance is returned to the index's `place()` and to a
      second caller for an unchanged file
- [ ] 3.2 Create `src/plugin/vault-search.ts`: the progressive, yielding, generation-guarded walk
      over the vault or one file, calling back per note with the hit ids from `matchNodes`, and
      counting past the group cap (design D5); verify unit tests with a fake vault of stubbed
      files: results arrive per note, a bumped generation silences stale callbacks, the tail
      count is the true remainder. Negative control: drop the generation check and confirm the
      stale-callback test fails

## 4. The palette

- [ ] 4.1 Create `src/plugin/search-palette.ts`: the `Modal` subclass with the prompt shell,
      the query field, the scope chip, the results container and the hints row (design D1, D8);
      verify by opening it from the command and checking the DOM carries the combobox, listbox
      and option roles
- [ ] 4.2 Wire the query to `vault-search` and the results to the shared renderer with
      `descendantDepth: 0`, groups as cards, the cap tail, and the two empty states; verify
      manually against the test vault with the queries from `docs/research/31`'s captures
- [ ] 4.3 Implement the keyboard model on the modal's `Scope`: arrows over hits, modified arrows
      over groups, scroll-into-view, hover selection, Tab toggling scope and re-running the
      query; verify manually and in 5.1
- [ ] 4.4 Implement landing on a hit through the registry (design D6): open, caret, scroll,
      zoom root chosen by the leaf rule, gated on outline mode; Shift and the new-tab modifier
      variants; the palette closes. Verify `grep -n "as any\|\.cm\b" src/plugin/search-palette.ts`
      is empty and 5.1 passes
- [ ] 4.5 Register the "Search outline" command in `main.ts` with a plain `callback` so it is
      available in every view; verify the command is offered with outline mode off
- [ ] 4.6 Styles: the palette's result scope inherits the footer's row rules; hit-only active
      state; the chip; the phone container query hiding the hints; verify on the desktop and
      mobile e2e configs by screenshot

## 5. End-to-end

- [ ] 5.1 Add `e2e/specs/45-search-palette.e2e.ts` covering: the command opens the palette
      outside outline mode; a query renders grouped hits under lineage with no children; two
      hits share their ancestor; the match is marked; arrows cross a group boundary and the
      group jump lands on a group's first hit; Tab narrows to the current note and back; Enter
      on a hit with children zooms to it, on a leaf to its parent, with the caret on the hit;
      Shift+Enter opens unzoomed; Enter outside outline mode opens unzoomed; a replaced query
      shows only the replacement's results; the group cap's tail states the remainder. Negative
      controls: for the zoom tests, disable the `zoomTo` dispatch; for the stale-results test,
      drop the generation guard; for the cap test, stop counting past the cap
- [ ] 5.2 Run the same spec under the mobile config and add the tap-opens and hints-hidden
      assertions; verify it passes under `--mobile`
- [ ] 5.3 Manual pass in a real vault: broad and narrow queries, both scopes, every landing
      variant, a note not yet opened this session; record findings in `docs/research/31`

## 6. Docs and validation

- [ ] 6.1 Update `docs/research/31`'s prototype section with what changed between prototype and
      feature (the four differences named in design Context); verify the section reads as a
      record, not a session log
- [ ] 6.2 `openspec validate search-palette --strict`
