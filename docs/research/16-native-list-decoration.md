# Native list decoration: how Obsidian draws lists, and what we can own

Research and measurement pass for the parking lot's **"native list decoration experiments"**
entry ([12-decoration-follow-ups.md](12-decoration-follow-ups.md)), which asks whether list
rendering can be brought up to the level of the heading/paragraph/atom decoration layer —
one indentation step, one guide grid, consistent spacing, customizable markers.

An earlier attempt at cross-kind visual unification failed and was postmortemed
([06](06-outline-decorations-postmortem.md)); the experiment series that followed
deliberately left native list geometry untouched
([07](07-decoration-experiments-plan.md)–[11](11-decoration-lessons.md)). Two later probes
concluded that drawing along list columns needs a second, measurement-based rendering
mechanism ([14, finding 3](14-experiment-position-indicators.md)). **That conclusion was
right about the mechanism it examined and wrong about the problem**: it looked for a way to
*follow* native list columns, when the columns themselves are driven by public CSS variables
we can *set*.

Measurements below were taken against **Obsidian 1.13.4** in the e2e harness (bundled theme,
16px base font), by throwaway probe specs. Every number is a live measurement, not a
derivation. Where a value is quoted from Obsidian's own stylesheet it was confirmed against
the rendered result.

## Prior art

| Source | What it does about list geometry |
| --- | --- |
| **obsidian-outliner** (`BetterListsStyles`) | Does **not** touch indentation. A `margin-right` on `.cm-formatting-list-ul` plus a restyled `.list-bullet::after` square — cosmetics only. |
| **obsidian-outliner** (`VerticalLines`) | Draws list guides as absolutely-positioned `div`s in a scroller overlay, from per-item `coordsAtPos` measurement, recalculated on doc/viewport/geometry change. This is Experiment 2a's mechanism, and it is what doc 14 assumed we would have to adopt. It also hides the native guide (`.cm-hmd-list-indent .cm-indent::before { content: none }`) rather than coexisting with it. |
| **Minimal** (kepano) | Sets `--list-indent: 2em` (user-tunable via Style Settings), applies `tab-size: var(--list-indent)` to source lines, adds a `--list-edit-offset` margin on `.HyperMD-list-line`, and nudges `.cm-indent` guides with a `transform`. The most-installed Obsidian theme retargets list columns purely through variables. |
| **Community threading snippets** (KillyMXI's gist and its relatives) | Draw threading with pseudo-elements positioned in multiples of `var(--list-indent)`, and warn explicitly that only **tab** indentation aligns; space-indented files need a hand-tuned `--list-indent` per space count. |
| **obsidian-lapel** | Not list work, but the theming pattern we already borrow: `data-*` attributes plus custom-property indirection so snippets can restyle without plugin settings. |

The split is informative. Plugins reach for measured overlays; themes reach for variables.
The variable route is the one that leaves Obsidian's own layout arithmetic intact, and it is
the one nobody had checked against our tree model.

## How Obsidian renders list geometry in Live Preview

Four mechanisms, all confirmed live.

**1. The indent unit is a public variable.** `--list-indent` defaults to
`calc(var(--indent-unit) * var(--indent-size))` = `0.5625em × 4` = `2.25em` (36px at 16px).
`--indent-size` is the vault's own **Tab size** setting, written onto `document.body`.
`--list-indent` drives exactly two things: `tab-size` on `.cm-line.HyperMD-list-line`, and
`min-width` on `.cm-indent`. `--list-indent` and `--list-spacing` are documented Obsidian CSS
variables; the rest below are undocumented but present and byte-identical in 1.12.7 and 1.13.4.

**2. One `.cm-indent` span is emitted per tab or per exactly four spaces.** A view plugin
walks each line's leading `[\s>]+` run: `>` is skipped, a tab emits one `.cm-indent`, four
spaces emit one `.cm-indent`, and a shorter run of spaces emits a `.cm-indent-spacing` and
then advances one character at a time. The quantum is hardcoded at four and does **not**
follow the Tab size setting. The span for the caret's own list level additionally carries
`.cm-active-indent`, on that item's descendant lines.

**3. The whole span set exists only while "Show indentation guides" is on.** With the setting
off there are no `.cm-indent` spans at all, so `min-width` no longer applies and space-indented
levels collapse to the natural width of their whitespace. Tab-indented levels are unaffected
(`tab-size` is independent of the setting).

**4. The bullet hang is a live measurement written as an inline style.** A second view plugin
measures each line's rendered indent-plus-marker prefix and writes
`text-indent: -Npx; padding-inline-start: Npx` onto the line element, so wrapped rows align
under the item's content. It caches `N` per line keyed on the prefix text, and invalidates
only on text change or on a DOM mutation its `MutationObserver` sees — `childList`,
`characterData`, `subtree`, but **not attributes**.

## Measured geometry

Bullet columns, relative to `.cm-content`, three indentation styles, four levels, outline
mode off (identical with mode on for a pure list):

| Source indentation | Show indent guides | Level 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| tab | on | 12 | 48 | 84 | 120 |
| tab | off | 12 | 48 | 84 | 120 |
| 4 spaces | on | 12 | 48 | 84 | 120 |
| 4 spaces | **off** | 12 | 28.75 | 45.5 | 62.25 |
| 2 spaces | on | 12 | **20.38** | 48 | **56.38** |
| 2 spaces | off | 12 | 20.38 | 28.75 | 37.13 |

The step for a well-formed file is 36px — **1.5× our own `--to-decor-unit` of 1.5rem**. That
single number is most of why lists read as belonging to a different layout than the rest of
the outline. The 2-space rows are stock Obsidian behaviour, present with the plugin disabled.

Same-depth columns, a heading at depth 0 with children at depth 1 (outline mode on):

| Kind at depth 1 | Line box | Text starts | Marker centre |
| --- | --- | --- | --- |
| paragraph / heading | 0 (+44 padding) | 44 | 24 — on the depth column |
| code fence, quote (atoms) | 44 (margin) | 44 + own chrome | 24 — on the depth column |
| list item | 24 (margin) | 47.42 | bullet at 36, ~14 right of the column |

So at equal tree depth every non-list kind puts its text at the same column and its marker
centre on the guide column, while a list item puts its text 3.4px further right and its
bullet 14px right of the column. The native list guide sits at
`column + var(--indentation-guide-editing-indent)` = `column + 13.6px`, i.e. Obsidian threads
its guide through the bullet, where we thread ours through the marker.

## What we validated

Each row is a live measurement against a running Obsidian, not an argument.

| # | Change | Result |
| --- | --- | --- |
| E1 | `--list-indent: 24px` | Tab and 4-space lists step by exactly 24px at every level, ordered lists included. The native hang recomputes itself, so **soft-wrapped rows land on the item's content column with no work from us**. |
| E2 | Same, but 2-space source | Unchanged and still wrong — 2 spaces never form a `.cm-indent`. |
| E3 | `--indentation-guide-editing-indent` | Native list guides move onto the depth columns. **Corrected after a screenshot review**: a `0` offset leaves them ONE PIXEL right of ours, and the first probe missed it by measuring the pseudo-element's box origin rather than the border it paints — Obsidian draws its guide as `border-inline-end` on a 1px-wide box, so the visible line sits 1px past that origin, while our gradient paints its 1px at the column itself. Confirmed by counting pixel columns in the rendered screenshot: 752 / 800 / 850 / 898 device px, where an aligned grid is 752 / 800 / 848 / 896. `-1px` is the correct value, and with it the columns coincide. |
| E4 | Scope the variables to `.cm-line.to-decor-list` | Works: an outline-mode note's lists retarget, a non-outline note open at the same time is byte-identical to stock. The variables are consumed by the line and its descendants, so per-line scoping is enough. |
| E5 | `--list-padding-inline-start`, `--list-bullet-size`, `--list-bullet-radius`, `--list-marker-color` | All take effect, and the hang follows the marker-width change. Custom bullets are a variable-only job. |
| E6 | Caret round-trip across a retargeted line | Every character position maps back to itself through `coordsAtPos` → `posAtCoords`. |
| E7 | The same CSS with outline mode off | No effect at all — the gate holds. |

**Known residual, measured precisely.** Changing `--list-indent` through a decoration is an
*attribute* mutation, and Obsidian's hang cache watches `childList`/`characterData`/`subtree`
but not attributes — so the rendered columns move and the cached hang does not. Only
**soft-wrapping nested** list items are affected, and only their wrapped rows: a level-3 item
measured `padding-inline-start: 95px` (the pre-change value) against a content column of
119.4px, putting its wrapped rows one whole indent step to the right. Everything else —
bullets, first rows, guides, unwrapped items — is already correct.

What clears it, measured on the same line:

| Action | Hang re-measured? |
| --- | --- |
| `app.workspace.updateOptions()` | No |
| Reading-view round trip on the same leaf | No |
| Switch to another note and back | **Yes** |
| An outline-mode toggle off and on | **Yes** |
| Close and reopen the note | **Yes** |

A candidate in-plugin fix was built and confirmed to work: append an empty `display: none`
span to each visible list line and remove it again, which is exactly the `childList` mutation
the cache does watch, with the document byte-identical across the nudge. It was **backed out**
rather than shipped — this repo's own lint rule forbids DOM insertion into a plain `.cm-line`
after a confirmed 100%-CPU mutation-observer feedback loop, and "the removal happens
synchronously so the loop cannot start" is a judgement, not a measurement. Overriding that
rule needs its own CPU-profiled evaluation.

The better answer may be to not depend on the measurement at all: under `listBullet: 'column'`
the marker span is sized to the marker gutter, so the content column is
`depth × unit + gutter` — entirely from values the decoration already emits — and the hang
could be written by us with an `!important` rule instead of read from Obsidian's. That does
not generalize to native bullet geometry, where the marker width is a text measurement.

**Not validated:** a `Decoration.replace` widget standing in for the leading whitespace — the
one mechanism that could normalize indentation Obsidian does not quantize. The probe could
not construct one, because `@codemirror/view` is not reachable from page-level script; it
needs a temporary hook in the plugin itself.

## Three findings from the demo review

Recorded after the demo build was tried by hand and three of its claims were re-measured
against the right reference.

**The marker gutter breaks soft wrap, and owning the hang fixes it *and* the staleness.**
Under `listBullet: 'column'` the marker span is sized to the gutter with `min-width`, so the
item's text starts at `depth × unit + gutter` — but `coordsAtPos` at the end of the marker
returns the end of the marker's TEXT, not the end of its padded box, and that is the same
point Obsidian's hang measurement takes. Both agree, and both are 16px left of where the
content actually starts, so **every soft-wrapped list row sits 16px left of its own item's
text** — systematically, not only after a setting change. Measured:

| | `padding-inline-start` | item's text | wrapped rows |
| --- | --- | --- | --- |
| Obsidian's own measurement | 52px | 116.0 | 100.0 (**−16**) |
| Ours: `(depth − supp) × unit + gutter`, `!important` | 68px | 116.0 | 116.0 (exact) |

Writing the pair ourselves is exact in both the freshly-opened and the toggled-on case, and
because it is a `calc()` rather than a measurement it also **removes the stale-cache problem
entirely** — there is nothing left to go stale. An `!important` stylesheet rule beats
Obsidian's non-important inline style, the rule this codebase already relies on for
`to-decor-block`. It assumes the rendered indentation is exactly `(depth − supp) × unit`,
which holds wherever `--list-indent` holds and fails in the same two-space case everything
else does.

This also corrects an earlier reading in this document: the staleness was reported as the
only wrap-alignment defect. It was the smaller one.

**The trail reaches list levels by deleting two conditions.** `computePositionTrail` skips
list-item ancestors in both guide styles (`if (a.isListItem) continue` in `'full'`, and the
`.filter((a) => !a.isListItem)` that builds `'lineage'`'s rungs) — correct while list levels
had no column of ours to draw on, and the whole reason the guide highlight was missing inside
lists. With those removed, and the list levels on the grid, the accent renders on list
columns immediately; confirmed on screen with the caret in a four-level list. Three unit
tests assert the old behaviour by name and are the change's own regression net rather than an
obstacle: "runs the segment at the shallower non-list column, through the list levels",
"accents only the non-list ancestor in the guides style", "draws no segment anywhere in a
pure list, in either style".

**The bullet is lighter than every other marker.** Obsidian's default is
`--list-bullet-size: 0.3em` (4.8px at a 16px base) filled in `--list-marker-color`
(`--text-faint`); our block markers are 0.85rem (13.6px) SVG at `stroke-width: 1.5`, in the
same `--text-faint`. Same colour token, very different optical weight. Screenshotted at
0.30 / 0.38 / 0.45em and at `--text-muted`: **0.38em keeps the colour token shared with the
block markers and lands at about their ink weight**; 0.45em starts to read large against the
text, and `--text-muted` makes the bullet heavier than the markers it is supposed to match.

## Marker-vs-guide alignment: two systematic half-truths

Reported from the bullet-weight review ("a tad too high, and a bit left of centre against the
guides") and confirmed by measurement to be systematic rather than a demo artifact. Neither
is caused by the list work; both become visible through it, because a 4.8px round dot next to
a 1px line shows an offset a 13.6px outline glyph hides.

**Horizontal — every marker is half a pixel left of its own guide.** A marker's centre is
placed at exactly `depth × unit`: measured, a block icon's centre is `+0.01` off the column
and a bullet's `::after` spans `[col − 2.398, col + 2.398]`, dead centre. But the guide paints
its 1px as `var(--to-guide-color) 0 1px` starting AT the column, so the line occupies
`[col, col + 1]` and its own visual centre is `col + 0.5`. Half a CSS pixel — a whole device
pixel at 2x — and it applies to the block markers too, unnoticed until now. This is the
"two things that must move together" rule again: the column, the marker centre and the
gradient's own 1px all have to come from one definition. Either the gradient starts half a
pixel early or the markers centre half a pixel late; picking one is part of the change.

**Vertical — bullets and block markers do not share a rule.** Measured against each line's
own first text rect:

| Marker | Centre relative to the text rect's centre |
| --- | --- |
| List bullet | `+0.00` — exactly the geometric centre |
| Paragraph icon | `−5.20` — above it |
| H1 icon | `−8.45` — further above it |

So the bullet is the one that follows the text and the block icons are the outliers, which is
the opposite of what the report's wording suggested and worth stating plainly. The bullet
still reads slightly high on its own, because a text rect spans ascender to descender while
lowercase text's optical centre sits roughly 1.5px below that rect's geometric middle. Both
halves are the same missing decision — what vertical anchor a marker uses, and whether every
kind uses it — and it joins the existing "vertical-alignment polish" entry in
[12-decoration-follow-ups.md](12-decoration-follow-ups.md) rather than being separate from it.

## What the numbers did not say

Two things the measurements above scored as "aligned" and a screenshot review did not. Both
are recorded here because the pattern matters more than either defect: a column measured to
the right value can still be drawn one pixel off it, and two things on the same column are
not the same as two things in the same relationship.

- **The one-pixel guide offset** (E3 above), found by eye in a comparison screenshot and then
  confirmed by counting pixel columns in the image rather than by re-reading the DOM. The
  probe had measured the right quantity of the wrong element.
- **A guide on the column still does not come out of the bullet.** Putting list levels on the
  grid aligns the *columns*, but every other kind centres its MARKER on its column, while a
  native bullet sits a `--list-indent-editing` gap to the right of it. So the guide descending
  from an item runs beside its bullet rather than out of it, which reads as misalignment even
  though the columns are exact. Phase 3's marker work is not polish on top of phase 2 — it is
  what makes phase 2 look like what phase 2 measures. Confirmed both ways in the demo build:
  with `listBullet: 'column'` the bullets land on their guides and the two layouts finally
  read as one.

## The gap, restated

With the above in hand the remaining distance to parity is:

1. **Indent step.** Lists step 1.5× our unit. Closed by `--list-indent`.
2. **Guide grid.** List levels have no guide of ours and a native guide on a different
   column. Closed by `--indentation-guide-editing-indent`, or by owning the guide outright.
3. **Guides depend on a user setting.** With "Show indentation guides" off, list levels lose
   their guides *and* space-indented columns collapse. Nothing we do to the variables changes
   that; only owning the geometry does.
4. **Marker column.** A bullet sits ~14px right of its column where every other kind's marker
   is centred on it. Ordered numbers and task checkboxes each need their own answer.
5. **Marker style.** Bullets are not configurable today, while block markers are approaching
   it. Pure variables, once we decide the surface.
6. **Vertical rhythm.** `--list-spacing` gives list lines 1.2px of padding top and bottom;
   block lines get none.
7. **Non-quantized indentation.** 2- and 3-space files, and 4-space files with indent guides
   off, are misaligned in stock Obsidian and stay misaligned under every variable-only fix.
8. **Continuation lines.** A list item's continuation line is not a `HyperMD-list-line`, so it
   takes neither the list `tab-size` nor the list guide, and hangs left of its item's content
   ([12](12-decoration-follow-ups.md) records the stock offsets).

## The invariant this changes

`outline-decorations` states that a pure list renders byte-identical to outline-mode-off. Items
1 and 2 break it deliberately: a pure list in outline mode would step by our unit rather than
Obsidian's, and its guides would sit on our columns. This is the amendment the parking lot
already anticipated ("with that requirement amended deliberately rather than broken in
passing"), and it should be made explicitly, with the replacement stated: **outline mode off
stays byte-identical to stock; outline mode on renders one grid for every kind.**

Note that adopting Obsidian's own `--list-indent` as our unit instead — which would preserve
the invariant — is not available. `--list-indent` is `em`-based, so it resolves against the
font-size of whichever line uses it; a heading line would inflate it. That is exactly the
Experiment-1 bug the whole layer is `rem`-based to avoid. The unit has to travel in our
direction, not Obsidian's.

## The demo build

Phases 1–3 are wired behind two experimental settings so they can be judged by eye before any
of it is committed to. **Experimental: list indentation and guides** —
`native` (default, today) / `grid` / `own-guides` — and **Experimental: where a list bullet
sits** — `native` / `column`. Both are per-vault settings; both classes are emitted on
list-item lines only, so the outline-mode gate and the lists-only gate both come from the
decoration and the CSS carries no second condition. `test-vault/Notes/List decoration demo.md`
covers tab nesting, a blank line inside a list, ordered lists across the digit-width boundary,
tasks, the four kinds at one depth, a list attached to a paragraph, soft-wrapped items at two
levels, and the two-space limitation.

Switch to another note and back after changing either setting — see the residual above.

## Plan

Four phases, each independently shippable, each with a real-vault pass as its exit criterion
(ground rule #3, [07](07-decoration-experiments-plan.md)). Phases 1 and 2 are ordinary
implementation work — the mechanism is measured and the risk is low. Phases 3 and 4 are
genuine experiments and should be run as such.

### Phase 1 — one indent step

- Publish `--to-decor-unit` as a real declaration (today only a CSS fallback value exists), so
  `--list-indent` and every other consumer read one number. A real declaration is the
  prerequisite for the parking lot's "indentation unit should be configurable" item; exposing
  it as a SETTING is deliberately not part of this work (see the change's design, Non-Goals).
- On `.cm-line.to-decor-list`, set `--list-indent: var(--to-decor-unit)`.
- Amend `outline-decorations`' pure-list requirement as above.
- Verify: per-level step equals the unit for tab, 4-space, ordered, task and nested-under-heading
  fixtures; wrapped rows land on the content column; a non-outline note in a second pane is
  unchanged; both bundled themes plus Minimal (which sets `--list-indent` itself, and whose
  `--list-edit-offset` margin collides with our own `margin-left !important`).
- Decide what to do about the stale hang after a mode toggle. Candidates, cheapest first:
  accept and document (wrapped list items only, until the next edit); force the mutation
  Obsidian's observer watches; rebuild the view. Measure how visible it actually is before
  spending anything on it.

### Phase 2 — one guide grid

- Set `--indentation-guide-editing-indent: -1px` on our list lines so native list guides land
  on the depth columns, and drive `--indentation-guide-color` / `-color-active` from
  `--to-guide-color` / `--to-decor-accent` so they match ours. `-1px`, not `0`: Obsidian paints
  its guide as `border-inline-end` on a 1px-wide pseudo-element, so a zero offset lands one
  pixel right of the column (E3 above). An earlier revision of this plan said `0` and would
  have reintroduced exactly the misalignment the measurement found.
- Then decide the ownership question, which is the real content of this phase:
  - **Keep native.** Free, and `.cm-active-indent` gives the caret's own list level a
    highlight for nothing. But it disappears with the user's indent-guide setting, and it
    accents only one level where our trail accents the whole ancestor chain.
  - **Own it.** Set `--indentation-guide-width: 0` on our list lines and drop the
    list-item-ancestor exclusion in `computeLineGuides`, so our existing gradient draws every
    level. Guides then survive the setting, carry the trail and the accent layers for free,
    and the deferred "ancestor trail along native list columns" item
    ([12](12-decoration-follow-ups.md), [14](14-experiment-position-indicators.md)) closes
    with no second mechanism — which was its whole blocker.
  - The recommendation is **own it**, and to keep the native geometry (the `.cm-indent`
    spans) doing the layout while our gradient does the painting.
- Verify: guide columns identical across kinds at equal depth; trail continuity through list
  nesting; no doubling with the native guide at any setting value.

### Phase 3 — markers, bullets and rhythm (experiment)

Not optional polish: without it phase 2's guides sit on the right columns and still do not
come out of the bullets they belong to (see "What the numbers did not say"). Higher risk,
though — this is the native chrome the postmortem blames for most of the earlier failure, and
it has three shapes to satisfy at once. The demo build's `listBullet: 'column'` is a first
cut: it sizes the whole marker span to the marker gutter (so the text column is
font-independent by construction) and gives the bullet box zero width so its `::after` centres
on the column. Task lines are excluded — their checkbox lives in the same span and is wider
than the gutter — and ordered markers start on the column rather than centring on it.

- Bullet centred on its depth column, via `--list-padding-inline-start` and an explicit
  `.list-bullet` box, with `padding-inline-end` restoring the text column.
- An answer for ordered markers (variable width — `1.` vs `10.`) and for task checkboxes,
  which replace the bullet with a wider control.
- Bullet WEIGHT fixed at `0.38em`, colour token unchanged — a single value, not a setting.
  Bullet style is variable-driven (`--list-bullet-size`, `-radius`, `-border`, `-transform`,
  `--list-marker-color`), which is what makes a style SETTING cheap later; that setting belongs
  with the parking lot's "which icons to show, and their style" entry, so lists and blocks get
  one marker-appearance surface rather than two, and is deliberately outside this change (see
  the change's proposal, "No new settings").
- `--list-spacing` against block-line rhythm.
- Screenshot each step. The measurements say all of this is reachable; whether it *reads*
  better is the thing the experiment is for, and Experiment 5b's outcome is the precedent
  for changing the design once it is on screen.

### Phase 4 — indentation Obsidian does not quantize (experiment)

Only reached if phases 1–3 leave it worth solving. Three candidates:

- A per-line `--to-list-level` from `Decoration.line` plus an explicit width on
  `.cm-hmd-list-indent`. Geometry, caret round-trip and click mapping all measured correct;
  the open question is whether Obsidian's hang measurement sees our width on the first render
  (the probe applied the level after render, which is exactly the case that fails).
- A `Decoration.replace` widget standing in for the whitespace. Structurally the cleanest —
  Obsidian would measure our widget as ordinary content — and the only fully unvalidated
  mechanism here. Needs a spike in the plugin, not a page-level probe.
- A document-level "normalize list indentation" command. Not a decoration at all, but this
  project already rewrites list indentation on every structural operation, so a one-shot
  normalizer is consistent with the model and removes the problem at the source.

**Outcome: the first candidate, and it needed no new fact.** Reached not because phases 1–3
left it "worth solving" in the abstract but because a manual pass on the real vault reported
it: with the guides finally on an even grid, a two-space list's bullets sat ON them.

Measured on a two-space file at unit 24px — levels 1, 3 and 5 on their columns, levels 2 and 4
8.38px right of the level above. The DOM says why: Obsidian wraps ALL of a list line's leading
whitespace in one `.cm-hmd-list-indent` span and inside it emits `.cm-indent` per tab or per
exactly four spaces, leaving the remainder as a `.cm-indent-spacing` run of literal space
glyphs. Sizing the WRAPPER — not the spans, not a widget — to `(depth − supplementalDepth) ×
unit` states the answer for whatever is inside it.

The open question the plan raised does not arise: the hanging indent is no longer read from
Obsidian at all (Phase 1's stated `--to-list-hang`), so there is nothing that has to observe
this width on the first render. And the two custom properties the width is computed from are
the ones the hang already publishes, so no new fact reaches the DOM. The `Decoration.replace`
widget and the normalizer command are both unnecessary.

It also settles the last carried-forward finding below in the strongest way available: the
"Show indentation guides" setting stops moving geometry, because the wrapper is emitted either
way. Measured with it off, nothing is quantised at all — a FOUR-space level renders 7.25px
short of its column — and the same rule covers that too.

## Carried-forward findings

For [11-decoration-lessons.md](11-decoration-lessons.md) when this work lands:

- **Look for the variable before building the mechanism.** Two prior probes concluded that
  list columns could only be followed by measurement. They were measuring the right thing and
  asking the wrong question: the columns are computed from public CSS variables, so they can
  be *set* instead of followed. The cost of the wrong question was a deferred feature and a
  planned second rendering mechanism.
- **Override the variable that the rule using it reads, not an intermediate one.**
  `--list-padding-inline-start: var(--list-indent-editing)` is declared on
  `.markdown-source-view`; overriding `--list-indent-editing` further down the tree does
  nothing, because the substitution already happened above. Overriding
  `--list-padding-inline-start` itself works. `--list-indent` is consumed directly by
  `.cm-line`/`.cm-indent` and can be scoped as far down as our own per-line class.
- **Obsidian's list hanging-indent is a cached live measurement, and its cache does not watch
  attributes.** Anything that changes the rendered width of a list prefix through CSS alone
  leaves the hang stale until the line's text changes or the view is rebuilt. Changing the
  rendered width through a variable that is already in effect at first render is the way to
  avoid the problem rather than fight it.
- **`--list-indent` is `em`-based.** Any of our own values that flow into it must be `rem`, or
  the Experiment-1 font-size bug returns through a new door.
- **A user setting can move geometry.** "Show indentation guides" does not only paint: with it
  off, the `.cm-indent` spans do not exist, and space-indented list levels change width. Any
  reasoning about list columns has to name which side of that setting it holds on — or, better,
  reach for a box that exists on both sides of it, which `.cm-hmd-list-indent` turned out to be.
- **When the same fix serves a reported bug and an accepted residual, the residual was a
  mis-scoped bug.** Two- and three-space files, and space-indented files with indent guides
  off, were both written down as things to document rather than fix. One rule — state the
  wrapper's width — removed both, and it was found only because a manual pass reported the
  visible half of it. An accepted residual is worth re-costing whenever something adjacent
  moves.
- **A space's advance has no CSS unit.** `ch` is the digit's (9.6px where a space is 4.19px in
  the bundled font), and nothing else comes close. A layout that has to cancel exactly one
  space — a task item's text, which Obsidian leaves the space after `]` in front of — has to
  measure it. The same live-measurement pattern as the fold chevron's dead space applies:
  publish it on `view.dom`, outside CM6's observed subtree, and write only on a change.
- **A fallback tuned to the bundled font makes its own measurement untestable by position.**
  `--to-space-advance`'s `0.26em` fallback is within 0.03px of the real advance, so every
  rendered-position assertion passed with the measurement deleted — confirmed by deleting it.
  The assertion has to be on the published property agreeing with the thing it compensates.
