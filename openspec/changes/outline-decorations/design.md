## Context

Outline mode's editing model (structural commands + keyboard grammar) is complete and
correct, but it was invisible: list items already render Obsidian's native bullet, so they
happen to look right, while heading and (especially) paragraph nodes render exactly like
stock markdown. The first dev-vault verification round hit this directly — flat,
paragraph-heavy documents gave no visual signal that outline mode was even on, let alone
where node boundaries fell.

The design recorded here is not the one originally proposed. Three prior implementation
attempts failed in real vault use (cascade/`!important` fights, em/rem marker-size bugs,
native list hanging-indent corruption, fold-indicator collisions) — see
[docs/research/06-outline-decorations-postmortem.md](../../../docs/research/06-outline-decorations-postmortem.md).
A subsequent series of isolated, falsifiable experiments validated a different mechanism
per layer; this file records the architecture **as built and merged** (PRs #8, #10, #11),
not the original proposal. For the experiment-by-experiment rationale, the bugs found, and
the alternatives rejected along the way, see:

- [docs/research/07-decoration-experiments-plan.md](../../../docs/research/07-decoration-experiments-plan.md) —
  series hub, ground rules, fixture corpus, final results table
- [docs/research/08-experiment-1-additive-indentation.md](../../../docs/research/08-experiment-1-additive-indentation.md) —
  additive-only indentation (kept)
- [docs/research/09-experiment-2-guide-lines.md](../../../docs/research/09-experiment-2-guide-lines.md) —
  guide lines, overlay (2a) vs. CSS stacked-gradient (2b, chosen)
- [docs/research/10-experiment-5-block-markers.md](../../../docs/research/10-experiment-5-block-markers.md) —
  block markers, SVG/DOM (5a, chosen) vs. CSS shapes (5b), head-to-head verdict, and the
  hardening checklist `tasks.md` section 3 draws from
- [docs/research/11-decoration-lessons.md](../../../docs/research/11-decoration-lessons.md) —
  cross-experiment findings (CSS cascade/box model, CM6 coordinate systems, Obsidian
  internals) worth reading before touching this code again

The precedent this still follows is `src/plugin/grammar.ts` + `src/plugin/keymap.ts`: a
pure module (`decorate.ts`) that computes facts from `(OutlineDoc, position)` with no CM6
imports, and thin CM6 adapters (`decorations.ts`) that turn those facts into
decorations/DOM, gated by the same mode-source pattern already used for the keyboard
grammar and commands.

## Goals / Non-Goals

**Goals** (unchanged from the original proposal, all now met by the shipped design):
- Every node's tree depth is visible via an indentation guide, computed from its position
  in the parsed tree (not from raw markdown indentation/level), so heading subtrees, list
  nesting, and paragraph-adjacency children all read as one consistent hierarchy.
- Node kind is visible via a marker on nodes that have no adequate native leader of their
  own, without duplicating chrome nodes already have (list bullets).
- Decorations are strictly read-only: no document mutation, no cursor movement, no undo
  entries, ever.
- Same mode-gating guarantee as the rest of the plugin: off outline mode (or a file never
  toggled on), the editor is byte-for-byte stock Obsidian; toggling applies immediately, no
  reload.
- Mobile-safe (CM6 `Decoration`/CSS/DOM only, no Node/Electron APIs) and acceptable
  performance on typical single-note documents.

**Non-Goals** (unchanged, still deferred):
- Fold chevrons or any fold state/persistence as a *decoration feature* — the marker layer
  does reposition Obsidian's *existing* native fold chevron via a CSS transform to avoid
  colliding with it (see D5), but introduces no new fold state, affordance, or persistence
  of its own.
- Zoom/breadcrumbs, drag handles, node-selection highlight — all depend on layers not built
  yet (selection model, zoom).
- Interactivity on the decorations themselves (click-to-select, click-to-fold, hover
  affordances) — passive chrome, not a new input surface. (The marker mechanism's use of a
  real DOM widget makes this easier to add later than the original line-attribute design
  would have — see D2 — but nothing here adds it.)
- Configurable marker glyph/guide styling via a settings UI, beyond the one shipped
  `markerVisibility` axis (D5) — user CSS snippets remain the escape hatch for anything
  finer-grained.
- Reading (preview) view — untouched by construction; this plugin only registers CM6 editor
  extensions, never a `MarkdownPostProcessor`.

## Architecture: three layers, one shared pure module

`decorate.ts` (no CM6/Obsidian imports, unit-testable directly against `parse()` output)
computes two kinds of per-line fact from an `OutlineDoc`, both walking the tree in document
order:

- `decorate(doc): LineDecorationFact[]` — `{ lineNumber, depth, isFirstLine,
  hasNativeMarker, isAtom, isListItem, supplementalDepth, kind, hasChildren }` per line.
  `supplementalDepth` is the additive-indentation quantity (below); `kind`/`hasChildren`
  feed the marker layer.
- `computeLineGuides(doc): LineGuideFact[]` — `{ lineNumber, guideDepths, isGapLine }` per
  line, a strict superset of `decorate()`'s line coverage (it also covers blank
  `trailingGap` separator lines, which carry no `decorate()` fact at all).

`decorations.ts` turns these into three CM6 `ViewPlugin`s, all gated by a shared
`DecorationSource` (`ModeSource` + the current `markerVisibility` setting) and all checking
`isNestedEditor(view)` before computing anything (see "Nested-editor gating" below):

1. **`DecorationsPlugin`** — line decorations for indentation + guides (additive
   indentation, D3/D4 below; guides, D1).
2. **`MarkersPlugin`** — a *separate* `ViewPlugin` producing `Decoration.widget`s for the
   block-marker icon on plain lines (D5). Kept separate from (1) rather than merged into
   one `RangeSetBuilder`, specifically so CM6's own decoration-merging (multiple sources at
   the same position) does the work instead of this code having to reason about
   `Decoration.line`/`Decoration.widget` ordering itself.
3. **`MarginCompensation`** — a `ViewPlugin` that runs after render (`docViewUpdate`) and
   directly patches DOM for two things CM6 decorations cannot reach: widget-replaced atom
   elements (table/callout/html/hr — D2), and Obsidian's native "readable line width"
   base margin, which every `.cm-line` gets regardless of our own decorations and which our
   own `margin-left`/`padding-left` values must add to, not replace.

### Layer 1 — additive-only indentation

`padding-left` = `depth × unit` for block lines (heading/paragraph) and atom lines
(code/table/callout/quote/html/hr) — additive by construction, since there is no native
`padding-left`/`margin-left` on these kinds to conflict with. Atoms use `margin-left`
instead of `padding-left` for the same value: padding shifts an element's *content*, not
its own border/background box, which is invisible for plain text but wrong for an atom that
renders a visible box.

List items are handled differently and never have their native `text-indent`/`padding-left`
hang pair touched at all. Instead, `supplementalDepth` (the count of non-list-item
ancestors above the nearest list root) is applied as `margin-left` — a box-model property
native list rendering doesn't otherwise use — on top of native rendering. A list with no
non-list-item ancestors has `supplementalDepth` 0 everywhere in it, which makes it
byte-identical to outline-mode-off. This is a permanent regression invariant covered by
dedicated tests, not an incidental property (see spec.md).

Widget-replaced atoms (table/callout/html/hr — Obsidian renders these as opaque
`.cm-embed-block`/`.hr` replacement elements in Live Preview) get zero effect from any CM6
`Decoration.line` — confirmed live, not assumed. `MarginCompensation` patches their
`margin-left` directly via an inline `!important` style after each render, additionally
compensating for native padding it reads live via `getComputedStyle` (never hardcoded, so
it stays correct across themes) and clamped at zero so a depth-0 atom never goes negative.

Full history, the three real-vault bugs found and fixed, and the deferred (not fixed) list
hang-width cosmetic gap:
[docs/research/08-experiment-1-additive-indentation.md](../../../docs/research/08-experiment-1-additive-indentation.md).

### Layer 2 — indentation guides (CSS stacked-gradient)

One `--to-guides` CSS custom property per line — a comma-joined list of
`repeating-linear-gradient(...)` layers, one per active ancestor depth — consumed by a
single shared `::after` pseudo-element (the `@replit/codemirror-indentation-markers`
technique). O(1) DOM nodes per line regardless of depth; no pixel measurement.

A depth is "active" on a line when a strict, non-list-item ancestor at that depth owns a
guide. List-item ancestors never own a guide: Obsidian's native "Show indent guides"
already connects one bullet precisely to the next within a list, and a second, fixed-unit
mechanism running alongside it either doubles the line or reads as unevenly spaced against
native per-level width. A non-list ancestor bridging into a list still gets its own guide,
reaching all the way through the list's lines.

Margin-shifted lines (atoms, list items) widen their own `::after` box leftward by
`--to-own-shift` (exactly their own known `margin-left` contribution) to reach a shallower
ancestor's column — a `::before`/`::after` pseudo-element's box does not have to match its
containing block's dimensions, and nothing in the ancestor chain up to `.cm-scroller` clips
that overflow. Widget-replaced atoms need one additional override:
`contain: paint !important`, which Obsidian's own `app.css` sets on all four widget kinds
and which clips descendant painting independently of `overflow`. The override is scoped to
match Obsidian's own selector specificity (not `!important`-escalation, which has nowhere
further to go once both sides already use it). The table widget needed one more: its own
`overflow-x: auto` (for horizontal scroll of wide tables) lives on the *same* element the
`contain` override targets; moving `overflow-x: auto` onto Obsidian's own inner
`.table-wrapper` element decouples "let the guide bleed past this box's edge" from "keep
wide content scrolling," so both behaviors hold simultaneously.

Blank `trailingGap` lines also carry a guide fact (a leaf's own gap uses its own
`guideDepths`; a node-with-children's gap uses `childGuideDepths`, since that gap already
sits inside the node's own subtree) — guides render continuously through blank separator
lines, not just through node content.

Full history including the "guides can't reach past a shifted box" false claim and its
correction, the blockquote `::before` collision, the readable-line-width interaction, and
the table fix: [docs/research/09-experiment-2-guide-lines.md](../../../docs/research/09-experiment-2-guide-lines.md).

### Layer 3 — block markers (SVG icons, DOM mechanism)

A small, fixed-size (`rem`, never `em` — the historical marker-size bug class, `font-size`
resolving against the wrong line's context), self-drawn SVG icon per node kind, distinct
per kind (heading/paragraph/code/table/callout/quote/html/hr), built via DOM APIs
(`createElementNS`), never a data-URI. List items get no marker — the native bullet/number
already does that job (same exclusion guides use).

Two delivery mechanisms, split the same way indentation is:

- **Plain lines** (heading/paragraph/code/quote): a CM6 `Decoration.widget`
  (`side: -1`) inserted at the line's first character, kept in normal inline flow
  (`display: inline-block`, `vertical-align: baseline`) rather than absolutely positioned —
  this gets correct vertical alignment "for free" from the browser's own text layout,
  scaling naturally with heading font size, instead of needing a live-measured Y-position
  (the alternative CSS-shape design, 5b, needed exactly this and it was the more expensive
  path — see the head-to-head verdict in doc 10).
- **Widget-replaced atoms** (table/callout/html/hr): a real DOM child injected directly by
  `MarginCompensation`, the same escape hatch already used for their `margin-left` — CM6
  decorations have zero effect on these elements.

Both mechanisms place the icon horizontally centered on the shared guide-line column (not
flush with its left edge), so a guide passes through a marker's visual center exactly the
way a native nested list's connecting line passes through its own bullet — a geometry both
5a and 5b independently converged on. Placing every non-list line's marker requires
reserving a small `--to-marker-gutter` additively on top of the existing depth formula, even
at depth 0 — flat/top-level nodes have no other gutter to draw into. Never appending a
marker child into a plain `.cm-line` is a hard invariant, not a style choice: an earlier
version tried it (to get live-measured height for code fences) and pegged Obsidian's
renderer at 100%+ CPU, almost certainly CM6's own DOM-mutation observer reacting to the
unexpected child in a feedback loop; plain-line markers stay on the CM6-native
`Decoration.widget` path for this reason.

**Marker visibility.** `markerVisibility` (`'all'` / `'with-children'` /
`'headings-and-paragraphs'`) is a real, persisted, user-facing setting
(`mode-registry.ts`), not a temporary toggle — added after review found that a marker reads
well as a "crown on top of the guide line" for a branch node's kind, but adds little for a
leaf (most leaf atom kinds already carry their own native visual style: a code fence's
background, a callout's colored bar). `'with-children'` hides markers on any leaf, atoms
included, via a new `hasChildren` field on `LineDecorationFact`. `'headings-and-paragraphs'`
keys off kind, not per-instance state: those are the only two marker-eligible kinds that
can ever have children in this tree model. The gutter reservation stays unconditional
regardless of this setting — hiding a marker never reflows text; only whether the icon
itself is drawn changes.

Full history, including the fold-chevron collision fix, the three placement variants
explored, and the 5a-vs-5b comparison table:
[docs/research/10-experiment-5-block-markers.md](../../../docs/research/10-experiment-5-block-markers.md).

### Nested-editor gating

Obsidian renders an actively-edited table cell in Live Preview as its own separate,
independent CM6 `EditorView`, mounted inside the outer table widget's own DOM
(`.cm-embed-block.cm-table-widget` → … → a nested `.cm-editor`).
`registerEditorExtension` (`main.ts`) applies this whole extension to *every* CM6 instance
Obsidian creates app-wide, this nested one included — and its "document" is just the cell's
raw text, which `parse()`/`decorate()` classify as a plain paragraph, picking up markers and
depth-based indentation exactly like real top-level content, visibly corrupting the cell
being edited. `editorInfoField` (the mode-source gate used everywhere else in this plugin)
resolves to the exact same outer `MarkdownView` for both the nested and the real editor, so
state alone cannot distinguish them — only DOM ancestry can:
`view.dom.closest('.cm-embed-block') !== null`. This is why all three decoration mechanisms
are `ViewPlugin`s (which have `view`/DOM access) rather than plain `StateField`s (which do
not) — `isNestedEditor(view)` is checked by each before computing anything, returning
`Decoration.none` / doing nothing for a nested instance. Independently confirmed in the wild
(obsidian-lapel hits the identical leak in its own gutter markers, fixed there only as a CSS
hide rather than stopping computation). Full account:
[docs/research/10-experiment-5-block-markers.md](../../../docs/research/10-experiment-5-block-markers.md#follow-up-round-4-a-genuine-architectural-bug-found-via-a-flaky-test--decorations-leaking-into-obsidians-own-nested-per-cell-editors).

## Decisions

Renumbered from the original proposal's D1–D6 to reflect what actually shipped; the
original numbering and its "void" annotations are preserved in git history
(see the pre-experiment version of this file) rather than repeated here.

### D1. Guides are line-attribute decorations (CSS custom property + shared `::after`), not widgets
Confirmed as originally proposed for the *guide* layer specifically: `Decoration.line` sets
a `--to-guides` custom property, consumed by a single stylesheet `::after` rule — no widget,
no extra DOM node per guide. This part of the original D1/D2 pairing survived the
postmortem's void largely intact once combined with the `--to-own-shift`
box-widening technique (Layer 2 above) that the original design didn't have. Depth itself
(`--to-depth`) is likewise still a plain CSS custom property, consumed by a `calc()` rule —
the original per-depth-class alternative remains rejected for the reason the original
proposal gave (unbounded nesting depth).

### D2. The block marker is a real DOM element (`Decoration.widget` / direct DOM injection), not a line attribute
This reverses the original D2. The original design(rejected by the postmortem) drew the
marker as a `::before`/background rule, reasoning that a non-interactive marker didn't need
widget DOM-lifecycle cost. Experiment 5's head-to-head (5a icons via a real widget vs. 5b a
uniform dot painted on the same `::after` guides use) found the opposite: vertical
centering on "the first rendered visual row" is fundamentally a rendering fact no CSS-only
formula can derive, so the line-attribute variant (5b) ended up needing a genuinely new
live-pixel-measurement subsystem anyway to get it right, plus ongoing coordinate-coupling
bugs from sharing one pseudo-element's coordinate space with the guide gradient. The
DOM-element variant (5a) gets correct vertical alignment for free from the browser's own
inline-flow text layout, at full opacity (not sharing the guide's `0.6 opacity`), and stays
open to future interactivity if a later change ever wants it. Full comparison:
doc 10's "Head-to-head: comparison and verdict."

### D3. Depth is derived by walking the parsed tree, not from source indentation/level
Unchanged from the original proposal and confirmed as built: a node's depth is its distance
from the document root in the `OutlineDoc` tree, computed by walking `doc.children`
recursively in `decorate()`/`computeLineGuides()` — the same walk shape as `startLine` in
`grammar.ts`. This is what makes heading level, list indentation, and paragraph-adjacency
depth collapse into one visual language regardless of how many `#` characters or spaces are
in the source.

### D4. Full-document recompute on every relevant transaction, no incremental diffing
Confirmed as built, now across three `ViewPlugin`s rather than the originally-proposed
single `ViewPlugin`: `DecorationsPlugin`, `MarkersPlugin`, and `MarginCompensation` all
consume one shared `parse()`/`decorate()`/`computeLineGuides()` computation per document
(`docFacts()` in `decorations.ts`, cached by the CM6 `Text` instance in a `WeakMap` —
whichever plugin runs first pays the cost; the others, and every subsequent non-doc
update reusing the same `Text`, get the cached result). The hardening pass consolidated
this from three independent full reparses per update (the 2b baseline did two; Experiment
5 added a third). Same asymptotic budget already accepted for the keyboard grammar and
structural commands. Viewport-limited building (obsidian-lapel's shape: build only over
`view.viewport`, rebuild on `docChanged || viewportChanged`) remains a separately-deferred
option, not needed at current document sizes.

### D5. Marker scope: every non-list-item kind, gated by a persisted visibility setting
This revises the original D5 ("paragraphs only"). Real-content review during Experiment 5
found that per-kind icons read as legible and useful well beyond paragraphs — headings,
code, tables, callouts, quotes, html, and hr all get a distinct icon, gated only by
`markerVisibility` (`'all'` / `'with-children'` / `'headings-and-paragraphs'`, default
`'all'`), not by kind. List items remain permanently excluded (native bullet/number already
serves the purpose the original D5 was protecting). The original rationale — don't double
up on chrome that already reads clearly — is now served by the visibility setting rather
than a fixed kind restriction, since real usage showed the "which kinds need a marker"
question is closer to a matter of taste than a fact fixed at design time.

### D6. Gating reuses (and extends) the `ModeSource` contract
The decoration `ViewPlugin`s take a `DecorationSource` — `ModeSource` (`isOutline(path)`,
unchanged from the original proposal, same contract the keyboard grammar depends on) plus
`markerVisibility`, read fresh on every recompute so a live setting change takes effect on
the next transaction without a rebuild. When the file isn't in outline mode, or the view is
a nested per-cell editor (see "Nested-editor gating" above — a refinement the original
design didn't anticipate), every plugin's `decorations` field is the empty `DecorationSet`.

## Risks / Trade-offs

- **Accepted design costs — deliberate, not bugs** (restated here so they aren't
  rediscovered as regressions): every non-list line reserves a 1.25rem marker gutter, so
  text visibly shifts when toggling outline mode on or off; and two Experiment-1
  invariants were knowingly relaxed when the marker layer landed — depth-0 lines are no
  longer padding-free (they carry the gutter), and same-depth list items vs. atoms no
  longer share a column (list items reserve no gutter; atoms always do). The pure-list
  invariant (a list with no non-list ancestors renders byte-identical to
  outline-mode-off) still holds unconditionally and remains covered by dedicated tests.
- **Full-document reparse per doc change** (D4) — same accepted budget as before; the
  hardening pass consolidated the former 3x constant into one shared, per-document cached
  computation. Viewport-limited building stays deferred until document sizes demand it.
- **Two hardcoded fold-chevron measurement constants** in the marker-repositioning CSS
  (`decorations.ts`) are the one place this design violates its own "read native values
  live" rule — a theme or Obsidian update that resizes the chevron degrades layout
  cosmetically. 5b's session solved the equivalent problem with live measurement; porting
  that approach is a tracked hardening task.
- **CSS guide alignment across themes/fonts** — mitigated in practice (verified across
  bundled light/dark themes and one community theme), but RTL text, IME composition, and a
  wider community-theme sweep remain untested; tracked as hardening/polish.
- **Community CSS snippets/themes overriding our styling** — narrowly scoped `to-` prefixed
  class names, `!important` only where matching Obsidian's own specificity requires it, not
  as a first resort; documented as a known limitation rather than an unbounded specificity
  war.
- **Two documented invariants must survive future refactors**: (a) DOM injection into
  widget-atom subtrees relies on Obsidian never re-diffing those opaque subtrees internally
  — an undocumented-to-Obsidian invariant whose failure mode would be re-injection
  flicker/duplicated markers; (b) never append a child into a plain `.cm-line` — confirmed
  to peg the renderer via CM6's mutation-observer feedback loop. Both are called out
  explicitly here and in `tasks.md` so a future change doesn't rediscover them the hard way.
- **Visual redundancy if obsidian-outliner/obsidian-zoom are also enabled** — unchanged from
  the original proposal, already covered by the existing one-time coexistence warning
  Notice.

## Migration Plan

Unchanged from the original proposal: purely additive UI layer, no data model, no file
content, no plugin-data schema changes beyond the new `markerVisibility` field (which has a
default and degrades gracefully if absent from persisted data). Ships as a normal minor
change: build, unit tests (`tests/decorate.test.ts`), e2e DOM/screenshot coverage
(`e2e/specs/50-decorations.e2e.ts`, `51-guides-gradient.e2e.ts`,
`52-block-markers-icons.e2e.ts`), manual dev-vault visual pass. No rollback concerns beyond
disabling the plugin, which already restores stock rendering.

## Open Questions

*(All deferred decoration work — these open questions plus the gaps found after the
hardening pass — is consolidated in
[docs/research/12-decoration-follow-ups.md](../../../docs/research/12-decoration-follow-ups.md).)*

- **Shrinking only our own added list margin** — raised during Experiment 1's review, not
  yet decided. List items sit visibly further right than a same-depth sibling
  paragraph/blockquote, traced to Obsidian's own native list hang (`text-indent`/
  `padding-left`) pre-existing in vanilla Obsidian, not something this design introduces —
  but a narrower, still-additive-only fix (reduce only our own added margin by the list
  root's own native hang width, read live) stays open as a possible follow-up. Two risks
  noted but unresolved: clamping so a shallow `supplementalDepth` never goes negative, and
  compensating from the list *root*'s own hang, not each item's (nested items can have
  wider markers with different native hang widths). See doc 10's "Open question" section.
- **Marker/guide interactivity** (click-to-select, click-to-fold, per-heading-level markers)
  remains explicitly deferred, per the Non-Goals above. Doc 10's prior-art addendum
  (obsidian-lapel) records a concrete idea for how a future change might attach this to the
  real DOM widget the marker layer already has, without committing to it here.
