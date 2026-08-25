## Context

See proposal.md for motivation, and
[docs/research/16-native-list-decoration.md](../../../docs/research/16-native-list-decoration.md)
for the measurements every decision below rests on — taken live against Obsidian 1.13.4 in the
e2e harness, then reviewed by hand in a demo build whose two experimental settings this change
removes.

Four properties of Obsidian's own list rendering shape the approach, all confirmed live:

1. **`--list-indent` is a documented CSS variable** (`calc(--indent-unit × --indent-size)`,
   where `--indent-size` is the vault's Tab size) and drives exactly two things: `tab-size` on
   a list line, and `min-width` on each `.cm-indent` span. Setting it retargets every list
   level at once. Minimal, the most-installed community theme, already does this.
2. **`.cm-indent` spans exist only while Obsidian's own "Show indentation guides" setting is
   on**, and one span is emitted per tab or per exactly four spaces — never per two or three.
   Layout for space-indented files therefore depends on a setting the user owns, and on a
   quantum that is not the Tab size. Both of those are neutralised by D9: the spans and the
   leftover whitespace share one WRAPPER, and sizing the wrapper states the answer for
   whatever is inside it.
3. **The hanging indent is a cached live measurement** written as an inline style, invalidated
   on text change or on a DOM mutation Obsidian's own observer sees — `childList`,
   `characterData`, `subtree`, but not attributes.
4. **The variables must be overridden where they are USED, not on an intermediate holder.**
   `--list-padding-inline-start: var(--list-indent-editing)` is declared high in the tree, so
   overriding `--list-indent-editing` below it does nothing; overriding
   `--list-padding-inline-start` works. `--list-indent` is read directly by the line and its
   descendants and can be scoped as far down as a single `.cm-line`.

## Goals / Non-Goals

**Goals:**

- One unit, one column definition, one guide mechanism, one marker rule — for every kind.
- No new rendering mechanism. Everything below is either a CSS variable Obsidian already reads
  or the gradient/`Decoration.line` machinery the layer already runs.
- No pixel measurement added for POSITION. Obsidian's hanging indent — a per-line measurement
  it caches and gets wrong twice over — is replaced by a stated value rather than by one of
  ours, and every column, marker offset and guide stop is a `calc()` over facts the layer
  already publishes. One font METRIC is measured, and deliberately: `--to-space-advance`
  (D10), because the layout has to cancel exactly one space and no CSS unit expresses a
  space's advance. It is a single value per font, not a value per line, and it joins the
  existing `--to-chevron-dead-right` rather than starting a new mechanism.

**Non-Goals:**

- Rewriting a document's indentation to a canonical unit. This layer renders; it does not
  edit. A "normalize list indentation" command would be a structural-operations change.
- ~~Making list rendering correct for files Obsidian itself does not quantise (two- and
  three-space indentation).~~ Written as a non-goal on the assumption that it needed a
  mechanism of its own; **D9 does it with one rule** over facts already published, so it is in
  scope after all. Kept struck through rather than deleted: the assumption is the interesting
  part, and it is the same one the Risks section made.
- Turning the unit into a user setting. It becomes a single declared value so `--list-indent`
  can read it, which is the prerequisite; exposing it belongs with the wider
  layer-configurability item in `docs/research/12`.

## Decisions

### D1 — Set the variables Obsidian reads, rather than positioning list lines ourselves

Scope `--list-indent` (and the guide and marker-gap variables) to `.cm-line.to-decor-list`, the
class the decoration already puts on list-item lines. Both gates — outline mode, and lists only
— then come from the decoration itself and the CSS needs no second condition. Confirmed live:
an outline-mode note retargets and a non-outline note open beside it is byte-identical to
stock.

*Alternatives considered.* Measuring each item's bullet and drawing overlays at those
coordinates (obsidian-outliner's technique, and Experiment 2a's) was the approach two earlier
probes concluded was the only one available. It is a second rendering mechanism with its own
reflow bookkeeping, and Experiment 2b replaced exactly that with the measurement-free gradient
the layer now rests on. Forcing a width onto `.cm-hmd-list-indent` per line was also built and
measured: the geometry is right and the caret round-trips, but it desynchronises Obsidian's
hanging indent (see D3) and needs a per-line custom property where a single variable does.

### D2 — Draw the list guides ourselves; do not share with Obsidian's

Suppress the native indent guide on our list lines (its width, not the user's setting, so the
`.cm-indent` spans that carry layout still exist) and lift `computeLineGuides`' list-item
exclusion so the existing gradient draws every level.

Keeping the native guide was the cheaper option and was rejected on two measured grounds. It
disappears entirely when the user turns "Show indentation guides" off, so list levels would
lose their guides for a reason unrelated to outline mode. And it accents only ONE level — the
caret's own, via `.cm-active-indent` — where the trail accents the whole ancestor chain, so the
position indicator would still be missing inside lists, which is one of the things this change
exists to fix.

`LineGuideFact` carries the list-item ancestor depths in a field of their own rather than
merged into `guideDepths`. The walk publishes them unconditionally and the consumer combines
them, which keeps the fact independent of any rendering decision and keeps the per-`Text`
fact cache correct without a second key.

### D3 — State the hanging indent; do not read Obsidian's

Write `padding-inline-start` and `text-indent` on our list lines from
`(depth − supplementalDepth) × unit + gutter`, with `!important` — the rule this codebase
already relies on for `to-decor-block`, where an important stylesheet declaration beats
Obsidian's non-important inline style.

Two measured defects close together. Obsidian derives the hang from `coordsAtPos` at the end of
the marker, which reports the end of the marker's TEXT rather than the end of its padded box:
with the marker span sized to the gutter, every soft-wrapped list row lands 16px left of its
own item's text (measured 100.0 against a text column of 116.0). And because the value is
cached against attributes the observer does not watch, retargeting the grid at runtime — which
is what turning outline mode on does — leaves the old value in place until the note is
reopened. A stated value has neither problem: measured exact in both the freshly-opened and
the toggled-on case.

*Alternative considered and rejected.* Provoking the `childList` mutation Obsidian's cache does
watch (append an empty hidden span to each list line, remove it again) was built and confirmed
to work, with the document byte-identical across the nudge. It was backed out: this repo's own
lint rule forbids DOM insertion into a plain `.cm-line` after a confirmed 100%-CPU
mutation-observer feedback loop, and "the removal is synchronous so the loop cannot start" is a
judgement rather than a measurement. Stating the value removes the need entirely.

### D4 — The bullet is Obsidian's, positioned and weighted by us

Keep the native `.list-bullet` rather than replacing it with a synthetic marker. It is already
a real element on the real column, it already carries the collapsed/hover states and the
accent hooks `hierarchy-position-indicators` uses, and its appearance is entirely
variable-driven (`--list-bullet-size`, `-radius`, `-border`, `-transform`,
`--list-marker-color`) — so customisable bullets later are a settings surface over variables,
not new geometry.

Position: zero `--list-padding-inline-start`, a zero-width bullet box so its absolutely
positioned dot centres on the box's own start edge, and the whole marker span sized to the
marker gutter with `min-width`. Sizing the SPAN rather than padding the glyph is what makes the
text column font-independent: it is the gutter by construction rather than the sum of a
padding, a glyph and a space.

Weight: `--list-bullet-size: 0.38em`, colour token unchanged. Screenshotted at 0.30 (Obsidian's
default, 4.8px), 0.38, 0.45em and at `--text-muted`; 0.38em at the shared `--text-faint` lands
at the block icons' ink weight, 0.45em reads large against the text, and `--text-muted` makes
the bullet heavier than the markers it is matching.

### D5 — Ordered markers start on the column; task checkboxes keep native geometry

`min-width`, not `width`, on the marker span: a bullet gets exactly the gutter and a wide
ordered marker (`10. `) pushes its own text out rather than overlapping it. Ordered markers
therefore START on the column instead of centring on it, and an item numbered past 9 starts its
text slightly further right than its siblings. Right-aligning numbers into the gutter would
read better but needs a wrapper element the DOM does not provide.

A task checkbox is CENTRED on the column like a bullet, pulled back half its own width with
`margin-inline-start: calc(var(--checkbox-size) / -2)` — Obsidian's own variable for that
width, so a theme that resizes the control is followed rather than assumed away. Its width and
hit area are untouched.

Two earlier drafts of this decision were wrong, in opposite directions. The first said task
lines keep native geometry outright, which contradicted the requirement it was meant to
implement. The second brought the checkbox's START onto the column but excluded it from
centring, justified as "the checkbox is wider than the gutter" — measured, it is not: 16px
against a 20px gutter. Nothing was stopping it centring, and starting it there is exactly what
real use reported, a checkbox sitting nearer its text than the bullets above and below it in a
mixed list.

An ordered number takes the column too, with one qualification. Its mark IS its glyphs, so it
cannot shrink its box the way a bullet does; instead the painted glyphs are shifted left by a
fixed amount with `transform`, which moves the ink without moving the box its own text follows.
Every number in a list therefore shares one left edge, and wider ones lean right into the space
`min-width` already reserves.

That fixed amount is half a MARKER ICON, not half the gutter, so the shared left edge is the
one a block marker at the same depth begins at. Half a gutter was built first and reviewed by
hand: it put the digits 3.2px left of the paragraph icon beside them, which reads as the
numbers hanging off the column rather than sitting on it — visible whenever a numbered list
sits above or below a paragraph, which is where a reader has an edge to compare against. What a
single digit does is a consequence of whichever constant is chosen, not the rule: `1. ` centres
almost exactly under the half-icon shift in the bundled theme, and would land differently on a
font with different digit metrics.

Shifting each number by half its OWN width was built first and measured out: it centres them
all, but `10. ` then reaches 14px left of the column and `100. ` 19px, leaving nothing for the
fold chevron, which needs about 10px on that side and cannot go further without crossing the
parent level's guide one unit away.

### D8 — The fold chevron moves off the marker

Obsidian renders a list line's fold chevron with its right edge on the item's content origin.
That was harmless while a marker began to the RIGHT of that origin; now that markers are
centred ON it, the chevron sits straight through them — measured, the glyph occupies
`[column − 10, column]` while a bullet's dot occupies `[column − 3, column + 3]`.

`--list-bullet-end-padding` is the obvious lever and does nothing: raising it grows the
indicator's box to the right while its own `inset-inline-end` compensates by the same amount,
so the glyph does not move. Measured at 1.3rem, 2rem and 2.6rem — the glyph stayed put in all
three. So the glyph is translated directly; it is absolutely positioned, so nothing else moves.

How far is not a fresh choice: it is the BLOCK rule's answer minus that rule's gutter term. A
block line's chevron is anchored at the text origin, one gutter right of its column; a list
line's is anchored at its content origin, which the rules above have already put ON the column.
Drop the gutter and both kinds land their painted glyph at `column − icon/2 − 3px`, the same
3px visual gap from their own marker. Since a heading and a list item are foldable side by side
in the same document, that is the comparison a reader actually makes.

A self-chosen half-gutter-plus-2px was built first and reviewed by hand: 2.2px further left
than a heading's, close enough to the parent level's guide to read as belonging to that guide
rather than to its own marker. The two chevrons agreeing is now asserted as such in
`56-list-grid.e2e.ts`, rather than each being checked against a distance of its own.

### D9 — State the leading whitespace's WIDTH, not just the indent unit

Setting `--list-indent` retargets the levels Obsidian actually resolves. It does not help with
the ones it does not: a list line's leading whitespace is quantised into `.cm-indent` spans per
tab or per exactly four spaces, and whatever is left over stays a `.cm-indent-spacing` run of
literal space glyphs at the font's own advance. Measured on a two-space file, unit 24px: levels
1, 3 and 5 land on columns and levels 2 and 4 land 8.38px right of the level above. The parse
counts five levels; the editor's whitespace arithmetic counts two and a half. Guides drawn from
the parse then run through the bullets rather than out of them, which is how this surfaced in
real use.

The lever is that Obsidian wraps ALL of a line's leading whitespace — resolved and leftover
alike — in one `.cm-hmd-list-indent` span. Sizing that wrapper to `(depth − supplementalDepth) ×
unit` states the answer once for whatever it contains, so the quantum stops mattering. The
inputs are the two custom properties the line already publishes for the hanging indent, so this
adds no new fact and no measurement.

It also removes the dependence on Obsidian's "Show indentation guides" setting that this
change's Risks section had listed as a residual to detect and surface. With that setting off,
Obsidian emits no `.cm-indent` at all and nothing is resolved — measured, a FOUR-space level
then renders 7.25px short of its column. The wrapper is emitted either way, so one rule covers
both, and there is no longer a case to surface.

`white-space: pre` and `overflow: hidden` on the wrapper keep whitespace wider than its stated
box from wrapping the line or spilling across the marker; `vertical-align: top` keeps an
`overflow: hidden` inline-block — whose baseline would otherwise be its bottom margin edge —
from dropping the row it sits in. Line heights and row counts were measured unchanged.

**A continuation line takes the whole hang, a first line the hang less its gutter.** Every line
of a list item carries `to-decor-list`, first line and continuation alike, so the first version
of this rule sized them identically and put a continuation on the MARKER's column — measured,
20px left of the row above it. A first line spends the gutter on its native
bullet/number/checkbox; a continuation has no marker and belongs under the item's TEXT. The
line already knows which it is: `hasNativeMarker` is exactly "list-item first line" and had no
consumer until now, so it becomes `--to-list-marker-cols`.

This also closes a long-standing entry in `docs/research/12` — "a list item's continuation line
does not align with the item's own content" — which had been diagnosed as unclosable precisely
because closing it "would mean overriding the width of `.cm-hmd-list-indent` … from a live
measurement of the marker beside it". The override is the same one; the measurement is not
needed, because the column is stated. Measured before: 4.38px right of its own text under a
bullet, 8.56px right under `1. `, 4.16px left under `10. `. After: exact for every kind whose
marker fits the gutter.

The exception is the one the grid already states: a marker wider than the gutter pushes its own
first row out, and its continuation follows the grid's text column rather than that row. `10. `
measures 8.16px of it in the bundled theme on macOS. Aligning to the first row instead would
mean reading the marker's glyph width per line — the measurement this whole design avoids.

### D10 — Measure the space advance a task line's text begins with

A task item's text sat one space further right than every other kind's. The space is not ours
to remove: Obsidian tokenises `- ` into the marker span and `[ ]` into the checkbox, and leaves
the space between `]` and the text as the first character of the CONTENT span. A bullet line's
equivalent space falls INSIDE the marker span, which D4/D5 size to the gutter, so it is
absorbed there and the text lands on the column; a task line has nothing to absorb it.

Worth recording because the first reading of the report was wrong: the marker-to-text GAP is
not larger on a task line — 17px on a bullet against 16.2px on a task, the checkbox being much
the wider mark. What a reader sees is the text COLUMN, 4.19px out of line with its neighbours'.

So the label is sized one space SHORT of the gutter. No CSS unit expresses a space's advance
(`ch` is the digit's — 9.6px where a space is 4.19px), and hardcoding one font's number is the
mistake this layer keeps rediscovering, so it is measured live into `--to-space-advance` by the
same mechanism and for the same reasons as `--to-chevron-dead-right`: `view.dom` rather than
`contentDOM` to stay outside CM6's observed subtree, and written only on a real change.

The correction goes on the LABEL rather than on the content span: exactly one label exists per
rendered task line, so it cannot compound across however many spans the content is split into,
and the cursor's own line — which shows `- [ ]` as source and has no label — is excluded by
construction rather than by an added condition. Shrinking the label moves only its right edge,
so the checkbox stays centred on the column.

The e2e assertion is on the PROPERTY, not on the rendered position. The CSS fallback (`0.26em`)
reproduces the bundled font to within 0.03px, so a position assertion passes identically with
the measurement removed — verified by removing it. What is worth pinning is that the
measurement ran and agrees with the space it compensates.

### D6 — One column definition, shared by markers, guides and accents

Measured: a marker's centre sits at exactly `depth × unit`, while a guide paints its 1px as
`[column, column + 1]`, so its visible centre is `column + 0.5` — every marker in the layer,
bullets and block icons alike, is half a pixel left of its own guide. Separately, a bullet
centres on its text rect's geometric centre while a block icon sits about 5px above it, so the
two kinds do not share a vertical rule.

Both are resolved by making the column — horizontal and vertical — one value that the guide
gradient, the marker offset and the accent layers all derive from, rather than three call sites
that agree by convention. This is the standing rule doc 11 draws from Experiment 5b's three
near-identical bugs: when two things must move together, make it impossible to change one
without the other.

### D6a — The vertical anchor stays per-kind (revised during implementation)

D6 said the vertical rule would be unified along with the horizontal one. The horizontal half
landed; the vertical half was built, looked at, and reversed.

`vertical-align: middle` is the optical centre of a row of lowercase text and is exactly right
for a bullet — it moved the dot the ~1.4px down that the review had reported as "a tad too
high". Applied to a synthetic marker it is wrong, because `middle` resolves against the
PARENT's x-height and a heading's parent is the heading: on an H1 the icon moved from 8.45px
above its text-rect centre to 2.96px BELOW it, landing under the heading's own glyphs and hard
against the guide that starts on the row beneath. Reported from the demo build as "icon
markers too low and overlapping the guides", and confirmed in a screenshot.

So the bullet keeps the optical anchor and the synthetic marker keeps `baseline`. They differ
by about 7px on a body-sized row. That is a real design finding rather than an unfinished
task: a 13.6px outline glyph in the text flow and a 6px dot in a flex box do not read as
aligned at one numeric offset, and no single CSS anchor serves both across font sizes. The
requirement was amended to say so rather than left stating something the implementation does
not do.

A task checkbox lands 0.46px off the bullet's anchor — the label is the box that participates
in the line and is taller than the control inside it. Left as measured.

### D7 — Remove the settings

The demo build's `listLayout` and `listBullet` dropdowns and their persisted fields go. They
existed to make the comparison possible, the comparison happened, and keeping them would mean
committing to four rendering combinations.

The removal is not complete at the type level, because the loader is
`{ ...DEFAULT_DATA, ...(await this.loadData()) }` (`main.ts`): it spreads EVERY key the file
holds onto `this.data`, so a `data.json` written by the demo build keeps `listLayout` and
`listBullet` on the object, and the next `saveData(this.data)` — the next outline-mode toggle
— writes them straight back. Deleting the type does not delete the data.

So the load path gains a normalization: `this.data` is built by picking the KNOWN keys, not by
spreading whatever the file contains. That is the general fix rather than a two-key patch —
this is the first setting the plugin has ever removed, and an allow-list means the next removal
is free. Anything unrecognized is dropped on the first save; nothing is migrated, because the
two values map onto the single behaviour this change makes unconditional.

*Alternative considered.* Deleting exactly these two keys during load is smaller, but it leaves
the general defect in place and needs another patch the next time a setting is retired.

## Risks / Trade-offs

- ~~**Two- and three-space indented files stay misaligned, and more visibly than before.**~~
  ~~**Space-indented files depend on a setting the user owns.**~~ Both were accepted as
  residuals and both are **resolved by D9**, which states the leading whitespace's width from
  the item's own depth instead of accepting what Obsidian made of the characters. They are kept
  here rather than deleted because the risk as written was real and its accepted mitigation
  (document it, and offer a normalize-indentation command later) was the wrong answer: the
  right one was another look at what Obsidian's DOM offers, which is the lesson
  `docs/research/16` already states as "look for the variable before building the mechanism".
- **We now override native list chrome, the surface the original postmortem blames for most of
  the earlier failure.** → The overrides are variables Obsidian itself exposes plus one stated
  hang, not a fight with its box model; every one is verified by measurement and by a
  screenshot pass, and the additive-only discipline still holds for every non-list kind.
- **Theme collision.** A theme that sets `--list-indent` itself (Minimal does, at `2em`, via
  Style Settings) loses that setting inside outline mode; Minimal additionally puts its own
  `--list-edit-offset` margin on list lines, which our own `margin-left !important` replaces.
  → Include Minimal in the manual pass, as `docs/research/12`'s existing Minimal entry
  requires.
- **Three existing trail tests assert the behaviour being removed** ("runs the segment at the
  shallower non-list column, through the list levels", "accents only the non-list ancestor in
  the guides style", "draws no segment anywhere in a pure list, in either style"). → They are
  the regression net for the old contract and are rewritten against the new one, not deleted
  quietly.
- **Obsidian could change any of this.** The variables are identical in 1.12.7 and 1.13.4, and
  `--list-indent`/`--list-spacing`/`--list-marker-color` are documented; the guide and bullet
  variables are not. → Every value we set has a working fallback, and the e2e suite measures
  rendered geometry rather than asserting the variables exist.

## Open Questions

- ~~What the surface should be when a note's list indentation cannot render on the grid.~~
  **Moot: there is no such note.** This was settled once as "documentation only" — a "Known
  limitations" README section — and then settled again by D9 removing the condition it would
  have described. Two- and three-space files, and space-indented files with Obsidian's
  indentation guides off, all render on the grid. The README entry and the demo note's
  "Known limitation" section are removed rather than reworded.
