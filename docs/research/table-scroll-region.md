# A table that fits, scrolling both ways: what the wrapper's scroll region holds

Measured 17 September 2026 against `8b9335b`, Obsidian 1.13.7 under the e2e harness, desktop
config and mobile emulation.

Reported from real-vault use: in outline mode a small table — `Notes/Edge Case Zoo`, two columns
and three rows — scrolls both horizontally and vertically, though it fits its line with room to
spare. Horizontal scroll is the mechanism [experiment-2-guide-lines.md](experiment-2-guide-lines.md) finding 4 introduced for
genuinely wide tables; vertical scroll was never intended at all.

## What scrolls

Obsidian's table widget nests two boxes: the outer `.cm-table-widget`, which is the line, and an
inner `.table-wrapper`, which holds the `<table>`. Our own rule moves `overflow-x: auto` from the
outer onto the wrapper, so the outer can stay `overflow: visible` and let a marker icon and a
guide's `::after` reach left of the line's own box ([decoration-lessons.md](decoration-lessons.md)).

| | wrapper box | wrapper scroll region | scrollbars (h/v) | widget height |
| --- | --- | ---: | ---: | ---: |
| stock, outline off | 230×61, `visible/visible` | 246×77 | 0 / 0 | 93 px |
| outline on | 230×61, computed `auto/auto` | 246×77 | 12 / 12 | 105 px |

The region exceeds the box by exactly 16 px on each axis, and the table is not what exceeds it:
the table is 230×61, the same as the box. The same 16 px appears on every table measured, at
every width, on both fixtures in the decoration corpus.

## What the 16 px is

Obsidian's own declarations, read live from `document.styleSheets`:

```css
.markdown-source-view.mod-cm6 .cm-table-widget {
  --table-drag-handle-size: var(--size-4-4);   /* 16 px desktop; --size-4-6, 24 px, on mobile */
  padding: var(--table-drag-handle-size);
  overflow: auto hidden;
  margin: 0 calc(-1 * var(--size-4-4)) !important;
}
.markdown-source-view.mod-cm6 .cm-table-widget .table-wrapper {
  position: relative;
  width: fit-content;
}
```

The widget's padding is a reservation, and what it reserves room for is four pieces of table-edit
chrome, each absolutely positioned flush outside one edge of the wrapper — which `width:
fit-content` keeps tight to the table, and `position: relative` makes their anchor:

| piece | native placement | size | against the wrapper's scrollport |
| --- | --- | --- | ---: |
| `.table-col-btn` (add column) | `inset-inline-start: 100%; top: 0; height: 100%` | 16×60.59 | 16 px past its right edge |
| `.table-row-btn` (add row) | `top: 100%; inset-inline-start: 0; width: 100%` | 134.59×16 | 16 px past its bottom edge |
| `.table-row-drag-handle` | `inset-inline-end: 100%` (anchored per cell) | 14×28.8 | 13 px past its left edge |
| `.table-col-drag-handle` | `inset-block-end: 100%` (anchored per cell) | 65.8×14 | 13 px past its top edge |

A scroll container's scrollable overflow region is the union of its own padding box with its
descendants' boxes, so making the wrapper a scroll container took all four pieces into its
region. Two of them are in the positive direction and became 16 px of scroll on each axis; the
other two are in the negative direction, which a scroll container cannot reach, and are simply
clipped — 13 of each handle's 14 px. So today, in outline mode, a desktop table's row and column
drag handles are unreachable. That was not reported and is the same rule's doing. Mobile is
spared: `.is-mobile` sets `display: none` on both handles.

The vertical axis is a second, independent mechanism. Our rule states only `overflow-x`, and a
box with one axis `auto` and the other `visible` computes the `visible` one to `auto` — measured
`auto/auto` where the stylesheet says `overflow-x: auto` alone. Obsidian's own rule states
`overflow: auto hidden` for exactly this reason, and pays for the hidden axis with the padding
that absorbs the horizontal scrollbar.

The costs, then, are three: 16 px of vertical scroll on every table (reported), 16 px of
horizontal scroll on every table that fits (reported), and two clipped drag handles (not
reported). On a wide table the spurious vertical scrollbar also takes 12 px of the table's own
visible width — 546 px where the line offers 558.

## Four dead ends, measured

| candidate | fitting table | why it fails |
| --- | --- | --- |
| `overflow-y: hidden` alone | region 16/16, scrollbars 12/0, widget 105 px | closes the reported vertical scroll and leaves the horizontal one, since the chrome still overflows |
| padding on the wrapper | region 16/16, widget 121 px | the chrome's insets are percentages OF the wrapper's padding box, so it follows the padding outward — the region never catches up |
| `right: 0` / `bottom: 0` on the two buttons | insets unchanged | over-constrained against native `inset-inline-start: 100%` / `top: 100%`, so the declaration is dropped |
| `.table-wrapper { position: static }` | region 0/0, widget 93 px | the chrome re-anchors to the widget: the add-column button lands 455 px right of the table at the widget's full height, the add-row strip 590 px wide |

`position: fixed` on the chrome was measured for the same reason and is recorded only because it
isolates the mechanism: it too gives a clean region (0/0), positioning the button against the
viewport at 760 px tall. What leaves the scroll container's containing-block chain leaves its
region, and nothing else does.

`overflow: auto clip` with `overflow-clip-margin` would have been the small fix for the vertical
axis — clip the chrome away without a scrollbar, then let the clip margin pass it through. This
Electron computes that pair as `auto hidden` and the clip margin has no effect, so it is not
available.

## The reservation

What the wrapper is missing is the reservation the widget's own padding already is. Give it the
same one, re-anchor the two add buttons into it, and pull their cross-axis length back to the
table's own so the reservation cannot stretch them:

| | region (h/v) | scrollbars | widget | chrome against the table | drag handles |
| --- | ---: | ---: | ---: | --- | --- |
| fits, stock | — | 0 / 0 | 93 px | `+134.59,0` and `0,+60.59` | 13 px outside, visible |
| fits, today | 16 / 16 | 12 / 12 | 105 px | same offsets | 13 px outside, clipped |
| **fits, reservation** | **0 / 0** | **0 / 0** | **93 px** | **same offsets** | **3 px inside** |
| wide, today | 2977 / 16 | 12 / 12 | 125 px | button pinned at 546 px | clipped |
| **wide, reservation** | **2965 / 0** | **12 / 0** | **125 px** | **button pinned at 558 px** | **3 px inside** |

Every piece of chrome keeps its stock size and its stock offset from the table, and every one is
inside the scrollport rather than outside it. The table itself does not move (16,16 from the
widget's own box, in all three states), the widget's height returns to stock, the guide and the
marker are unaffected, `scrollLeft` on the wide fixture still takes 300, and the document's own
scroller stays at its client width — 668/668 — instead of scrolling sideways.

Two residuals. The add-row strip's bottom lands 0.39 px past the scrollport on the wide fixture,
a sub-pixel of the table's own fractional height, clipped by the hidden axis. And on a wide table
the add-column button stays pinned to the scrollport's inline edge rather than sitting at the
table's far right, which is how it already behaves today — the reservation moves it 12 px right,
the width the vertical scrollbar had been taking.

Mobile emulation confirms the rule follows Obsidian's own variable rather than a length of ours:
at `--table-drag-handle-size: 24px` the region goes 24/24 → 0/0, the widget returns to its stock
109 px, and the wide fixture keeps 3241 px of real horizontal scroll. Clicking the native
add-column button rewrites the row the same way with the reservation as without it, desktop and
mobile — `| a | b |` → `| a   | b   |     |`.

## The alternative, and what it would cost

The other way to keep the chrome out of the region is not to have a region: make the wrapper a
scroll container only when the table is genuinely wider than its line, and leave it stock
otherwise. Measured on a fitting table, `overflow: visible` is stock in every figure above,
which makes this the smaller-looking fix.

It is the riskier one. Measured on the wide fixture, a wrapper left `overflow: visible` puts the
document's own scroller at 3601 px against a 668 px client — the whole note scrolling sideways,
which is the regression the wrapper rule exists to prevent ([experiment-2-guide-lines.md](experiment-2-guide-lines.md) finding 4).
A gate that is ever stale reintroduces it, and staleness is reachable: CM6 calls
`docViewUpdate` only when the document view is actually redrawn, so narrowing the pane around an
already-rendered table — or widening a column by typing in it — can change which side of the gate
a table belongs on with no redraw to notice. Holding it would take a size observer on the
editor's own box and on each table, and a missed signal is a visibly broken note rather than a
cosmetic slip. The reservation has no state to go stale, and it also un-clips the drag handles,
which a gate would only do for the tables that fit.
