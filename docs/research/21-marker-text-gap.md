# The marker-to-text gap: one measurement pass, and the gutter derived from it

`--to-marker-gutter` is the distance between a depth's column and the start of that depth's
text. Every kind's position is stated from it — block lines, atoms, native bullets,
checkboxes, ordered numbers, the fold chevron, and the backlinks footer — and until this pass
its value was `1.25rem` because that is what worked in Experiment 5a
([10](10-experiment-5-block-markers.md)). Nothing recorded what it had to be big enough for.

This document is that statement: one pass of commensurable measurements, the derivation they
support, the one number chosen rather than derived, and the defects the derivation exposed.

**Measurement pass: 2 September 2026.** ONE environment, deliberately — Obsidian 1.13.7
(installer 1.5.8, darwin), both bundled themes, 16px root font, `--to-decor-unit` 1.5rem (24px), `--to-marker-icon-size`
0.85rem (13.6px). Taken by a throwaway e2e probe in one run, against the rules currently in
force. Figures quoted from other environments below — CI's Linux font, Obsidian's mobile
checkbox — are named as such and are NOT combined with this pass; they are the evidence that the
terms they belong to had to be read live rather than recorded. Superseded figures are listed at
the end so nobody merges passes again.

## What was measured, and why ink

Each mark is reported as the distance its **ink** reaches right of its own column — what a
reader sees, not the box reserved for it. The two differ enough to matter: a block marker's
box is 13.6px wide and no glyph fills it, and a bullet's box is zero-width with the dot
painted by an `::after`. Deriving a gutter from boxes would be deriving it from reserved space.

Boxes are reported alongside, because which one the derivation should use was exactly the open
question.

## The readings

All four qualifying marks at one depth, one-space markers, editor surface. Both bundled themes
returned identical geometry to the hundredth of a pixel, so one column serves for both.

| Mark | ink left of col | **ink right of col** | box right of col |
| --- | ---: | ---: | ---: |
| Block icon, heading (`H` glyph) | −4.24 | +4.26 | +6.80 |
| Block icon, paragraph (three rules) | −5.09 | +5.11 | +6.80 |
| Native bullet (the dot) | −3.04 | **+3.04** | — |
| Task checkbox | −8.00 | **+8.00** | +8.00 |
| Ordered `1.` | −6.80 | **+7.40** | — |
| *Ordered `10.` (excluded)* | *−6.80* | *+17.17* | — |

`--to-space-advance`, measured live: **4.19px**.

The block marker's ink varies by kind because each kind draws a different glyph inside one box;
the paragraph's three rules are the widest at +5.11, the heading's `H` narrower at +4.26. The
box is +6.80 for all of them, half the icon.

### The same four on the backlinks footer

The footer's marks are `0.8em` against a `0.92em` row, so its icon box is 11.78px rather than
13.6px. It draws no native bullet, no native checkbox and no native ordered marker: a bulleted
row gets a block icon, a task row gets an SVG checkbox glyph inside the same icon box, and an
ordered row gets `.to-backlinks-ordinal` digits.

| Mark | ink right of col | box right of col |
| --- | ---: | ---: |
| Block icon, paragraph / callout / table | +4.42 | +5.89 |
| Block icon, heading / quote / html | +3.68 | +5.89 |
| Block icon, list row | +2.21 | +5.89 |
| Checkbox glyph | +3.83 | +5.89 |
| Ordinal `1.` | **+7.34** | +20.00 |
| *Ordinal `10.` (excluded)* | *+16.41* | *+20.00* |

### Tab- and multi-space-separated markers

Measured for completeness, and they do not participate. The one-space rules are gated on
`to-decor-marker-1sp`, so on `-\tfoo` and `1.\tfoo` no gutter padding is added at all and the
text lands where the literal whitespace puts it — 24.00px right of the column here, unchanged
by the gutter. Every mark's ink is identical to the one-space case; only the text column
differs. `-\t[ ] foo` is not a task to Obsidian's parser at all: it renders as a bullet whose
text happens to begin `[ ]`.

The consequence is that changing the gutter widens the distance between a one-space row and a
tab-separated one, from 4px to 10px. That divergence is pre-existing and out of scope here;
it is filed in [12](12-decoration-follow-ups.md).

## The derivation

> The gutter is the greatest distance any qualifying mark's ink reaches right of the column,
> plus one stated visual gap.

A mark qualifies when this layer positions it on the column and its width does not depend on
its own content. That is four marks: the block icon, the bullet, the checkbox and a
**single-digit** ordered number.

On the measured font the widest is the **task checkbox at +8.00px**, which is
`--checkbox-size / 2` — a theme's value, not ours. The single-digit ordered number is second at
+7.40px and is font-*dependent*: on the wider Linux font CI runs, `1. ` measures 20.36px against
18.39px here ([16](16-native-list-decoration.md)), which puts its ink at roughly +8.9px and
makes it the widest mark on that font.

Neither of those is a constant, and that is the finding this pass nearly missed. **Two terms
vary, in two different ways, and they need different treatment.**

- The **checkbox** is sized by the theme, and Obsidian resolves `--checkbox-size` differently
  per platform: 16px on desktop and **18.4px on mobile**. That is knowable at render time, so
  the gutter reads it live — the checkbox term is `var(--checkbox-size) / 2`, and the gutter is
  a CSS `max()` rather than a number. Frozen at the desktop value it was 0.29px short on mobile,
  and a task's text sat off the shared column there while every other kind's stayed on it.
- The **ordered number** is drawn by the reader's font, and its width is not knowable before
  layout. It cannot be a term at all. What it gets instead is the floor below, which is what
  keeps it on the column; on a font wide enough it spends part of the stated gap, and the
  measurement that matters is whether it still clears the floor.

So the derivation is over the marks this layer SIZES, evaluated live, and the marks the font
draws are held by the floor. Both halves are asserted, and the mobile case is why: the e2e spec
names no mark as the widest — it measures which one is.

Multi-digit numbers are excluded by the spec, and the readings say why plainly: `10.` reaches
+17.17px, more than twice the widest qualifying mark. A gutter that held it would have to be
at least 21px — wider than today's 20px, which is the value this pass set out to tighten.

### The floor nobody had stated

The measurements turned up a second constraint, and it is the more interesting one. Every
one-space kind is built as *"the gutter, less one space"*, with the marker's own trailing space
completing the run:

- a bullet's `padding-inline-end` is `gutter − space`
- a task label's `min-width` is `gutter − space`
- an ordered item's digit box is `gutter − space + icon/2`

Each of those has to stay wider than the mark it holds, or the mark overflows and pushes its
own text right off the shared column. Written out, that is:

> gutter ≥ (mark's ink right of the column) + one space's advance

So **the stated gap can never be smaller than a space's advance** — the mechanism fixes its
own floor, and the floor moves with the reader's font. That is not a preference; it is what
the existing rules already require, and nothing had said so.

## The stated gap: 0.375rem

One number in this document is chosen rather than derived, and this is it.

**0.375rem (6px at a 16px root)**, giving a gutter of **8.00 + 6.00 = 14px** on the desktop
themes measured here, and 15.2px on mobile, where the theme's checkbox is larger.

The argument, in the order it was made:

1. **It clears the floor with room to spare.** A space advances 4.19px here and about 4.6px on
   CI's wider font. Six is the first quarter-rem step clear of both, with 30–43% headroom.
2. **It is the tightest value the mechanisms actually survive.** Drop it by a quarter-rem and
   the task label's `min-width` falls under the checkbox's own advance, and a task's text leaves
   the shared column while every other kind's stays on it. This is the last step before that.
3. **It reads as one row.** Judged on screenshots in both themes, at 20px the mark and its text
   are two things beside each other; at 14px they are one row, and the outline reads the way
   Logseq and Workflowy do. 1rem was measured and shot as the conservative alternative and
   reads as a smaller version of the old problem.

What varies between kinds is the room left beside a *narrower* mark, never the column its text
starts on: at this gutter the checkbox gets exactly the stated 6.00px, `1.` gets 6.60px, a
paragraph's icon 8.89px, a heading's 9.74px and the bullet's dot 10.96px. One gutter and marks
of different widths cannot give a constant gap and a shared column at once, and the shared
column is the one worth having.

### What it costs

The single-digit ordered number keeps roughly 0.4px of headroom on CI's font — positive, but
thin. If a font ever crosses it, a `1.` item's text drifts right exactly as `10.`'s already
does, which is the degradation the spec already licenses, and the shared-column e2e assertion
catches it rather than letting it pass quietly.

## The defects the derivation exposed

Four, all of the same shape: a value frozen or inherited from one environment, correct there
and quietly wrong elsewhere.

### A task's text, held off the column by Obsidian's own margin

Applying the derived gutter put a task's text at 15.52px while every other kind sat at 14.00px,
with nothing in the rendering to say why. The cause: Obsidian gives
`.task-list-item-checkbox` a **`margin-inline-end` of 3.33px** — its own answer to the question
the gutter already answers.

That margin was inert at a 1.25rem gutter and only because of it. The task label's natural
width is `−8 (our centring margin) + 16 (checkbox) + 3.33 (Obsidian's) = 11.33px`, and our
`min-width` of `gutter − space` governs only while it exceeds that: 15.81px at the old gutter,
9.81px at the new one. Shrink the gutter past `11.33 + 4.19 = 15.52px` and Obsidian's number
silently takes over.

This is the failure mode the proposal predicted in the abstract — *"the first kind whose mark no
longer fits will fail quietly: text a few pixels off its column, which reads as a rendering bug
rather than as a value chosen too small"* — arriving concretely on the first kind measured.
The fix is `margin-inline-end: 0` on the checkbox, which puts the whole distance back under our
own `min-width` so a checkbox's text takes the derived gap like every other mark's.

### A task's text on mobile, against a checkbox the derivation had frozen

The same shape as the one above, one level out. The first fix put the checkbox's own ink into a
constant — correct on the machine it was measured on, and 1.2px wrong on mobile, where the theme
draws an 18.4px checkbox. The gutter was then 0.29px short of what that checkbox plus one
space's advance needs, and a task's text sat at 14.28px while every other kind's sat at 14.00px.

Caught by CI rather than by reading, and caught at all only because the derivation's own e2e
spec asserts the shared column. The fix is to stop freezing what the theme owns: the checkbox
term is read live and the gutter is a `max()` evaluated where it is used.

### The footer's heading, laid out against a stale copy of the gutter

`--to-marker-gutter` is published per ROW, so the footer's own chrome — its heading, its
"resolving…" placeholder — read it through a literal fallback in the stylesheet instead. The
fallback still spelled the old value, so the heading kept the old gutter while every row took
the new one, and the heading's title sat off the column of the rows it heads.

Its icon did not move, which is what made this quiet: the icon is placed from the COLUMN and the
title from the GUTTER, so the existing assertion that the heading's icon shares a top-level
marker's column passed throughout. The fix is for the section to publish the gutter and the gap
itself, and for the stylesheet to carry no literal copy of either.

### The footer's wide ordinal, with nothing left between it and its text

The editor's ordered marker gets its clearance for free: the trailing space after `1.` is part
of the line and renders whether or not the digits fit their slot. A footer ordinal is drawn from
the item's number alone, with no space after it, so its only clearance was whatever the slot did
not spend. At the old gutter that left a few pixels; at the derived one the slot is narrower than
`10.`, and the digits ran flush into their own text.

The fix is a `padding-inline-end` of the stated gap on the ordinal, inert while the number fits.

## Both surfaces, one gutter

The derivation applied to the footer's own marks would give a smaller gutter than the editor's:
its ordinal reaches +7.34px where the editor's checkbox reaches +8.00px, and its block icons are
smaller again. Measured on desktop that is a 0.66px difference; on mobile, where the theme draws
a larger checkbox that the footer does not use at all, it is 1.2px.

**The footer takes the editor's gutter anyway, and that is the requirement rather than a
rounding.** The footer renders directly below the note's own content, and a reader comparing a
footer row with a note line above it sees one column or two. Deriving each surface separately
would put the footer's text 1.2px left of the editor's on mobile — two outlines that resemble
each other rather than one outline continued. Sharing the LARGER of the two derivations costs
the footer nothing: a gutter wider than its own marks need leaves them extra room, where one
narrower than they need would take a kind off the column.

It is published on the section root, so the footer's own chrome lays out against the same value
its rows do. `MARKER_LEFT_SHIFT_EXPR` therefore keeps spelling the gutter rather than reading a
per-surface property — the drift the proposal planned for cannot arise while there is one value.
What the footer does scope for itself is its marker SIZE, and that is exactly why the placement
arithmetic reads `MARKER_ICON_VAR`: the mark is smaller, its centre is still on the column.

The footer's own mechanisms have more room than the editor's, not less: its ordinal slot is
`gutter + icon/2` = 19.89px against 13.22px of digits, and it has no `--to-space-advance` term
because its marks carry no trailing whitespace.

## Superseded figures

Recorded here so they are not combined with the table above. Each was taken in a separate
investigation, under rules that have since changed; they do not describe the same rendering and
cannot be compared with each other.

| Figure | Where it came from | Status |
| --- | --- | --- |
| Checkbox at 16px | [16](16-native-list-decoration.md) | Superseded: 16px is the box; the ink reaches +8.00 right of the column |
| `10. ` at 28px | [16](16-native-list-decoration.md) | Superseded: +17.17 right of the column, 23.97px of glyph |
| Bullet-to-text 17px vs task 16.2px | styles.css, task-label rule | Superseded: 16.96 and 11.99 at the old gutter, 10.96 and 5.99 at the new one |
| Space advance 4.19px | `MarginCompensation` | **Confirmed** by this pass |
| `1. ` 18.4px local / 20.36px CI | [16](16-native-list-decoration.md), 56-list-grid header | **Confirmed** local (18.39); CI unchanged and used here as the wide-font case |
