## Context

See proposal.md — Why. The mechanism, the four candidates that failed, the figures for the one
that holds, and the rejected alternative are all in
[docs/research/table-scroll-region](../../../docs/research/table-scroll-region.md); this document decides only what to write and where.

Two constraints shape everything below, both inherited rather than chosen:

- The outer `.cm-table-widget` stays `overflow: visible` and `contain: none`, because a marker
  icon and a guide's `::after` reach left of the line's own box
  ([docs/research/decoration-lessons.md](../../../docs/research/decoration-lessons.md)). So a wide table's scroll cannot live there.
- The inner `.table-wrapper` is `position: relative; width: fit-content` and is the positioning
  anchor for Obsidian's four pieces of table-edit chrome, each placed at a `100%` inset of the
  wrapper's own padding box. So anything we do to that box moves the chrome with it.

## Goals / Non-Goals

**Goals:**

- The scroll container's scroll region holds the table's own content and nothing else.
- Every length in the rule derives from Obsidian's own `--table-drag-handle-size`.
- No TypeScript: the wrapper's overflow is independent of the decoration pipeline, confirmed by
  measurement, so this stays a stylesheet change.

**Non-Goals:**

- Re-deriving the geometry this change restores. The target is stock: what the widget's own box
  measures with outline mode off.
- Any change to the outer element's overrides, or to `MarginCompensation`.

## Decisions

### D1. Reserve the chrome's own size inside the scroll container, rather than gating whether it
is one

A scroll container's scroll region is the union of its padding box with its descendants' boxes,
and Obsidian's chrome is positioned exactly one `--table-drag-handle-size` outside that padding
box on all four sides. There are three ways out of the region, and only these three: take the
chrome out of the scroller's containing-block chain, stop being a scroll container, or grow the
padding box to hold the chrome and place the chrome inside it.

The first breaks placement outright — measured, both by making the wrapper `position: static` and
by making the chrome `position: fixed`. The second is the gate, rejected in the research note: it
is bit-identical to stock when correct and puts the whole note into sideways scroll when stale,
and CM6 offers no redraw to re-evaluate it on when a pane is resized. The third is this change.

The reservation is the same one the outer widget's own padding already is — `padding:
var(--table-drag-handle-size)` — given back with a negative margin of the same length so the
widget's box does not grow, and `max-width` widened by twice the reservation so a wide table
keeps the visible width it has today.

### D2. State both overflow axes, as Obsidian's own rule does

`overflow-x: auto` alone does not leave the other axis alone; it promotes `visible` to `auto`.
The rule becomes `overflow: auto hidden`, the same pairing Obsidian writes on the outer element.
With the reservation in place the hidden axis clips nothing that was visible before — the chrome
is inside the scrollport — and with the wrapper's height still `auto`, a horizontal scrollbar
adds to the box rather than covering the table's last row.

### D3. Re-anchor the two add buttons by their logical insets, not by a transform

Both land in the same place and both measured identically. Logical insets (`inset-inline-end`,
`inset-block-end`) are the direction-independent way to say "the far edge", which matters for an
RTL note, where the add-column button is physically on the left. A transform would have to know
which side that is.

Each button also needs its cross-axis length pulled back by twice the reservation and its
cross-axis offset pushed in by one: its native `height: 100%` / `width: 100%` and its `top: 0` /
`inset-inline-start: 0` resolve against the padding box, which the reservation has grown.
Measured: with both corrections, every piece of chrome keeps its stock size and its stock offset
from the table.

### D4. The rule keeps the gate it already has

The `.table-wrapper` rule fires on the same three classes as the outer element's
`contain`/`overflow` override, so the two are active together: making the wrapper a scroll
container is only correct while the outer is not one. The two new button rules take the same
gate, verbose as the tripled selector list is, rather than the broader
`.to-decor-widget-line` — which marks every widget line we patch, including those the outer
override does not cover.

### D5. The rule lives in `styles/10-editor.css`

It replaces the rule that introduced the defect, next to the doc comment that explains why the
scroll moved to the wrapper at all. A new part file under `styles/` is for a new feature area;
this is the same rule, corrected.

## Risks / Trade-offs

- **Obsidian changes its table chrome's placement or class names** → every length derives from
  `--table-drag-handle-size`, so a resized reservation follows. A renamed or re-anchored piece of
  chrome does not: the failure would be a reappearing scrollbar or a misplaced button, which the
  e2e assertions this change adds would catch on the next Obsidian bump.
- **The add-row strip's bottom edge lands a sub-pixel past the scrollport** on a table whose
  height is fractional, and the hidden axis clips that sliver → measured at 0.39 px on the wide
  fixture; below the threshold where rounding the reservation up would be worth the divergence
  from Obsidian's own value.
- **A theme that restyles `.table-wrapper` itself** (its padding, or its `fit-content` width)
  could shift what the reservation is measured against → the existing rule already overrides that
  box with `!important` and the same exposure; this change does not widen it.
- **Two scroll containers if the outer override ever stops firing while this one does** → D4
  keeps both rules on one gate, and the guide/marker e2e cases already assert the outer's own
  overflow.
