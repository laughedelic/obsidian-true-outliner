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

| | wrapper client box | wrapper scroll region | scrollbars (h/v) | widget height |
| --- | --- | ---: | ---: | ---: |
| stock, outline off | 230×61, `visible/visible` | 246×77 | 0 / 0 | 93 px |
| outline on | 230×61, computed `auto/auto` | 246×77 | 12 / 12 | 105 px |

The box column is the client box throughout, so the two states are comparable; outline mode's
border box is 242×73, the two scrollbars' 12 px each, which is where the widget's extra 12 px of
height comes from.

The region exceeds the box by exactly 16 px on each axis, and the table is not what exceeds it:
the table is 230×61, the same as the box. The 16 px of vertical excess appears on every table
measured at every width; the horizontal excess is 16 px only while the table fits, since a wide
table's own content exceeds the box by far more (2977 px on the corpus's wide fixture) and the
chrome adds nothing beyond it.

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
chrome, each absolutely positioned flush outside one edge of the table. They divide by what they
are anchored to, and the division matters below:

| piece | native placement | anchored to | size | against the wrapper's scrollport |
| --- | --- | --- | --- | ---: |
| `.table-col-btn` (add column) | `inset-inline-start: 100%; top: 0; height: 100%` | the wrapper | 16×60.59 | 16 px past its right edge |
| `.table-row-btn` (add row) | `top: 100%; inset-inline-start: 0; width: 100%` | the wrapper | 134.59×16 | 16 px past its bottom edge |
| `.table-row-drag-handle` | `inset-inline-end: 100%` | its own cell | 14×28.8 | 13 px past its left edge |
| `.table-col-drag-handle` | `inset-block-end: 100%` | its own cell | 65.8×14 | 13 px past its top edge |

The wrapper has exactly three children — the table and the two buttons — so only the buttons
track the wrapper's own padding box, which `width: fit-content` keeps tight to the table and
`position: relative` makes their anchor. The handles hang off `th`/`td`, which carry
`position: relative` of their own, and reach 13 px out (the handle's 14 px less the table's
selection border), so they track the table rather than the wrapper.

A scroll container's scrollable overflow region is the union of its own padding box with its
descendants' boxes, so making the wrapper a scroll container took all four pieces into its
region. The two buttons are in the positive direction and became 16 px of scroll on each axis;
the two handles are in the negative direction, which a scroll container cannot reach, and are
simply clipped — 13 of each handle's 14 px. So today, in outline mode, a desktop table's row and
column drag handles are unreachable. That was not reported and is the same rule's doing. On
mobile the handles are hidden at rest (`.is-mobile` sets `display: none`), but the next rule
brings one back on an active row or column (`.mod-active-row-handle > .table-row-drag-handle
{ opacity: 1; display: flex }`), so mobile is spared only until a handle is wanted.

The vertical axis is a second mechanism on top. Our rule states only `overflow-x`, and a box with
one axis `auto` and the other `visible` computes the `visible` one to `auto` — measured `auto/auto`
where the stylesheet says `overflow-x: auto` alone. Obsidian's own rule states `overflow: auto
hidden`, which is how it keeps the vertical axis off a box the chrome overhangs. Its horizontal
scrollbar is not absorbed by that padding, though: measured on the wide fixture, the outer's box
grows by the scrollbar's 12 px (`clientHeight` 113 against `offsetHeight` 125) rather than
spending padding on it.

Neither mechanism is sufficient alone, and the vertical scrollbar needs both: the promotion makes
the axis scrollable and the chrome gives it something to scroll. So either one closes it — which
is why the reservation below leaves nothing for the axis pairing to do, measured, and why the
pairing is there to match Obsidian's rule rather than to carry the fix.

The costs are three: 16 px of vertical scroll on every table (reported), 16 px of horizontal
scroll on every table that fits (reported), and two clipped drag handles (not reported). On a wide
table the spurious vertical scrollbar also takes 12 px of the table's own visible width — 546 px
where the line offers 558.

## Four dead ends, measured

| candidate | fitting table | why it fails |
| --- | --- | --- |
| `overflow-y: hidden` alone | region 16/16, scrollbars 12/0, widget 105 px | closes the reported vertical scroll and leaves the horizontal one, since the chrome still overflows |
| padding on the wrapper | region 16/16, widget 121 px | the two buttons' insets are percentages OF the wrapper's padding box, so they follow the padding outward — the region never catches up |
| `right: 0` / `bottom: 0` on the two buttons | insets unchanged | over-constrained against native `inset-inline-start: 100%` / `top: 100%` and an explicit native size, so the far-edge inset is dropped |
| `.table-wrapper { position: static }` | region 0/0, widget 93 px | the two buttons re-anchor to the widget: the add-column button lands 455 px right of the table at the widget's full height, the add-row strip 590 px wide |

The third is a dead end of the declaration rather than of the technique: releasing the native near
inset (`inset-inline-start: auto`, `top: auto`) alongside the far-edge one does move the button.
Recorded because the malformed form looks identical in a stylesheet and reports no error — the
computed insets are the only way to see which one landed. The released form is a dead end too, for
a different reason real use found later: any inset form scrolls the button out of reach on a wide
table, so the rule ends up moving the button with a transform instead.

`position: fixed` on the chrome was measured for the same reason and is recorded only because it
isolates the mechanism: it too gives a clean region (0/0), positioning the button against the
viewport at 760 px tall. What leaves the scroll container's containing-block chain leaves its
region, and nothing else does.

`overflow: auto clip` with `overflow-clip-margin` would have been the small fix for the vertical
axis — clip the chrome away without a scrollbar, then let the clip margin pass it through. Paired
with a scrolling axis, `clip` computes to `hidden`, the mirror of the same computed-value rule
that turns `visible` into `auto` above; measured `auto hidden`, clip margin inert. It is the
property's own definition rather than this Electron's limitation, so there is no version to wait
for.

## The reservation

What the wrapper is missing is the reservation the widget's own padding already is. Give it the
same one, pull the two add buttons inside it, and correct their cross-axis length so the
reservation cannot stretch them. The handles need nothing of their own: they track the table, and
the reservation moves the scrollport's edge out past them.

The figures below are that shape with the reservation on all four sides, which is what this pass
settled on and what real use then found two defects in — the section after next revises it to
three sides and replaces the buttons' re-anchoring with a transform. The geometry it reports for
a table that fits is unchanged by that revision; what changes is the row drag handle, which the
revision leaves clipped.

| | region (h/v) | scrollbars | widget | chrome against the table | drag handles |
| --- | ---: | ---: | ---: | --- | --- |
| fits, stock | 16 / 16, unscrollable | 0 / 0 | 93 px | `+134.59,0` and `0,+60.59` | 13 px outside, visible |
| fits, today | 16 / 16 | 12 / 12 | 105 px | same offsets | 13 px outside, clipped |
| **fits, reservation** | **0 / 0** | **0 / 0** | **93 px** | **same offsets** | **3 px inside** |
| wide, today | 2977 / 16 | 12 / 12 | 125 px | button pinned at 546 px | clipped |
| **wide, reservation** | **2965 / 0** | **12 / 0** | **125 px** | **button pinned at 558 px** | **3 px inside** |

Every piece of chrome keeps its stock size and its stock offset from the table, and every one is
inside the scrollport rather than outside it. The region figure is better than stock, not equal to
it: stock's own 16 px of excess is simply unscrollable, where the reservation leaves none. The
table itself does not move (16,16 from the widget's own box, in all three states), the widget's
height returns to stock, the guide and the marker are unaffected, `scrollLeft` on the wide fixture
still takes 300, and the document's own scroller stays at its client width — 668/668 — instead of
scrolling sideways.

## What real use found, and what the reservation had to become

Two defects came back from a wide table in a real vault, and only one of them was ours.

**A leading reservation is a strip that scrolled content renders into.** A scroll container's
scrollport IS its padding box, so reserving on the inline-start side moves the clip edge one
reservation left of the table — into the column the marker occupies. Unscrolled, nothing is there;
scrolled, the table's own cells render across the whole scrollport, mark included. Measured as the
clearance between the scrollport's leading edge and the marker's right edge: +7.2 px without any
reservation, **−8.8 px with a symmetrical one**, +7.2 px again once the inline-start side is
dropped. The e2e case asserts that clearance, and the symmetrical rule is its control: it reads
back the same −8.8 px. The table's own box reads −1467 px at mid scroll in every case, which is why the box is
the wrong thing to measure: the clip is what decides whether anything shows.

So the reservation is three-sided. The block-start side keeps its own — that axis never scrolls,
so nothing can move into it, and the column drag handle it uncovers stays uncovered. The
inline-start side gets none, and the row drag handle that lives there stays clipped, exactly as it
is with none of this rule at all. That is a residual, not a fix: the handles were never the point
of this change, and one of them cannot be had at the same time as a mark that stays clear.

**A percentage inset resolves against the VISIBLE padding box, not the scrollable content.** This
is the mechanism behind the second report, and it is not this change's doing. `inset-inline-start:
100%` on a box whose containing block is also the scroll container resolves to the scrollport's own
width, so the button's anchor is that width — a length with no relation to the table.

Measured on the wide fixture, the button sits at content x = 558 px: the scrollport's 574 px less
its own 16 px, which the transform accounts for. It scrolls with the content from there, so its
distance from the table's left edge never changes, and 558 px into a 3523 px table is the third of
thirty columns, 37 % across it. At scroll 0 that lands flush against the scrollport's right edge,
which is why it looks correct until the table is scrolled; past that it is a button in the middle
of a column, and at full scroll it has left the viewport entirely. The rule as it stands on `main`
reads the same way — anchor 546 px, exactly the scrollport, column three at 32 % across — so the
transform moved this by 16 px and changed nothing else about it.

The signature is the pane: narrow the line to 400 px and the anchor follows it to 1939 px minus
the scroll, landing in column two at 51 % across. A control that depends on the window's width for
which cell it appears in is anchored to the wrong length.

The add-row strip has the same defect in the block axis, from the same `100%`: it spans the
scrollport's width (558 px) rather than the table's (3523 px).

Natively the button sits at the table's right edge (offset 0), because natively the anchor box is
the tight wrapper INSIDE a scrolling outer element.

On a table that fits, both buttons keep their native placement to the pixel, and a real pointer
hover reveals the add-column button and lands on it. A wide table needs an anchor no stylesheet
can name, since the length a percentage resolves against there is either the scrollport or nothing.
Three ways out:

- **Publish the table's own width** from the pass that already measures the chevron and the accent
  stops, and let both buttons' insets read it. The anchor becomes the table's right edge in content
  coordinates, which is where native puts it, and a stale value costs a few pixels of placement
  until the next render. The smallest of the three, and the only one that leaves Obsidian's layout
  alone.
- **Make the wrapper a flex row** so the buttons take a static position beside the table and get
  the same anchor from layout rather than from measurement. No state, but a real intervention in
  the widget's own layout, and unmeasured.
- **Draw a widget's marker and guide outside the widget**, so Obsidian's own box keeps its own
  scroll and none of this arises ([decoration-follow-ups.md](decoration-follow-ups.md)).

The first is what this change carries. `--to-table-width` is published on the widget's element in
the render pass that already measures the chevron and the accent stops, from the table's own rect,
and both buttons read it — the add-column button's `inset-inline-start` and the add-row strip's
`width`, each falling back to Obsidian's percentage while no measurement is published. The
add-column button's transform goes with it: what it corrected for was the percentage anchor.

Measured on the wide fixture, both buttons report the table's own 3522.72 px — the button flush at
the table's right edge, the strip spanning the table — at scroll 0 and at full scroll alike. The
percentage form reads 558 px in the same place, the scrollport. On a table that fits, the published
width and the native percentage are the same length, so nothing moves there.

The value is measured, not decided, so `53-decoration-dom-baseline` leaves it out of its recorded
DOM alongside the chevron and the accent stops: a table's width is fractional (134.59375 px on the
atoms fixture) and follows the font, which differs between CI and macOS.

An uncovered handle is a grabbable one, checked rather than assumed. Hit-tested at the centre of
its own visible part, the row drag handle answers as itself in every state — but without the
reservation that visible part is 1 px of its 14, the rest scrolled off where nothing can reach it,
so "present" and "usable" come apart. With the reservation it is 14 px, and the column handle's
whole 65.8 px is visible rather than clipped to a sliver. One qualification: our own marker icon's
box overlaps the row handle's outer 5.8 px, in outline mode with the reservation or without it, so
the handle's usable target there is the remaining 8 px. The marker is unchanged by this change and
the overlap is not new; it is recorded because the left band's hit target is the marker's, which is
what a reader measuring that band will find.

The one existing assertion the reservation could have flipped holds. `51-guides-gradient` pins
`outer.scrollWidth === outer.clientWidth` exactly, and the reservation takes the slack between the
wrapper's border box and the outer's padding box from 16 px a side to zero: measured, the wrapper
comes to exactly the outer's padding edge and the outer still reports no overflow, on both
fixtures, at the default width, at two fractional readable-line widths (587.5 px, 541.33 px) and
under a 1.1 leaf zoom — the last of which leaves the wrapper 528.381 px in a 528 px box and still
rounds to no overflow.

Four residuals, counting what the revision below adds: the row drag handle stays clipped, since
the side it sits on is the side that has to stay clear of the marker. The add-row strip's bottom
lands 0.39 px past the scrollport on the wide fixture,
a sub-pixel of the table's own fractional height, clipped by the hidden axis. On a wide table the
add-column button stays pinned to the scrollport's inline edge rather than sitting at the table's
far right, which is how it already behaves today — the reservation moves it 12 px right, the width
the vertical scrollbar had been taking. And the reservation depends on the outer's padding being
the same `--table-drag-handle-size`, which `.cm-table-widget.is-loading` sets to zero: forced into
that state, the wrapper overhangs the widget by one reservation on each side and the outer itself
overflows by 16 px. That state never appeared in 200 polls across a wide table's open, so it is a
hazard on paper; gating the reservation (not the overflow) on `:not(.is-loading)` costs one
pseudo-class and closes it.

Mobile emulation confirms the rule follows Obsidian's own variable rather than a length of ours:
at `--table-drag-handle-size: 24px` the region goes 24/24 → 0/0, the widget returns to its stock
109 px, and the wide fixture keeps 3241 px of real horizontal scroll. Mobile is also where the
handles matter most, since there they are the only way to reorder: with a row or column marked
active, a 22 px handle reads `opacity: 1` and sits 21 px outside the scrollport today, 3 px inside
it with the reservation, at an unchanged offset from the table. Clicking the native add-column
button rewrites the row the same way with the reservation as without it, desktop and mobile —
`| a | b |` → `| a   | b   |     |`.

Direction turns out not to be a variable. With Obsidian's own right-to-left setting on,
`.cm-content` computes `direction: rtl` while `.table-wrapper` stays `ltr`, so both buttons keep
the physical sides an LTR note gives them — measured identically with the reservation and without
it. The logical spelling is worth keeping because it is the spelling Obsidian's own rules use, not
because an RTL note moves anything here.

Stating the second overflow axis changes nothing measurable once the reservation is in place:
with `overflow-x: auto` alone the axis still computes to `auto`, and both fixtures report the same
region and the same scrollbars as the paired form — 0/0 fitting, 12/0 wide, desktop and mobile.
The pair is worth writing anyway, because it says on the box what Obsidian says on its own and
because a future overhang would otherwise reappear as a scrollbar rather than as nothing; but it
is not what fixes the reported defect, and no assertion can be written that fails without it.

## The alternative, and what it would cost

The other way to keep the chrome out of the region is not to have a region: make the wrapper a
scroll container only when the table is genuinely wider than its line, and leave it stock
otherwise. Measured on a fitting table, `overflow: visible` is stock in every figure above,
which makes this the smaller-looking fix.

The gate is buildable, and an earlier draft of this note said otherwise on a false premise. It is
true that `docViewUpdate` — the hook `MarginCompensation` runs on — fires only when the document
view is actually redrawn, so a pane resize around an already-rendered table need not reach it. But
CM6 already carries the signal one layer up: it observes `scrollDOM` with a `ResizeObserver`, a
size change requests a measure, and the measure flags `Geometry` when `scrollDOM.clientWidth`
moves and then calls `updatePlugins`, so every view plugin's `update` hook runs with
`geometryChanged` set, redraw or not. A gate would read each table's own width in the same measure
cycle, the way the chevron and the accent stops are already read. Two hooks, not an observer of
our own.

What decides against it is asymmetric cost, not feasibility. Measured on the wide fixture, a
wrapper left `overflow: visible` puts the document's own scroller at 3601 px against a 668 px
client — the whole note scrolling sideways, the regression the wrapper rule exists to prevent
([experiment-2-guide-lines.md](experiment-2-guide-lines.md) finding 4). A gate stale the other way costs a scrollbar nobody
needed. The two are not comparable, and the window is not hypothetical: CM6's resize observer
debounces its measure by 50 ms and skips a view redrawn within the last 75 ms, so dragging a pane
divider past a wide table's width means frames on the wrong side of the gate every time, spilling
the note sideways for as long as the drag lasts.

The reservation has no state to go stale, and it un-clips the drag handles, which a gate would
only do for the tables that fit. Those are the two reasons it wins; the third dead end above is
what makes it cheap.
