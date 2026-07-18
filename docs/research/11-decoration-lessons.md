# Decoration lessons: cross-experiment findings

The accumulated non-obvious findings from the whole decoration-experiments series
(Experiments [1](08-experiment-1-additive-indentation.md),
[2a/2b](09-experiment-2-guide-lines.md), and [5a/5b](10-experiment-5-block-markers.md)) —
carried forward the same way the original postmortem's own "carried-forward technical
findings" section was meant to be used
([06-outline-decorations-postmortem.md](06-outline-decorations-postmortem.md), which
remains its own separate reference for the pre-experiment failure). **Read this before
building anything that touches decorations, CM6 extensions, or Obsidian's native
rendering** — every entry below is a mistake that was actually made (often shipped) at
least once in this project, or a hard-won capability that a plausible mental model says
shouldn't exist.

Each entry keeps its full original wording from the experiment that produced it; they are
grouped by theme here, not by chronology. The per-experiment docs record *which* bug each
finding came from.

## CSS: cascade, box model, and painting

- **Matching beats escalating.** When Obsidian's own CSS wins a specificity fight even
  against `!important`, the fix is matching its ancestor-chain specificity, not adding more
  `!important` (there's nowhere further to escalate past equal importance — the tie-break is
  specificity, then source order).
- **An inline style with `!important`, set via JS, always wins over any stylesheet rule**
  regardless of that rule's own specificity — a reliable escape hatch specifically for
  native-widget cascade fights that a CSS-only rule can't win.
- **Padding's visibility depends on where the background lives.** Padding never moves an
  element's own box (carried forward from the original postmortem), but whether that's
  visually invisible or visually offsetting depends on whether the element's own background
  fills the padded box (invisible, as for callout) or the visible content is nested one level
  further in without its own covering background (offsetting, as for a `<table>` inside a
  padded wrapper).
- **A `::before` pseudo-element's own box does NOT have to match its containing block's
  dimensions — `left`/`right` can widen it arbitrarily, including leftward past where a
  `margin`-shifted line's own box starts.** A first pass on 2b wrongly concluded the opposite
  ("a per-line background can only ever paint within that line's own box, full stop") and
  shipped it as a "confirmed structural limitation" — this was corrected only after the user
  explicitly refused to accept that framing and asked for verification, not because the
  original box-model reasoning was re-examined unprompted. The actual fix: widen the pseudo by
  exactly the line's own known `margin-left` value (`--to-own-shift`), which brings its box's
  *left edge* back to the global column a shallower ancestor needs, and CSS raises no
  objection to a positioned descendant's box extending outside its containing block's own
  edges (only `overflow`/`contain` on an ancestor can clip that, and by default they don't).
  Confirmed live via a bisection test (a probe `::before` visible at `left: 0`, progressively
  clipped as `left` went more negative) that this is real, not a fluke. Generalizes beyond
  guide lines: any future per-line decoration that needs to reach a coordinate outside its own
  (possibly `margin`-shifted) line box can use the same widened-box technique instead of
  assuming it needs a measured overlay.
- **`contain: paint` (or `contain: strict`/`content`, which includes it) silently clips
  descendant painting to an element's own box regardless of `overflow` — a distinct mechanism
  from the `overflow` property, easy to miss when auditing "what could be clipping this."**
  Obsidian's own `app.css` sets it (`!important`, on a `.cm-content > [contenteditable="false"]`
  selector) on all four widget-replaced atom kinds (table/callout/hr/html), likely a rendering/
  virtualization isolation hint. It was found only by checking `getComputedStyle(...).contain`
  directly on the clipped element itself — `overflow` alone reported `visible` the whole time,
  which is what made the clipping look inexplicable at first. Overriding it needs the same
  "match Obsidian's own specificity, don't just add `!important`" fix Experiment 1 already
  established for `margin`/`padding` — a *different* property, same lesson, confirmed by
  checking which stylesheet rule actually won via `document.styleSheets` inspection rather than
  guessing from the rendered result.
- **Overriding a native CSS property should be checked for a legitimate reason before assuming
  it's safe to fight — but "it has a legitimate reason" isn't automatically "so leave it
  alone," it can also mean "so find where else that reason's actual mechanism lives."**
  Table's `overflow-x: auto` (for horizontal scroll on genuinely wide tables) sits on the same
  element a guide's `contain`/`overflow` overrides target, and naively forcing
  `overflow: visible` there does trade away that real, functional native behavior for a
  cosmetic guide line — confirmed live, not just theorized (a 15-column table lost its
  scrollbar entirely, `scrollLeft` became inert, and the *whole document* became horizontally
  scrollable instead of just the table). The productive next question wasn't "so don't do
  this," it was "why does this one property change break something else, and can that
  something else live on a different element?" It can: Obsidian's table widget already wraps
  the actual `<table>` in its own inner `.table-wrapper` div, distinct from the outer element
  carrying the `contain`/`overflow` fight. Moving `overflow-x: auto` onto that inner wrapper
  instead of the outer decouples "let our pseudo-element bleed past this box's edge" from "clip
  the actual wide content that needs to scroll" — two different concerns that don't have to
  live on the same box just because they happened to start out on the same native element.
  Generalizes: when overriding a native property seems to force a real trade-off, check whether
  the *conflicting* responsibility can be relocated to a different element in the existing DOM
  before accepting the trade-off as permanent.
- **`background-position`'s `%` component already resolves relative to (box size − image
  size) — it does NOT need a manual `- HALF`-style correction to "center" something.**
  `background-position: 50% 50%` alone centers an image; subtracting half the image's own
  size on top of that shifts it further than intended. This is an easy mistake to make by
  analogy with *length*-based positioning (where a literal offset does need that
  correction, since a length value places the image's top-left corner directly, with no
  automatic size-aware adjustment) — the two positioning modes have different semantics and
  don't compose the way intuition suggests. Caught only because the user reported a marker
  sitting suspiciously close to a line's top edge on real content; a synthetic single-line
  fixture at the exact right size could easily have looked "close enough" to pass a casual
  screenshot glance.
- **When a box's own position is widened to reach a coordinate outside itself (2b's own
  `--to-own-shift` technique above), EVERY layer painted on that box — and the widening
  amount itself — must be driven from ONE shared value, computed ONCE.** This is the single
  most-repeated bug shape across Experiment 5b, showing up in three structurally different
  guises: (1) a marker's own position went unwidened while its box wasn't, so it clipped
  entirely at shallow depths; (2) after guides were changed to align with a marker's
  *center* rather than the raw depth column, the marker's own position formula kept using
  its OWN (narrower) shortfall while the box widened by the marker-vs-guide COMBINED one,
  drifting the marker off its intended column at any depth where the two values diverge;
  (3) after folding in the native fold-chevron's reach, a live-override code path set
  `--to-own-shift` to the combined `extra` alone, silently dropping the OTHER term
  (`ownShiftUnits * unit`) that margin-shifted lines also need there. All three are the
  *same* mistake at heart — two call sites that are supposed to derive from one number
  quietly grew independent, slightly different formulas — and all three were fixed the
  same way: consolidate into one function (`computeMarkerAndGuideBg`) that every caller,
  static and live, goes through, so there is structurally only one place left to get it
  wrong. Worth treating as a standing design rule for any future decoration needing
  box-widening, not a lesson specific to markers or guides: **when two things must move
  together, make it impossible to change one without the other, don't just remember to.**
- **A per-line "extra reach" constant is the wrong shape once a chrome adjustment applies to
  only SOME of the ancestors bridging that line, not all of them uniformly.** The fold-gap
  fix initially treated "does this line need extra reach for a fold chevron" as one
  per-line yes/no fact — true for a single node's own marker, but WRONG for guides, where
  one line can simultaneously bridge a heading-owned ancestor (needs the reach) and a
  paragraph-owned one (doesn't — paragraphs never fold in Obsidian's UI, even though this
  project's own tree lets them own children). The fix needed to track the adjustment
  PER ACTIVE ANCESTOR DEPTH, not per line — `computeLineGuides` grew a `headingGuideDepths`
  field (the subset of `guideDepths` whose owner is foldable) precisely so a downstream
  per-depth decision could be made correctly. A useful general question when a new
  chrome-clearing adjustment is added to an EXISTING per-line-aggregate mechanism (any
  future guide/marker refinement included): "does this adjustment apply uniformly to every
  contributor to this aggregate, or only some of them?" — if only some, the aggregate needs
  to carry per-contributor detail, not just a combined total.

## CodeMirror 6: decorations, widgets, and coordinate systems

- **CM6 `Decoration.line` has zero effect on Obsidian's "embed-block" replacement widgets**
  (tables, callouts, raw HTML, and horizontal rules) — not a partial win, not a class-merge;
  confirmed live that both class and inline style come back completely empty. Any atom kind
  Obsidian renders this way needs direct DOM patching via a `ViewPlugin`'s `docViewUpdate`
  hook, not a CM6 decoration. Code fences and plain blockquotes are *not* in this category —
  they render as genuinely plain `.cm-line`s and decorate normally.
- **A single broad selector plus a fact lookup by document line number is enough** to handle
  all four widget-replaced kinds uniformly (`.cm-embed-block, .cm-line.hr` → `posAtDOM` →
  `decorate()` facts by line) — no need for kind-specific branches.
- **CM6's coordinate systems are not interchangeable, and mixing them silently compiles.**
  `coordsAtPos()` is viewport-relative (like `getBoundingClientRect`); `lineBlockAt()`'s
  `top`/`bottom` are relative to `view.documentTop` instead — a *different* origin, even
  though both "sound" document-relative. Converting only one axis (x, via a `getBase()`-
  style subtraction) and not the other (y, left as the raw `lineBlockAt` value) type-checks
  fine and looks plausible in code review; it produced a ~76px vertical offset only caught
  by an e2e rect assertion against independently-measured `.cm-line` rects, never by the
  pure-function unit tests (which never touch real coordinates at all). Any experiment doing
  its own pixel measurement (2b's gradient positioning included, if it ends up needing any)
  should audit *every* axis's reference frame explicitly, not assume symmetry.
- **`coordsAtPos(pos, side)`'s side parameter matters at line starts, and defaults are not
  obviously safe.** `side: 1` ("after"-biased) at a line's very first position returns the
  far edge of the first character — for a list item, that's past the bullet glyph, not at
  its start. `side: -1` ("before"-biased) gives the character's own left edge. Untested,
  `side: 1` compiles and "looks right" (it did return *a* plausible-looking coordinate) —
  only a rect comparison against the actual rendered marker (`.cm-formatting-list`) caught
  the ~12px discrepancy.
- **A nested list item's raw source line starts with its own indentation whitespace, and
  Obsidian doesn't render that whitespace at literal character width.** Measuring
  `coordsAtPos` at a line's raw `.from` (before skipping leading whitespace) lands at
  wherever Obsidian's own indent mechanism collapses that whitespace to — which turned out
  to be the *parent* list level's own column, not the current line's marker. Any code
  measuring "where does this line's real content start" needs to skip
  `text.length - text.trimStart().length` characters first; this is general (headings/
  paragraphs have no leading whitespace, so it's a no-op there), not a list-item special case.
- **CM6 ships a first-party `layer()`/`RectangleMarker` pair (`@codemirror/view`, used
  internally for the selection/cursor layers) purpose-built for "measured overlay outside
  `.cm-content`, scrolls naturally."** `RectangleMarker` alone (just the positioned-div
  factory, not the full `layer()` wrapper) was reused here since `layer()`'s own `update()`
  hook only supports a synchronous redraw with no way to thread in the plan's requested
  debounce — but the full `layer()` extension is worth trying as-is for 2b or a future
  revisit if debouncing turns out not to matter in practice; it would remove the need for
  this experiment's manual scroll-coordinate calibration entirely.
- **A CM6 extension registered via `registerEditorExtension` applies to EVERY `EditorView`
  instance Obsidian creates app-wide, including nested/embedded ones a naive mental model
  wouldn't expect.** Obsidian renders an actively-edited table cell in Live Preview as its own
  separate, independent CM6 instance mounted inside the outer table widget's DOM — not a
  detail this project's own decoration code accounted for. A mechanism built assuming "I only
  run on the real top-level note" silently also runs there, and a bare line of cell text gets
  classified exactly like real top-level content (here: a plain paragraph, since that's the
  default block kind for a line with no special syntax), picking up markers/indentation meant
  only for the actual document and visibly corrupting the cell being edited. `editorInfoField`
  (Obsidian's own "which file is this editor for" field, a reliable outline-mode gate
  everywhere else in this project) resolves to the exact SAME object for both — confirmed live
  via `EditorView.findFromDOM()` on the nested instance — so state alone can never distinguish
  a nested editor from the real one; only DOM ancestry can (`view.dom.closest('.cm-embed-
  block')`), which requires `view` access a plain `StateField` doesn't have (fixed here by
  moving to `ViewPlugin`s). Any future CM6 extension in this project that implicitly assumes
  "I only run on the real note" should check this explicitly, not assume it — table cells are
  the one confirmed case so far, but any other Obsidian construct that edits a fragment of a
  document as its own nested editor would have the identical exposure.

## Obsidian: native chrome and internals

- **Read native values live instead of hardcoding compensations.** Subtracting a
  `getComputedStyle(...)`-read native padding from an own-added margin (clamped at zero)
  stays correct across themes/Obsidian versions; a hardcoded pixel constant would silently
  drift the moment a theme changes that padding.
- **List items already sit right of sibling text in vanilla Obsidian** — the native
  `text-indent`/`padding-left` hang pair reserves room for the bullet regardless of outline
  mode. This experiment's additive design correctly preserved that native behavior
  (verified: our own added margin is identical across list/paragraph/blockquote at the same
  depth); the extra offset users notice is pre-existing Obsidian behavior becoming more
  visible now that everything else aligns precisely, not a regression this experiment
  introduced.
- **A custom guide mechanism must actively coexist with Obsidian's own native "Show indent
  guides" setting for lists, not just avoid crashing next to it.** Real-vault side-by-side
  comparison (native only / both / ours only) showed native list guides are already precise
  (bullet to bullet) in a way a block-level, fixed-unit overlay can't match — running both
  at once visibly doubles lines; ours alone (if drawn for list nesting) reads as unevenly
  spaced. The fix wasn't CSS suppression of the native feature (obsidian-outliner's own
  approach, per the original postmortem) but scope reduction: never draw our guide where
  the *native* mechanism already owns the job (any list-item ancestor), only where native
  has zero representation at all (bridging a non-list ancestor into a list, or between
  non-list kinds). **2b will face this identical question** — a CSS-gradient guide is
  exactly as capable of doubling against native list guides as an overlay div is; the same
  list-item-ancestor exclusion should apply there too, not be treated as an 2a-specific fix.
- **Measure the actual visual element a fix needs to clear, not its wrapper — a wrapper can
  report a technically-true but practically-useless size (here, 0).** Obsidian's native fold
  chevron is two nested elements: `.cm-fold-indicator` (a zero-width anchor point Obsidian
  positions at the text's own start column) and `.collapse-indicator.collapse-icon` (the
  actual glyph, rendered via a negative offset extending LEFT of that anchor). Measuring the
  wrapper's own `getBoundingClientRect()` would have silently produced a no-op fix (0px of
  extra reach); the real, non-zero width was only on the child. Generalizes: when a fix
  needs "how much space does native UI element X occupy," verify empirically which specific
  DOM node actually carries that dimension — a "reasonable-sounding" selector (the outer
  wrapper, the one with the semantic class name) is not guaranteed to be the right one.

## Verification and process discipline

- **The synthetic corpus, even a deliberately adversarial one, missed all three real bugs
  above.** Every one was caught only by a human visually reviewing real, organic vault
  content (not synthetic fixtures, not DOM-attribute assertions). This reaffirms the
  postmortem's central lesson directly, in a new implementation: treat the real-vault pass
  as load-bearing verification for every future experiment, not a final formality after the
  fixtures pass.
- **A script-driven interaction (setting `.scrollLeft` programmatically, reading it back) is
  real evidence that a scroll container is *functional*, but it is not equivalent to a human
  actually using it.** It doesn't exercise trackpad/wheel gesture handling, doesn't reveal
  whether a scrollbar is visually discoverable, and doesn't catch problems that only show up
  under real input events. A fix that passes every computed-style and scripted-interaction
  check should still be handed to a human for a final pass before being called settled if the
  thing being fixed is itself a human-facing interaction (as opposed to, say, a purely visual
  property like a color or an alignment, where a computed-style check IS the full story).
- **Consolidating a fix from a scratch/probe test into the "real" file is itself a step that
  needs re-verification, not just a mechanical copy.** A probe's injected `<style>` tag can
  "work" only because it's layered on top of OTHER state (here, a still-present earlier
  override in `styles.css`) that gets dropped when the probe's finding is folded into a single,
  final rule — silently losing a piece that was necessary but easy to assume the new rule
  subsumed. Caught only because a human tried the rebuilt output and reported a regression,
  not because the "surely this is equivalent" reasoning was double-checked before shipping it.
- **A test that stays flaky after a plausible-looking fix may be revealing a real bug, not a
  residual timing issue — a fix that reduces flakiness without eliminating it hasn't
  necessarily fixed the actual cause.** A specific e2e test's intermittent failure was first
  attributed to an async DOM-settling race and "fixed" with a poll instead of a fixed sleep (a
  legitimate improvement in its own right, kept permanently) — but it kept failing
  deterministically once machine load stopped intermittently masking/unmasking the real cause.
  The poll-based fix was necessary but not sufficient; the actual bug (the nested-editor
  decoration leak, immediately above) was found only by tracing the failing assertion's own DOM
  ancestry down to its root, in an environment quiet enough to reproduce it every time rather
  than intermittently. Don't declare a flaky test "fixed" on the strength of a plausible
  mechanism alone — confirm the fix actually eliminates the failure, not just reduces its rate.

- **A drastic design simplification (8 distinct shapes+colors → 1 uniform dot) is a
  legitimate outcome of a "build it, then actually look at it" process, not a failure of
  the original design.** The plan called for a distinct mark per kind specifically to test
  whether that was legible; building it, screenshotting it, and then judging — correctly —
  that the variety read as cryptic rather than helpful was the experiment doing its job, not
  wasted work. The per-kind version's code (quadrant/tick/bar helper functions, an 8-entry
  color table, a kind-keyed switch) is gone entirely from the final implementation, and the
  final code is smaller for it. Worth remembering when a build-and-look step contradicts an
  earlier plan-time assumption: revising the design mid-experiment, based on what was
  actually seen, is the intended use of this project's whole "confirm rather than assume,
  and look at the real result" discipline — not a deviation from it.
