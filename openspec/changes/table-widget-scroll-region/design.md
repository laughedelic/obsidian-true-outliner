## Context

See proposal.md — Why. The mechanism, the four candidates that failed, the figures for the one
that holds, and the rejected alternative are all in
[docs/research/table-scroll-region](../../../docs/research/table-scroll-region.md); this document decides only what to write and where.

Two constraints shape everything below, both inherited rather than chosen:

- The outer `.cm-table-widget` stays `overflow: visible` and `contain: none`, because a marker
  icon and a guide's `::after` reach left of the line's own box
  ([docs/research/decoration-lessons.md](../../../docs/research/decoration-lessons.md)). So a wide table's scroll cannot live there.
- The inner `.table-wrapper` is `position: relative; width: fit-content`, tight to the table, and
  is the positioning anchor for Obsidian's two add buttons, each placed at a `100%` inset of its
  padding box. So anything done to that box moves those two with it. The two drag handles are
  anchored to their own cells instead, so the same change leaves them where they are and only
  decides whether the scrollport contains them.

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
and Obsidian's chrome reaches one `--table-drag-handle-size` past the table on all four sides —
the two buttons measured from the wrapper's padding box, the two handles from their own cells.
There are three ways out of the region, and only these three: take the chrome out of the
scroller's containing-block chain, stop being a scroll container, or grow the padding box to hold
the chrome and place the chrome inside it.

The first breaks placement outright — measured, both by making the wrapper `position: static` and
by making the chrome `position: fixed`. The second is the gate, which the research note rejects on
the asymmetry of its two failure directions rather than on feasibility: it is buildable on signals
CM6 already provides, and the direction that fails badly puts the whole note into sideways scroll.
The third is this change.

The reservation is the one the outer widget's own padding already is, given back with a negative
margin of the same length so the widget's box does not grow, and `max-width` widened to match so
a wide table keeps the visible width it has today. The reservation half carries
`:not(.is-loading)`, for the reason under Risks; the overflow half does not, so no state can
leave a wide table unclipped.

On three sides, not four. A scroll container's scrollport IS its padding box, so reserving on the
inline-start side puts the clip edge one reservation left of the table — inside the column the
marker occupies — and a scrolled table renders its own cells there. Real use found exactly that
(figures in the note). The block-start side keeps its reservation, since that axis never scrolls
and nothing can move into it; the inline-start side gets none, and the row drag handle that lives
there stays clipped, as it is with none of this rule at all.

### D2. State both overflow axes, as Obsidian's own rule does

`overflow-x: auto` alone does not leave the other axis alone; it promotes `visible` to `auto`.
The rule becomes `overflow: auto hidden`, the same pairing Obsidian writes on the outer element.
With the reservation in place the hidden axis clips nothing that was visible before — the chrome
is inside the scrollport — and with the wrapper's height still `auto`, a horizontal scrollbar adds
to the box rather than covering the table's last row.

This declaration is defensive, and the note's measurement of the unpaired form says so plainly:
with the reservation in place, stating `overflow-x` alone gives the same region and the same
scrollbars on both fixtures and both platforms. It is written because it is what the box means,
and because a future overhang should reappear as nothing rather than as a scrollbar — not because
the fix needs it. Nothing in this change's coverage can fail without it, and task 2.3 is written
to say so rather than to claim a control it does not have.

### D3. Pull the two add buttons in with a transform, leaving their insets alone

The transforms are physical (`translateX`, `translateY`) because the box they act on is: with
Obsidian's own right-to-left setting on, `.cm-content` computes `direction: rtl` while
`.table-wrapper` stays `ltr`, so both buttons keep the physical sides an LTR note gives them,
measured with the reservation and without it. An earlier draft of this decision re-anchored the
buttons by logical insets and claimed RTL as the reason; real use then showed the inset form
scrolls the button out of reach on a wide table, and the RTL case turns out to be unaffected
either way.

Obsidian's own insets are left alone, and each button is pulled inside by its own width with a
transform instead. An inset cannot do this job: a percentage resolves against the VISIBLE padding
box, not the scrollable content, so on a wide table every inset form — Obsidian's own included —
lands the button near the content's left end, where scrolling carries it off. That is the second
thing real use found, and the note records that it predates this change: any arrangement where
the anchor box is also the scroller has it. A transform moves the box without touching where it
is anchored, which keeps a fitting table's buttons exactly where stock puts them.

Each button also needs its cross-axis length pulled back by the reservation on that axis, and the
add-column button its cross-axis offset pushed in by one: `height: 100%`, `width: 100%` and
`top: 0` all resolve against the padding box, which the reservation has grown — by two
reservations in the block axis, by one in the inline axis, since the inline-start side has none.
The add-row strip's own `inset-inline-start: 0` needs nothing for the same reason. Measured: with
the transforms and those corrections, every piece of chrome keeps its stock size and its stock
offset from the table.

The declarations keep the `!important` the rule they replace already carries on every one of its
own. Ours out-specifies Obsidian's `.table-wrapper` and chrome rules on class count, so the flag is
not load-bearing against Obsidian itself — it is there for a theme or snippet that reaches the
same elements, which is the exposure under Risks.

### D4. The rule keeps the gate it already has

The `.table-wrapper` rule fires on the same three classes as the outer element's
`contain`/`overflow` override, so the two are active together: making the wrapper a scroll
container is only correct while the outer is not one. The two new button rules take the same
gate — one `:is()` list of the same three classes, whose specificity is its most specific
argument and so counts as the spelled-out selectors it replaces — rather than the broader
`.to-decor-widget-line`, which marks every widget line we patch, including those the outer
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
  height is fractional, and the hidden axis clips that sliver → the note measures it on the wide
  fixture; below the threshold where rounding the reservation up would be worth the divergence
  from Obsidian's own value.
- **The reservation assumes the outer widget's padding is `--table-drag-handle-size`**, which is
  new exposure: `max-width: 100% + 2 × reservation` only lands the wrapper flush with the outer's
  padding box while those two agree, where the `max-width: 100%` it replaces assumed nothing.
  Obsidian breaks the agreement itself in one state — `.cm-table-widget.is-loading` zeroes that
  padding — and the note measures what follows: the wrapper overhangs the widget on each side and
  the outer element itself overflows. → the reservation half of the rule carries
  `:not(.is-loading)` (D1), and the same pseudo-class answers a theme that changes the widget's
  padding without changing the variable, which is the residual here.
- **A theme that restyles `.table-wrapper` itself** (its padding, or its `fit-content` width)
  could shift what the reservation is measured against → the existing rule already overrides that
  box with `!important` and the same exposure; this change does not widen it.
- **The 16 px band around the table changes owner**: it is the wrapper's padding after this change
  where it was the widget's before, so a pointer event there has a different `event.target` →
  Obsidian's own hit-testing in that band is not measured, and task 3.3 checks it by hand.
  Scrolling in the band is at parity by construction, since natively the band belongs to the
  scroll container's own padding either way.
- **Two scroll containers if the outer override ever stops firing while this one does** → D4
  keeps both rules on one gate, and the guide/marker e2e cases already assert the outer's own
  overflow.
