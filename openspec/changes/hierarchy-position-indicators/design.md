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
- Three visual features (current marker, ancestor guides, bullet-threading), configurable, with
  the two ancestor-trail renderings mutually exclusive by construction.
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

A new `computePositionTrail(doc, cursorLine, style)` sits beside `decorate()` and
`computeLineGuides()`, returning per-line accent facts plus the current node's own line. It
takes the caret as a plain line number and returns plain data, so the entire "which levels are
accented on which lines, and where do the elbows go" logic is unit-testable in
`tests/decorate.test.ts` with no CM6 and no Obsidian — the same split that made the guide layer
cheap to get right.

*Alternative considered:* compute inside the ViewPlugin from `state.selection` directly. Rejected
for the same reason the guide walk lives in `decorate.ts` — the interesting logic (segment
extents, elbow placement, list-vs-non-list levels) is exactly the part worth testing without a
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
as `background: var(--to-thread) var(--to-guides)`. Rejected: composing two comma-separated
custom properties into one `background` needs the fragile empty-custom-property trick, and CM6
would be merging two sources into one declaration with no way to keep them from fighting.

Consequence: the accent computation happens inside `DecorationsPlugin`'s builder, which already
recomputes on **every** update (not only `docChanged` ones — see `decorationsExtension`'s own
comment), so selection-driven recomputation needs no new wiring.

### 4. Thread geometry is expressible in the same gradient technique — including elbows

The `thread` style differs from the `guides` style only in *which lines carry an accent at which
depth*, plus two extra layer shapes:

- **Vertical segment, depth `d`**: accented on lines from just below ancestor `d`'s own first
  line down to the first line of ancestor `d+1` (or of the current node, at the last level) —
  instead of the `guides` style's "every line in ancestor `d`'s subtree."
- **Half-height stub**: on an ancestor's *own* first line the guide for its own depth does not
  exist (a node never owns a guide on its own line), yet the thread must visibly start at that
  node's marker. A layer with `background-size: <unit> 50%` positioned at `bottom` draws the
  lower half of that row — the segment leaving the marker downward.
- **Elbow**: on the line where the next level starts, one additional horizontal
  `linear-gradient` layer spanning column `d` to column `d+1` at that row's vertical middle.

All of it is `background-position`/`background-size` arithmetic on constants this module already
computes; no pixel measurement, no overlay divs, no per-depth DOM.

### 5. List levels are accented on Obsidian's own DOM, not on our columns

Our gradient columns are `depth × unit`; a list's per-level columns are Obsidian's native metrics,
which we deliberately never touch and never measure. Drawing a thread through list nesting with
our own gradient would therefore land at the wrong columns — the exact mistake Experiment 2
already learned not to make.

Leading mechanism, to be confirmed in the experiment phase: **style the native `.cm-indent`
spans**. Obsidian emits one per list indentation level inside the line, and its `::before` is
where the native indent guide draws (`obsidian-outliner` disables exactly that selector when it
substitutes its own guides — see `docs/research/06`). Their widths *are* the native per-level
widths, so accenting the nth such span puts the accent on the native column with **no
measurement at all**. The bullet uses the same family of hooks (`.list-bullet::after`, the
element `obsidian-outliner` restyles rather than replaces).

Two things to establish before relying on it, and both are experiment tasks rather than
assumptions: whether `.cm-indent` spans are present regardless of Obsidian's "Show indentation
guides" setting, and whether accenting them survives the bundled themes plus a `max-width`-style
community theme.

*Fallback, if `.cm-indent` proves unreliable:* list levels contribute no trail segment; the trail
renders through non-list levels only and stops where the list begins. Degraded, documented, and
still correct — never a misaligned line.

### 6. The current marker is accented by class, on both mechanisms

A `Decoration.line` class on the current node's first line lets CSS color the marker widget
(`.to-decor-marker-icon`) that `MarkersPlugin` already put there; widget-replaced atoms get the
same class through the existing `MarginCompensation` DOM patch, the same declarative/imperative
split every other decoration here uses.

**Known hazard, list items specifically:** Live Preview reveals raw markup on the line the caret
is on, and `docs/research/13` established that a list marker's round bullet comes from a
`.list-bullet` span that exists **only in the hidden/rendered form** — revealing swaps it for
plain `"- "` text. So on the one line we most want to accent, the bullet element may not exist.
The fallback is to accent the revealed text instead (`.cm-formatting-list`), giving the same
accent color on whichever form is currently mounted.

### 7. Colors come from theme variables through one indirection

`--to-decor-accent`, defaulting to Obsidian's own `--text-accent`, plus a weight variable for the
thread's line width — mirroring `bullet_threading.css`'s own
`--ls-block-bullet-active-color` / `--ls-block-bullet-threading-width` pair and the
custom-property theming pattern doc 12 recommends copying from `obsidian-lapel`. Nothing is
hardcoded, and a snippet can retune the look without the plugin growing settings for it.

Note that the guide `::after` currently carries `opacity: 0.6` for the whole pseudo-element,
which would dampen the accent along with everything else; the accent color needs to carry its own
alpha rather than inherit that flat opacity.

### 8. Two settings, live-applied through the existing `forceRedraw` path

`highlightCurrentMarker: boolean` (default **on**) and `ancestorTrail: 'off' | 'guides' | 'thread'`
(default **`guides`**) join `PluginData`; existing installs pick up defaults through the
`{ ...DEFAULT_DATA, ...loadData() }` merge already in `onload`, so there is no migration step.
Setting changes reuse `setMarkerVisibility`'s pattern — persist, then `forceRedraw()` — because
the byte-identical-decoration-output problem that method exists for applies here too (a
table-only note can produce identical output across a setting change, and
`workspace.updateOptions()` was already measured to fail that case).

Both settings must be registered in **both** halves of the settings tab: `getSettingDefinitions()`
(Obsidian 1.13+) and the pre-1.13 `display()` fallback, which the existing code explicitly keeps
in sync.

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
- **Recomputation on every caret move** → the trail adds one ancestor-chain walk per update on top
  of work `DecorationsPlugin` already does every update, with `docFacts` still cached on the
  document `Text`. If it ever shows up, the memo is a single entry keyed on `(Text, line)` — but
  it is not worth adding speculatively, matching the reasoning already recorded for
  `selectedLineRootTargets`.
- **Two features ship on by default** → existing guide/marker e2e specs now run against a document
  that also has a caret and therefore a trail. Re-check them and pin the settings explicitly
  wherever an assertion would otherwise become ambiguous, rather than letting a default change
  silently weaken an existing regression net.
- **The pure-list byte-identical invariant** → accenting native list chrome means an outline-mode
  pure list is no longer pixel-identical to outline-mode-off while the caret is in it. The
  invariant is narrowed to what it was always protecting — the base layers' geometry — and the
  delta spec says so explicitly rather than leaving the two requirements in silent conflict.
- **Visual noise in deep trees** → the `guides` default accents an ancestor's *entire* guide, which
  in a long section is a long line. This is precisely what the `thread` style trades away, and why
  both are offered; the experiment phase compares them side by side in a real vault before either
  is codified.
- **Nested per-cell table editors** → they must stay decoration-free (an existing requirement, and
  an existing bug class); the new layer routes through the same `isNestedEditor` gate and gets an
  assertion of its own.

## Migration Plan

No data migration: two new `PluginData` keys land with defaults through the existing
`{ ...DEFAULT_DATA, ...(await this.loadData()) }` merge. Rollback is per-setting and immediate —
`ancestorTrail: 'off'` plus `highlightCurrentMarker: false` restores exactly today's rendering,
which is also the reason those two states are worth an explicit e2e assertion.

## Open Questions

- **Does the thread stop at the current node, or continue into its own subtree?** Working answer:
  it stops — the thread's purpose is the path from the root *to* the caret, and continuing past it
  would re-draw what the ordinary guide layer already shows. To confirm by eye in the experiment
  phase.
- **Should the current node's own children get any emphasis?** Out of scope here; if the experiment
  suggests it, it lands in the follow-ups parking lot.
- **Folded regions.** Fold persistence is a later roadmap layer; when it arrives, a trail passing
  through a folded ancestor needs a rule. Not this change.
- **Where the `guides` and `thread` styles disagree with the escalated-selection suppression rule**
  (decision 2) — the suppression is a judgment call made without a screenshot; the experiment phase
  should sanity-check that a covered selection really does read better with no trail.
