## 1. Measure the mechanism before building on it

- [x] 1.1 Probe a real Obsidian with the whole decoration stack live: collapse every gap row and
      compare content height, per-row height and per-row class list against the same note
      unhidden
- [x] 1.2 Probe CodeMirror's own height map — `contentHeight`, and a `coordsAtPos`/`posAtCoords`
      round-trip on every content line — since scrolling and click-to-place read it
- [x] 1.3 Probe the mechanisms that already end on a gap line: the backlinks footer's anchor at
      the document end, a fold cover, a zoom's trailing range. The node cover's background is
      reasoned about (separate provider, CM6 concatenates same-position line classes) and NOT
      measured — task 4.6 closes that
- [x] 1.4 Measure the caret's own row at the pure level over both generators: every gap line
      materializes a provisional position, and no gap line carries a `decorate()` fact.
      Negative control — a build that hides a row carrying a fact fails the second property
- [x] 1.5 Record all of it in `docs/research/gap-line-hiding`, with a row in the research index

## 2. The setting

- [x] 2.1 Declare `hideGapLines` in `src/plugin/settings/appearance.ts`, default off, with a
      description naming what the outline gives up (design D4)
- [x] 2.2 Accessor pair on the plugin plus its `WRITERS` row; the setter forces a redraw, as
      every paint-only appearance setting's does
- [x] 2.3 `DecorationSource` gains the field. It stays OUT of `renderInputs`' cache key: that
      function's records do not depend on it, and `computeDecorations` reads it live

## 3. The rendering

- [x] 3.1 `gapLineDecoration` takes the guide string as OPTIONAL and a hidden flag, and emits the
      collapse class (design D2)
- [x] 3.2 Emit it for a gap line carrying no guide when the setting is on. Negative control — with
      the old `guides !== undefined` gate, a top-level gap stays open while nested ones collapse
- [x] 3.3 `styles/70-gap-lines.css`, one new part: height and min-height to zero, block padding
      and margin to zero. The guide overlay needs nothing — its `::after` resolves both `top` and
      `bottom`, so its used height is the collapsed box's; `overflow: hidden` is a guard, not a
      requirement

## 4. Tests

- [x] 4.1 Unit test in `tests/decorate.test.ts`: the gap/fact partition over both generators,
      as a standing property rather than a one-off measurement. Negative control — a gap line
      given a fact makes it fail. Note what this does NOT guard: `computeProvisional`'s own gate,
      which lives in `decorations.ts` and has no unit test (design D3)
- [x] 4.2 E2E case in `e2e/specs/50-decorations.e2e.ts` or its own spec: every separator row at
      zero height, every content row's class list and height unchanged, seams closed. Negative
      control — the setting off leaves every row at its natural height
- [x] 4.3 E2E case: a provisional position's row stays at full height with its separation
      collapsed either side. Negative control — hiding by `isGapLine` alone collapses it
- [x] 4.4 E2E case: the backlinks footer renders with the setting on against a note ending in a
      gap. Negative control — the same note under a block-replacement mechanism loses the footer
- [x] 4.5 E2E case: the setting composes with a zoom and with a folded node, neither of which
      may lose its own hidden range or cover
- [x] 4.6 E2E case: a node cover's selection background over a node whose trailing gap is
      collapsed — the fourth mechanism that ends on a gap line, reasoned about in task 1.3 but
      not measured there. Negative control — the cover's own class failing to land on the gap row
- [x] 4.7 Decide D1 against the height-map figures. DECIDED: the CSS collapse stands and the
      settling is accepted — judged against the real thing it is not a defect a reader trips
      over, and the block replacement buys an exact scrollbar for a second decoration source on
      an opt-in setting. Recorded in design D1 and the research note
- [x] 4.8 Mark the setting EXPERIMENTAL with a chip on its row, not prose in the description:
      `SettingRow.experimental`, a description fragment the tab builds, one stylesheet part.
      Negative control — a declaration losing the flag drops the chip, which
      `tests/plugin.test.ts` pins and the e2e case measures in a real settings tab

## 5. Land

- [x] 5.1 `npm run lint`, `npm run build`, `npm run test`
- [x] 5.2 A checkpoint push, which runs CI's full matrix
- [x] 5.3 Sync the delta spec into `openspec/specs/outline-decorations`
- [x] 5.4 Archive the change and bump the version, on the branch, before merging
- [x] 5.5 `openspec validate hide-gap-lines --strict`
