## 1. The level reaches the drawing inputs

- [x] 1.1 `LineDecorationFact` gains `level`, set from `OutlineNode.level` for a heading and absent
      for every other kind, constant across a node's lines. Verify with a `tests/decorate.test.ts`
      property over both generators: a fact has a level exactly when its kind is `heading`, and it
      equals the node's. Negative control: dropping the forward in `decorate()` fails it
- [x] 1.2 `rowFact` takes an optional level, and a lineage row's synthetic fact passes its chain's
      first element's level, the element its kind already comes from (design D2). Every fact,
      projected or synthetic, then has a level exactly when its kind is `heading`. Verify with a
      `tests/footer-model.test.ts` case: a lineage row whose chain starts at an H2 has a fact of
      kind `heading` and level 2, and one starting at a paragraph has no level. Negative control:
      the current `rowFact(row.kind, row.depth)` leaves the heading row without a level, and the
      case fails
- [x] 1.3 `LineageSegment` gains the same `level`, and `lineageKey` joins it (design D4). Verify
      with a unit test that two segments differing only in level produce different keys. Negative
      control: leaving level out of the join makes them equal

## 2. The geometry, as a pure function

- [x] 2.1 New module (`src/plugin/marker-shapes.ts`): `markerShapes(subject)` returns the primitive
      list for every kind (design D1). The drawing subject is the union in design D2, and the
      non-heading kinds keep their exact current shapes. Verify with a unit test that each
      non-heading kind's primitives equal the ones `buildMarkerIcon` draws today, copied into the
      test as fixtures, along with today's heading `H` for 2.4
- [x] 2.2 The heading glyphs (`H`, `#`), the six monoline digit paths and the placement helpers,
      exactly as in `docs/research/heading-level-markers.md` "Geometry" and "The digits". The
      digit stroke is scale-compensated (design D6). Verify with unit tests over all six styles ×
      six levels that every primitive's extent, stroke included, lies inside the viewBox
      (bounded by path control points), and that the six digit paths are pairwise distinct.
      Negative control: moving the twin digit box one unit right pushes a digit's stroke out of
      bounds, and the test fails
- [x] 2.3 The style → weights table, as the research note's "Decision" states it, and the `H`-beside
      glyph box derived from the digit's ink (design D5). Verify with unit tests that each style
      draws at its table weights, and that the `H`-beside glyph's top and bottom equal the
      digit's ink extent to within 0.01 units. Negative control: a constant full-height `H` box
      fails the equality
- [x] 2.4 The two no-digit styles: the glyph alone, the same for every level. Verify with unit tests
      that the six levels draw identical primitives under each, and that `H` alone equals the
      heading fixture from 2.1, today's mark. Negative control: drawing the `H`-alone glyph with
      the twin's derived box fails the fixture equality
- [x] 2.5 `buildMarkerIcon` takes the subject and materialises `markerShapes` into the existing
      `<svg>`, still through DOM calls on a detached element. Verify with `npm run build`, the
      lint (the `no-restricted-syntax` DOM guard included) and `52-block-markers-icons.e2e.ts`
      passing unchanged

## 3. The settings

- [x] 3.1 Declare `headingMarkerGlyph` (`H` | `hash`, default `H`) and `headingMarkerLevel`
      (`beside` | `subscript` | `none`, default `beside`) as `choice` settings in
      `src/plugin/settings/appearance.ts`. Each option's label says what it draws; each row's
      description says it changes only heading marks. Verify with a unit test that
      `normalizePluginData` fills both defaults when absent and rejects an unknown value
- [x] 3.2 Getter/setter pair on the plugin, plus their `WRITERS` rows. The setter saves, bumps
      the footer revision, then calls `nudgeFooters` and `repaintFooters`. It does not rely on
      `forceRedraw`, which reaches only the active view (design D9). A single
      `headingMarkerStyle` getter resolves both keys into the style value (design D3). Verify
      with the settings e2e in 6.3
- [x] 3.3 `DecorationSource`, `FooterSource` and `ZoomTrailSource` each gain `headingMarkerStyle`,
      read fresh per recompute. Verify with `npm run build` (the plugin implements all three)

## 4. The editor

- [x] 4.1 `computeMarkers` passes the fact's level and the source's style into `MarkerWidget`.
      `eq` compares level and style alongside kind and shift (design D4). Verify with 6.2.
      Negative control: dropping level from `eq` leaves an H2 mark after `##` becomes `###`
- [x] 4.2 `MarkerWidget.toDOM` sets `data-kind` on the wrapper, and `data-level` for a heading
      (design D7). Verify with 6.1, which locates marks by these attributes and then asserts on
      the drawing

## 5. The footer and the zoom trail

- [x] 5.1 `markerFor`, `segmentMarker` and `segmentGlyph` build their subject from the row's fact
      or the segment, level included, with the source's style. `segmentMarker`'s fallback takes
      the row's fact instead of a bare kind, and that fact carries the level after task 1.2
      (design D2). Verify with `npm run build`: a heading fact, segment or mark without a level
      no longer compiles, pinned by a `@ts-expect-error` case in `tests/marker-shapes.test.ts`
- [x] 5.2 The zoom trail's widget key joins the style (design D4). Verify with 6.4. Negative
      control: leaving it out keeps the old trail glyph after a style change

## 6. End-to-end

- [x] 6.1 New spec `e2e/specs/52-heading-level-markers.e2e.ts`: a note with one heading per level,
      in outline mode. Each heading's mark carries its `data-level`, the six SVG markups are
      pairwise distinct, and every heading mark's box equals a paragraph mark's box. With the
      position set to `none`, the six markups are identical and `data-level` still names each
      level. Iterate with
      `npm run test:e2e:narrow -- 52-heading-level-markers`
- [x] 6.2 Same spec: retyping `## Title` as `### Title` redraws that mark to equal the level-3 markup
      drawn elsewhere in the note. Negative control: task 4.1's
- [x] 6.3 Same spec: with the note open in two panes, the second one zoomed so it shows a trail,
      switching each setting switches every heading mark in both panes, the inactive one included,
      and the trail's heading segment. No line's text moves: every heading's text rect is
      unchanged across the switch. Negative control: a setter that repaints through
      `forceRedraw` alone leaves the inactive pane's marks on the old style
- [x] 6.4 Same spec: with a heading ancestor in a backlinks footer's lineage and in a zoom trail,
      each heading mark's SVG markup equals the editor's for that level and style, before and
      after a style change. Negative control: dropping `repaintFooters` from the setter leaves
      the footer on the old style
- [x] 6.5 Re-run `52-block-markers-icons`, `57-marker-gap` and `74-footer-chrome-pass` narrow and
      unchanged. They pin the box size, the gutter derivation (the checkbox stays the widest
      mark) and the footer's marks sharing the editor's column

## 7. The settings preview

- [x] 7.1 `src/plugin/heading-marker-preview.ts`: one level's mark from `buildMarkerIcon` in the
      given style (design D10), plus its rules in `styles/80-settings.css`, drawn larger than the
      editor's own mark. Verify with 7.3
- [x] 7.2 The settings tab renders it as a `SettingDefinitionRender` row after
      `headingMarkerLevel`, in the declarative path and in the pre-1.13 `display()` fallback, and
      redraws every mounted preview after a write (design D10). Verify with 7.3
- [x] 7.3 Same e2e spec: with the tab open, the preview draws one mark whose markup equals the
      editor's drawing of that level for each style, and whose box is larger, before and after a
      change written through the tab. Negative control: a `setControlValue` without the redraw
      leaves the open preview on the old style

## 8. Manual testing and landing

- [x] 8.1 Add `test-vault/Notes/Heading level markers.md`, a nested H1–H6 outline with
      paragraphs, a list and a reference from another note. Verify by manual review of all six
      styles, `#` alone's weight in particular, light and dark, desktop and mobile emulation,
      footer, zoom trail and the settings preview included. Reviewed and signed off from captures
      of a real (headless) Obsidian in both themes, footer, trail and settings preview included;
      the note stays in the vault for a hands-on pass
- [x] 8.2 `npm run lint` and the unit suite pass, and the research index row for
      `heading-level-markers.md` resolves
- [x] 8.3 `openspec validate heading-level-markers --strict`
