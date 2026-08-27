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

The condition is the presence of a task marker at the item's content start, and nothing else.
An earlier version asked instead whether the item was EMPTY, reusing `itemContentIsEmpty` —
which was too narrow twice over, reported after it shipped: an interior split of `- [ ] foobar`
left the caret in front of the new item's box, and a ticked box was exempted for a reason that
belongs to a different question. `itemContentIsEmpty`'s carve-out serves the unwrap ladder,
which decides whether Enter may outdent an item away; where an item's TEXT begins is not a
function of its state, and an item created empty and one that kept its text present the same
position.

The boundary it measures from is `caret.ts`'s, not `ops.ts`' finished column. That one also
swallows an ATX prefix, so sharing it would move this caret onto the `#` of `- # title` —
which this same requirement states it must not. What the two share is the task marker's own
length, exported for the purpose, so each adds it to its own boundary.

Its reach is deliberately wide: it also catches a `derived` placement whose mapped column
happens to be that content start. That is the intended behaviour, not an accident — the
argument for moving the caret is that typing at that position destroys the marker, and that
argument does not depend on which key produced the position. It reaches no further than that
one column, so a caret the user parked INSIDE `[ ]` is carried along unchanged by the same
operations.

It closes that kind's geometry as well, which was not the expectation. Measured: with the
caret at the content start Obsidian renders the line as source and the caret sits at 11.42,
where that line's own text also begins; with it at the content end — `- [ ] |` — Obsidian
renders the `.task-list-label` checkbox and the caret measures 19.99, the gutter. So a task
item needs no CSS of its own here, and the delta's caret requirement is satisfied for it by
this rule rather than by D2 or D3.

`enter-and-shift-enter-grammar` D5 held "is `[ ]` chrome?" out of scope, and this stays out of
it. Nothing here changes addressability, the content boundary, Home, or the selection ladder;
one placement moves by four characters.

### D5a — Splitting gets its own content-start column; `contentColumnCh` keeps its callers

Reported after the caret work landed, and a second instance of the same shape: a task
marker sitting between the user's idea of where content starts and the code's.

`splitNode` decides between its two outcomes by comparing the position to
`contentColumnCh`, which stops after `- `. So on `- [ ] bar` the position a user reads as
the item's content start is ch 6 while the operation's is ch 2, and ch 6 took the INTERIOR
path. Measured, both halves:

- Childless: `- [x] foo` / `- [ ] bar` split at ch 6 produced the right TEXT
  (`- [ ] ` above `- [ ] bar`) and anchored on the lower node — the item that kept its text,
  not the empty one just made.
- With children: `- [ ] bar` over `- kid` produced `- [ ] ` with `bar` demoted to a CHILD,
  its task marker gone. That is precisely what the 2026-08-07 amendment to "Node split" was
  written to remove — "a split at a node's content start demoted the node's own text into a
  child of an empty parent" — surviving in the one place the amendment could not reach,
  because `contentColumnCh` does not count `[ ] ` as part of the prefix.
- Inside the marker: ch 3 divided it, yielding `- [` and `- [ ] ] bar`.

The fix is a split-specific boundary, not a change to `contentColumnCh`. That helper answers
several other questions — split-point clamping's siblings, chrome recognition, transaction
classification, the selection ladder — and `caret-placement-policy` states that its marker
boundary is unchanged and keeps them. Moving it would be the "is `[ ]` chrome" decision D5
refuses, arrived at sideways.

The clamp `splitNode` already applies is what makes this one rule cover the whole marker:
a position is raised to the content column before the comparison, so every position from
the list marker's end through the task marker's end resolves to the same intent, and the
marker-interior case needs no rule of its own. That mechanism predates this change; it is
the column it clamps to that was short.

Splitting only, and stated that way in the delta. A ticked box is still content to the
caret — D5's placement rule leaves `- [x] ` alone — but a line break in front of one still
means "a new item above", so this boundary does not read the box's state.

### D5b — The same column, in the Backspace path — and it takes three gates, not one

Reported straight after D5a, and worse than the merge defect predicted from reading the code:
Backspace where a task item's text begins did not merge at all. It deleted one character and
left `- [ ]bar` — a broken checkbox with both nodes still there.

Three places read the item's content column, and all three read the short one:

1. `classify.ts`'s `crossesViaChromeDeletion` decides that a single-character deletion at a
   list item's content column CROSSES a boundary. At ch 6 it did not match, so the keypress
   was classified as ordinary within-node authoring and the enforcement layer never ran.
2. `enforce.ts`'s `recognizeMergeIntent` reads the same shape as a merge intent.
3. `mergeNodes` strips the absorbed item's LIST marker only, so even once the first two fire,
   `- [x] foo` + `- [ ] bar` read `- [x] foo[ ] bar`.

The first is why a verdict-level test passed while the editor did nothing: handed the class by
hand, `computeVerdict` already produced the merge. The test asserted the outcome and the
mechanism was never reached — so the classifier now has its own case, and the e2e presses the
key.

(1) and (2) must agree exactly: if the classifier admits an edit the recognizer does not
understand, the keypress reaches the enforcement layer with nothing to do; if the recognizer
is wider, its extra cases are unreachable. So the column test is ONE exported predicate
(`isContentStartCh`) that both call, rather than the same expression written twice.

A task item has TWO content-start columns and the predicate accepts both. After `- ` is where
Home lands and was already recognized; after `- [ ] ` is where the item's text begins.
Widening must not trade one for the other, which is what its own test pins.

Positions INSIDE `[ ]` are deliberately excluded here, where the split (D5a) includes them.
The two gestures ask different questions: a line break inside a marker can only produce a
broken marker, so every position in it means the same thing; a DELETION inside one is
ordinary editing of characters the user can see, and stealing it would make the checkbox
unremovable by the obvious gesture.

For (3), the strip stays on `LIST_MARKER_SPLIT_RE` with the task marker taken after it, NOT on
`markerPrefixCh`. That column is built on `contentColumnCh`, which also swallows an ATX prefix
and requires whitespace after the marker — so the shorter spelling would eat the `#` from
`- # title` and keep the `-` on a bare `-`. It passes every other test in the file, which is
why the two shapes are pinned.

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
