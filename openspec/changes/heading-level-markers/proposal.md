## Why

Every heading draws the same blocky `H` whatever its level. So the marker column, the one place
an outline names what each node is, cannot tell an H2 from the H4 two rows below it, and the
level is only visible in the heading's own font size. Per-level markers were parked twice on
scope alone ([experiment-5-block-markers.md](../../../docs/research/experiment-5-block-markers.md),
[decoration-follow-ups.md](../../../docs/research/decoration-follow-ups.md)). The roadmap's
"Marker configurability" ([#157](https://github.com/laughedelic/obsidian-true-outliner/issues/157))
needs a first style axis to start from, and a heading's level is the smallest one with a real
question behind it.

The design pass behind this change is recorded in
[heading-level-markers.md](../../../docs/research/heading-level-markers.md). It covers the
constraints, three review rounds over a dozen candidate marks, and the six styles that came out
of it, with exact geometry.

## What Changes

- **A heading's marker can name its level.** The mark is a glyph plus a level digit, drawn
  inside the existing `0 0 16 16` viewBox and the existing marker box. The box, the gutter and every
  placement term stay where they are, and the ink stays inside the budget measured in
  [marker-text-gap.md](../../../docs/research/marker-text-gap.md).
- **Two settings choose the style**, each on its own axis:
  - **Glyph**: `H`, or `#` (markdown's own heading syntax).
  - **Level digit**: *beside* the glyph at the same height, a *subscript* below and to the
    right, or *none*. With no digit, every level draws the glyph alone, and `H` alone is exactly
    today's mark.

  The six combinations each carry fixed weights for glyph and digit. The weights are part of the
  style and are not settings (the table is in the research note, "Decision"). The defaults are
  `H` and *beside*.
- **Digits are drawn, not typeset.** Six monoline outline paths are drawn like every other mark,
  in `currentColor`. The reader's font never enters the mark's geometry.
- **Every surface that draws a heading's mark draws the same level mark**: the editor line, the
  backlinks footer's gutter and its inline lineage segments, and the zoom trail's segments. A
  style change repaints all three.
- **Markers say what they mark.** Every plain-line marker states its kind in `data-kind`, which
  the widget-atom markers already do, and a heading's marker also states `data-level`. This is a
  hook for snippets and for tests. It does not change how anything renders.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `outline-decorations`: adds a requirement that a heading's marker can name its level, in the
  style the two settings choose, and that `H` without a digit stays today's mark. The box stays
  the same size at every level and in every style. It also requires markers to carry
  `data-kind` and, for a heading, `data-level`.
- `backlinks-footer`: the notation requirement's "same glyph for the same kind" becomes "same
  glyph for the same kind and heading level, and the same glyph the editor draws". Without the
  change, an H2 lineage element and an H3 referencing node would contradict the requirement's
  current wording.

## Non-goals

- **The marker size.** No style changes the box, so `Markers are fixed-size` stands as written.
- **Font-drawn digits.** They look best, and we rejected them because they put the reader's font
  inside the mark's geometry ([heading-level-markers.md](../../../docs/research/heading-level-markers.md),
  "The constraints").
- **The other kinds' marks.** The marker layer's own off switch, per-kind icon choice and a
  uniform bullet set stay with [#157](https://github.com/laughedelic/obsidian-true-outliner/issues/157).
  These two settings are not a framework for them.
- **Tunable weights.** The six styles' weights are fixed; exposing them was tried and settled
  during the design pass.
- **Clicking a mark to change a heading's level** (obsidian-lapel's menu). The mark's click
  already zooms (`outline-zoom`).

## Impact

- **Model → decorations**: `LineDecorationFact` gains the heading's `level`, forwarded from
  `OutlineNode.level`. The footer's `LineageSegment` gains it too, and so does the synthetic fact
  a collapsed lineage row gets from `rowFact`.
- **Drawing**: `buildMarkerIcon` in `src/plugin/decorations.ts` takes a heading's level and the
  chosen style. The geometry moves into a pure function the unit suite can reach, without a DOM.
- **Editor**: `MarkerWidget` carries the level and the style, and includes both in its `eq`.
  Otherwise, retyping `##` as `###` would keep the old widget.
- **Footer and zoom trail**: `markerFor`, `segmentMarker` and `segmentGlyph` in
  `src/plugin/backlinks-footer.ts` pass the level and the style through. Their sources gain the
  style setting.
- **Settings**: two `choice` declarations in `src/plugin/settings/appearance.ts`, with a
  getter/setter pair on the plugin and a row in `WRITERS`. The setter redraws every open editor
  and zoom trail through `nudgeFooters`, and the footers through `repaintFooters`, not just the
  active pane.
- **Tests**: unit tests for the geometry and the fact's level; e2e tests for the level mark on
  every surface, its update on an edit and on a style change. `52-block-markers-icons.e2e.ts`
  and `57-marker-gap.e2e.ts` must pass unchanged.
- **In-flight PRs**: `feat/search-palette` (#95) moves the footer's marker call sites into
  `lineage-list.ts` and `lineage-row.ts`, so whichever lands second resolves a few call-site
  lines. `feat/drag-nodes-with-a-drop-preview` (#124) draws a destination's mark and will need to
  pass a heading's level if it lands after this change.
