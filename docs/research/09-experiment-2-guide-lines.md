# Experiment 2: guide lines — 2a vs. 2b head to head (2026-07-13)

Part of the decoration-experiments series — see the
[hub](07-decoration-experiments-plan.md) for ground rules, fixture corpus, and the overall
results table. Both implementations were built against the same corpus, deliberately
without picking a favorite in advance; both earned a "keep" on capability, and **2b won
the head-to-head** on code size and mechanism simplicity (see the bottom-line comparison
inside 2b's results below). Experiment 5's markers build on 2b. Prerequisite:
[Experiment 1](08-experiment-1-additive-indentation.md). Cross-experiment lessons:
[11-decoration-lessons.md](11-decoration-lessons.md).

## Design (from the plan)

Build **both** below against the same corpus and compare; don't pick a favorite in advance.

**2a — overlay-measured (obsidian-outliner's proven technique).** A `ViewPlugin` reads
already-rendered pixel positions via `view.coordsAtPos()`/`view.lineBlockAt()` *after*
Experiment 1's indentation has been laid out, and draws absolutely-positioned overlay
`<div>`s (inline-styled from JS, not CSS classes) in a layer outside `.cm-content`.
Recompute debounced on `docChanged || viewportChanged`, not every `ViewUpdate` (a real
perf/correctness improvement over this cycle's D4 choice, now that the mode-toggle-poke
problem can be solved with a dedicated `StateEffect` instead of an empty dispatch forcing a
full recompute path every time).

**2b — CSS stacked-gradient (the `@replit/codemirror-indentation-markers` technique).** A
single `Decoration.line` per line sets one CSS custom property to a comma-joined list of
`repeating-linear-gradient(...)` layers (one per ancestor level), consumed by a single
`::before` — O(1) DOM nodes per line regardless of depth, no JS pixel measurement at all.

**Compare on**: correctness against the multi-line continuation fixture specifically (2a
gets wrapped-row height for free via `lineBlockAt`; 2b needs the line's own rendered height,
which should also be free since it's one element per whole line — verify this isn't
secretly harder); resilience across light/dark theme and a couple of community themes if
convenient; code size/complexity; whether 2b's reliance on the cascade re-triggers *any* of
the `!important`/specificity problems from last time (it shouldn't, since guides are a new
property no native rule contests — but verify, don't assume).

**Success criteria**: guide lines visibly connect a node to its ancestors' guides at every
fixture's nesting, including the multi-line continuation case (never verified last time).

## Results — Experiment 2a: guide lines via pixel-measured overlay

**Verdict: keep.** Branched off Experiment 1 (`experiment/decorations-2a-guides-overlay`).
All 8 corpus fixtures plus 4 real vault notes pass, both themes, screenshotted and visually
reviewed at pixel level (not just DOM-asserted) — see
`e2e/specs/51-guides-overlay.e2e.ts` (on the unmerged
`experiment/decorations-2a-guides-overlay` branch — 2a's code never merged), 43/43 e2e
tests green across the full suite (not just this spec). One ancestor-with-children gets one
continuous overlay `<div>` spanning from its first child's own line to its deepest
descendant's last line, positioned by *measuring* (`view.coordsAtPos`/`view.lineBlockAt`)
the ancestor's own already-rendered position rather than recomputing depth × unit —
obsidian-outliner's technique, applied to this project's universal (not list-only) tree.

**Real-vault finding, fixed on this branch (not a separate follow-up)**: a *list-item*
ancestor gets no guide of its own, deliberately. The user's own real-vault comparison
(built-in indent guides only / both / ours only, screenshotted side by side) showed two
problems, both traced to the same cause: (a) with Obsidian's native "Show indent guides"
setting on, list nesting got visibly doubled lines; (b) even alone, our guides within a
list read as unevenly spaced, because native list nesting has its own internal per-level
width that our fixed unit doesn't match (the same native-hang mismatch Experiment 1 already
deferred rather than fight, now visible one layer up). Native indent guides already connect
one bullet precisely to the next *within* a list — there is no gap for a second mechanism to
usefully fill there. Fixed by having `computeGuides` skip pushing a guide when the anchor
node's `kind === 'list-item'`, while still including list-item subtrees in a *non-list*
ancestor's own span (a heading or paragraph bridging into a list still gets its guide,
reaching all the way through — only the within-list levels get none of their own). This
turns, e.g., the `deep-nesting` fixture (four levels, all list items) into zero guides at
all — entirely deferred to native — while `heading-then-list` keeps exactly one guide
(the heading's, spanning the whole list) instead of three.

**Deliberate deviation from the plan's literal wording**: the plan called for "a dedicated
`StateEffect`" for the out-of-band mode-toggle refresh. Dispatching a raw CM6 effect from
`main.ts` (application code, not a registered extension) has no path through Obsidian's
public `Editor` API — `EditorTransaction` exposes no `effects` field, and reaching into
`(editor as any).cm.dispatch()` is exactly the private-API surface this project's own
research already flags to avoid outside registered extensions
([03-obsidian-api-feasibility.md](03-obsidian-api-feasibility.md)). Used per-instance state
comparison instead (`ViewPlugin`/`StateField` each remember the outline-mode flag they last
saw and compare on every transaction — cheap, since it's just a boolean read, not a
reparse): functionally identical gate (`docChanged || viewportChanged || mode-just-toggled`),
zero private API. `main.ts`'s existing cursor-nudge dispatch (already public-API, unchanged)
still supplies the transaction that gives the comparison a chance to run.

**Code cost**: ~35 lines added to `decorate.ts` (`computeGuides`, a second tree walk),
~140-line addition to `decorations.ts` (a hand-rolled, debounced `ViewPlugin` reusing
`@codemirror/view`'s own exported `RectangleMarker` as a positioned-div factory, not CM6's
higher-level `layer()` helper — see the in-code rationale for why), ~20-line `styles.css`.

**Bugs found and fixed** (all three caught only by real e2e rendering/measurement — the
*pure* `computeGuides` unit tests were correct throughout; every bug was in the CM6
coordinate-system plumbing, exactly the kind of thing the postmortem warned unit tests
can't see):

1. **Guides rendered ~76px too high, caught by an e2e rect assertion, root-caused via live
   DOM diagnostics.** `view.lineBlockAt(pos).top/.bottom` are relative to `view.documentTop`
   (itself viewport-relative, moves with scroll) — not to the guide layer's own container
   origin (`scrollDOM`'s top-left, where the container's `top: 0; left: 0` anchors it). The
   two differ by a real, non-zero, confirmed-live constant (`.cm-content`'s own offset within
   the scroller). Fixed by converting through `documentTop` the same way `coordsAtPos`'s
   result already gets converted through a `getBase()`-style subtraction for the x-axis —
   the asymmetry (only x was being converted, not y) is what let this slip through code
   review.
2. **A list item's guide anchored ~12px right of its own bullet, caught by an e2e rect
   assertion against `.cm-formatting-list`.** `coordsAtPos(pos, 1)` ("after"-biased) at a
   line's very first position returns the *far* edge of the first character — past the
   bullet glyph, not at its start. `coordsAtPos(pos, -1)` ("before"-biased) gives the
   character's own left edge, matching the bullet's true rendered start.
3. **A doubly-nested list item's guide anchored a full level too far left, caught by the
   same assertion at a deeper fixture level.** A nested list item's raw source line *starts
   with its own indentation whitespace* (`"  - nested item"`); Obsidian visually collapses
   that leading whitespace via its native indent mechanism rather than rendering it at
   normal character width, so `coordsAtPos` at the raw line's first position (a space)
   lands at the *parent* list level's column, not the marker's. Fixed by skipping past
   `text.length - text.trimStart().length` characters before measuring — general, not
   list-item-specific (a no-op for headings/paragraphs, which have no leading whitespace).

All three were "invisible" in a full-page screenshot glance (subtle 1px, low-opacity lines)
and only surfaced by comparing exact measured coordinates — directly reinforcing the
postmortem's central lesson (DOM assertions test that code ran; here, pixel-level rect
assertions were what actually caught bugs a screenshot glance and a passing unit-test suite
both missed). A closer crop of one screenshot region did independently confirm the fix
visually once the coordinates were right.

**Multi-line continuation (the case never even attempted last time)**: confirmed via e2e
that `lineBlockAt`'s block-level `.top`/`.bottom` correctly span a Shift+Enter-continued
node's full rendered height "for free," for both a paragraph and a list item — no special
handling needed once the coordinate-conversion bugs above were fixed.

## Results — Experiment 2b: guides via CSS stacked-gradient

**Verdict: keep.** Branched off Experiment 1 (`experiment/decorations-2b-guides-css-gradient`).
All 8 corpus fixtures plus 4 real vault notes screenshotted, both themes, plus computed-style
assertions on the actual rendered `::before` pseudo-element (not just the raw custom property
we set) — see [e2e/specs/51-guides-gradient.e2e.ts](../../e2e/specs/51-guides-gradient.e2e.ts),
46/46 e2e tests green across the full suite. `computeLineGuides` (a new, single-pass function
in `decorate.ts`) gives every line the ascending tree depths of its strict, non-list-item
ancestors that "own" a guide (same list-item-ancestor exclusion as 2a, same real-vault
reasoning); `decorations.ts` turns that into one `--to-guides` custom property per line — a
comma-joined list of `repeating-linear-gradient(...)` layers, one per active depth — merged
into the same `Decoration.line` that already carries `--to-depth`, consumed by a single
`::before` (`@replit/codemirror-indentation-markers`'s technique, per the plan). Guides render
correctly through every kind — block, atom, list item, and (after one native-CSS override)
widget-replaced atoms, tables included after a later fix (see the "second round of real-vault
review" below) — confirmed live by a human using the actual table scrollbar in a real running
vault, no defects found.

**A first pass concluded margin-shifted lines (atoms/list items) could never render a guide at
all — this was wrong, caught by the user pushing back rather than accepting the claim, and
corrected by actually testing it instead of reasoning from the box model alone.** Recorded here
in full because the correction process is as load-bearing as the result — this is exactly the
kind of unverified claim the original postmortem's whole point was to stop shipping:

1. **The wrong claim**: a `::before` pseudo's background is clipped to its own box, and since
   `margin-left` (used for atoms/list items, Experiment 1's own fix for the padding-doesn't-
   move-the-box bug) shifts that box rightward, no `background-position` could reach a
   shallower ancestor's column — concluded "confirmed structural limitation" and shipped with
   e2e tests asserting the *absence* of a guide on those lines.
2. **The user's challenge**: after seeing the shipped result (guides missing on list/atom
   lines and gapping through real content), asked directly whether this was really a
   limitation of the technique or an implementation gap — refusing to accept the prior
   "confirmed" framing at face value.
3. **What was actually wrong**: a pseudo-element's own box does *not* have to match its
   containing block's dimensions — `left`/`right` can widen it arbitrarily, including
   leftward past where the line's own (shifted) box starts. Confirmed live: widening the
   pseudo by exactly `--to-own-shift` (the line's own margin-left, fully known — `depth * unit`
   for atoms, `supplementalDepth * unit` for list items, since Obsidian's native list hang uses
   `padding-left`/`text-indent`, neither of which move the box either) correctly renders the
   guide at the right global column, on both atom and list-item lines, confirmed by screenshot
   and by measuring `getBoundingClientRect()` on a list line (its box's own left edge exactly
   matched its `margin-left`, despite nonzero native `padding-left`/`text-indent` also being
   present — neither moves the box, only `margin` does).
4. **A second, real (narrower) obstacle, found only on widget-replaced atoms**: table/callout/
   hr/html still showed nothing, even with the same fix. Bisecting a probe `::before` at
   several `left` offsets (fully visible at `left: 0`, invisible at any negative offset)
   pointed at clipping, not a stacking/z-index issue. The actual cause: Obsidian's own
   `app.css` sets `contain: paint !important` on `.cm-content > [contenteditable="false"]`
   (all four widget kinds) — paint containment clips *all* descendant painting to the
   element's own box regardless of `overflow`, a mechanism the postmortem's own
   padding/margin cascade lesson doesn't cover. The exact same "matching beats escalating"
   fix applied: a 2-class override lost on specificity until it matched Obsidian's own
   3-selector chain, confirmed by checking which stylesheet rule actually won
   (`document.styleSheets` inspection, not guesswork).
5. **Table specifically needed one more fix, for a different and legitimate reason**: it
   *also* carries its own `overflow-x: auto` (for horizontal scroll on wide tables — a real
   feature, confirmed via computed style) on the same element the `contain` fix targets.
   Overriding `contain` alone doesn't surface a guide there; naively also forcing
   `overflow: visible` was first assumed unsafe, then confirmed unsafe by actually trying it
   (see the "second round of real-vault review" below for the full account) — but a working
   fix was then found (decoupling the guide's own box from the table's internal scroll
   container) and confirmed live by a human using the real scrollbar, no defects found.

**Contrast with Experiment 2a**: 2a's overlay `<div>`s paint in a layer entirely outside
`.cm-content`, so a per-line box shift never mattered to it in the first place — this is a
real, structural difference in how the two techniques handle the "atom/list box is shifted"
case, it just isn't the *all-or-nothing* difference the first pass concluded. 2b needed a
couple of extra, narrow CSS overrides (matching Obsidian's own `contain: paint` selector, and
decoupling the table's scroll container — see below) that 2a never needed; 2a needed the full
pixel-measurement machinery that 2b never needed. Both techniques now handle every corpus
fixture correctly, tables included — 2a never had an equivalent gap to begin with, since its
overlay doesn't care what's inside `.cm-content` at all.

**What works unconditionally, verified via the exact fixtures 2a used**: bridging through
every kind (block, atom, list item), and multi-line (Shift+Enter) continuation "for free" with
*no* special code — a structural side effect of this project's line model (every physical
source line is its own CM6 `.cm-line` with its own independent `Decoration.line`, not a single
logical block CM6 soft-wraps), so `computeLineGuides` just assigns the same `guideDepths` to a
node's continuation lines as its first line. This contrasts with 2a, which needed a dedicated
two-pass span computation (`computeGuides`) plus `lineBlockAt`'s block-level top/bottom
specifically to get multi-line coverage right.

**No padding/margin-style cascade fight on the base mechanism**: `position: relative`/
`background` on `.cm-line.to-decor-guides` resolve exactly as set with no `!important` needed —
confirmed via `getComputedStyle`, both in e2e and by eye in the real vault. The *additional*
`contain: paint` fight on widget atoms (point 4 above) is a genuinely different mechanism this
initial verification pass didn't anticipate, caught only by the user's follow-up push and a
live bisection test, not by the original "confirm rather than assume" pass — a reminder that
"confirm" needs to mean actually trying the failing case, not just reasoning about why it
should fail.

**Code cost**: ~55 lines added to `decorate.ts` (`computeLineGuides`, a single-pass tree walk —
no two-pass span bookkeeping needed, since a per-line fact only needs "which ancestors are
active *here*," not any node's full subtree extent), ~75-line addition to `decorations.ts` (a
pure function building the gradient string, folded into the existing `lineDecoration`/
`computeDecorations`, plus extending the existing `AtomWidgetMargins` ViewPlugin to also set
the same guide custom properties directly on widget DOM — no new `ViewPlugin`, no debounce, no
`StateEffect`/mode-toggle bookkeeping, since it rides the exact same `StateField` Experiment 1
already recomputes on every transaction), ~65-line `styles.css` (including the `contain`
override and its extensive justification comment). Meaningfully smaller and simpler than 2a's
~35+~140+~20 lines, and with a materially smaller surface for coordinate-system bugs — 2b has
none of the `coordsAtPos`/`lineBlockAt`/scroll-origin conversion code that produced all three
of 2a's real bugs, because it does no pixel measurement at all. Its own bugs were entirely in
a different category: cascade/specificity and CSS-containment fights, not coordinate math.

**Bottom line for the head-to-head**: both techniques cover the corpus *completely* — every
kind, every gap line, tables included. Tables were, for a while, believed to be 2b's one
deliberate, structural gap (a trade against breaking real horizontal-scroll functionality) —
see finding #4 below for the full account of how that conclusion was revisited and a fix found
(decoupling the guide's own box from the table's internal scroll container via Obsidian's
existing `.table-wrapper` element), confirmed live by a human using the real scrollbar with no
defects found. 2b reaches full parity with 2a at the cost of two small, narrow, well-understood
CSS overrides (`contain: none`, and `.table-wrapper`'s `overflow-x: auto`) that 2a doesn't need.
2b is simpler, has zero pixel-measurement code, and rides the existing StateField with no new
ViewPlugin/debounce machinery. Given equivalent capability, 2b's smaller code size and simpler
mental model (no coordinate systems, no scroll calibration) make it the preferable technique
going forward — though the two are close enough that either would be a reasonable choice, and
2a's overlay approach remains proven and viable too.

**Second round of real-vault review found four more real issues.** Every one was caught only
because the user pushed on a specific rendering detail rather than accepting a screenshot
glance or a DOM-level "looks correct" check — directly reinforcing the original postmortem's
central lesson a second time, on a technique that had already been through one round of
"confirm rather than assume" and still had these left:

1. **Blockquotes: the native colored bar was being silently deleted, not just misaligned.**
   Reported as "the colored side-line stays at the leftmost position while the text indents
   correctly" — investigation found Obsidian implements a blockquote's own left bar via a
   native `::before` (`border-left`, confirmed via computed style with outline mode off). The
   guide rule also used `::before` on the same element — not a doubling, a full replacement (an
   element has exactly one `::before`), so activating a guide on a blockquote line silently
   deleted its native bar entirely; what the user saw was almost certainly the guide itself
   rendered where the (now-vanished) native bar used to be, not the native bar surviving.
   Confirmed `::after` is unused (`content: none`) by every kind this touches, including all
   four widget kinds, before switching the guide mechanism to it — now both the native bar and
   the guide render simultaneously, confirmed live. **Status: fixed, e2e-covered.**

2. **Community themes (and, in principle, any wide-enough viewport) broke indentation
   entirely for margin-based lines — atoms and list items rendered to the LEFT of a same-level
   or shallower heading.** Root cause: Obsidian's own "readable line width" feature centers
   `.cm-line` content via a `margin-inline: auto`-driven rule applied to literally any `<div>`
   child of `.cm-content` (not theme-specific — the same rule exists in the bundled themes too,
   it just so happened to resolve near 0px at the viewport size used for earlier verification,
   masking it). This rule's *specified* value is the literal keyword `auto`, not a length —
   `--content-margin`'s own computed value is the string `"auto"` — so it can't be referenced
   in a `calc()` expression the way `contain`'s culprit rule could be matched by specificity.
   The margin-left rules for atoms/lists were *replacing* this native centering base instead of
   adding to it. Fixed by extending the existing widget-margin ViewPlugin (renamed
   `MarginCompensation`) to also patch plain `.cm-line` atoms/lists: read the native base live
   from an undecorated reference line (impossible from a StateField, which has no rendered DOM
   to measure — only a ViewPlugin, running after render, can), then combine
   `nativeBase + ownContribution` as one inline `!important` override. Verified the guide's own
   `--to-own-shift` calc needed NO changes: the native base is uniform across every line
   (decorated or not), so it cancels out of the *difference* between any two lines' columns,
   which is all the guide positioning ever needed. **Status: fixed, e2e-covered, confirmed live
   against the Minimal community theme by screenshot.**

3. **The guide visibly broke at every blank line between sibling blocks, AND right after any
   heading/paragraph with children (before its own first child).** A screenshot-glance miss (a
   1-line gap reads as "close enough") but a real, confirmed regression against 2a, whose overlay
   is one continuous rectangle per guide and covers gaps between siblings for free. Root cause:
   `computeLineGuides` had no fact at all for blank `trailingGap` lines, so the per-line mechanism
   drew nothing there. Fixed in `computeLineGuides` in two stages: first, a LEAF node's own
   trailing gap (before the next sibling, at that leaf's own level) got a fact carrying the same
   `guideDepths` as its own content. That alone was shipped with the "before first child" case
   *deliberately* left uncovered, reasoning it matched Experiment 2a's own span (which also
   starts at the first child's own line) — but the user's continued real-vault review found this
   read as a real, visible break too, not acceptable parity, so it was covered in a second pass:
   a node WITH children's own trailing gap now uses `childGuideDepths` (the same depths its first
   child gets), since that gap is already "inside" the node's own subtree. This made
   `computeLineGuides`'s output a strict superset of `decorate()`'s line coverage instead of a 1:1
   zip target, so `decorations.ts` switched from index-zipping the two arrays to keying both by
   line number. **Status: fixed (fully, both cases), e2e-covered — a genuine improvement over 2a's
   own behavior in this respect, not mere parity with it.**

4. **Tables: guide visibility vs. the table's own horizontal scroll, resolved through several
   rounds of "confirm rather than assume" that each corrected the previous round.** This finding
   evolved more than the other three and is recorded in full because the *process* is the
   reusable lesson:
   - **First pass** concluded this was a permanent, structural 2b-vs-2a difference: 2a's overlay
     lives entirely outside `.cm-content`, so a table's own internal horizontal scroll can't
     affect it (confirmed by literally scrolling a wide table under 2a and re-measuring its
     overlay's rect — byte-identical). 2b's guide is a pseudo-element *inside* the table widget's
     own box, so it's unavoidably subject to whatever clips or scrolls that box — table's own
     `overflow-x: auto` (for horizontal scroll of wide tables) clips the guide's leftward-widened
     `::after` exactly like `contain: paint` did, and overriding `overflow` to `visible` naively
     was assumed unsafe.
   - **User asked for the naive override to be tried live, not just reasoned about.** It was: a
     15-column, genuinely-unwrappable-content table (`scrollWidth` 3075px vs `clientWidth` 708px)
     with `overflow: visible !important` forced showed the predicted regression for real — table
     content spilled off the visible pane with no scrollbar, `scrollLeft` became inert (stuck at
     0, confirmed via script), and the WHOLE document became horizontally scrollable instead of
     just the table (nothing else up the ancestor chain clips it either). Confirmed unsafe, not
     just theorized.
   - **Investigating *why* it cascades (not just accepting the regression) found a real fix**:
     Obsidian's table widget conveniently already wraps the actual `<table>` (plus its add-row/
     add-column buttons) in an inner `.table-wrapper` div, distinct from the outer element the
     `contain`/`overflow` rules target. Moving `overflow-x: auto` onto `.table-wrapper` instead —
     while leaving the OUTER element `overflow: visible` — decouples the two concerns onto two
     different boxes: the outer no longer has anything to clip (confirmed: its own `scrollWidth`
     now equals its `clientWidth`, since its only child now scrolls internally instead of
     overflowing it), so the guide's leftward bleed is unobstructed, while `.table-wrapper`
     independently owns the actual wide-content scrolling.
   - **A real self-inflicted regression during write-up**: when transcribing this fix from a
     scratch/probe `<style>` tag into the actual `styles.css`, the outer element's own
     `overflow: visible !important` was dropped — reasoning (wrongly, without re-testing) that
     the new `.table-wrapper` rule would be sufficient alone. It is not: both are needed
     simultaneously (outer visible so the guide isn't clipped by *it*; wrapper auto so the real
     content still scrolls, contained). The probe had "worked" only because it was layered on
     top of a styles.css that *still* had the outer override from an earlier step — dropped when
     consolidating. Caught only because the user tried the rebuilt plugin in their own real
     Obsidian instance and reported the guide had disappeared, then asked for it to be
     double-checked rather than accepting a re-assurance — the exact same discipline that caught
     every other finding in this document, now catching a regression in the fix-verification
     process itself.
   - **Status: CONFIRMED.** Both rules are present and correct in `styles.css`, confirmed via
     computed style that both conditions hold simultaneously (outer `overflow-x: visible` and no
     longer overflowing itself; wrapper `overflow-x: auto` and still overflowing, i.e.
     scrollable; guide's `::after` background resolved and non-none) — AND confirmed by the user
     actually using the table's scrollbar (trackpad/click-drag) with the rebuilt plugin in their
     own real Obsidian instance: "it actually works... I don't see any notable defects or UX
     issues." This closes the last remaining gap in the whole guide feature: every kind, every
     gap line, and tables, all fully continuous, with 2b needing only two small, well-understood,
     narrowly-scoped CSS overrides (`contain: none`, and `.table-wrapper`'s `overflow-x: auto`)
     beyond the base mechanism — full parity with 2a's coverage, at meaningfully lower code cost
     and zero pixel measurement.

All four were verified live (computed style, rect measurements, a bisection test, or a real
human trying the rebuilt plugin), not assumed from reasoning alone — the SAME discipline the
postmortem asked for, applied repeatedly, including to catch a mistake made while applying it.
Full e2e suite (unit + e2e) re-verified green after each fix; see
[e2e/specs/51-guides-gradient.e2e.ts](../../e2e/specs/51-guides-gradient.e2e.ts) for the
blockquote-coexistence, margin-compensation, gap-continuity, and table (computed-style side of
the fix) regression tests. The human-scrollbar-interaction side is, by nature, not something an
automated e2e assertion can fully substitute for — the computed-style test is a floor, not a
replacement for a periodic real-vault spot check if this area is touched again later.
