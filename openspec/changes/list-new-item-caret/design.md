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

- No new rendering mechanism. Nothing here is allowed to introduce a per-line pixel
  measurement; the one font metric already measured (`--to-space-advance`) may be reused and
  its measurement SOURCE widened, and that is the extent of it. If a kind cannot be closed
  within that budget, the residual is recorded rather than paid for with new machinery.
- Nothing about which positions a caret may occupy. `content-space-caret` is untouched, `[ ]`
  stays addressable, and Home is unchanged.
- Nothing about the raw-source-to-rendered transition on a task line; see proposal.md.

## Decisions

### D1 — The width has to sit on an element the caret's own range crosses

This is the constraint everything else follows from, and it is what
`lists-on-the-outline-grid` missed: sizing the marker SPAN gives the text column, because the
following content starts at the span's right edge, and gives the caret nothing, because the
range ends inside the span.

An element BEFORE the position works — a range that fully contains an inline-block covers its
border box, padding included. A pseudo-element does not: `::after` is not a DOM node, so a
range that ends at the preceding text node does not reach it. That rules out the cheapest-
looking fix (`content: ''` padding on the marker span) before it is tried.

So each kind needs a real element between the depth column and the position. Both exist:
`.list-bullet` for an unordered item and `.list-number` for an ordered one. Both are present
on the caret's own line — `.list-bullet` confirmed live (docs/research/14, cited by the
accent rules), and `.list-number` implied by the same rules, which colour it for the CURRENT
node and would be dead code if it disappeared under the caret. **Task 1 measures both before
anything is built**, because if either is absent on the caret's own line that kind's lever
does not exist and D2/D3 collapse to "record the residual".

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

### D3 — The ordered number's shift moves onto the number itself, so the run ends on the column

The `transform` is the larger half of the ordered deficit, and it cannot simply be dropped:
it is what puts a number's left edge where a block marker's is (`outline-decorations`, and
`56-list-grid` asserts it). Nor can it be compensated on the span — padding after the digits
is past the range's end, exactly as in D1.

Give the shift and the width to `.list-number` instead:

```
.list-number { display: inline-block; min-width: calc(var(--to-marker-gutter) - var(--to-space-advance) + var(--to-marker-icon-size) / 2); margin-inline-start: calc(var(--to-marker-icon-size) / -2); }
```

The digits' painted left edge is where the transform put it. The run ends at
`−icon/2 + (gutter − advance + icon/2) + advance` = the gutter, so the caret lands on the text
column. The span's own width is the sum of its children's margin boxes, which is the same
gutter, so the text column does not move either. `min-width` rather than `width` keeps the
wide-marker exception intact: `10.` overflows its own box, pushes its item's text out, and the
caret follows it there — which is what the new requirement says it must do.

This is the one place the change touches something `56-list-grid` already measures (the
ordered number's left edge, and the wide-marker push-out). Both are relationships, not pixels,
and both are preserved by construction — but they are the assertions most likely to catch a
mistake here, which is the point of them.

Alternatives rejected: shifting the outer span by a negative margin and widening its
`min-width` to compensate leaves the run's end exactly where the transform left it (the text
moves with the box), so it buys nothing; suppressing the shift while the item is empty makes
the mark's own position depend on whether the item has content, which is the chrome-shape
dependence this codebase refuses elsewhere; and publishing a per-line measured slack buys the
same answer for a new measurement mechanism, against D-none-of-that in Non-Goals.

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

`enter-and-shift-enter-grammar` D5 held "is `[ ]` chrome?" out of scope, and this stays out of
it. Nothing here changes addressability, the content boundary, Home, or the selection ladder;
one placement moves by four characters.

### D6 — Verify against the rendered caret, never against `coordsAtPos`

`56-list-grid`'s header already records that `coordsAtPos` reports the end of a marker's TEXT
rather than of its box, and that an assertion built on it agreed with the 16px soft-wrap defect
it was supposed to catch. This defect is the same function reporting the same thing, so an
e2e that measures the caret with `coordsAtPos` would confirm the bug and pass.

Measure `.cm-cursor`'s own client rect — what the user actually looks at — and assert it
against the item's own text column, taken from a sibling item's text node the same way that
suite already takes text columns. Assert the RELATIONSHIP, never a pixel a glyph's width
decides: CI's font is not macOS's, and every rewrite this suite has needed came from
forgetting that.

### D7 — Negative controls before the fix is trusted

Every new assertion is run once with its own lever disabled — the padding removed, the number
rule removed, the policy exception removed — and must fail. Three of these tests would pass
against unfixed code by accident: an ordered assertion stated as an inequality, a bullet
assertion tolerant to the space advance, and the plain-item case of D5, where content start and
content end coincide and the exception is a no-op by construction.

## Risks / Trade-offs

- **`.list-bullet` or `.list-number` is absent on the caret's own line** → D2/D3 lose their
  lever entirely. Measured first (task 1), before any rule is written. If a kind has no
  element, that kind's residual is recorded in `docs/research/12` and its scenarios are dropped
  from the delta rather than being asserted against a fix that does not exist.
- **The range rect may not include an inline-block's padding** → D2's fallback (width plus a
  re-centred `::after`) is stated and costs one extra rule. Same measurement decides it.
- **`--to-space-advance` gains two more consumers**, so a bad measurement now misplaces every
  list line's text run rather than one label's. Mitigated by D4 and by an e2e that a
  bullet-only document publishes a measured value, not the fallback — the suite already has
  the task-line version of exactly that assertion.
- **A theme that restyles `.list-bullet` or `.list-number`** could fight the new rules. They
  are the same elements the layer already restyles for size, weight and accent colour, so the
  exposure is not new; the assertions are relationships rather than pixels, so a theme that
  changes the font does not break them.
- **The ordered rule moves the number's own positioning from the span to the child.** That is
  the riskiest edit here, because it re-expresses something already correct. It is guarded by
  the two `56-list-grid` assertions written for it (the shared left edge with a block icon, and
  the wide-marker push-out), which must be shown to pass unchanged.
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
