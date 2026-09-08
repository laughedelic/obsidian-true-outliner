## 1. D1 — settled

- [x] 1.1 Compare the policies on both surfaces in
      `docs/research/prototypes/lineage-rendering.html`
- [x] 1.2 Settle D1: live rendering, no colour accent, no media in a chain — recorded in
      design.md with what was rejected
- [x] 1.3 Fold the answer into both delta specs

## 2. One answer to what a node says

- [x] 2.1 Move the per-kind content rule out of `footer-model.ts`'s `contentOf` into
      `node-text.ts`, returning `{ markdown, render }` (design D3)
- [x] 2.2 Make `nodeLabel` a caller of it: per-kind content, first line only, kind-label
      fallback, ellipsis when the node has more
- [x] 2.3 `footer-model.ts` calls the moved rule rather than its own copy
- [x] 2.4 Unit tests in `tests/zoom.test.ts`: a callout, table and code-block ancestor's label,
      each against the footer row's own text for the same node — the assertion is that they
      agree, not that either has a particular value
- [x] 2.5 Negative control: revert 2.1 and confirm 2.4 fails

## 3. A lineage segment carries a render mode

- [x] 3.1 `LineageSegment.text` becomes `markdown` plus `render` (design D4)
- [x] 3.2 `footer-model.ts` builds segments through the moved rule, so a segment and a node row
      of the same kind carry the same content
- [x] 3.3 `zoom-trail.ts` builds its crumbs the same way; the file segment stays plain text,
      since a file name is not markdown
- [x] 3.4 Extend `tests/footer-model.test.ts`'s lineage cases to assert the render mode, not
      only the text

## 4. One rendering path

- [x] 4.1 Add the renderer option to `lineage-row.ts` and replace `appendText` with it
      (design D5)
- [x] 4.2 The footer passes its existing renderer; `renderContent` becomes the shared entry
- [x] 4.3 `ZoomTrailWidget` creates a `Component` in `toDOM` and unloads it in `destroy`
- [ ] 4.4 Measure `MarkdownRenderer.render`'s settle time for one inline string, and how often
      the trail widget rebuilds during ordinary typing — then choose D6's option A or B and
      record it in design.md. The fallback the first draft assumed does not exist
- [x] 4.5 Move the activation guard into `lineage-row.ts` (design D8): a click whose target is
      inside a link or button does not activate the segment, and neither does an `Enter` raised
      on a focusable element inside one
- [x] 4.6 Widen `ZoomTrailWidget`'s key to every render-relevant segment field (design D9),
      keeping node IDs out for the reason `zoom-trail.ts` already records
- [x] 4.7 Apply D1's policy in one function over the rendered fragment (design D2): media out,
      to its alt text; everything else through

## 5. The subdued treatment

- [x] 5.1 A lineage row's links take the row's own colour, underlined at rest (design D1)
- [x] 5.1a Hover — on a link or on a segment — shifts colour only. Remove the lineage row's
      existing hover underline: on this row an underline means "link" and nothing else
- [x] 5.1b Hover keeps `--text-normal`, checked rather than changed: BOTH lineage surfaces sit
      at `--text-faint` in the real stylesheet (the trail has no colour of its own), so one
      destination is visible on both. The divergence this task was written against was the
      prototype's own. The tag and highlight are `currentColor`-relative for a different and
      real reason — a fixed colour would not follow the row's own hover
- [x] 5.2 An external link takes the `alias` cursor and an internal one `pointer`, so the two
      destinations differ before the click rather than after it
- [x] 5.3 A tag steps toward the text colour from the ROW's own colour — `color-mix` on
      `currentColor`, not a fixed token, since the footer's lineage is faint and the trail's is
      muted — and fills on hover
- [x] 5.4 Mute a highlight inside a lineage row, keeping its hue; a reference row keeps its own
      at full strength
- [x] 5.5 Bound media inside a reference row in `styles.css` (design D7); the chain needs no
      rule, since nothing reaches it
- [ ] 5.6 Check every treatment in a light and a dark theme, and against a community theme that
      redefines `--text-faint`

## 6. Organic vault material for the manual pass

Every judgement in D1 was made against a synthetic corpus. The manual pass has to be made
against notes that read like notes, or the treatment is only known to work on a matrix.

- [ ] 6.1 Add vault notes carrying the D1 corpus in ORGANIC prose — links, tags, highlights,
      code spans, an image embed, math, escaped characters — sitting where they naturally fall,
      not one per line. New files rather than edits to the existing `Backlinks/` fixtures, whose
      exact text `tests/footer-model.test.ts` asserts
- [ ] 6.2 Cover both surfaces from the same material: chains deep enough to zoom into for the
      trail, and references to a shared target for the footer
- [ ] 6.3 Include the ancestor kinds the trail leaked — a callout with children, a table, a
      fenced code block — since those are the crumbs no synthetic case proved in place
- [ ] 6.4 Include the cases that only misbehave at length: a chain wide enough to wrap, an
      ancestor whose text is one long link, and an ancestor with several links on one line
- [ ] 6.5 Confirm `scripts/gen-backlink-hub.mjs` and `scripts/check-vault-drift.mjs` are
      unaffected, and that `npm test` still passes against the extended vault

## 7. Verification

- [ ] 7.1 `e2e/specs/73-footer-render.e2e.ts`: a lineage row whose ancestors carry emphasis, a
      code span, an external link, a wikilink and an image renders per D1 — asserted on the
      row's DOM, not on its text
- [ ] 7.2 The same spec asserts a lineage row and the reference row beneath it produce the same
      ELEMENTS for the same syntax, and differ only in colour and in media
- [ ] 7.3 `e2e/specs/80-outline-zoom.e2e.ts`: a callout, table and code-block ancestor's crumb
      carries no block syntax
- [ ] 7.4 The same spec asserts a crumb renders inline markdown per D1
- [ ] 7.5 A link inside a crumb takes the click where the pointer is on it, and the crumb takes
      it everywhere else — asserted as behaviour on BOTH surfaces, since the guard the first
      draft relied on never ran for zoom (design D8)
- [ ] 7.5a `Enter` on a link focused inside a segment follows the link and does not also
      activate the segment
- [ ] 7.5b Toggling a task ancestor's checkbox while zoomed updates that crumb's marker —
      the widget-key regression D9 describes
- [ ] 7.6 An ancestor carrying an image embed renders its alt text, and the row's height is a
      line of text
- [ ] 7.7 Negative controls for 7.1 and 7.3: disable the fix, confirm each fails
- [ ] 7.8 Full sweep in CI on the checkpoint push

## 8. Land

- [ ] 8.1 Manual pass over the organic notes from section 6, both surfaces, in a light and a
      dark theme — plus the real note that produced the report
- [ ] 8.2 `openspec sync` the two delta specs into the main specs
- [ ] 8.3 Archive the change and bump the version
