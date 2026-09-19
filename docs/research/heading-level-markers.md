# Heading level markers: which mark tells H1 from H6

Every heading has drawn the same blocky `H` since Experiment 5a, whatever its level. Telling
the levels apart was parked twice — in Experiment 5's own follow-ups
([experiment-5-block-markers.md](experiment-5-block-markers.md), "Per-level heading markers")
and again under "Layer configurability" in
[decoration-follow-ups.md](decoration-follow-ups.md) — both times on scope, never on a
technical objection, and the roadmap carries it as part of "Marker configurability"
([#157](https://github.com/laughedelic/obsidian-true-outliner/issues/157)).

This note records the design pass that settled the mark: the constraints any candidate had to
meet, what three review rounds tried and why each rejected candidate lost, and the four styles
that came out of it, with their exact geometry. The companion
[heading-marker-mockup.html](heading-marker-mockup.html) draws the four at real size in a nested
document, beside the paragraph and bullet marks they have to sit with — open it in a browser. It
is a mockup, not a measurement: what it settles is which marks to build.

**Design pass: 10–19 September 2026.** The figures below are computed from the 16-unit drawing at
the two shipped box sizes. The budget they are checked against is the measurement pass in
[marker-text-gap.md](marker-text-gap.md); no new live measurement was taken.

## The constraints

**The box does not change.** `outline-decorations` requires that a marker's size not vary with
kind, heading level, or font size ("Markers are fixed-size and coexist with native and guide
chrome"), and `52-block-markers-icons.e2e.ts` asserts that a heading's marker has the same
computed width as a paragraph's. The placement arithmetic depends on the box too: the horizontal
shift, the baseline correction and the gutter all read `--to-marker-icon-size`
([marker-text-gap.md](marker-text-gap.md)). A level can change the ink inside the box, and
nothing else.

**The whole box is available for ink.** The shipped `H` reaches +4.26px right of its column, in
a box that reaches +6.80px. The task checkbox, at +8.00px, is the widest layer-sized mark, and it
alone sets the gutter ([marker-text-gap.md](marker-text-gap.md), "The readings"). A glyph that
filled the 16-unit box completely would still sit 7.20px from its own text: above the stated
6.00px gap and well above the one-space floor. No candidate had to hold back for the gutter's
sake.

**Three surfaces draw one glyph.** Three places build a heading's mark with `buildMarkerIcon`:
the editor line, the backlinks footer (its gutter marker and its inline lineage segments) and the
zoom trail. The backlinks-footer spec requires the same glyph at the same size for the same kind.
The footer draws its box at `0.8em`, 11.8px against 13.6px in the editor. So a candidate has to
hold up at 11.8px, and every level mark has to reach all three surfaces.

**The mark stays a drawn `<svg>`.** Two consequences:

- The marker e2e counts `.to-decor-marker-icon svg` children, and `57-marker-gap.e2e.ts` reads
  ink as the union of the icon's children's rects. A mark made of text or a pseudo-element would
  break the first check and escape the second.
- The mark stays self-drawn, as every other kind's is. A `<text>` digit would inherit the
  reader's interface font: every theme, and CI's font, would draw a slightly different mark with
  a slightly different gap to its text. That would still fit the budget, but the geometry would
  no longer be ours.

## Prior art: obsidian-lapel

obsidian-lapel ([experiment-5-block-markers.md](experiment-5-block-markers.md), "Prior-art
addendum") prints `"H1"`…`"H6"` as literal text. A pseudo-element reads
`content: var(--heading-marker)`, the property is set per `[data-level]`, and the text is sized at
`var(--font-smallest)`. Nothing is drawn. Its digits look natural because they *are* the reader's
interface typeface, hinted by the browser at that size, which no shape drawn on a 16-unit grid
receives.

Copying that mechanism fails both constraints above. What it does show is what legibility at this
size depends on: real numeral shapes, with open counters and natural proportions. The digit
drawing this note settles on approximates them in paths.

## Round one: eight families

Each family drew all six levels in the unchanged viewBox:

| Family | What it drew | Outcome |
| --- | --- | --- |
| Twin | `H` and a digit side by side, equal height | Kept |
| Subscript | A large `H`, a small digit low and right | Kept |
| Numeral | The digit alone, filling the box | Rejected |
| Chip | A filled badge, the digit knocked out | Rejected |
| Size ramp | One `H` at six sizes, no digit | Rejected |
| Ink ramp | One `H`, weight and opacity falling by level | Rejected |
| Pips | Die faces | Rejected |
| Level meter | A bar on one of six rungs | Rejected |

Numeral and Chip were the most legible at both sizes. Neither says "heading", though, and a bare
number in the marker column reads as an ordered list's own number a few rows away — the list
keeps its native number in the same column. The two stayed in round two as a legibility
benchmark, not as candidates.

The level meter was ruled out by arithmetic before review. Its six rungs sit 2.2 units apart:
1.9px in the editor and 1.6px in the footer, too close to tell apart. Size ramp, Ink ramp and
Pips rendered cleanly, but none of them reads as a level at a glance. Size ramp also raised the
question of whether scaling the ink inside a fixed box keeps to the fixed-size requirement's
intent, as well as its letter. Dropping the family makes that question moot.

## Round two: the digit, the glyph, the weights

Three axes were opened on the two surviving layouts.

**How the digit is drawn.** Round one's digits were seven-segment blocks: rectangles only,
matching the rectangles of the existing `H`. Three drawings were compared at both sizes:
seven-segment, monoline outline paths, and a `<text>` node in the page's own face, standing in
for lapel's effect. Type looked best. The outline came close, and it keeps both constraints that
type breaks. Seven-segment was the first to lose legibility at 11.8px.

**Which glyph.** `#` joined `H`, since it is heading syntax in markdown itself. A hash at cap
height is close to square, so it takes its own proportions rather than the `H`'s tall box. Its
stems are slanted, because upright stems read as a window frame at this size.

**Weight.** The glyph and the digit got independent weights. The glyph is identical on every
heading, so it carries no information; the digit carries all of it. The weights that settled
below lean on that asymmetry.

Two more layouts were tried and dropped. Ghost put the full-box digit over the glyph at 30%
opacity; Stacked put the glyph above the digit, each at the full width.

## Round three: tuning

- **Twin with `H`** looked thin: a full-height `H` squeezed into half the box's width. Cutting it
  to exactly the digit's ink height gave the pair a common cap line and baseline without widening
  it. The height is derived from the digit's drawing and weight, so the two cannot drift apart.
- **Twin with `#`** needed only a lighter glyph, at 0.90×.
- **Subscript** looked best in both glyphs at glyph 0.85×, digit 0.90×. The glyph steps back far
  enough that the small digit no longer reads as an afterthought.
- **A tall `#` for subscript** (8.6 × 12.2 units) was tried and rejected.

## Decision

Two independent axes, four styles, each with fixed weights. The axes are settings; the weights
are part of each style and are not exposed.

| | **Twin** — digit beside the glyph | **Subscript** — digit below and right |
| --- | --- | --- |
| **`H`** | glyph 1.00×, digit 1.00×; `H` height matched to the digit's ink | glyph 0.85×, digit 0.90× |
| **`#`** | glyph 0.90×, digit 1.00× | glyph 0.85×, digit 0.90× |

### Geometry

All in the `0 0 16 16` viewBox, as `x, y, w, h`, with the stroke or bar thickness `t` after the
weight is applied.

| Style | Glyph box | Glyph `t` | Digit box | Digit `t` |
| --- | --- | ---: | --- | ---: |
| `H` twin | `0.6, 3.09, 6.0, 9.82` | 1.70 | `9.2, 2.2, 6.2, 11.6` | 1.55 |
| `#` twin | `0.4, 4.2, 7.2, 7.6` | 1.35 | `9.2, 2.2, 6.2, 11.6` | 1.55 |
| `H` subscript | `0.8, 1.4, 8.2, 10.4` | 1.70 | `10.0, 7.4, 5.4, 7.2` | 1.28 |
| `#` subscript | `0.5, 1.4, 9.2, 9.6` | 1.45 | `10.0, 7.4, 5.4, 7.2` | 1.28 |

- **`H`**: two stems `t` wide and a crossbar `t` tall, centred on the box.
- **`#`**: two stems at `x + 0.20w` and `x + 0.62w`, slanted by `min(0.9, 0.11w)` from top to
  bottom, and two full-width rails centred at `y + 0.28h` and `y + 0.70h`.
- **`H` twin glyph box**: derived rather than fixed. It spans the digit's ink from the top of the
  figure to the baseline, stroke included.

### The digits

Six monoline paths, authored in a 6 × 10 box with the figure between `y = 1` and `y = 9`,
stroked with round caps and joins. Each is scaled uniformly into its digit box and centred there;
the stroke width is divided by the scale, so `t` above is the stroke as drawn in the viewBox.

```text
1  M1.5,2.4 L3.0,1.0 L3.0,9.0
2  M0.9,2.7 C0.9,0.6 5.2,0.3 5.2,3.0 C5.2,5.1 1.6,6.5 0.8,9.0 L5.3,9.0
3  M0.9,2.2 C1.4,0.5 5.2,0.4 5.2,2.7 C5.2,4.2 3.7,4.9 2.7,4.9
   C3.9,4.9 5.4,5.6 5.4,7.2 C5.4,9.5 1.5,9.8 0.8,7.9
4  M4.3,9.0 L4.3,1.0 L0.7,6.6 L5.5,6.6
5  M5.0,1.0 L1.5,1.0 L1.2,4.3 C2.5,3.5 5.4,3.9 5.4,6.5 C5.4,9.3 1.9,9.9 0.8,8.3
6  M4.9,1.2 C2.3,1.9 1.0,4.1 1.0,6.4 C1.0,8.4 2.2,9.4 3.3,9.4
   C4.6,9.4 5.4,8.4 5.4,7.2 C5.4,6.0 4.5,5.1 3.2,5.1 C2.1,5.1 1.2,5.8 1.0,6.6
```

### Against the budget

| Style | Digit ink, editor | Digit ink, footer | Ink right of column, editor |
| --- | ---: | ---: | ---: |
| Twin (either glyph) | 8.3px tall | 7.2px tall | +6.51px |
| Subscript (either glyph) | 6.0px tall | 5.2px tall | +6.07px |

The twin's rightmost ink, the digit's stroke, reaches 96% of the box's half-width and leaves 7.49px
to its text. That clears the stated 6.00px gap, and the checkbox's +8.00px is still the widest
layer-sized mark. The derivation in [marker-text-gap.md](marker-text-gap.md) therefore does not
move, and neither does `57-marker-gap.e2e.ts`.

## What the decision leaves

- **Keeping today's plain `H`** would need a third value on the layout axis, "no level", which
  none of the four styles covers. Whether it earns a place is a question for the change's review,
  not something this pass measured.
- **Font-drawn digits** remain the best-looking option and the one we rejected. They would become
  worth revisiting only if the ink stopped being part of the gap derivation.
- **Configuring the other kinds' marks** (an off switch for the marker layer, per-kind icons, a
  uniform bullet set) stays with [#157](https://github.com/laughedelic/obsidian-true-outliner/issues/157).
  These two settings are the first per-kind style axis. They should not become a template until
  a second kind needs one.
