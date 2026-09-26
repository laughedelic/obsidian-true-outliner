## 1. The index reports subpaths

- [ ] 1.1 Add `subpath` to `BacklinkReference` in `src/plugin/backlink-index.ts`, set from
      `parseLinktext(ref.link).subpath` for links, embeds and frontmatter links, absent when empty.
      Verify with cases in `e2e-tests/specs/72-backlink-index.e2e.ts` for each scenario of
      `backlink-index`'s new requirement: an aliased heading link, a nested heading path, an embed
      of a block, a frontmatter heading link, and the three whole-note forms reporting none.
      Negative control: leave the frontmatter loop without the field and confirm the property case
      fails

## 2. Anchors of a parsed document

- [ ] 2.1 Create `src/anchors.ts` with `anchorsOf(doc)` per design D2, reading attached ids from
      `OutlineNode.blockId` and misplaced ones from `misplacedBlockIds`: headings with their text
      and level, block ids with their lower-cased key, each with its start line and owning node id,
      in document order. Verify with `tests/anchors.test.ts` holding the 68 shapes of the
      attribution prototype in `docs/research/zoom-scoped-backlinks` as a table of text → expected
      start line — `^f15` on the paragraph our parser makes of it, as the design's first risk
      records — plus the heading-text rows (closing hashes, setext, trailing spaces, inline markup
      kept, an id kept in the text). Negative controls: leave out the list-item lift and confirm
      `^x8`–`^x10` fail; leave out the run rule and confirm `^y2` fails
- [ ] 2.2 Add a property to `tests/anchors.test.ts` over `arbTree()` documents with ids appended to
      random lines: every anchor's owning node is `nodeAtLine(doc, line)` for its own start line.
      Negative control: return the lone id line's own line as the start and confirm the property
      fails
- [ ] 2.3 Add the pure classification to `src/anchors.ts` (design D3): given the anchors, the zoom
      root's id, its cover and a resolver from subpath to start line, answer `node`, `below` or
      `outside` for a subpath, and which answers are available. Verify in `tests/anchors.test.ts`
      with a stub resolver: the root's own heading is `node`, a descendant's id is `below`, a
      sibling's is `outside`, an id on the line after a zoomed table is `node`, a subpath the
      resolver cannot place is `outside`, and a root with no anchor but an anchored child offers
      `below` and not `node`. Negative control: test membership by the anchor's LINE against the
      cover instead of by its owning node, and confirm the table case fails

## 3. The answer in the controls model

- [ ] 3.1 Add `scope: ReadonlySet<string> | null` to `ControlsState` in
      `src/plugin/footer-filter.ts` and apply it at the head of `filterSources`, `presentValues`
      and `admitReferences` (design D1). Verify in `tests/footer-filter.test.ts`: totals under a
      scope count only admitted references; the kind axis offers no `note` under a narrow scope; a
      reference with no subpath is admitted only by `null`; `admitReferences` drops out-of-scope
      references from a placed group; every existing case passes unchanged with `scope: null`.
      Negative control: apply the scope in `filterSources` only and confirm the `admitReferences`
      case fails
- [ ] 3.2 Keep a selection alive across answers (design D8): offered values are the scoped set's
      plus any selected value it lacks, at a count of zero, and `pruneDeadSelections` runs against
      the unscoped axes. Verify with a `tests/footer-filter.test.ts` case for a folder that only
      whole-note references carry, selected, then scoped, then unscoped. Negative control: prune
      against the scoped axes and confirm the selection is lost

## 4. The footer answers for the zoom

- [ ] 4.1 Add `test-vault/Backlinks/Zoom target.md`, carrying the probe corpus's heading and
      block-id shapes, and source notes linking to its anchors in every form the specs name — an
      aliased link, a nested path, a case variant, a duplicate heading, an embed, a property, and a
      whole-note link. Verify that `72-backlink-index`, `73-footer-render`, `75-footer-behaviour`,
      `77-footer-controls` and `78-footer-caps` still pass in narrow mode, since they count the
      fixture vault
- [ ] 4.2 Create `src/plugin/footer-scope.ts` with `zoomAnswerFor(state)` (design D2, D3): the
      anchors of `parsedDoc(state.doc)`, a `CachedMetadata` of their headings and blocks for
      `resolveSubpath`, the classification from 2.3 and the key of design D4; memoized per
      `EditorState`. Verified end to end by 4.4 and 5.1
- [ ] 4.3 Give `BacklinksFooterWidget` the answer object: `eq` compares the path and the key, and
      `updateDOM` hands a new object to the existing controller and re-renders it (design D4).
      Verify with a case in `e2e-tests/specs/77-footer-zoom-scope.e2e.ts` that tags the footer
      element before zooming and finds the same element after zooming in, switching answers and
      zooming out. Negative control: return `false` from `updateDOM` and confirm the element is
      replaced
- [ ] 4.4 Add `scopeAnswer` to the per-note view state with the fallback of design D5, and have the
      controller build `ControlsState.scope` from the summaries' distinct subpaths. Verify with
      `e2e-tests/specs/77-footer-zoom-scope.e2e.ts` cases for every scenario of
      `backlink-filtering`'s "While zoomed, the footer answers for the zoomed node" and "The zoom
      answer comes before every filter, and is not one", against the fixture from 4.1. Negative
      control: ignore the fallback (apply the chosen answer even when unavailable) and confirm "A
      narrower choice falls back without being forgotten" fails
- [ ] 4.5 Build the header control of design D6: the three shared glyphs at their one size, the chip
      and its menu with no caption, and the narrow form's segments with their counts, the switch
      between them in `styles/20-backlinks-footer.css` under the header's existing container query;
      add `'scope'` to `OpenPopover`. Verify with `e2e-tests/specs/77-footer-zoom-scope.e2e.ts`
      cases for each scenario of `backlinks-footer`'s "While zoomed, the header names what the
      footer answers for" — the segments through `resizeLeafForFooter` on desktop and in a
      `--mobile` narrow run — and confirm `e2e-tests/specs/77-footer-controls.e2e.ts` still passes
      its one-row header case unzoomed. Negative controls: leave `'scope'` out of `OpenPopover` and
      confirm "Opening the menu closes another popover" fails; show the chip at every width and
      confirm "A narrow footer offers the answers as segments" fails
- [ ] 4.6 Render the empty answer (design D7). Verify with the two scenarios of "An answer with
      nothing in it says so and offers the note". Negative control: render the dormant footer for
      an empty answer and confirm the first scenario fails
- [ ] 4.7 Verify the live-document half with the two parts of "An edit counts before the note is
      saved": type ` ^later` onto a line of the zoomed node and read the footer within 500 ms,
      well inside the measured ≈2 s save debounce; then delete it and read again. Negative control:
      resolve against `getFileCache` instead of `anchorsOf` and confirm the first read fails
- [ ] 4.8 Measure the repaint cost of typing inside a heading in the zoomed view on the hub
      fixture (design Risks), with the `76-footer-cost` harness, and record the figure in
      `docs/research/zoom-scoped-backlinks`. If a repaint costs more than a frame, bring the
      keystroke case back to review before landing

## 5. Agreement with Obsidian

- [ ] 5.1 Add the agreement case of design D9 to `e2e-tests/specs/77-footer-zoom-scope.e2e.ts`:
      for every fixture note carrying headings or block ids, each `getFileCache` heading and block
      starts on the line `anchorsOf` gives the same heading or id. Negative control: attribute a
      misplaced id to the paragraph holding it and confirm the case fails on `Zoom target.md`

## 6. Docs and landing

- [ ] 6.1 Add to `docs/research/structured-backlinks` D13 a pointer to this change and to
      `docs/research/zoom-scoped-backlinks`, and record in the research note that
      `Backlinks/Zoom target.md` now carries the probe corpus the agreement case runs over. Verify
      with `node scripts/check-research-index.ts`
- [ ] 6.2 Run `npm run build`, `npm test` and `npm run lint`, and a narrow run of
      `77-footer-zoom-scope` on desktop and with `--mobile`; all pass
- [ ] 6.3 `openspec validate zoom-scoped-backlinks --strict`
