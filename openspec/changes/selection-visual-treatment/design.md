## Context

`node-selection-enforcement`'s transaction filter (`src/escalate.ts` + the CM6 adapter
in `src/plugin/transaction-filter.ts`) already turns boundary-crossing selections into
whole-subtree covers — drag past a node boundary, past a node's trailing gap, or a
multi-range selection where any range escalates. What it deliberately does NOT do is
change how the result *renders*: the escalated range is still just a wider native
`EditorSelection` range, painted with CM6's stock character-level selection background.
The 2026-07-20 manual pass that validated escalation flagged this mismatch, and
design.md scoped it out of that change on purpose (docs/research/13, "Escalated-selection
visual treatment").

The decoration system this change extends is `src/plugin/decorations.ts` /
`src/plugin/decorate.ts`: pure fact computation (`decorate()`, `computeLineGuides()`)
feeding three `ViewPlugin`s gated on outline mode via `editorInfoField`
(`DecorationsPlugin` for per-line CM6 `Decoration.line` classes/CSS vars,
`MarkersPlugin` for marker widgets, `MarginCompensation` for direct DOM patching of
widget-replaced atoms — tables/callouts/HTML/hr — which CM6 line decorations can't
reach at all). This change adds a fourth decoration concern to that same architecture:
node/subtree-selected chrome.

## Goals / Non-Goals

**Goals:**
- When the current editor selection is exactly a whole-node or whole-subtree cover (one
  node, or a contiguous run of sibling subtrees), render block-level chrome distinct
  from stock character-level highlight, across every line the cover spans (own content,
  descendants, and trailing gap where the cover actually reaches it).
- The chrome reads as ONE rectangle bounded on the left by the covered ROOT's own
  column — not each individual line's own (possibly deeper) indentation — so a selected
  H3 section, say, tints uniformly under a nested list/code-block/blockquote/table all
  the way to the right edge, never reaching further left than the H3's own column
  either (a real finding from user review of the first version, which anchored each
  line to its own indentation instead — see "Chrome anchors to the covered root's
  column" below).
- Suppress the native character-level highlight while the whole selection is
  block-covered, so the two don't visually compete (also from user review — showing
  both at once read as confusing).
- Handle multi-range selections: each range that is itself an exact cover gets its own
  chrome independently.
- Compose cleanly with existing indentation, guide-line, and marker decorations, and
  with widget-replaced atoms (tables/callouts/HTML/hr) via the same declarative/DOM-patch
  split the existing decoration layer already uses.
- Remain purely reactive/derived: no new persisted state, no change to selection
  computation, the transaction filter, or document content.
- While a selection is a whole-node/subtree block cover, Live Preview's rendered
  (WYSIWYG) appearance SHALL stay intact rather than reverting to raw markdown syntax —
  since a block selection is about working with whole blocks, not editing raw text at a
  position (a user-requested "significant UX improvement," not merely a visual-polish
  nit). Reached via blurring the editor on a covering selection and recovering keyboard
  interaction through a real keymap replay, after a CSS-only approach was tried and
  reverted — see "Live Preview stays rendered while block-selected" below and
  docs/research/13-selection-follow-ups.md for the full investigation, including a
  handful of known, accepted residual limitations.

**Non-Goals:**
- No change to *when* or *how* selections escalate — that's `node-selection-enforcement`,
  unchanged by this proposal.
- No new selection-creation gesture (the ladder, bullet-click) — docs/research/13's other
  Track 2 threads, left for their own future change.
- No modal block-selection keyboard mode — same deferral.
- Reading view: untouched by construction (this is a CM6/Live-Preview-only decoration
  layer, like the rest of `outline-decorations`).

## Decisions

### Detection is geometric and stateless, not history-based
Rather than threading an "this selection was escalated" flag from the transaction filter
through to the decoration layer, the decoration layer independently asks, for each
non-empty range in the current `EditorSelection`: *does this range's bounds cover some
node's subtree, or the union cover of a contiguous run of sibling subtrees?* If yes,
decorate every line of that cover; if no, render nothing extra.

"Covers" is deliberately not "equals both ends exactly" — see the next decision for why
the low end must match the cover's start precisely while the high end only needs to
reach it (or go beyond, up to this same node/run's own territory).

**Why:** matches the existing decoration system's discipline (`decorations never mutate
document state`, purely derived from current `EditorState`) and needs no new plumbing
through the transaction filter. It also has a clean side effect: a selection that
*happens* to exactly match a node's bounds (e.g. triple-click a whole single-line
paragraph, or Select All in a single-top-level-node note) gets the same chrome an
escalated selection would — which is arguably correct (the same thing is selected either
way) rather than a special case to exclude.

**Alternative considered:** tag escalated ranges at the transaction-filter layer (e.g. an
effect or annotation on the dispatched transaction) and have the decoration layer key off
that instead of recomputing geometry. Rejected: adds cross-module state to track through
undo/redo and programmatic selection restores, for no behavioral gain over the
stateless geometric check, which `escalate.ts`'s existing pure functions already make
cheap to compute.

### Reuse `escalate.ts`'s cover geometry via a new read-only query, not new math
Add a pure query function `coveredSubtreeRoots(doc, range): readonly OutlineNode[] | null`
alongside `escalateRange`/`escalateRanges` in `src/escalate.ts`. `escalateRange`'s
differing-node branch is refactored to extract its scope-resolution logic into a shared
`siblingRunCover(doc, anchorNode, headNode)` helper (returns both the covered node list
and the combined cover), so the two functions agree on cover geometry by construction —
`escalateRange` keeps calling it to compute the expand-only union it dispatches;
`coveredSubtreeRoots` calls the same helper (or `subtreeCoverOf` for the same-node case)
to test an existing range against it.

The match itself is **not** strict equality on both ends: `lo` (the range's earlier end,
normalized regardless of anchor/head orientation) must equal the cover's exact start,
but `hi` only needs to be at-or-beyond the cover's end (`!posBefore(hi, cover.end)`), not
exactly equal to it. This was a real bug in the first pass of this design, caught while
writing unit tests: the gap-line trigger's own expand-only rule (`escalateRange`) pins
`lo` to the cover's start but *deliberately retains* `hi` wherever the user's drag
actually landed inside the node's trailing gap — past the cover's own content end. Strict
equality on `hi` would silently reject that shape, which is the single most common
escalated selection (drag from mid-content past a node's end onto its gap line) — the
flagship scenario this whole change exists for. The relaxed `hi` check still can't
over-match: `hi`'s owning node is resolved via `nodeAtLine` before the comparison, so an
`hi` that strays past this node/run's own territory resolves to a *different* node and
takes a different branch (or extends the covered run itself) rather than falsely
qualifying. The same relaxed condition also cleanly subsumes the "exact single-line leaf
match" case (`hi` lands precisely on `cover.end` with no gap involved at all) — one
condition, no separate case to write.

**Why:** the geometry is identical to what escalation already computes forward
(range → cover); this is the same computation used as a membership test, with no new
tree-walking logic to get right independently.

### Line-based chrome via a fourth `ViewPlugin`, declarative + DOM-patch split
Follow the existing dual mechanism exactly:
- A new `ViewPlugin` (`SelectionDecorationPlugin`) computes a `DecorationSet` from
  `coveredSubtreeRoots` over `view.state.selection.ranges`, adding a
  `Decoration.line({ class: 'to-decor-node-selected', attributes: { style } })` for
  every real `.cm-line` the cover(s) span — including descendant lines and trailing gap
  lines. The `style` carries `--to-selected-left` (see the next decision) — CM6 merges
  BOTH classes AND style-attribute strings from independent line decorations at the same
  position (`combineAttrs`, verified directly against `@codemirror/view`'s own source
  before relying on it — a real question, not an assumption, since this rule now also
  carries a style payload, not just a bare class), so this composes with whatever
  `DecorationsPlugin` already put on the same line without disturbing indentation,
  guides, or markers.
- Widget-replaced atoms (tables/callouts/HTML/hr) inside a cover get the same class
  AND `--to-selected-left` applied as a direct DOM patch, extending
  `MarginCompensation`'s existing imperative-patch pass (it already walks mounted
  widget-atom elements every render for margin/marker; this adds one more class
  toggle plus one more custom property to that same walk) rather than introducing a
  fifth plugin. Widgets use their OWN live-measured `ownShiftExpr` (already computed
  there for margin/marker, correcting for native padding) instead of the generic
  per-kind formula `selectedLineRootTargets` uses for plain lines — more precise.
- `styles.css` adds `to-decor-node-selected` as a background layer (following the
  existing `--to-*`/`to-decor-*` naming convention).

**Why:** this is the smallest addition that fits the established architecture instead of
introducing a parallel one. It also means the same nested-editor guard
(`isNestedEditor`) and outline-mode gate (`editorInfoField`) apply for free by following
the same construction pattern as `DecorationsPlugin`/`MarkersPlugin`.

**Alternative considered:** a single `Decoration.mark` spanning the escalated range's
character offsets, styled as a background. Rejected: marks don't reach widget-replaced
atom lines at all (same limitation the existing decoration layer already worked around
for indentation/markers), and a single mark can't independently style multiple
non-contiguous line runs the way per-line decoration naturally does for a multi-sibling
cover.

### Chrome anchors to the covered root's column, not each line's own
A real, substantial correction from user review of the first version (which used
`inset: 0` — each line's own box, full stop): a selected subtree should read as ONE
rectangle bounded on the left by the covered ROOT's own column, not stair-stepped to
match each descendant's own (typically deeper) indentation. The first version left the
space between a shallow root's column and any more-indented descendant's own narrower
box completely untinted — visible as "no block-selection background under the
indentation" for a nested list, code block, callout, table, or blockquote anywhere
inside a selected section, and (for a selected H3 specifically) no way to express "stop
at this H3's own column, don't reach into H1/H2's territory."

`selectedLineRootTargets(state): ReadonlyMap<number, string>` (decorations.ts) replaces
the old membership-only `selectedNodeLines`: for each covered range, it looks up the
cover's ROOT fact at the cover's own start line (exactly the root's first line, by
construction of `coveredSubtreeRoots`), computes a target column, and maps every line
the cover spans to that ONE shared target. Each consumer then computes ITS OWN
`left: calc(target - thisLine'sOwnShift)`, the same "widen a leftward-reaching pseudo by
this line's own shift" technique the guide layer already uses.

**The target is the PARENT's column, not the root's own** — `calc((rootDepth - 1) *
UNIT)` for a block/atom/heading root, or the root's own line-shift MINUS one `UNIT` for
a list-item root (list guides are deferred entirely to native rendering per
`computeLineGuides`'s own precedent, so there's no additive guide column to target
directly; subtracting one unit from the root's own shift approximates "one level out"
the same way). A second, later round of user review corrected the FIRST version of this
decision, which anchored to the root's OWN column (`rootDepth * UNIT`) — reusing exactly
where an ancestor's guide renders. That looked right in isolation but ran the chrome's
left edge straight through the MIDDLE of the root's own marker icon (the icon is
CENTERED on its own column, per Experiment 5a's placement decision) — comparing directly
against Logseq's own block-selection convention, which is "wider on the left, going till
the next level," made the fix obvious: target the PARENT's column instead, clearing the
marker entirely. A top-level root (depth 0) has no shallower level to reach for the same
reason a guide never renders at negative depth — subtracting one `UNIT` anyway (rather
than clamping to the root's own column) keeps the same "one level out" amount uniform,
and stays within the leftward-overflow margin the guide layer's own doc comment already
confirmed is never clipped.

**Why:** reuses the exact column concept guides already establish (an ancestor's guide
renders at `ancestorDepth * UNIT` regardless of which descendant line it threads
through) as a MEMBERSHIP test's TARGET rather than inventing new geometry — the same
"reuse escalate.ts's cover geometry" discipline the rest of this module follows,
applied to `decorate.ts`'s depth facts instead.

**A second real bug found while fixing this, via the manual visual pass, not by
inspection:** Obsidian's own `.HyperMD-quote::before` (app.css, the blockquote's native
colored side-bar) sets `width: 1px`. This rule out-specifies that native rule for every
property they share, but never declared `width` at all — so on any blockquote line,
native's `1px` leaked straight through uncontested (no cascade conflict to win, since
nothing here overrode it), silently shrinking the WHOLE chrome box to an invisible
sliver. A screenshot of a selected section with a blockquote inside it showed a
blank, untinted gap exactly where the blockquote sat, sandwiched between correctly-tinted
lines above and below — `width: auto` (styles.css) closes it explicitly. Caught the same
way the original guide-line code learned this exact lesson for the SAME native rule
(hence guides using `::after`, not `::before` — see that rule's own doc comment); this
rule can't switch pseudo the same way (it needs `::before` specifically so it can coexist
with guides' `::after` on the same element), so it resets the conflicting property
instead.

### A widget atom's right edge is pulled in to match plain lines, not left at its own (wider) box
A table widget reserves extra box width past its own visible grid for the "+ column"
button (present in the DOM whether or not currently visible/hovered) — found by user
review as a visible "notch": the table's chrome, matching its own wider box via a flat
`right: 0`, poked out past every plain line's own right edge in the same cover.
`MarginCompensation`'s widget loop now computes `--to-selected-right` per widget: live-
measures a reference plain line's own right edge (`nativeContentRightPx` — deliberately
NOT `contentDOM.getBoundingClientRect().right`, a real bug in an early version of this
fix: Obsidian's readable-line-width centers each `.cm-line` INDIVIDUALLY via its own
`margin-inline: auto`, so `contentDOM` itself stays full-viewport-width regardless — only
correct in a viewport narrow enough that no line was being centered at all yet), then
pulls the widget's own right edge in by however much its box exceeds that reference.

**Two more real bugs found live while building this, both instructive:** (1) an early
version subtracted the widget's own `padding-right` from its border-box edge, reasoning
that a positioned descendant's containing block is inset by padding — wrong: it's inset
by BORDER width only (this widget has none, so no adjustment was needed at all, and the
subtraction silently reintroduced a same-size gap on the other side). (2) after removing
that, the fix still visibly did nothing — forcing an extreme test value (`-300px`)
looked IDENTICAL to the real one (`-16px`), which turned out to mean both were pushing
the edge OUTWARD (CSS `right` more negative = further right/outward, the opposite of
`left`, where more negative reaches further left/outward) past an ancestor's real
overflow-clipping boundary, clipped to the same visible result either way — not, as
first assumed, that `right` had no effect. The actual fix needed a POSITIVE value (push
inward). Both errors were caught by forcing extreme/adversarial values and comparing
against live computed geometry, not by re-reading the CSS spec harder.

### Native character-level highlight suppressed while fully block-selected
A real finding from user review: showing the chrome above AND CM6's own character-level
selection at once read as confusing — two competing visual cues for the same selection,
not a "layered, both useful" combination as the first version's design assumed.

`allRangesCovered(state): boolean` (decorations.ts) — true when every non-empty range in
the current selection is a cover — drives a `to-decor-block-selecting` class toggled on
`view.dom` by `SelectionDecorationPlugin`. Investigated live (via the e2e harness, not
assumed from `@codemirror/view`'s docs) which rendering mechanism actually paints
Obsidian's selection: CM6's optional `drawSelection()` background layer
(`.cm-selectionBackground`) never mounts here (`.cm-selectionLayer` stays empty even
with a real non-empty selection) — Obsidian renders selection via the plain browser
NATIVE `::selection` pseudo-element. So the suppression is a scoped `::selection`
override (`.cm-editor.to-decor-block-selecting .cm-content ::selection { background-
color: transparent; color: inherit; }`), not a decoration-layer change.

All-or-nothing, not per-range: a genuinely mixed selection (one covered range, one plain
range) can't arise through the real transaction filter — the uniform multi-range rule
(node-selection-enforcement) forces every range to at least its own node's cover once any
range escalates — so the only way to reach a mixed state is a raw, atypical programmatic
dispatch bypassing the filter, which this check simply doesn't suppress for (native
highlight stays visible there, same as any non-covered selection). Per-range suppression
would need CM6's selection-rendering layer to carry per-range identity into the DOM,
which — since it turns out to not even be the active rendering mechanism here — isn't
where the real complexity would be anyway.

**Why:** `::selection` is the standard, minimal-footprint way to suppress native
highlight for exactly the text it covers, without touching selection state, and the
all-or-nothing scope matches what's actually reachable through real usage.

### Chrome color reuses `--text-selection`, resolved live rather than referenced directly
The chrome's background color is a live-resolved COPY of the theme's own
`--text-selection` variable (the same one native selection itself uses — full opacity,
no separate tint/reduction of our own), not a plain accent color at low opacity. A real
finding from user review: the first version's `--interactive-accent` at 0.08 opacity
read as too faint, and picking any other color independently of the theme risked
inconsistency across themes; reusing the theme's OWN selection color was the direct fix.

Resolved live and copied into a NEW property (`--to-selected-bg`,
`MarginCompensation.measureSelectionColor`), not referenced directly as
`var(--text-selection)` in the chrome rule: Obsidian's own
`.cm-table-widget.is-selected { --text-selection: transparent; }` (avoiding a double
selection render inside table cells, which have their own native selection UI) would
otherwise silently make the chrome invisible on any table under an escalated selection
too — a real bug, found live via a manual visual pass showing the color-fixed chrome
correctly tinted everywhere EXCEPT the table (which stayed completely blank). A `var()`
reference re-resolves against whatever's inherited AT THE ELEMENT USING IT, not "frozen"
at whichever ancestor last declared it, so merely referencing `--text-selection` inherits
that same local override. Reading the value once via `getComputedStyle` on `contentDOM`
(never itself `.is-selected`) and writing it back as a resolved color literal under a
property name NOTHING else resets breaks that inheritance chain outright.

### A blockquote's native side-bar BORDER needed resetting too, not just its width
A third round of user review found the native colored side-bar (blockquote's
`.HyperMD-quote::before`) visibly relocating along with the chrome's own `left` — the
wider the selection, the further out the bar got dragged. Root cause: native sets both
`inset-inline-start: 0` (pinning that edge at native position 0) AND `border-inline-start`
(a border painted at the box's OWN edge) on the SAME `::before` this rule also targets.
This rule's `left` out-specifies native's `inset-inline-start` for that property (same as
every other property this rule already wins), which relocates the box — and since a
border always paints at wherever its OWN box's edge ends up, the bar moves right along
with it, growing more displaced the shallower/wider the covered selection.

**First fix attempt, rejected on further review:** simply reset the real border to
`border-inline-start: none` (the same technique that fixed the `width: 1px` leak) —
harmless everywhere else this rule applies, since nothing else declares a competing
border there. This stopped the relocation, but traded one visible bug for a different
one: the bar just vanished entirely while the blockquote was part of an escalated
selection, judged too blunt on review — the bar should stay exactly where it always is,
not disappear.

**The actual fix:** reproduce the bar as a `background-image` (a flat-color
`linear-gradient`) on the SAME pseudo-element, positioned independently of the box's own
edges via `background-position` — a border is always tied to the box's own edge, but a
background-image's position is not. Since the box's own edge is now at `nativeEdge +
shift` (where `shift` is this rule's own `--to-selected-left`, and `nativeEdge` is where
the box would render un-shifted, i.e. where the real border used to sit), positioning the
stripe at `background-position-x: calc(-1 * var(--to-selected-left))` lands it back at
`nativeEdge` in absolute page terms, regardless of `shift` — confirmed live (both via
screenshots at two very different shift amounts, and via a direct rect/position
calculation) that the stripe's absolute position doesn't move at all as the shift varies,
while the box's own edge clearly does. The real border stays reset to `none` (a real
border still can't stay put while the box's edge moves) — only its VISUAL reproduction
moves to the background layer instead.

`--blockquote-border-color`/`--blockquote-border-thickness` are Obsidian's own theme
variables — confirmed live via `document.styleSheets` that native's rule is literally
`border-inline-start: var(--blockquote-border-thickness) solid
var(--blockquote-border-color)` on this exact pseudo-element — so the reproduction uses
the theme's real values directly, with no separate JS measurement needed (unlike
`--to-selected-bg`/`--to-selected-right` elsewhere in this file, which measure a property
with no stable variable of its own to reference).

Scoped to a `.HyperMD-quote`-specific rule, layered on top of the shared one (using
`background-color` on the shared rule instead of the `background` shorthand, so the
blockquote-specific `background-image`/`-position`/`-size` layer on top rather than
resetting): only blockquote lines have a native bar to reproduce, so sizing the stripe
from these two variables on the SHARED rule (applying to every kind) would paint a stray
sliver on headings/paragraphs/etc. too.

Considered and rejected: decoupling the bar from the chrome box via `box-shadow` instead
(a non-inset box-shadow, offset to extend the fill leftward without moving the box itself,
was explored as an alternative to the `left`/`right` override mechanism generally — but
would need re-deriving the widget right-edge pull-in logic against a differently-shaped
primitive, for no benefit over the simpler background-image fix once the real native
variables were found); reverting blockquote's own `left` to native's `0` (would
reintroduce the earlier "no fill under nested content" bug this same rule was built to
fix).

**Why:** the same general lesson the `width: 1px` fix already established (out-specifying
a native rule only wins the properties actually declared, never ones left unset) applied
to a second property on the same pseudo-element — but this time, discarding the property
outright (as the width fix could get away with, since nothing visible was lost) traded one
bug for another; the real fix needed a way to keep the bar's VISUAL presence while
decoupling its position from the box's own moving edge, which only a background-position-
based reproduction (not a border, which is always edge-bound) could do.

### A line needs its own stacking context for its `z-index: -1` chrome to resolve behind its OWN background
A third-round user request ("can callout-style tinting extend to code blocks too?")
surfaced that code fence lines showed NO visible tint at all, while callouts already
tinted correctly — even though the chrome's `::before` measured a fully correct
`background-color` and `z-index: -1` in both cases (confirmed live via computed styles,
which looked identical in shape for both kinds). The actual paint order didn't match:
computed CSS values can look completely correct while cascade/stacking interactions
still hide the result, the same lesson the `--text-selection` inheritance bug (above)
already taught.

Root cause: `position: relative` alone, with `z-index: auto` (as this rule originally
declared), does NOT make an element its own stacking-context root — only an explicit
non-`auto` `z-index` does. Without that, a `z-index: -1` pseudo-element doesn't resolve
"one layer behind THIS element's own content" at all; it hoists to whichever ANCESTOR
first establishes a stacking context and paints behind EVERYTHING there, at stack level
-1 — including this SAME line's own background, if the line sets one directly (a code
line does, opaquely, via `background-color` on the `.cm-line` itself; a heading or
paragraph stays transparent, so the bug was invisible on them). A callout's own colored
background lives on a nested CHILD element deep inside its widget, not on the widget's
own outer box directly, so it never competed with the hoisted pseudo the same way —
purely incidental to why callouts "happened" to already work, not evidence the mechanism
was actually correct.

Fix: add `z-index: 0` alongside the existing `position: relative` on this rule (styles.
css) — gives the line its own local stacking context, so its `z-index: -1` pseudo now
correctly resolves relative to THAT line's own background/content only, not whatever
ancestor context it would otherwise hoist to. Confirmed live (screenshot + a direct
`getComputedStyle().zIndex` check) that a selected code fence now tints identically to a
selected callout, with no change to unselected lines (the rule is scoped to
`.to-decor-node-selected`, applied only while covered).

**Why:** this was a genuine correctness gap in the general chrome mechanism, not a
code-block-specific special case — any future widget/line kind that sets its own opaque
background directly (rather than on a nested child) would have hit the exact same bug.
Framed by the user as a low-risk "experiment, might be revert" ask; turned out to be a
one-property, root-cause-understood fix rather than something needing a revertible
fallback.

### Live Preview stays rendered while block-selected: tried CSS-based mark hiding, reverted; blur-based approach kept and validated
A fourth-round user request, framed as "a significant UX improvement": stock Obsidian
reveals a line's raw markdown marks whenever any selection range overlaps it — normal
for character-level editing, distracting once a whole block is selected. This spans
TWO real, substantially different attempts; only a short summary lives here — the full
investigation (root cause, exact class names, every regression found on real vault
content across two review rounds, and the reasoning behind each decision) is recorded in
docs/research/13-selection-follow-ups.md's "Live Preview raw-markdown reveal during
block selection" section, since it's more detail than belongs in this change's own
design doc and is exactly the kind of learning worth preserving if this gets picked up
again later.

**Attempt 1 (reverted): hide revealed marks via CSS**, keyed off Obsidian's own
`.cm-formatting` class. Worked cleanly for marks whose "hidden" form is just
invisible/absent text (heading, bold, italic, blockquote, links) but NOT for marks whose
"hidden" form is a richer WIDGET Obsidian removes from the DOM entirely on reveal (a list
marker's round bullet, a task checkbox's real `<input>`, a code fence's language badge, a
callout's title-line rendering) — CSS can hide text but can't resurrect a widget that's
gone. Excluding those four reverted them to native raw-text display rather than the
blank-gap/collapsed-height regressions an indiscriminate version produced, but a second
real-vault review round found the exception list still growing (an aliased wiki link
showing both forms at once, a wiki link's underline disappearing, blockquote/callout
content sticking to the border) with no sign it would stop. Reverted on that basis, not
any single remaining bug: rather than keep chasing individual constructs with more CSS
special cases, the user asked to step back and try a structurally different mechanism.

**Attempt 2 (kept, confirmed working): reproduce a real "click away" via blur, recover
keyboard interaction via a real keymap replay.** A manual click outside the text area
after a block-covering selection already returns Live Preview to its fully native
rendered form — confirmed by the user for every case attempt 1 couldn't reach (callout
widget, real checkboxes, round bullets, wiki-link aliases). `SelectionDecorationPlugin`
(`decorations.ts`) blurs `view.contentDOM` on `mouseup` whenever the resulting selection
is a whole-block cover, reproducing that same DOM effect programmatically.

Blurring alone cost keyboard interaction entirely (typing, Backspace, Delete, arrow keys
all silently ignored while unfocused — confirmed identical to manually clicking away).
Recovered via a second listener, on `document` itself (`keydown`, capture phase): when a
keystroke lands with nothing meaningfully focused while this view is the one blurred, it
refocuses `contentDOM` (sufficient on its own for plain typing, which the browser
delivers via a separate, later `beforeinput` dispatch evaluated against whatever's
CURRENTLY focused) and replays the same event through `@codemirror/view`'s
`runScopeHandlers(view, event, 'editor')` — a public CM6 API for exactly this ("run this
view's installed keymap against an event that didn't originate on its own DOM"). This
recovers Backspace/Delete/arrows/Tab/Cmd+A, including this project's OWN layered keymap
(the structural-edit rewriting, marker-transparent cursor placement), without
reimplementing any command by hand — deliberately NOT calling `@codemirror/commands`
functions directly, which would bypass this project's own higher-precedence keymap
entirely.

A real bug surfaced on the first manual test round and was fixed: `runScopeHandlers`
matching and running a command didn't stop the ORIGINAL event's own native default
action from ALSO firing against the now-focused editor — a second, generic
contentEditable deletion on top of the correct structural one for Backspace/Delete
(confirmed live: one Backspace press on a selected subtree needed TWO undos, and the
surviving text matched exactly what a redundant extra single-character deletion from the
correctly-placed post-command cursor would produce), and the browser's native
focus-cycling for Tab (stealing focus to a toolbar button, Tab's own default action
outside a text field). Fixed with `event.preventDefault()`/`stopPropagation()` — but only
when `runScopeHandlers` reports a command actually matched, since an unmatched key (plain
typing) must NOT be prevented, or the native `beforeinput` insertion that makes typing
work stops firing too.

**Confirmed working by the user after the fix**: typing, arrows, Backspace, Delete (one
keystroke, correct result, one undo), and copy/cut/paste all behave correctly with the
selection staying fully rendered throughout.

**Two follow-up bugs, found live on a second manual round and fixed**: a multi-pane
conflict (two outline-mode panes both blurred/block-selected simultaneously always routed
typing to whichever view's listener registered first, not the pane the user actually
clicked into) — fixed by additionally requiring `app.workspace.activeEditor` to identify
this exact view, a signal Obsidian tracks independently of DOM focus. And keyboard-only
block selection (Shift+Arrow, no mouse) originally never triggered the blur at all — fixed
by also hooking `ViewUpdate.selectionSet`, guarded against firing mid-drag via a
tracked `mouseDown` flag.

**One limitation found live and NOT fixed, a genuine hard limit of the reactive-refocus
approach**: IME composition (tested: Chinese Pinyin) loses its first keystroke to literal
Latin insertion before composition correctly engages from the second keystroke onward —
an input method's decision to compose is tied to focus state at the moment the OS
delivers the keystroke, which our refocus (reacting to that SAME keydown) is
structurally too late to influence. No earlier, reliable "about to type" signal exists to
refocus on instead without defeating the point of staying blurred. Recorded as a known,
accepted limitation rather than attempted, deliberately — speculative here means
untestable across IMEs/platforms, the exact kind of fragile-workaround-chasing already
backed off from once with the CSS approach (attempt 1 above).

Full detail on all three findings is in docs/research/13-selection-follow-ups.md. No e2e
coverage was added for any of this listener logic, deliberately: focus/blur timing
interacting with real keyboard/drag input is exactly the kind of thing unlikely to test
reliably through the automated harness — validation here was manual, in a real vault, by
design, and it passed (except for the documented IME limitation).

### Tried and reverted: a border + corner-radius around the whole selection rectangle
A third-round visual-polish request, explicitly gated by the user as "only if it's
simple" for both a slim border and slight corner rounding. Prototyped the obvious
approach — add `border`/`border-radius` directly to the existing shared chrome rule,
which is a SEPARATE `::before` per covered LINE, not one box spanning the whole cover —
and confirmed live via screenshot that it looks wrong: every line gets its own
independent rounded border, producing a visible stack of separate pill-shaped boxes with
a double-thickness seam at every line boundary, not one clean rectangle around the whole
selection.

A correct implementation would need each line to know whether it's the FIRST or LAST
line of its own cover (to gate `border-top`/`border-bottom` and the corresponding two
corners' radius to only those lines, while every line still gets `border-left`/
`border-right` uniformly) — genuinely new state, not a style tweak: `selectedLineRootTargets`
would need to track first/last-of-cover per line (straightforward there, since the
loop already knows `loLine`/`hiLine`), but that flag would then need threading through
BOTH the declarative CM6 path (`computeSelectionDecorations`) and the widget DOM-patch
path (`MarginCompensation.apply`) as an additional per-line class or property, plus new
e2e coverage for edge cases a flat left/right value never had to consider: a multi-range
selection where each range has its own independent first/last pair, and a cover whose
first or last line is itself a widget atom (a different code path from a plain line).

Reverted rather than built: the user's own stated bar for this specific ask was "not
worth the trouble if complicated," and this crosses from a style change into new
per-line state threaded through two decoration mechanisms — worth reconsidering as its
own focused follow-up if wanted later, not as a corner of an already-large change.

## Risks / Trade-offs

- **[Risk, mitigated] The blur-based Live-Preview-stays-rendered mechanism initially
  traded away keyboard interaction with a block-covering selection entirely** (typing,
  Backspace, Delete, arrows all silently ignored while unfocused) **— recovered via a
  `document`-level `keydown` listener that refocuses the editor and replays the event
  through CM6's own `runScopeHandlers`, confirmed working by the user for all of these.**
  A second round of manual testing then found and fixed two more bugs (a multi-pane
  conflict; keyboard-only block selection never triggering the blur) — see design.md's
  own decision section above for both. **One limitation remains, not fixed, a genuine
  hard limit of this approach**: IME composition (tested: Chinese Pinyin) loses its
  first keystroke to literal Latin insertion, since an input method's decision to
  compose is tied to focus state at the moment the OS delivers the keystroke — our
  reactive refocus is structurally too late to influence that decision for the SAME
  keystroke that triggered it. See docs/research/13-selection-follow-ups.md for the
  full investigation, including the abandoned CSS-based alternative this replaced.
- **[Risk] Recomputing cover-membership on every selection-only view update adds cost
  on very large/deep documents.** → Mitigation: the check is per-range (typically one or
  a handful of ranges) and reuses `escalate.ts`'s existing O(tree size) walks, the same
  cost the transaction filter already pays on every escalating selection change; no
  worse asymptotically than what's already shipped. Revisit only if profiling on a real
  large vault shows it matters (ties into the parked "viewport-limited decoration
  building" idea in docs/research/12, not specific to this change).
- **[Risk] Visual noise from over-triggering on ordinary selections that coincidentally
  match a leaf node's exact bounds** (e.g. selecting one short paragraph's full text via
  Home/Shift+End). → Confirmed by the manual visual pass (Open Questions below): reads
  as an ordinary, unremarkable tint, not noise — no narrowing needed.
- **[Trade-off] All-or-nothing native-selection suppression, not per-range** (see "Native
  character-level highlight suppressed" above) → the only reachable gap is a raw
  programmatic multi-range dispatch bypassing the transaction filter entirely, which real
  user interaction can't produce (the uniform multi-range rule forces every range to a
  cover once any one escalates).
- **[Risk, found and fixed during this change] A leftover native CSS property leaking
  through an unset property on this rule's own `::before`/`::selection` overrides, since
  higher specificity alone only wins properties THIS rule actually declares.** Three real
  instances, all caught by manual visual/live-pixel review, not by inspection: a
  blockquote's native `width: 1px` (side-bar rule) shrinking the whole chrome box to an
  invisible sliver; (before the redesign below) an under-reaching `left` leaving gaps
  under nested content; and the SAME blockquote side-bar rule's `border-inline-start`
  visibly relocating along with this rule's own `left` (a third-round finding — see
  "A blockquote's native side-bar BORDER needed resetting too" above). All three fixed by
  explicitly declaring the previously-unset property (`width: auto`, `border-inline-start:
  none`) or by the root-anchoring redesign itself. The general lesson — matching a native
  rule's specificity only guarantees winning the properties actually declared, never the
  ones left to fall through — is worth remembering for any FUTURE property this rule might
  need to add.
- **[Deferred, out of scope] Under the Minimal community theme, boxed atoms (callouts,
  code blocks) overflow the reading column when indented at all** — a base-indentation
  issue (`MarginCompensation`, Experiment 1), not something this change introduces or can
  fix within its own scope: Minimal sizes these boxes via a fixed `max-width` percentage
  that doesn't recompute when `margin-left` changes, unlike the bundled themes' `width:
  auto`. The chrome merely inherits whatever box width these atoms end up with. Confirmed
  live (Minimal theme, already present in the test vault via the existing e2e
  infrastructure) and diagnosed in full in docs/research/12's "Known gaps."
- **[Deferred, out of scope] A same-node selection that reaches a node's own text doesn't
  yet include that node's owned trailing gap — only dragging INTO the gap does.**
  Confirmed live: this is `node-selection-enforcement`'s own escalation math (`D4`'s
  `subtreeContentEnd`), unrelated to how escalated selections render. Whether reaching a
  node at all (not just dragging past it) should be enough to pull its gap into the
  cover is a real, worthwhile question, but changing that math ripples into a different
  capability's own spec and property tests — deliberately not touched here. Full
  diagnosis in docs/research/13's "Escalation math re-examination candidate."

## Open Questions — resolved by the manual visual pass

Both were flagged above as needing a real look rather than a decision from first
principles (tasks.md 4.3); screenshots against the nested-list, gap-trigger, table-cover,
and exact-leaf-match fixtures, in both bundled themes, confirm:

- **Trailing-gap chrome reads as intended.** A drag past a node's end onto its gap line
  visibly tints that gap line too, reinforcing "this blank line belongs to the selected
  node" rather than looking like a stray/accidental highlight.
- **The single-leaf exact-match case reads as signal, not noise.** A plain Home+Shift+End
  match on one short paragraph renders as an ordinary, unremarkable "this line is
  selected" tint — no narrowing to a size/child-count threshold is warranted.

A first round of this pass also surfaced three real, substantial findings that went well
beyond these two questions — native selection competing with the chrome, no fill under
nested content's own indentation, and the blockquote `width: 1px` leak — all addressed by
the "Chrome anchors to the covered root's column" and "Native character-level highlight
suppressed" decisions above. A second visual-pass round (after those fixes) re-confirmed
all five fixtures, including a genuinely mixed-depth nested-headings-with-blockquote/
code/list fixture, read correctly in both themes.
