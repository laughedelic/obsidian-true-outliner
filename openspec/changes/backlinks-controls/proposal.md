## Why

`backlinks-footer` puts every reference to a note under it, in tree context. That is the right
default for a note with six references and the wrong one for a hub note with four hundred: the
note ends up buried under its own backlinks. Cost is not the reason — S5 measured placement at
about 2ms for 42 sources and 150 references, and named this change as the one that should size
its caps on legibility instead (`docs/research/19`). It is also indiscriminate — a reader who
wants only what the daily notes said, or only the places that pointed at a specific heading, has
no way to ask.

This change makes the footer answer to its reader: what to show, in what order, and how much
before it asks. It also settles the one place the plugin collides with Obsidian itself — the
core Backlinks plugin's own in-document section, which renders the same references with no
lineage directly below ours.

Design decisions are recorded in `docs/research/18-structured-backlinks.md` (D8, D10, D12,
D14, D15).

## What Changes

- **Filtering, on two axes with two visual shapes.** Round pills for source folders (a
  *where*), square icon chips for reference kinds (a *what*): Note, Anchor, Embed, Property.
  Both are **focus-on**: nothing selected means no filter, selecting one narrows to it. A reset
  clears filters and search together. The row stays behind a Filter toggle in the header, which
  carries a dot while any filter is active (D8, D14).
- **A search field beside them**, narrowing by source note name, in the same revealed row and
  cleared by the same reset. Name only, never reference content: the pills, the chips and this
  field are all answered from the summary layer without reading a file, which is what D8 means by
  "no search engine behind them".
- **Sorting** as a dropdown — recently modified (default), oldest, note name, most references
  (D15).
- **Volume caps**, one overall and one per note, both configurable with defaults, and each
  measured the way its own question is asked. The overall cap is a reference count applied before
  any source note is placed, so it bounds how many notes the footer reads at all. The per-note cap
  stays the group-height bound `backlinks-footer` shipped, because a row's rendered height depends
  on how its content wraps and a row count does not predict it. The header always reports the true
  total; the body says what it is not showing (D10).
- **An incompleteness cue that is spatial, not just numeric**: an ellipsis rung at the depth the
  missing nodes would occupy — counted by the overflow pass the group cap already runs — plus a
  fade dissolving the last card, so a truncated list is visibly running off rather than ending
  (D10).
- **Coexistence with core backlinks**: a setting, defaulting on, that hides Obsidian's own
  in-document backlinks section from our stylesheet. Turning it off restores both. There is no
  public API to read or change the core setting, so this is a deliberate one-way suppression
  the user can always reverse (D12).
- **A settings tab section** for the caps, the coexistence toggle, and the three appearance
  settings deferred here from `backlinks-footer` (D19): **segment icons** on a lineage row (every
  ancestor named, the default — or only the row's own marker, or none at all), **separator**
  between ancestors (none, the default — or a chevron), and **guide lines** in the footer body
  (off by default). Each is a rendering that change chose between and shipped one of; the model
  still reports `guideDepths`, and the renderer is the single site that declines to draw them.
  Colour and spacing are deliberately NOT settings: the chrome contract publishes the `--to-*`
  custom properties, so a CSS snippet already covers them without new surface to maintain.
- Not in this change: chronological mode (daily-notes filter with date-parsed sort), which is
  recorded as wanted and deferred (D15); and narrowing the footer to a zoomed node, which needs
  `outline-zoom` as well as this filter model (see Sequencing).

## Capabilities

### New Capabilities

- `backlink-filtering`: the filter and sort model — focus-on semantics, the two filter axes and
  the search term, what each admits, reset behaviour, sort orders, and how filtering interacts
  with the caps (whether a cap applies before or after a filter, and what the reported total
  means).

### Modified Capabilities

- `backlinks-footer`: gains the header control row, the truncated-list presentation (rung and
  fade), and the rule that the reported count is always the true total even when the body is
  capped. The footer's unfiltered, uncapped rendering from the prior change becomes the special
  case of no filter and a cap not reached.
- `plugin-shell`: gains settings for the two caps, the core-backlinks suppression and the three
  appearance settings, plus the stylesheet rule that suppression depends on.

## Impact

- **New**: filter/sort/cap module under `src/plugin/`; settings-tab section.
- **Modified**: the footer view from `backlinks-footer`; `styles.css` (the suppression rule and
  the fade mask); plugin data shape for the new settings.
- **Builds on** `backlinks-footer` — the index, the projection and the footer surface. See
  Sequencing.
- **Interop caution**: hiding another plugin's UI is impolite by default in the wrong
  direction. The setting exists so the choice is the user's; the default is argued in D12 and
  should be revisited if community-directory review objects.

## Sequencing

- **Builds on shipped code.** `backlinks-footer`, `backlink-index` and `tree-projection` landed
  in #64, and their spike series returned its verdicts (`docs/research/19`; every open question
  in `docs/research/18` now carries an answer). The surface this change adds controls to exists,
  so there is no gate left to wait on.
- **`outline-zoom` (#69) and this change are independent, in both directions.** Zoom leaves the
  footer unfiltered while zoomed and deliberately adds no zoom-shaped hook for a filter model to
  use; this change's axes are properties of the *referencing* side — a source note's folder, a
  reference's kind — and read nothing about the view's scope.
- **Their `backlinks-footer` deltas do not collide.** Zoom's delta adds one requirement — the
  footer survives an active zoom scope — while this change's modifies two others and adds a
  third. No requirement appears in both, so either can sync into the main spec first.
- **Three files both touch, mechanically.** `src/plugin/backlinks-footer.ts` — zoom re-anchors
  the footer widget to the end of the visible range while a zoom is active. That is settled by
  measurement (`docs/research/23`, zoom's D12): the alternative, shortening the hidden range, is
  impossible for any document ending in a newline, because such a document's empty final line
  starts at `doc.length`. So the widget's mount position becomes zoom-conditional in the same file
  this change rewrites the header and body render in. `src/plugin/footer-model.ts` — zoom lifts
  `stripBlockPrefix` out to a shared home (its D13) while this change grows the same file's model.
  And `styles.css`. Whichever lands second rebases; none of it is a design conflict.
- **e2e numbering is already disjoint**: the footer holds 70–76 in the `backlinks` group and this
  change continues there; zoom takes 80.
- **This one goes first if either does.** Zoom's task 1 gate has passed — the block-replace
  mechanism holds (`docs/research/23`) — but the same measurement struck its design's claim that
  confinement came mostly for free, so every confinement site there is real work and that change
  grew rather than shrank. This one has no comparable gate, and running it first means zoom
  rebases onto a settled footer rather than the reverse.
- **`paste-heading-section-reencoding` is unrelated** — it touches the re-encoding algebra, which
  a read-only footer never reads.
- **What belongs to neither change**: scoping the footer to a zoomed node — `docs/research/18`
  D13's "zoom carries the footer" — needs zoom's scope *and* this filter model, so it lands after
  whichever of the two is second. Neither change should build half of it.
