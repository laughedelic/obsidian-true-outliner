## 1. Measure

- [ ] 1.1 Measure the cold whole-vault tree resolution inside Obsidian: an e2e probe on a
      generated vault of a few thousand notes timing the first sweep through the shared tree cache
      and the second; record both figures in `docs/research/search-surfaces` (open question 1) and
      decide there whether background warming (design D5) is added. The probe goes beside the note
      under `docs/research/prototypes/search-palette/`, as the prototype's own capture did, and not
      in `e2e/specs/`, which `scripts/spec-groups.mjs` globs into the CI matrix — a vault of a few
      thousand notes is a measurement, not a check to run on every push — generated with
      `scripts/gen-backlink-hub.mjs --notes 3000` into the gitignored hub folder, and driven
      through `scripts/e2e-narrow.mjs`, which resolves a direct `.e2e.ts` path before it falls
      back to matching by substring. Record retained heap after the sweep beside the two timings:
      the cache has no eviction and no production caller of `clearTrees()`, so the sweep's
      retention is a figure of the same standing as its duration (design D4). Verified by the
      three figures being in the note

## 2. The shared renderer

- [x] 2.1 Split the segment level out of `backlinks-footer.ts` into its homes (design D2):
      `segmentGlyph`, `separatorGlyph`, `segmentMarker` and the `markerSlot` / `ordinalMarker` /
      `checkboxGlyph` primitives to `src/plugin/lineage-row.ts`; `renderInline` with
      `unwrapBlocks`, `decodeEntities`, `withoutEmbeds`, `dropMedia` and the match-marking walk to
      a new `src/plugin/inline-render.ts`; `glyph()` and the disclosure to a new
      `src/plugin/chrome-controls.ts`. Repoint `zoom-trail.ts`'s three imports across them.
      Verify `npm run test:e2e:narrow -- 80-outline-zoom` passes unchanged, and that
      `lineage-row.ts` imports neither `obsidian` nor a `Component`
- [x] 2.2 Create `src/plugin/lineage-list.ts` and move into it the footer's list level — the group
      head, the row renderer, `markerFor` and the match-marking walk — parameterised by the
      per-surface options in design D2, calling down into `lineage-row.ts` for the rest, and
      returning the row element so a caller can put its own role on it; make the footer call it
      through one `listOptions()`. Verify `npm run test:e2e:narrow -- 73-footer-render`,
      `74-footer-chrome-pass` and `79-footer-appearance` pass unchanged
- [x] 2.3 Rename the classes the shared renderer emits from `to-backlinks-*` to `to-lineage-*`
      (design D2) — `lineage-row.ts`'s own strings, `lineage-list.ts`'s rows and group head, their
      rules, and the e2e selectors that read them. Verify the whole `backlinks` group and
      `80-outline-zoom` pass unchanged. Negative control: leave one shared class behind and
      confirm the check in 4.6 names it

- [x] 2.4 Add the `descendantDepth` option to `buildRows` (design D3), defaulting to the
      footer's level; verify `tests/footer-model.test.ts` gains a case where zero emits no
      descendant rows and no fold counts, and one over a hit nested under a non-matching ancestor
      where that ancestor still has a row of its own. Negative control: keep the footer's depth
      and filter to hits and lineage rows instead, and confirm the nested-hit case fails on the
      missing ancestor row

## 3. The search

- [x] 3.1 Expose the `SourceTreeCache` the backlink index owns, so the search reads that instance
      (design D4); verify `tests/source-tree-cache.test.ts` shows one cache handing a second caller
      the same `OutlineDoc` for an unchanged file, without reading again. The INDEX's half — that
      `treeCache` hands out the instance it indexes with — is e2e's to cover, not vitest's:
      `backlink-index.ts` does `file instanceof TFile` and the `obsidian` package is types-only
      (`main: ""`), so the unit suite cannot load it, the same split `decorate.test.ts` records.
      Negative control: a second `SourceTreeCache` over the same vault, which reads again and
      answers with a tree whose node ids are not the first's — ids are per parse, so two caches
      cost correspondence, not just memory
- [ ] 3.2 Create `src/plugin/vault-search.ts`: the progressive, yielding, generation-guarded walk
      over the vault or one file, ordered by modification time before the first tree is resolved,
      calling back per note with one hit per matching node — the id, the index of the first of the
      node's own lines `matchRanges` finds the term in, and that occurrence as written, not the
      query (design D5) — and counting past the group cap; verify unit tests with a fake vault of
      stubbed files: results arrive per note and in recency order whatever order the files come
      back in, a hit inside a fence reports the fence's third line rather than its first, a bumped
      generation ends the walk rather than only silencing it, the tail count is the true
      remainder. Negative control: drop the generation check and confirm the
      stale-callback test fails. Second negative control: silence the stale callback but let the
      walk run on, and confirm the read count for a superseded query does not drop

## 4. The palette

- [x] 4.1 Create `src/plugin/search-palette.ts`: the `Modal` subclass with the prompt shell,
      the query field, the scope chip, the results container and the hints row (design D1, D8);
      verify by opening it from the command and checking the DOM carries the combobox, listbox
      and option roles
- [x] 4.2 Wire the query to `vault-search` and the results to the shared renderer with
      `descendantDepth: 0` and `hitOf` answering the search's own hit so a fence, table or callout
      row shows the matching line, groups as cards, the cap tail once the sweep finishes, and the
      three query states — below the floor, searching, nothing found; verify manually against the
      test vault with the queries from `docs/research/search-surfaces`'s captures
- [x] 4.3 Implement the keyboard model on the modal's `Scope`: arrows over hits, modified arrows
      over groups, stopping at both ends rather than wrapping, scroll-into-view, selection on
      pointer MOVEMENT rather than on the pointer being over a row, Tab toggling scope and
      re-running the query, and the input-row control doing the same in both scopes (design D7);
      verify manually and in 5.1
- [x] 4.4 Implement landing on a hit through the registry (design D6): take the leaf with
      `getLeaf(newLeaf)` and open the file on it rather than reading back the active view, wait a
      bounded number of frames for the registry to carry that view before giving up on the zoom,
      caret, scroll,
      zoom root chosen by the leaf rule and withheld when a childless hit has no parent, gated on
      outline mode; Shift and the new-tab modifier
      variants; the palette closes. Verify `grep -n "as any\|\.cm\b" src/plugin/search-palette.ts`
      is empty and 5.1 passes. Negative control: take the registry lookup once instead of waiting
      and confirm the new-tab zoom test fails
- [x] 4.5 Register the "Search outline" command in `src/plugin/main.ts` with a plain `callback` so it is
      available in every view; verify the command is offered with outline mode off
- [x] 4.6 Styles: move the renamed row rules, the group head's rules (the group, its head, name,
      folder, count and chevron, and `--to-group-inset`) and the custom properties into
      `styles/15-lineage-list.css` under the shared `to-lineage-list` scope, leaving
      `styles/20-backlinks-footer.css` the footer's own — its placement under a note, its
      `white-space: normal`, which undoes the CodeMirror `pre-wrap` a block widget inherits and
      means nothing in a modal, its heading and its controls (design D2). Add the check that keeps
      it true: no `to-lineage-*` selector in the footer's part, and no `to-backlinks-*` selector in
      the shared one, as a case in `tests/styles.test.ts` beside the brace check. Then `styles/80-search-palette.css`: the
      shell, the hit-only active state, the scope control, and the palette's own `container-type`
      with the query that hides the hints. Verify on the desktop and mobile e2e configs by
      screenshot

## 5. End-to-end

- [ ] 5.1 Add `e2e/specs/45-search-palette.e2e.ts`, with its own helpers beside it as
      `e2e/search-palette.ts`, covering: the command opens the palette outside outline mode; a
      query renders grouped hits under lineage with no children; the vault scope carries a scope
      control that narrows without a key; two hits share their ancestor;
      the match is marked; arrows cross a group boundary and the group jump lands on a group's
      first hit; Tab narrows to the current note and back; Enter on a hit with children zooms to
      it, on a leaf to its parent, with the caret on the hit; Shift+Enter opens unzoomed; Enter
      outside outline mode opens unzoomed; a childless top-level hit opens unzoomed; a replaced
      query shows only the replacement's results; the next-hit key on the last hit does not wrap;
      a group arriving does not move the active hit; groups arrive most-recently-modified first;
      the active hit scrolls into view; the palette says nothing about matches until the sweep
      finishes, and says so after; below the floor it shows the hints; the new-tab modifier leaves
      the previous tab as it was and zooms in the tab it opens, on a note not yet loaded; a fence
      hit shows the matching line marked; opening from the
      graph view offers no scope control; the group cap's tail states the remainder. Negative controls: for the zoom tests, disable
      the `zoomTo` dispatch; for the stale-results test, drop the generation guard; for the cap
      test, stop counting past the cap
- [ ] 5.2 Run the same spec under the mobile config and add the tap-opens, hints-hidden and
      scope-control-tappable assertions; verify it passes under `--mobile`. Negative control:
      drop the palette's container query and confirm the hints-hidden assertion fails
- [ ] 5.3 Manual pass in a real vault: broad and narrow queries, both scopes, every landing
      variant, a note not yet opened this session; record findings in
      `docs/research/search-surfaces`

## 6. Docs and validation

- [ ] 6.1 Update `docs/research/search-surfaces`'s prototype section with what changed between
      prototype and feature (the four differences named in design Context); verify the section
      reads as a record, not a session log
- [ ] 6.2 `openspec validate search-palette --strict`
