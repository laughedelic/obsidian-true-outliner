## Context

A heading's mark is built by `buildMarkerIcon(kind)` in `src/plugin/decorations.ts`, which
switches on the kind alone and appends SVG children through DOM calls. It has five call sites on
three surfaces:

- **The editor**: `MarkerWidget.toDOM` for plain lines. The widget-atom injection is never a
  heading, since `WIDGET_ATOM_KINDS` holds only table, callout, html and hr.
- **The backlinks footer**: `markerFor`, `segmentMarker` and `segmentGlyph`.
- **The zoom trail**: it reuses `segmentGlyph`.

The level exists on `OutlineNode.level` but stops there. Neither `LineDecorationFact` nor the
footer's `LineageSegment` carries it.

Each surface decides whether to rebuild its DOM with an identity check, and today that check
knows only the kind:

- `MarkerWidget.eq` compares kind and left shift.
- `lineageKey` joins each segment's text, render mode, kind, task state and ordinal.
- The zoom trail's widget key adds the segment-icon setting to that.

The design has to satisfy the constraints in
[heading-level-markers.md](../../../docs/research/heading-level-markers.md), "The constraints".
The mark it must draw, with exact geometry, is the same note's "Decision".

## Goals / Non-Goals

**Goals:**
- Draw the six styles exactly as the research note's geometry table specifies, from one
  definition every surface shares. `H` with no digit reproduces today's heading mark exactly.
- Make the geometry checkable by the unit suite, which has no DOM
  ([#156](https://github.com/laughedelic/obsidian-true-outliner/issues/156)).
- Give every identity check on the drawing path the level and the style, so neither an edit nor a
  setting change leaves a stale mark mounted.

**Non-Goals:**
- Restructuring how the other kinds are drawn. They move into the same pure geometry function
  only because they share `buildMarkerIcon`'s switch; their shapes do not change.
- A general per-kind style mechanism. The style is one value for one kind (proposal, Non-goals).

## Decisions

### D1. Geometry is a pure function; the DOM is a thin materialiser

A new function, `markerShapes(subject)`, returns a list of primitives: a tag plus its attributes,
covering `rect`, `polygon`, `circle`, `line`, `polyline`, and a stroked `path` inside a
transformed `g`. `buildMarkerIcon` becomes a loop that creates those elements under the existing
`<svg viewBox="0 0 16 16">`. The whole heading drawing becomes reachable from the unit suite:
bounds, distinctness, and the derived `H` height.

*Alternatives.*
- Keeping the drawing inline in `buildMarkerIcon` leaves the geometry testable only in e2e,
  through rendered rects, whose pixel values vary by platform.
- A data-URI or CSS-mask icon was rejected in Experiment 5a in favour of DOM-built SVG
  ([experiment-5-block-markers.md](../../../docs/research/experiment-5-block-markers.md)).

### D2. A heading subject always carries its level

The drawing input is a union: `{ kind: 'heading', level, style }` or `{ kind: <other> }`. No call
site can ask for a heading mark without a level. `LineDecorationFact` and `LineageSegment` each
gain `level`, present exactly when the kind is `heading`, forwarded from the node.
`segmentMarker`'s kind-only fallback, for a chain with no elements, takes the row's own fact
instead of a bare kind, so it too has a level to pass.

*Alternative.* Defaulting a missing level to 1, or falling back to the no-digit mark. Either
would make a model defect render as a plausible mark instead of failing to compile.

### D3. The style travels as data with the other drawing inputs

The two settings resolve to one `HeadingMarkerStyle` value, `{ glyph: 'H' | 'hash', level:
'beside' | 'subscript' | 'none' }`. With `none`, the drawing ignores the subject's level. The
subject still carries it (D2), so `data-level` stays true and the identity checks in D4 need no
special case. It is read fresh per recompute through the source interfaces that
already carry marker settings: `DecorationSource` for the editor, `FooterSource` for the footer,
and `ZoomTrailSource` for the trail. The fixed weights live in a table keyed by the style inside
the geometry module. They appear nowhere else.

*Alternative considered.* Draw all six styles into every heading mark and select one by an
attribute on `body`. A setting change would then be paint-only. It is rejected for two reasons:

- `57-marker-gap.e2e.ts` reads a mark's ink as the union of its children's rects, and a
  `display: none` child reports a zero rect at the origin, which corrupts that union.
- Every heading would carry six drawings to show one.

### D4. The level and the style join every identity check on the drawing path

- **`MarkerWidget`**: gains `level` and `style`, and `eq` compares both. Without the level,
  retyping `##` as `###` keeps the H2 widget: same position, same kind, same shift.
- **`lineageKey`**: joins the segment's level, for the same reason on the footer and the trail.
- **The zoom trail's key**: joins the style, as it already joins the segment-icon setting for the
  same failure its comment records.
- **The footer's own widget**: keyed by the note, and already re-rendered by `repaintFooters`.
  It needs no change.

### D5. The twin `H`'s height is computed, not tabulated

The `H`-beside style sizes its glyph box from the digit's ink extent: the outline's figure spans
`y = 1..9` of its authored box, plus half the stroke on each side. The research note's
`3.09 / 9.82` are outputs of that computation. If the digit's box or weight is ever retuned, the
`H` follows, and a unit test holds the equality.

### D6. Digits are stroked paths with scale-compensated stroke width

Each digit path is authored in a 6 × 10 box ([heading-level-markers.md](../../../docs/research/heading-level-markers.md),
"The digits"). It is placed with a uniform `scale` in a `g` transform and centred in its digit
box. `stroke-width` is divided by the scale, so the tabulated `t` is the stroke drawn in viewBox
units at every box size. `vector-effect: non-scaling-stroke` would instead fix the stroke in
rendered pixels, and the footer's smaller box would then draw a proportionally heavier digit
than the editor's.

### D7. `data-kind` and `data-level` sit on the marker wrapper

`MarkerWidget.toDOM` sets `data-kind` on the `.to-decor-marker-icon` span, which the widget-atom
path already does, and sets `data-level` when the kind is `heading`. No stylesheet rule selects
on either. The e2e reads them to find a given level's mark, then asserts on the drawing itself,
so the tests never trust the label (D8).

### D8. Tests assert the drawing, not the label

- **Unit (geometry)**, for every style and level:
  - every primitive's extent, including half its stroke, lies inside `0..16`, bounded
    conservatively by the path's control points;
  - the six digit paths are pairwise distinct;
  - each style's weights match the table;
  - the `H`-beside glyph's top and bottom equal the digit's ink extent;
  - with no digit, the six levels draw identical primitives, and `H` alone equals today's
    heading primitives.
- **Unit (model)**: a heading's fact and lineage segment carry its level, and no other kind
  carries one. `lineageKey` differs between two segments that differ only in level.
- **e2e (editor)**, all in a new decorations-group spec:
  - the six levels mount six different SVG markups, or one shared markup with no digit;
  - retyping a level redraws the mark;
  - each setting switches every mounted heading mark;
  - the width and height equality against a paragraph still holds.
- **e2e (surfaces)**: in a heading's footer lineage and zoom trail segment, the SVG markup
  equals the editor's for the same level and style, before and after a style change.
- **Unchanged and re-run**: `52-block-markers-icons.e2e.ts` and `57-marker-gap.e2e.ts`. The
  heading's wider ink is inside the box, and the checkbox stays the widest mark.

## Risks / Trade-offs

- **[Risk]** Every heading changes its look on upgrade, because the default shows the level. →
  `H` with no digit is today's mark exactly, one setting away. A unit test pins it to today's
  primitives.
- **[Risk]** `#` with no digit has not been reviewed at real size. → It is drawn to the `H`'s
  footprint and weight, and manual review (task 7.1) settles its weight before landing.
- **[Risk]** `#95` and `#124` touch the footer's and the drag preview's calls into
  `buildMarkerIcon`. → The call sites change in only a few lines each. Whichever lands second
  passes the subject from D2. The type change makes a missed site a compile error, not a silent
  plain mark.
- **[Trade-off]** A heading's mark carries more ink than the plain `H`: a second glyph, and ink
  reaching further toward its text. → The research note's "Against the budget" shows it inside
  the box and clear of the stated gap, and the gap e2e re-verifies it on CI's fonts.
- **[Trade-off]** The settings tab gains two rows for one kind's mark. → They are the first step
  of #157's "Marker configurability". The row descriptions say what each axis changes, and
  nothing more is added until a second kind earns a style.

## Migration Plan

No data migration. The two keys are new and absent keys take their defaults, as every setting's
does through `normalizePluginData`, which also rejects unknown values. Rollback is a revert: an
older build ignores the two keys.
