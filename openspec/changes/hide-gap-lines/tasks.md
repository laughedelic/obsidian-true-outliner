## 1. Measure the mechanism before building on it

- [x] 1.1 Probe a real Obsidian with the whole decoration stack live: collapse every gap row and
      compare content height, per-row height and per-row class list against the same note
      unhidden
- [x] 1.2 Probe CodeMirror's own height map — `contentHeight`, and a `coordsAtPos`/`posAtCoords`
      round-trip on every content line — since scrolling and click-to-place read it
- [x] 1.3 Probe the three mechanisms that already end on a gap line: the backlinks footer's
      anchor at the document end, a fold cover, a node cover's background
- [x] 1.4 Measure the caret's own row at the pure level over both generators: every gap line
      materializes a provisional position, and no gap line carries a `decorate()` fact.
      Negative control — a build that hides a row carrying a fact fails the second property
- [x] 1.5 Record all of it in `docs/research/gap-line-hiding`, with a row in the research index

## 2. The setting

- [x] 2.1 Declare `hideGapLines` in `src/plugin/settings/appearance.ts`, default off, with a
      description naming what the outline gives up (design D4)
- [x] 2.2 Accessor pair on the plugin plus its `WRITERS` row; the setter forces a redraw, as
      every paint-only appearance setting's does
- [x] 2.3 `DecorationSource` gains the field, and `renderInputs`' cache key gains it too — two
      settings have to be told apart on one state

## 3. The rendering

- [x] 3.1 `gapLineDecoration` takes the guide string as OPTIONAL and a hidden flag, and emits the
      collapse class (design D2)
- [x] 3.2 Emit it for a gap line carrying no guide when the setting is on. Negative control — with
      the old `guides !== undefined` gate, a top-level gap stays open while nested ones collapse
- [x] 3.3 `styles/70-gap-lines.css`, one new part: height and min-height to zero, block padding
      and margin to zero, `overflow: hidden` so the guide overlay's absolute `::after` collapses
      with the box

## 4. Tests

- [x] 4.1 Unit test in `tests/decorations.test.ts`: the gap/fact partition over both generators,
      as a standing property rather than a one-off measurement. Negative control — a gap line
      given a fact makes it fail
- [x] 4.2 E2E case in `e2e/specs/50-decorations.e2e.ts` or its own spec: every separator row at
      zero height, every content row's class list and height unchanged, seams closed. Negative
      control — the setting off leaves every row at its natural height
- [x] 4.3 E2E case: a provisional position's row stays at full height with its separation
      collapsed either side. Negative control — hiding by `isGapLine` alone collapses it
- [x] 4.4 E2E case: the backlinks footer renders with the setting on against a note ending in a
      gap. Negative control — the same note under a block-replacement mechanism loses the footer
- [x] 4.5 E2E case: the setting composes with a zoom and with a folded node, neither of which
      may lose its own hidden range or cover

## 5. Land

- [x] 5.1 `npm run lint`, `npm run build`, `npm run test`
- [ ] 5.2 A checkpoint push, which runs CI's full matrix
- [ ] 5.3 Sync the delta spec into `openspec/specs/outline-decorations`
- [ ] 5.4 Archive the change and bump the version, on the branch, before merging
- [x] 5.5 `openspec validate hide-gap-lines --strict`
