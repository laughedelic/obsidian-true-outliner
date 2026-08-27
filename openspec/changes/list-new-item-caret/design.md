## Context

See proposal.md for motivation and the measured table. This section states only the mechanism
the decisions turn on, and the arithmetic that identifies each kind's deficit.

**CM6 measures a caret from the text run, not from the box around it.** A caret's x comes from
a DOM Range that ends at the position, and the rect of that range covers the text and the
ELEMENT boxes it crosses. Width contributed by an ancestor — `min-width` on the span holding
the marker — lies past the range's end and is invisible to it. So the marker's box can be one
gutter wide while its text ends well short of that, and the caret takes the text's end.

On an item that HAS content this never shows: CM6 resolves the content-start position to the
start of the following content span, which is at the box's right edge. An EMPTY item has no
following span, so the marker's own run is all there is to measure. That is the whole defect,
and why it is specific to empty items.

Each kind's deficit decomposes exactly, against the recorded measurements:

- **Bullet.** `.list-bullet` is `width: 0` (styles.css, so its flex-centred `::after` puts the
  dot on the depth column), so the text of `- ` is its trailing space alone. Caret 4.19 = one
  space advance. Deficit = gutter − advance = 20 − 4.19 = **15.81**, which is what was
  reported.
- **Ordered.** `1. ` measures 18.4px in the bundled theme — a number already recorded in
  `e2e/specs/56-list-grid.e2e.ts`' own header. `--to-marker-icon-size` is `0.85rem` = 13.6px,
  and `.cm-formatting-list-ol` is shifted `translateX(-icon/2)` = −6.8px. 18.4 − 6.8 = **11.6**,
  the measured caret. The ordered deficit is therefore two terms: 6.8px of `transform`, which
  moves the measured run as well as the ink, and 1.6px of `min-width` slack.
- **Task.** The `min-width` rule excludes `.HyperMD-task-line`, and on the caret's own line
  Obsidian renders `- [ ] ` as source with neither `.task-list-label` nor a bullet. 11.42 is
  the natural width of `- ` in that state — and the line's own text starts there too, so
  nothing is out of place while the caret is on it. The task line's shift to column 20 happens
  when the caret LEAVES and the checkbox renders. Its defect is a different one, and it is not
  about pixels.

**The task item's second defect.** `splitNode` writes `- [ ] ` and `finalize` anchors at
`contentColumnCh`, which swallows `- ` and stops in front of `[`. Verified by running the
operation directly: `splitNode(parse('- [x] done\n'), …, {line: 0, ch: 10})` returns
`{line: 1, ch: 2}`. Split routes through `caret-placement-policy` as `exact`, which takes the
anchor unchanged, so that is the caret the user gets. Typing there yields `- foo[ ] `.

## Goals / Non-Goals

**Goals:**

- The caret agrees with the item's own text column while the item is empty, for a bullet and
  for an ordered item, at every depth and in any font.
- One lever per kind, in the same place the rest of the list grid lives, hanging off elements
  this layer already restyles.
- Enter on a task item leaves the caret where the text goes.
- Every column `e2e/specs/56-list-grid.e2e.ts` guards is identical before and after.

**Non-Goals:**

- No pixel measurement added. The one font metric already measured (`--to-space-advance`) may
  be reused and its measurement SOURCE widened, and that is the extent of it. Every column
  here stays a `calc()` over facts the layer already publishes. A `Decoration.mark` is new to
  this layer but not a new mechanism in that sense — it is the same CM6 decoration API the
  line and widget decorations already use, and it measures nothing.
- Nothing about which positions a caret may occupy. `content-space-caret` is untouched, `[ ]`
  stays addressable, and Home is unchanged.
- Nothing about the raw-source-to-rendered transition on a task line; see proposal.md.

## Decisions

### D1 — The width has to sit on an element the caret's own range crosses

This is the constraint everything else follows from, and it is what
`lists-on-the-outline-grid` missed: sizing the marker SPAN gives the text column, because the
following content starts at the span's right edge, and gives the caret nothing, because the
range ends inside the span.

An element BEFORE the position works — a range that FULLY CONTAINS an inline-block covers its
border box, padding included. An element the range merely ends INSIDE contributes only up to
the endpoint, which is the same reason the span's own `min-width` is invisible. A
pseudo-element is not a DOM node at all, so `::after` on the marker span is unreachable too;
that rules out the cheapest-looking fix before it is tried.

So each kind needs a real element between the depth column and the position, ending before the
marker's trailing space. Task 1 measured which kinds have one, and they differ:

- **A bullet has one.** `.list-bullet` is present on the caret's own line, `display:
  inline-flex`, `width: 0`, with an absolutely positioned `::after` at `left: -3.04px`. D2
  widens it.
- **An ordered marker has none.** `.list-number` is NOT emitted on the caret's own line: the
  span holds the raw text `2. ` and no child element at all. An earlier draft of D3 assumed
  otherwise, from the accent rules that colour `.list-number` for the current node — which
  turn out to apply only where the line is rendered rather than sourced. D3 supplies the
  element instead.

### D2 — The bullet takes the gutter as trailing PADDING, not as width

`.list-bullet { width: 0 }` is load-bearing: Obsidian centres the dot inside the bullet's own
content box, and a zero-width content box is what puts that centre on the depth column.
Growing `width` moves the dot by half the growth, straight off the column that
`outline-decorations`' shared-column requirement pins.

Padding grows the BORDER box while leaving the content box zero-wide where it is. The range
covers the border box, so the caret gains the width; the `::after` centres on the content box,
so the dot does not move:

```
.list-bullet { width: 0; padding-inline-end: calc(var(--to-marker-gutter) - var(--to-space-advance)); }
```

The marker's run then measures 0 + 15.81 + 4.19 = one gutter exactly, and `min-width` on the
span stops binding for bullets — it stays, as the guarantee for a font whose space is wider
than the gutter and for the kinds that still need it.

Alternative kept in reserve: `width` on the bullet plus a `translateX(-50%)` on the `::after`
to put the dot back. Same result, two coupled rules instead of one, and it re-centres a dot
this layer does not otherwise position. Take it only if the padding box turns out not to
behave as assumed — which task 1 measures rather than argues.

### D3 — The ordered marker's digits are wrapped by a decoration of ours, and that box carries the width

There is no element inside an ordered marker to widen, and no arrangement of padding, margin
or `min-width` on the span around it can substitute for one: the gap has to sit between the
digits and the position, and both ends of that gap are fixed — the digits' left edge by the
half-icon shift the shared-column requirement pins, and their width by the font. Four
arrangements were worked through against the measurements before this one; each moved the
digits, the text column, or nothing at all.

So the layer supplies the element. A `Decoration.mark` covers the marker's digits and their
punctuation — `1.`, `12)` — and never the whitespace that follows, since the whitespace is
what the range ends AT. The class it carries is sized in `styles.css` the way `.list-bullet`
is: one space short of the gutter, plus the half-icon the span now gives back.

The span keeps its `transform` and gains `margin-inline-end: calc(icon / -2)`. `transform`
moves ink and not layout, so before this the item's own text began at the box's UNTRANSFORMED
right edge — a gap between a number and its text exactly as wide as the shift. Pulling the box
in by the same amount puts the text back where it was for a marker that fits the gutter, and
closes that gap for one that does not.

Measured after building, against Obsidian 1.13.7 (caret x / that item's own text column):
`2. ` 20.02 / 20.02, `1. alpha` 20.02 / 20.02, `10. ` 21.36 / 21.36, `100. ` 31.12 / 31.12,
with the digits' painted left edge on −6.8 in every case. CM6 nests the mark INSIDE Obsidian's
own token span rather than splitting it, which is the arrangement the arithmetic assumes.

`min-width`, so a marker whose glyphs exceed it overflows, pushes its own text out, and takes
the caret with it — the run and the box end together whatever the digits measure, so the
wide-marker exception needs no case of its own.

**This is a deliberate behaviour change beyond the caret**, and the delta states it: a `10. `
item's text moves one half-icon LEFT, onto the point where its own number ends. That column
was previously the sum of the untransformed box and a shift applied only to the ink, which is
not a position anything intended. It also narrows an existing mismatch this change did not set
out to touch — a wide marker's soft-wrapped rows follow the stated hang while its first row
follows the marker, and the two were 8.16px apart.

Alternatives rejected: a widget between the digits and the space, or a per-line published
slack, both of which need the digits' own width measured and so buy the same answer for a new
measurement mechanism; and suppressing the shift while an item is empty, which makes the
mark's position depend on whether the item has content.

### D4 — Widen where `--to-space-advance` is measured from, since D2 and D3 make every list line depend on it

`MarginCompensation.measureSpaceAdvance` queries one shape:
`.cm-line.to-decor-list.HyperMD-task-line .task-list-label`, then the leading space of the
text after it. Today that is right — the only rule reading the variable is the task label's.
D2 and D3 make every bullet and every ordered item read it, so a document with no task line in
the viewport would lay out its whole list grid from the CSS fallback (`0.26em`), which is a
guess at a font metric rather than the metric.

Widen the source, not the mechanism: a bullet line's marker span ends in exactly one space
too, and it is the same space, in the same font, at the same size. The method already measures
a single character with a Range and already refuses a measurement it cannot identify; it gains
another selector and the same guard, not a second code path.

This follows D8a of `lists-on-the-outline-grid` — measure a value from the kind of element the
rule consuming it applies to — one step further: now that three kinds consume it, any list
line may supply it.

### D5 — The task placement rule lives in `caret-placement-policy`, stated on the resulting position

Not in `ops.ts`. `structural-operations` states that an operation's result carries a structural
ANCHOR and not a caret, and that composing code (the enforcement layer's delete-then-splice)
locates nodes by it. Moving the anchor to satisfy a caret preference would change what those
callers find.

In the policy, the rule is stated on the OUTCOME — "a caret that lands at the content start of
an item whose only content is an unchecked task marker goes to that item's content end" —
rather than on any one `CaretOp` case. Three reasons: the same keypress reaches the position
through more than one case, a case-by-case rule is one that a future case can forget, and the
outcome form is a total function of the result tree, which is what the policy already is.

The condition reuses `ops.ts`' `itemContentIsEmpty` rather than a second definition of
emptiness. That predicate already carries the carve-out this needs — UNCHECKED only, because a
ticked box is content the user entered and must never be skipped — and it is the same
predicate Enter's unwrap ladder consults, so the two cannot drift.

Its reach is deliberately wide: it also catches a `derived` placement whose mapped column
happens to be that content start. That is the intended behaviour, not an accident — the
argument for moving the caret is that typing at that position destroys a marker this grammar
wrote, and that argument does not depend on which key produced the position.

It closes that kind's geometry as well, which was not the expectation. Measured: with the
caret at the content start Obsidian renders the line as source and the caret sits at 11.42,
where that line's own text also begins; with it at the content end — `- [ ] |` — Obsidian
renders the `.task-list-label` checkbox and the caret measures 19.99, the gutter. So a task
item needs no CSS of its own here, and the delta's caret requirement is satisfied for it by
this rule rather than by D2 or D3.

`enter-and-shift-enter-grammar` D5 held "is `[ ]` chrome?" out of scope, and this stays out of
it. Nothing here changes addressability, the content boundary, Home, or the selection ladder;
one placement moves by four characters.

### D6 — Verify with `coordsAtPos`, which IS the caret here

An earlier draft said the opposite, on the strength of `56-list-grid`'s header recording that
`coordsAtPos` reports the end of a marker's TEXT rather than of its box. That is true, and it
is why an assertion built on it agreed with the 16px soft-wrap defect — but the quantity it
was reporting wrongly there was a marker's BOX. A caret is the other thing.

Measured: Obsidian renders `.cm-layer.cm-cursorLayer` and leaves it empty — the caret is the
browser's own, drawn from the DOM selection — so there is no `.cm-cursor` element to measure,
and the draft's instruction was unfollowable. `coordsAtPos` and the DOM selection's own
`getBoundingClientRect` agreed to the hundredth of a pixel across all eight probe
measurements. Either is the caret; `coordsAtPos` is the one the harness already has.

The assertions still take the RELATIONSHIP and never a pixel a glyph's width decides — the
caret against the item's own text column, taken from a sibling item's text node the way that
suite already takes text columns. CI's font is not macOS's, and every rewrite this suite has
needed came from forgetting that.

### D7 — Negative controls before the fix is trusted

Every new assertion is run once with its own lever disabled — the padding removed, the number
rule removed, the policy exception removed — and must fail. Three of these tests would pass
against unfixed code by accident: an ordered assertion stated as an inequality, a bullet
assertion tolerant to the space advance, and the plain-item case of D5, where content start and
content end coincide and the exception is a no-op by construction.

## Risks / Trade-offs

- **The ordered case now rests on a decoration rather than on Obsidian's own DOM.** A mark
  where Obsidian already has a token span is a place the two could collide — measured, CM6
  nests ours inside theirs and splits nothing, but that is an arrangement CM6 chooses and not
  one this layer states. The e2e asserts the resulting geometry rather than the nesting, so a
  future CM6 that nested the other way fails loudly on the column rather than silently on the
  DOM shape.
- **`--to-space-advance` gains two more consumers**, so a bad measurement now misplaces every
  list line's text run rather than one label's. Mitigated by D4 and by an e2e that a
  bullet-only document publishes a measured value, not the fallback — the suite already has
  the task-line version of exactly that assertion.
- **A theme that restyles `.list-bullet` or `.list-number`** could fight the new rules. They
  are the same elements the layer already restyles for size, weight and accent colour, so the
  exposure is not new; the assertions are relationships rather than pixels, so a theme that
  changes the font does not break them.
- **A wide ordered marker's text column moves**, by design and not as a side effect — see D3.
  The two `56-list-grid` assertions written for the ordered marker (the shared left edge with a
  block icon, and the wide-marker push-out) are relationships rather than pixels and both still
  hold; they must be shown to pass unchanged, and the delta states the move so it is not read
  as a regression later.
- **D5 widens which keypresses can move a caret four characters.** A user who deliberately put
  the caret in front of `[ ]` and then pressed Tab finds it at the line's end. Accepted: the
  position they lose is one where typing destroys the marker, and the item is empty, so nothing
  else about the line depends on the column.

## Open Questions

- **The caret on a whitespace-only continuation line** — `docs/research/12` records it as the
  second, still-open offset of the same family: at end-of-line CM6 measured the caret from the
  whitespace's own metrics inside a wider span. `lists-on-the-outline-grid` has since given
  `.cm-hmd-list-indent` a STATED width, which is the D1 shape exactly — a box wider than its
  text — so the number that doc recorded is stale in an unknown direction. Task 6 measures it
  and either closes it with the same lever or records what it now is. Deferrable because the
  answer changes neither the requirements above nor the approach: it is a third instance of a
  mechanism this change already settles for two.
