## 1. Decide D1

- [ ] 1.1 Read `docs/research/prototypes/lineage-rendering.html` against both surfaces, with
      "Compare all four at once" on, and settle D1
- [ ] 1.2 Record the choice and its reasoning in design.md, replacing the open D1
- [ ] 1.3 Fold the answer into the two delta specs, which are written to hold either way

## 2. One answer to what a node says

- [ ] 2.1 Move the per-kind content rule out of `footer-model.ts`'s `contentOf` into
      `node-text.ts`, returning `{ markdown, render }` (design D3)
- [ ] 2.2 Make `nodeLabel` a caller of it: per-kind content, first line only, kind-label
      fallback, ellipsis when the node has more
- [ ] 2.3 `footer-model.ts` calls the moved rule rather than its own copy
- [ ] 2.4 Unit tests in `tests/zoom.test.ts`: a callout, table and code-block ancestor's label,
      each against the footer row's own text for the same node — the assertion is that they
      agree, not that either has a particular value
- [ ] 2.5 Negative control: revert 2.1 and confirm 2.4 fails

## 3. A lineage segment carries a render mode

- [ ] 3.1 `LineageSegment.text` becomes `markdown` plus `render` (design D4)
- [ ] 3.2 `footer-model.ts` builds segments through the moved rule, so a segment and a node row
      of the same kind carry the same content
- [ ] 3.3 `zoom-trail.ts` builds its crumbs the same way; the file segment stays plain text,
      since a file name is not markdown
- [ ] 3.4 Extend `tests/footer-model.test.ts`'s lineage cases to assert the render mode, not
      only the text

## 4. One rendering path

- [ ] 4.1 Add the renderer option to `lineage-row.ts` and replace `appendText` with it
      (design D5)
- [ ] 4.2 The footer passes its existing renderer; `renderContent` becomes the shared entry
- [ ] 4.3 `ZoomTrailWidget` creates a `Component` in `toDOM` and unloads it in `destroy`
- [ ] 4.4 Plain text fills a segment synchronously; the rendered form replaces it when the
      promise settles (design D6)
- [ ] 4.5 Apply D1's policy in one function over the rendered fragment (design D2)

## 5. Media in a row

- [ ] 5.1 Constrain media inside `.to-backlinks-content` in `styles.css` (design D7)
- [ ] 5.2 Confirm the constraint covers reference rows, which have the defect today

## 6. Verification

- [ ] 6.1 `e2e/specs/73-footer-render.e2e.ts`: a lineage row whose ancestors carry emphasis, a
      code span, an external link, a wikilink and an image renders per D1 — asserted on the
      row's DOM, not on its text
- [ ] 6.2 The same spec asserts a lineage row and the reference row beneath it treat the same
      syntax the same way
- [ ] 6.3 `e2e/specs/80-outline-zoom.e2e.ts`: a callout, table and code-block ancestor's crumb
      carries no block syntax
- [ ] 6.4 The same spec asserts a crumb renders inline markdown per D1
- [ ] 6.5 Under option A, a crumb has exactly one activatable target and clicking anywhere in it
      re-roots the view; under option B, the nested-link case is asserted instead
- [ ] 6.6 Negative controls for 6.1 and 6.3: disable the fix, confirm each fails
- [ ] 6.7 Full sweep in CI on the checkpoint push

## 7. Land

- [ ] 7.1 Manual pass in a real vault, both surfaces, on the note that produced the report
- [ ] 7.2 `openspec sync` the two delta specs into the main specs
- [ ] 7.3 Archive the change and bump the version
