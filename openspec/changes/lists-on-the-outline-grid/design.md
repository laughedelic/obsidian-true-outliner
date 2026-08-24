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
   quantum that is not the Tab size.
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
- No pixel measurement added. The layer keeps its measurement-free character; the one place a
  measurement exists today (Obsidian's hanging indent) is replaced by a stated value, not by
  one of ours.

**Non-Goals:**

- Rewriting a document's indentation to a canonical unit. This layer renders; it does not
  edit. A "normalize list indentation" command would be a structural-operations change.
- Making list rendering correct for files Obsidian itself does not quantise (two- and
  three-space indentation). See Risks.
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

A wide ordered marker genuinely can exceed the gutter (`10. ` measures 28px), so centring it
would push it left of the column its own text has to clear. That one, and only that one, still
starts on its column.

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

- **Two- and three-space indented files stay misaligned, and more visibly than before.**
  Obsidian resolves only a tab or exactly four spaces into an indent unit, so those files
  render their levels at literal whitespace widths — with the plugin disabled too. Once our
  guides sit on an even grid, bullets that do not is a visible mismatch rather than a merely
  uneven one. → Verify against a real two-space file and document it in the settings/readme
  surface; the durable fix is a normalize-indentation command, out of scope here.
- **Space-indented files depend on a setting the user owns.** With "Show indentation guides"
  off, the `.cm-indent` spans do not exist and four-space levels collapse to natural width.
  Tab-indented files are unaffected (`tab-size` is independent of it). → Detect and surface
  rather than silently render wrong; decide the surface during implementation.
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
  **Settled during implementation: documentation only** — a "Known limitations" section in the
  README. A notice would fire on a condition the user cannot act on from inside the note and
  that is Obsidian's behaviour rather than the plugin's; a status-bar hint would need a
  per-note scan for a case that a one-line README entry describes exactly. If real use shows
  people hitting it without knowing why, the cheaper next step is a normalize-indentation
  command, not a warning.
