## Context

Outline mode's decoration layer today is a function of the **document alone**: `decorate()`
yields per-line depth/kind facts, `computeLineGuides()` yields per-line ancestor-guide depths,
and `decorations.ts` turns both into CM6 line decorations (a stacked CSS-gradient `::after`
for guides, a `Decoration.widget` icon for markers) plus a DOM-patch path for
widget-replaced atoms. One decoration source already depends on more than the document —
`SelectionDecorationPlugin`, which reads `state.selection` to draw escalated-selection
chrome — so "a decoration that recomputes on selection change" is an established shape here,
not a new one.

What is missing is any rendering of **where the caret is in the tree**. Prior art:

- **Logseq** — `pengx17/logseq-plugin-bullet-threading` is a thin wrapper that injects
  `logseq-dev-theme`'s `bullet_threading.css`. The whole effect is pure CSS built on
  `:focus-within`: `.ls-block:focus-within` and `.block-children:focus-within > .ls-block`
  select the ancestor chain, `::before` pseudo-elements draw the connecting verticals and
  curves, and `--ls-block-bullet-active-color` / `--ls-block-bullet-threading-width` control
  the accent color and line weight.
- **Obsidian community** — forum requests for the same effect produced Outline-pane CSS
  snippets (elbows via `--outline-guideline-*` variables) and a Live Preview snippet that only
  manages to *background-highlight* hovered ancestors; contributors there concluded a CSS-only
  guideline version in Live Preview "gets significantly hairier."

The reason the Logseq technique cannot be ported is structural, and it dictates this design:
**Logseq's DOM is genuinely nested** — a block element contains its children — so the ancestor
chain is literal DOM ancestry and `:focus-within` hands it to CSS for free. **CM6 renders a
flat sequence of sibling `.cm-line` elements** with no ancestry at all, and outline mode's
hierarchy is a *parsed* fact, not a DOM fact. The ancestor chain therefore has to be computed
from the tree and pushed onto individual lines as decorations. That is exactly the wall the
Obsidian forum snippets hit; it is also why this belongs in the plugin rather than in a
snippet.

## Goals / Non-Goals

**Goals:**

- Answer "where am I in the tree?" without scrolling — current-node emphasis plus an ancestor
  trail, computed from the parsed tree and the primary caret.
- Three visual features (current marker, ancestor guides, an ancestor route), configurable along
  two independent axes, with each axis's own renderings mutually exclusive by construction.
- Strictly decorative: no document mutation, no cursor movement, no history entries, and — the
  stronger property — **no geometry change at all**, so switching any of these settings can
  never reflow text (the same contract `markerVisibility` already holds).
- Work in pure lists, where an outliner spends most of its time and where our own guide layer
  deliberately draws nothing.
- Theme-restylable through CSS custom properties, so snippets can retune the accent without
  the plugin growing more settings.

**Non-Goals:**

- Interaction. Hover behavior, click-to-zoom, and click-to-fold stay in the
  `docs/research/12-decoration-follow-ups.md` parking lot — `MarkerWidget` is
  `pointer-events: none` today and guides are pseudo-elements with no hit area, both of which
  need their own careful pass against CM6 focus handling.
- Reading view. Outline mode is Live Preview only; this layer inherits that.
- Breadcrumbs, zoom, or any non-decorative "where am I" affordance.
- Changing indentation, the marker gutter, guide geometry, or native list metrics.
- RTL correctness beyond what the base layer already has (the standing RTL gap in doc 12 covers
  this layer too).

## Decisions

### 1. The cursor-derived facts are a pure function in `decorate.ts`

A new `computePositionTrail(doc, cursorLine, highlight)` sits beside `decorate()` and
`computeLineGuides()`, returning per-line accent facts plus the current node's own line. It
takes the caret as a plain line number and returns plain data, so the entire "which levels are
accented on which lines, and over how much of each row" logic is unit-testable in
`tests/decorate.test.ts` with no CM6 and no Obsidian — the same split that made the guide layer
cheap to get right.

*Alternative considered:* compute inside the ViewPlugin from `state.selection` directly. Rejected
for the same reason the guide walk lives in `decorate.ts` — the interesting logic (segment
extents, ancestor markers, list-vs-non-list levels) is exactly the part worth testing without a
browser.

### 2. "Current node" = the node containing the primary selection's head, suppressed under block-selection chrome

- The primary range's **head** line, resolved via the existing `nodeAtLine`. Head, not anchor,
  so the trail follows where the user is steering.
- **Only the primary range.** Multi-cursor draws one trail; N trails would be visual noise and
  would need a conflict rule for overlapping accents.
- **Suppressed entirely while `allRangesCovered(state)` is true** — when escalated block-selection
  chrome is on screen, it already answers "where am I," and stacking an accent trail on top of a
  filled rectangle competes for the same pixels. A plain non-covering selection (ordinary
  character drag) still gets the trail.
- **Not suppressed while typing.** The trail is a function of caret position, full stop; no
  debounce, no "settle" delay, no animation.

### 3. Accents ride in the existing `--to-guides` gradient list, not a new pseudo-element

The guide layer is a comma-separated list of `repeating-linear-gradient` layers on a single
`::after`, one per active ancestor depth. An accented level is emitted as **the same layer with
an accent color substituted** — never as an extra layer on top of the normal one, so there is no
double-draw and no ordering question.

This is forced by what is already on the box: `::before` is taken twice over (Obsidian's native
blockquote bar owns it natively, and selection chrome owns ours), and a plain `.cm-line` cannot
take an appended DOM child — an earlier attempt at that pegged the renderer at 100% CPU
(module doc comment in `decorations.ts`). `::after` with a longer background list is the only
place left, and it costs zero extra DOM nodes.

*Alternative considered:* a separate ViewPlugin emitting its own custom property, composed in CSS
as `background: var(--to-path) var(--to-guides)`. Rejected: composing two comma-separated
custom properties into one `background` needs the fragile empty-custom-property trick, and CM6
would be merging two sources into one declaration with no way to keep them from fighting.

Consequence: the accent computation happens inside `DecorationsPlugin`'s builder, which already
recomputes on **every** update (not only `docChanged` ones — see `decorationsExtension`'s own
comment), so selection-driven recomputation needs no new wiring.

### 4. `lineage` geometry is expressible in the same gradient technique — with no horizontal parts

The guide setting's `lineage` state differs from `full` in *which lines carry an accent at which
depth*, plus one extra layer shape; the marker setting's `lineage` state reuses the marker accent:

- **Vertical segment, depth `d`**: accented on lines from just after ancestor `d`'s own lines
  down to the first line of ancestor `d+1` (or of the current node, at the last level) — instead
  of `full`'s "every line in ancestor `d`'s subtree."
- **Arriving partial segment**: on the row where the next level starts, a layer positioned at
  `top` whose height stops at that row's own marker, so the segment visibly meets the thing it
  points at. Nothing is drawn on an ancestor's OWN rows at either end — a node's guide does not
  exist there (`computeLineGuides`), and its marker sits centred on that very column, so an
  accent there would draw over the icon rather than lead to it. An earlier version did exactly
  that with a bottom-anchored half-height stub on the ancestor's own row, meaning to make the
  path "leave" the marker; it struck through the icon instead and is gone.
- **Every ancestor's marker, accented** — the same mechanism decision 6 already builds for the
  current node, pointed at the ancestor chain. This is the marker axis's own `lineage` state, so
  it can be had with or without the guide segments, and it is what connects one segment to the
  next now that nothing horizontal is drawn.

The columns and extents are `background-position`/`background-size` arithmetic on constants this
module already computes — no overlay divs, no per-depth DOM. The one exception is where the
arriving segment STOPS: a marker's centre is `padding-top + iconSize / 2` down its row, and that
padding is Obsidian's, varying by kind with no way to read it into a `calc`. `MarginCompensation`
measures the glyph per arriving row and publishes `--to-accent-stop` (see docs/research/14,
findings 5 and 6).

**Reworked after the first real-note review.** The original built the Logseq shape literally: an
extra horizontal `linear-gradient` layer at each level change, spanning column `d` to `d+1` at the
row's vertical middle. Seen in a real note, it was wrong in a way the geometry made inevitable — a
marker is centered ON its own guide column (decision 6's placement, and Experiment 5a's before
it), so an elbow arriving at level `d+1` ran straight through the very icon it was reaching for,
and the segment ends picked up visible offsets against it.

Accenting the ancestor's marker instead makes the marker itself the junction. The rendering reads
as one route with nothing horizontal drawn, it reuses two mechanisms that already work rather than
adding a third that fights them, and — the part that turned out to matter most — it is the only
part of the style that survives inside a list, where no segment can be drawn at all (decision 5).
The state is named `lineage` rather than `thread` because it is no longer the threading shape.

### 5. List levels are accented on Obsidian's own DOM, not on our columns

Our gradient columns are `depth × unit`; a list's per-level columns are Obsidian's native metrics,
which we deliberately never touch and never measure. Drawing a SEGMENT through list nesting with
our own gradient would therefore land at the wrong columns — the exact mistake Experiment 2
already learned not to make.

A list ancestor's own MARKER is a different matter, and is accented like any other's: a bullet is
a real element already sitting at the real native column, so it needs none of the geometry we
cannot address. That is what lets `path` say something inside a deep list — the levels read as a
run of accented bullets even though nothing can be drawn between them.

Mechanism explored and REJECTED by the experiment phase: **style the native `.cm-indent`
spans**. Obsidian emits one per list indentation level inside the line, and its `::before` is
where the native indent guide draws (`obsidian-outliner` disables exactly that selector when it
substitutes its own guides — see `docs/research/06`). Their widths *are* the native per-level
widths, so accenting the nth such span puts the accent on the native column with **no
measurement at all**. The bullet uses the same family of hooks (`.list-bullet::after`, the
element `obsidian-outliner` restyles rather than replaces).

Measuring it killed it (docs/research/14, finding 3): `.cm-indent` spans do NOT correspond to list
levels — 2-space indentation emits none at all for a genuine level — and the columns track the
rendered width of whatever whitespace the file contains, so there is no constant per-level step to
measure either. Both cheap approaches are out.

**Shipped instead:** list levels contribute no trail segment; segments render through non-list
levels only. Degraded, documented, and never a misaligned line. Their MARKERS are accented (the
marker axis's `lineage` state, decision 4), so the levels stay legible — the gap is only the
connecting lines. Closing it properly means a second rendering mechanism (per-item measurement
plus overlays, Experiment 2a's technique), which is a parking-lot item, not a follow-up here.

### 6. Markers are accented by class, on both mechanisms

A `Decoration.line` class on a node's first line lets CSS color the marker widget
(`.to-decor-marker-icon`) that `MarkersPlugin` already put there; widget-replaced atoms get the
same class through the existing `MarginCompensation` DOM patch, the same declarative/imperative
split every other decoration here uses. (A widget atom is a leaf by construction, so it can only
ever be the CURRENT node, never an ancestor.)

Four classes, not one: current vs. ancestor, each split again by our own icon vs. Obsidian's
native list bullet, since those are entirely different DOM reached by entirely different
selectors. Current and ancestor share the accent in styles.css today and are kept apart anyway,
so the DOM says which role a marker is playing — a snippet can dim ancestors without a new
setting, and an assertion can name one without matching the other.

Both roles answer to `markerHighlight`: `'current'` accents the caret's own node, `'lineage'` adds
every ancestor. A node is never both roles, so the two can never collide on one line. That the
marker axis is separate from the guide axis is what makes markers-only reachable — the rendering
a plain list depends on (decision 5).

**The list-item hazard this decision expected did not materialise.** `docs/research/13` had
established that a list marker's round bullet comes from a `.list-bullet` span present **only in
the hidden/rendered form**, which suggested the one line we most want to accent might have no
bullet element at all. Measured (docs/research/14, finding 1): a plain caret does NOT trigger
that swap — `.list-bullet` survives on the caret's own line, and the raw-text form belongs to the
block-selection reveal path, which is a state where indicators are suppressed anyway (decision
2). So the accent targets `.list-bullet::after` directly and no revealed-text fallback is
implemented. The spec's "whichever form is currently mounted" wording stays deliberately
permissive, so a future Obsidian that reveals more aggressively would not contradict it.

An ordered item is a different element again — `.list-number`, literal text taking `color`,
where a bullet's dot is a `::after` background (finding 4). Both are targeted.

### 7. Colors come from theme variables through one indirection

`--to-decor-accent`, defaulting to Obsidian's own `--text-accent`, plus a weight variable for the
accent's line width — set to the same `1px` an unaccented guide uses, so an accent is purely a
change of colour and the column neither thickens nor shifts as the caret moves into a subtree — mirroring `bullet_threading.css`'s own
`--ls-block-bullet-active-color` / `--ls-block-bullet-threading-width` pair and the
custom-property theming pattern doc 12 recommends copying from `obsidian-lapel`. Nothing is
hardcoded, and a snippet can retune the look without the plugin growing settings for it.

Note that the guide `::after` currently carries `opacity: 0.6` for the whole pseudo-element,
which would dampen the accent along with everything else; the accent color needs to carry its own
alpha rather than inherit that flat opacity.

### 8. Two independent three-state settings, live-applied through the existing `forceRedraw` path

`guideHighlight: 'off' | 'full' | 'lineage'` (default **`full`**) and
`markerHighlight: 'off' | 'current' | 'lineage'` (default **`current`**) join `PluginData`; existing installs pick up defaults through the
`{ ...DEFAULT_DATA, ...loadData() }` merge already in `onload`, so there is no migration step.
Setting changes reuse `setMarkerVisibility`'s pattern — persist, then `forceRedraw()` — because
the byte-identical-decoration-output problem that method exists for applies here too (a
table-only note can produce identical output across a setting change, and
`workspace.updateOptions()` was already measured to fail that case).

Both settings must be registered in **both** halves of the settings tab: `getSettingDefinitions()`
(Obsidian 1.13+) and the pre-1.13 `display()` fallback, which the existing code explicitly keeps
in sync.

**Two axes rather than one combined setting.** The first shape bundled them: a boolean for the
current marker plus one three-state trail where `path` implied "lineage guides AND lineage
markers". That made the most useful rendering unreachable — `markers: 'lineage'` with
`guides: 'off'` is the only thing that says anything inside a plain list, where there is no guide
column to accent at all (decision 5), and the bundled enum had no state for it. Splitting them
also stops "how did I get here" (guides) and "where am I" (markers) from having to agree, which
they do not: a user can want the whole ancestor context in guides while marking only the caret's
own node. Each axis stays a three-state enum rather than two booleans so its own two renderings
remain mutually exclusive by construction.

No migration: the old keys are simply absent from `PluginData`, so an install that has them on
disk picks up the new defaults through the same merge. The plugin is pre-release and its one user
is the person changing these settings, so a translation layer would be permanent code paying for a
one-time inconvenience.

### 9. Geometry is untouchable

Accents only ever set colors and background layers. They never touch `--to-marker-gutter`,
`padding-left`, `margin-left`, `--to-depth`, or the marker icon's size or position. This makes
"toggling a position-indicator setting never reflows text" true by construction rather than by
test, and it keeps every existing indentation and marker-placement invariant out of this
change's blast radius.

## Risks / Trade-offs

- **Depending on DOM we do not own (`.cm-indent`, `.list-bullet`) is theme-fragile** → confirm
  presence and behavior live before building on it (decision 5); degrade to "no accent on list
  levels" rather than to a misaligned line; sweep the bundled themes plus Minimal and Catppuccin,
  the same probe shape doc 12 records; no `!important` escalation — the project already carries a
  case study of a plugin drowning in ~890 of them.
- **Live Preview markup reveal changes the current line's own DOM** (decision 6) → the one line
  the marker accent targets is the least stable line in the document. Handle both mounted forms;
  cover both in e2e (caret on the line, caret elsewhere).
- **Recomputation on every caret move** → the trail adds one ancestor-chain walk per update, on
  top of work `DecorationsPlugin` already does every update, with `docFacts` still cached on the
  document `Text`. This was left uncached at first as not worth adding speculatively — then
  review pointed out the walk runs TWICE per render, once for the declarative decorations and
  once for the widget DOM patch, since both read the same `view.state`. Measured before acting:
  2.5µs at 110 lines, 16µs at 1.1k, 66µs at 5.2k — small against a 16.7ms frame, but the same
  "same asymptotics, doubled constant" that `docFacts` was consolidated for, and one WeakMap
  stops paying it. Keyed on the `EditorState` itself: a CM6 state is immutable, so one identity
  fixes document and selection together, with no compound key to get wrong and no
  `allRangesCovered` recomputation just to build it.
- **Two features ship on by default** → existing guide/marker e2e specs now run against a document
  that also has a caret and therefore a trail. Re-check them and pin the settings explicitly
  wherever an assertion would otherwise become ambiguous, rather than letting a default change
  silently weaken an existing regression net.
- **The pure-list byte-identical invariant** → accenting native list chrome means an outline-mode
  pure list is no longer pixel-identical to outline-mode-off while the caret is in it. The
  invariant is narrowed to what it was always protecting — the base layers' geometry — and the
  delta spec says so explicitly rather than leaving the two requirements in silent conflict.
- **Visual noise in deep trees** → the `guides` default accents an ancestor's *entire* guide, which
  in a long section is a long line. This is precisely what `lineage` trades away, and why
  both are offered; the experiment phase compares them side by side in a real vault before either
  is codified.
- **Nested per-cell table editors** → they must stay decoration-free (an existing requirement, and
  an existing bug class); the new layer routes through the same `isNestedEditor` gate and gets an
  assertion of its own.

## Migration Plan

No data migration: two new `PluginData` keys land with defaults through the existing
`{ ...DEFAULT_DATA, ...(await this.loadData()) }` merge. Rollback is per-setting and immediate —
setting both axes to `'off'` restores exactly today's rendering,
which is also the reason those two states are worth an explicit e2e assertion.

## Open Questions

Resolved during implementation — kept here with their answers, since the reasoning is what a
later reader needs:

- **Does the route stop at the current node, or continue into its own subtree?** ✅ It stops.
  Confirmed by eye: continuing past the caret re-draws what the plain guide layer already shows,
  and costs the style the one thing that makes it readable — that every accented pixel is on
  the path.
- **Do the elbows work?** ❌ No, and they are gone — see decision 4. The first real-note review
  is what settled it; the shape that replaced them is simpler and reaches further.
- **Do the two DOM bets hold?** ✅ Both settled by live probe before anything was built on them
  (`docs/research/14`). The list bullet survives the caret sitting on its own line, so the
  marker accent needs no dual-form handling. `.cm-indent` spans exist per level and are
  paintable, but their native guide column is 24px off the parent bullet's — which is why list
  levels ship as the spec's permitted omission rather than a misaligned segment.
- **Does the suppression rule read right?** ✅ Kept. A covered selection already fills the
  rectangle that answers "where am I"; an accent trail on top competes with it for the same
  pixels.

Still open, deliberately:

- **Should the current node's own children get any emphasis?** Out of scope here.
- **Folded regions.** Fold persistence is a later roadmap layer; when it arrives, a trail passing
  through a folded ancestor needs a rule. Not this change.
- **Drawing segments along native list columns.** The one piece of the proposal not built (the
  ancestor markers there ARE accented — only the lines between them are missing). What it needs
  is written up in
  [docs/research/14](../../../docs/research/14-experiment-position-indicators.md#deferred-drawing-segments-along-native-list-columns)
  with the measurements already taken.
