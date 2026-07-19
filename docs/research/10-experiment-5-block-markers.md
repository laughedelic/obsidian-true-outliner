# Experiment 5: per-kind block markers — 5a vs. 5b head to head (2026-07-16 → 2026-07-19)

Part of the decoration-experiments series — see the
[hub](07-decoration-experiments-plan.md) for ground rules, fixture corpus, and the overall
results table. Proposed after [Experiment 2b](09-experiment-2-guide-lines.md) was kept:
not a revival of the deprioritized Experiment 3 (a legibility fallback), but a richer
visual system on top of 2b's guides. Both variants were built in parallel, in separate
worktrees/sessions, against the same corpus. **5a won the head-to-head** — see the
comparison and verdict section below, which also carries the hardening checklist for
taking 5a to production. Cross-experiment lessons:
[11-decoration-lessons.md](11-decoration-lessons.md).

## Design (from the plan)

Proposed after 2b was confirmed kept: not a revival of Experiment 3 (which was a
fallback for a legibility gap that turned out not to exist), but a richer visual
system — a distinct marker symbol per kind (heading, paragraph, code, table, callout,
quote, html, hr), now that 2b's guides give a stable, already-debugged foundation to
build markers on top of. Gets a fresh number rather than reusing 3, since 3's own
verdict is already recorded and settled. Build **both** below against the same corpus
and compare, same head-to-head discipline as Experiment 2 — don't pick a favorite in
advance.

List items are excluded from markers entirely on both variants, for the same reason
guides already exclude list-item ancestors (see Experiment 2a's non-obvious findings
below): the native bullet/number already does this job.

**Shared prerequisite, added independently on each branch** (trivial, and NOT itself
part of either technique being compared — analogous to the shared fixture corpus, not
to the guide-computation code 2a/2b each built separately): `LineDecorationFact`
(`decorate.ts`) doesn't carry node kind today, only structural buckets
(`isAtom`/`isListItem`/else) — add a `kind: NodeKind` field, populated straight from
`node.kind` in the existing walk. No new tree walk or pure function needed at all:
`isFirstLine` (already present) is exactly the right gate for "does this line get a
marker" — simpler than either 2a's or 2b's own guide computation, both of which needed
a second pass. Also: promote the one-off plain-blockquote fixture (`quote` kind,
currently only inline in `51-guides-gradient.e2e.ts` as `decorations-guide-
blockquote.md`, never in the shared `ALL_DECORATION_FIXTURES` corpus) into
`e2e/fixtures/decorations.ts` proper — it's the one kind of the eight that ground rule
#2's "screenshot everything, every time" has never actually covered.

**A real constraint, not a preference, is why the two variants use genuinely different
mechanisms rather than two flavors of the same trick**: CSS gives each line exactly two
pseudo-elements, and both are already spoken for. Native blockquote uses `::before` for
its colored bar (confirmed in Experiment 2b; callout likely too, given how visually
similar its own bar is, but not yet confirmed live — don't assume). 2b's guides already
use `::after`. Neither variant can claim a third pseudo-element that doesn't exist.

### 5a — icon markers, via a new DOM-element mechanism

Small, fixed-size (rem/px, **never `em`** — the exact historical marker-size bug class
from the postmortem: `font-size` resolving against the wrong line's context) SVG icon
per kind, built via DOM APIs directly (no data-URI encoding needed) — one distinct,
self-drawn mark per eligible kind. Not a final design; exact icon shapes get tuned by
eye during real-vault review, like every other visual call in this project.

**Mechanism**: plain `.cm-line`s (heading/paragraph/code/quote) get a CM6
`Decoration.widget` (`side: -1`) whose `toDOM()` returns a `position: absolute` element
— deliberately out of flow, so it can't push text or trigger the `.cm-widgetBuffer`
line-wrap risk Experiment 4 flagged (that risk was specifically about *in-flow* spacer
widgets). Widget-replaced atoms (table/callout/html/hr) extend the existing
`MarginCompensation` `ViewPlugin`, which already walks these elements post-render via
`docViewUpdate` and patches them directly, to also inject/update a small marker child
element — the same proven escape hatch already used for `margin-left`, now attaching a
real node instead of just an inline style. `pointer-events: none` throughout, matching
the guide's own `::after`.

Positioning needs to be *verified live*, not reasoned from the box model:
`padding-left` lines (heading/paragraph) need the marker inside the reserved padding
gutter (a negative offset back toward the box's own left edge); `margin-left` lines
(atoms) already have their box shifted, so the marker sits near the box's own edge
instead. Confirm via `getBoundingClientRect()` against a reference point (e.g. a
same-depth list item's own native bullet) — this project has been burned before by
trusting box-model reasoning over live measurement (2b's own `::after`-widening
finding).

**What would kill it**: if an out-of-flow `Decoration.widget` still trips the
`.cm-widgetBuffer` gotcha in some way that matters even without pushing text: go in
expecting this might need real investigation, same posture Experiment 4 took toward the
identical CM6 mechanism.

**Success criteria**: every eligible kind's marker renders on the node's true first
line only (via `isFirstLine`) — never repeated on continuation lines, never on
trailing-gap lines. No stacking/paint-order conflict with the guide's `::after` or
native `::before`. Unaffected by `contain: paint` on widget atoms (a prepended child
sits inside the box, unlike the guide's deliberately-widened pseudo).

### 5b — CSS-shape markers, reusing 2b's existing background-layer mechanism

Small fixed-px CSS-gradient-drawn geometric marks — filled dot, hollow ring, filled
square, diamond (`conic-gradient`), plus-sign (layered `linear-gradient`s), short
bar/tick, wedge, cross — one shape+color combination per kind. Zero new
pseudo-element, zero new DOM, zero new `ViewPlugin`.

**Mechanism**: one more compound background-layer string per kind (self-contained
`background-position`/`background-size`/`no-repeat`, same pattern `guideLayer()`
already uses), exposed as a new `--to-marker` custom property — kept as an independent
function from the guide layers in the TS code, but painted via the *same* `::after` by
changing the CSS rule's `background` shorthand to `background: var(--to-marker,
none), var(--to-guides, none);`. Positioned via the exact same `--to-own-shift`
compensation already proven for guides — no new coordinate math.

**Real integration wrinkle, not just an additive change**: today the `to-decor-guides`
class — which gates `position: relative` plus the whole `::after` rule — is applied
only when `guide.guideDepths.length > 0`. Markers need to appear even on a depth-0
heading with zero ancestors (no guide at all today), so the gate becomes
`guideDepths.length > 0 || hasMarker`. This touches shared, working, already-well-
tested code (`lineDecoration()`, used by both the plain-line `StateField` and the
widget-atom `MarginCompensation` loop) — change it carefully. `gapLineDecoration`
(blank trailing-gap lines) must stay explicitly marker-free, since gap lines carry no
`decorate()` fact or node kind at all.

**Success criteria**: same as 5a's, achieved with zero new rendering mechanism.

### Compare on

Visual legibility/distinctiveness of the 8 marks at a glance — the actual question
this head-to-head exists to answer, not a secondary concern. Code size/complexity/new-
mechanism risk (5b reuses proven plumbing entirely; 5a introduces a new DOM/widget
mechanism with its own unverified risk, similar in kind to Experiment 4's).
Robustness across the full corpus, multi-line continuation, and widget atoms.
Cascade/paint safety. Record the result in the comparison table below before picking
one (or keeping both, if the answer turns out to be "different marks for different
kinds").

## Results — Experiment 5a: icon markers (DOM-element mechanism)

**Status: done, corpus + real-vault coverage confirmed.** Shared prerequisite added
first: `kind: NodeKind` on `LineDecorationFact` (`decorate.ts`), plus a unit test
confirming it at every line including list-item continuations
([tests/decorate.test.ts](../../tests/decorate.test.ts)); the plain-blockquote
fixture promoted into `ALL_DECORATION_FIXTURES` as `quote`
([e2e/fixtures/decorations.ts](../../e2e/fixtures/decorations.ts)), so the full
8-kind set is now covered by the shared "screenshot everything" loop.

**Mechanism, as planned**: a small, distinct, self-drawn SVG icon per kind (heading
"H", paragraph text-lines, code `</>`, table grid, callout alert-circle, quote
opening-marks, html tag-with-fold, hr bar), built via DOM APIs (`createElementNS` +
attribute setting), never a data-URI. Two delivery mechanisms, split the same way
indentation/guides already are: a CM6 `Decoration.widget` (`side: -1`,
`position: absolute`, out of flow) in a **separate StateField** from the existing
line-decoration one (sidesteps any need to reason about `Decoration.line`/
`Decoration.widget` ordering at equal positions — CM6 merges multiple StateFields'
decorations correctly on its own) for plain lines (heading/paragraph/code/quote);
a direct DOM child injected by the existing `MarginCompensation` `ViewPlugin` for
widget-replaced atoms (table/callout/html/hr), the same proven escape hatch already
used for their `margin-left` (a CM6 decoration has zero effect on these, confirmed
by Experiment 1/2b).

**A real design decision beyond the handoff prompt's literal wording**: the prompt
didn't specify how much extra space a marker needs vs. the *existing* depth-based
indentation. Reusing the existing gutter (marker inside already-reserved padding)
doesn't work at depth 0 — flat/top-level nodes have zero padding, so there's no
gutter to draw into, yet the whole point of Experiment 5 is a marker on every
eligible kind at every depth, depth 0 included. Resolved by reserving a **new,
small, fixed (`rem`, never `em`) `--to-marker-gutter` additively on top of the
existing depth formula**, for every non-list-item line (continuation lines
included, so text stays aligned across a whole multi-line node, not just its own
first line) — list items reserve nothing (no marker, native bullet/number
untouched). This makes the marker's absolute column agree exactly between the two
mechanisms: block lines (padding-left, box not shifted) place the icon at
`left: depth * unit` (the start of the new gutter); atom lines — both plain
(margin-left) and widget-replaced — place it at `left: -gutter` relative to their
own (already gutter-shifted) box, landing at the identical global column. Verified
live via rect/computed-style assertions, not reasoned from the box model alone (see
`e2e/specs/52-block-markers-icons.e2e.ts`).

**Two real integration risks found and fixed, both by extending existing,
already-hardened machinery rather than reasoning from scratch**:

1. `contain: paint` (Obsidian's own containment hint on widget-replaced atoms,
   already fought once for guides) also clips a real DOM child positioned outside
   its own box — not just a pseudo-element background. The existing override was
   gated on `.to-decor-guides` (only present when an ancestor owns a guide), but a
   marker is present on **every** widget atom, guide or not — a depth-0 table with
   no ancestor would have had its marker silently clipped. Fixed by widening the
   gate to `.to-decor-guides, .to-decor-marker`, and adding a regression test
   specifically for the no-ancestor case
   (`no !important/specificity or contain:paint regression: a depth-0 table...`).
2. The guide's own `--to-own-shift` compensation (2b) had to grow to include the
   new marker gutter for atom lines (both plain and widget-replaced), since their
   own box is now shifted right by `depth * unit + gutter`, not just `depth * unit`
   — otherwise a guide on a marker-bearing atom line would land one gutter-width
   short of the correct ancestor column. Block lines needed no change (padding
   never shifts the box, so their own-shift stays 0 regardless of the gutter).

**Full test suite** (`npm test` + `npm run test:e2e`, 8 e2e spec files, 44 tests)
green after the change, including two **pre-existing** Experiment 1/2b tests that
needed deliberate updates (not silently patched to match, per the postmortem's own
warning about that failure mode) because the underlying behavior legitimately
changed: a depth-0 heading's `padding-left` is no longer `0px` (now the marker
gutter, since every non-list block reserves one even at depth 0), and a same-depth
list item vs. code fence no longer land at the same column (the code fence, an
atom, reserves a marker gutter; the list item, excluded from markers, doesn't) —
both changes are documented inline at the updated assertions with the reasoning
above.

**Real-vault-equivalent pass**: `npm run vault:install` succeeded (symlinks in
place, plugin bundle built via `build:plugin`, not just type-checked). This
environment has no interactive access to the author's own Obsidian instance, so the
closest available check — the same one prior experiments on this project used as
their "real (non-synthetic) vault notes" proxy — is screenshotting the bundled
`test-vault`'s own real journal/notes/README content (not the synthetic fixture
corpus) through the e2e harness, both themes. Reviewed by eye:
multi-line-wrapped paragraphs get exactly one marker on their true first line
(never repeated on wrapped continuation rows); a callout with mixed checkbox
siblings, wikilinks, and a table all render correctly together with no clipping,
overlap, or stacking conflict; dark theme unaffected. A genuine pass by the
author's own hand against their personal vault is still the stronger bar the
postmortem asks for and hasn't happened yet for this specific branch.

**Code cost**: ~180 lines added to `decorations.ts` (icon builder switch + 8 SVG
shapes, `MarkerWidget`, `computeMarkers`, widget-atom marker injection/cleanup
helpers), ~35 lines in `styles.css` (gutter reservation + `position: relative` +
extended `contain`/`overflow` override gate), ~10 lines in `decorate.ts` (the
shared `kind` field prerequisite).

**Follow-up round 1: fold-indicator/marker crowding, found in review.** A
heading's native collapse chevron (`.cm-fold-indicator .collapse-indicator`) is
inserted at essentially the same "line start" anchor the marker's own target
column is defined relative to — its default position overlapped the marker at
every heading level, and (unlike a list item, where the native chevron already
sits well left of the bullet) a heading's chevron rendered to the marker's
*right* instead, an inconsistent layout. Fixed by repositioning the chevron via
`transform: translateX(...)` to sit left of both the marker and (when present) a
shallower ancestor's own guide column. Two rounds of live correction went into
the fix: measuring against the WRAPPER (`.collapse-indicator`, 22px wide)
instead of the actual painted `<svg>` glyph (~10px, centered inside with ~6px of
invisible hit-area padding per side) made a fit look impossible at deeper
nesting, where an ancestor's own guide is also active on the same row — it
wasn't; the wrapper can't avoid both neighbors in the available space, but the
glyph comfortably can. Also needed testing against a genuinely nested fixture
(3 heading levels deep), not a flat 2-level one — the collision this guards
against only appears when a shallower ancestor's guide line is also active on
the same row. See `e2e/specs/52-block-markers-icons.e2e.ts`'s "native fold
chevron glyph sits between the marker and an ancestor's guide line, clear of
both."

**Follow-up round 2: marker placement — three variants explored, settled on
centered.** Post-review, tried three candidates for WHERE the icon sits
relative to the shared guide-line column, each wired as a real (temporary,
debug-only) plugin setting so they could be compared live against a real vault
without a rebuild per attempt: (A) icon's own left edge at the column; (B) icon
horizontally centered on the column; (C) no marker gutter reserved at all —
text stays at the exact no-marker column, and the icon's own right edge sits in
whatever whitespace already exists to the left (none at depth 0, by
construction). B read best in real-vault comparison and was kept permanently;
the setting itself (and A/C) were removed once the choice was made — unlike the
visibility setting below, placement was never meant to be a permanent, shipped
axis of configurability, just a way to compare candidates without a rebuild per
attempt.

**Follow-up round 3: leaf-node marker visibility — kept as a real, permanent
setting.** A review observation after living with 5a for a while: a marker reads
well as a crown on top of the guide line, indicating a BRANCH node's kind, but
adds comparatively little for a LEAF — most leaf atom kinds (code, table,
callout, quote, html, hr) already carry their own native visual style (a code
fence's background, a callout's colored bar, etc.), so a marker there can read
as pure distraction. Added `markerVisibility` (`'all'` / `'with-children'` /
`'headings-and-paragraphs'`) as a genuine, persisted, user-facing setting
(`mode-registry.ts`) — not a temporary debug toggle like the placement
exploration above, since which nodes get a marker at all turned out to be a
legitimate, ongoing matter of taste the original plan didn't anticipate needing
to stay configurable. `'with-children'` hides markers on any leaf, atoms
included (`hasChildren` is a new, pure `LineDecorationFact` field:
`node.children.length > 0`). `'headings-and-paragraphs'` instead keys off KIND,
not per-instance state: the only two kinds that can *ever* have children in
this tree model — atoms are leaves by construction, and list items are already
excluded from markers unconditionally — so `!fact.isAtom` exactly captures it.

A real, separate bug was found and fixed while wiring this setting's live-
refresh path: `computeMarkers`/`computeDecorations` both skip widget-replaced
atoms entirely (`MarginCompensation` owns their marker instead), so for a note
containing *only* widget atoms (e.g. a lone table), changing `markerVisibility`
produced byte-identical decoration output before and after — CM6 correctly saw
no diff and never re-fired `MarginCompensation`'s `docViewUpdate` hook, silently
failing to update the table's marker until the next full mode toggle. The
existing mode-toggle refresh (a plain cursor nudge) doesn't reliably reach a
ViewPlugin with no decorations of its own, for exactly this reason. Fixed by
having the setting's own setter toggle outline mode off then immediately back
on (via the registry directly, not the user-facing command) — guaranteeing two
genuinely different decoration outputs (none vs. the real thing) that CM6
always detects, reliably re-triggering `docViewUpdate` twice. This also
retroactively fixed the identical latent gap in the earlier placement setting
(round 2), which no test happened to exercise against a table-only note.

**Follow-up round 4: a genuine architectural bug, found via a flaky test —
decorations leaking into Obsidian's own nested per-cell editors.** While
verifying the visibility setting's e2e coverage, one specific test (visibility
`'headings-and-paragraphs'` against a table) failed intermittently — first
misdiagnosed as an async timing race in the table widget's own DOM settling (a
`browser.pause()` was gambling against however long that took) and "fixed"
with a poll-based wait instead of a fixed sleep, which is a legitimate,
permanent improvement in its own right (`waitForContentChildCount` in
`e2e/helpers.ts`, mirroring the existing `waitForNotice` pattern) but did *not*
fix the underlying test — it kept failing deterministically once actual
machine load (which had been intermittently masking/unmasking it across runs)
settled down enough to reproduce reliably.

Root-caused by tracing the stray marker element's full DOM ancestry: Obsidian
renders an actively-edited table cell (cursor inside it) as its own separate,
independent CM6 `EditorView`, mounted inside the outer table widget's own DOM
(`.cm-embed-block.cm-table-widget` → `.table-wrapper` → `<table>` → `<tr>` →
`<th>`/`<td>` → `.table-cell-wrapper` → a whole nested `.cm-editor`). This
plugin's `registerEditorExtension` (`main.ts`) applies its decorations to
*every* CM6 instance Obsidian creates app-wide — this nested one included — and
that nested editor's own "document" is just the cell's raw text (e.g. a single
word), which `decorate()`/`parse()` classifies as a plain paragraph (the
default block kind for a bare line with no special syntax) — not an atom, so
under `'all'`/`'headings-and-paragraphs'` visibility it becomes marker-eligible
and picks up both a stray marker icon *and* depth-based padding/margin exactly
like a real top-level line, visibly corrupting the cell being edited. This is a
real, live, user-facing bug, not just a test artifact — confirmed independently
by the author noticing it in their own use before this was reported back.

The state-only "is this note in outline mode" gate (`editorInfoField`, already
used throughout `decorations.ts` as a reliable gate everywhere else) cannot
distinguish the nested editor from the real top-level one — confirmed live via
`EditorView.findFromDOM()` on the nested instance that its own `editorInfoField`
resolves to the exact *same* outer `MarkdownView` object as the real note. Only
DOM ancestry can tell them apart: a real top-level note's own `.cm-editor` is
never itself nested inside a `.cm-embed-block` (those are its own descendants,
never its ancestors). Since `StateField.create`/`update` have no view/DOM
access at all, fixing this required moving both decoration `StateField`s
(`computeDecorations`/`computeMarkers`) to `ViewPlugin`s (which do have
`view.dom`), gating each — and `MarginCompensation`, already a ViewPlugin — on
a shared `isNestedEditor(view)` check (`view.dom.closest('.cm-embed-block') !==
null`). Confirmed fixed via the same DOM-ancestry trace, and via two
consecutive clean e2e runs of the affected test (previously flaky, now
deterministic) plus the full 8-spec-file suite (58 tests) twice with no
regressions.

**Code cost of rounds 2-4 combined**: ~20 lines in `decorate.ts`
(`hasChildren`), ~15 lines in `mode-registry.ts` (`MarkerVisibility` type +
setting), ~15 lines in `main.ts` (setter + the off/on `forceRedraw` toggle +
settings dropdown), net ~+85 lines in `decorations.ts` after removing the
placement-variant machinery (round 2) and adding the nested-editor guard (round
4: two new small `ViewPlugin` wrapper classes replacing two `StateField`s, plus
`isNestedEditor`/`shouldShowMarker`).

## Results — Experiment 5b: CSS-shape markers (background-layer mechanism)

**Verdict: keep**, pending the head-to-head against 5a. Branched off
`experiment/decorations-2b-guides-css-gradient`. All 9 corpus fixtures (the shared 8, plus
a `quote`-kind fixture promoted into `ALL_DECORATION_FIXTURES` per this experiment's own
shared prerequisite) screenshotted, both bundled themes, plus targeted computed-style
assertions on the resolved `::after` background-image — see
`e2e/specs/52-block-markers-shapes.e2e.ts` (on the closed 5b branch
`claude/decorations-block-markers-595e13` — 5b's code never merged),
71/71 e2e tests green across the full suite (all 8 spec files, including a dedicated
"marker vertical position" sub-suite added after real-vault review — see bug 5 below,
two pixel-exact guide/marker-alignment tests, and a fold-chevron-clearance sub-suite —
see the follow-ups below), plus 127/127 unit tests (`npm test`), including new
`decorate: kind`/`headingGuideDepths` tests. Confirmed live
on 4 real vault notes (headings, paragraphs, lists, checkboxes, wikilinks, a code block, a
callout, a table) — no defects found; markers coexist cleanly with real content, including
multi-line paragraphs and wikilinks immediately after a marked line.

**Design pivoted once, after a live look at the first version.** The plan's own design
called for a distinct shape+color per eligible kind (8 marks: dot/ring/square/diamond/
plus/tick/wedge/cross across Obsidian's 8 accent colors) — built, screenshotted, and
initially judged reasonable from a distance. On closer real-content review our own
verdict was that the variety read as **cryptic, not helpful**: eight different shapes and
colors ask a reader to memorize a legend before the marks mean anything, which is the
opposite of legible. Replaced with a single, uniform, solid dot — same color as the guide
lines themselves (`var(--text-faint)`) — for every eligible kind. This is a real design
lesson worth carrying forward past this one experiment: for a piece of chrome whose whole
job is "signal that a node starts here," uniformity communicates that job better than
variety that has no established meaning yet. The per-kind shape system is described below
only for the record (what was tried and why it was reverted), not as the current design —
current code has exactly one shape.

**Mechanism (current)**: a single `radial-gradient` dot (`markerBackground()` in
`decorations.ts`), same color as guides, one call site for every eligible kind (heading/
paragraph/code/table/callout/quote/html/hr — everything except list-item, which needs no
marker check at all now: eligibility collapsed to "not a list item," full stop, since
every other `NodeKind` gets the identical mark). Exposed as a new `--to-marker` custom
property, painted through the *exact* same `::after` 2b's guides already use
(`background: var(--to-marker, none), var(--to-guides, none);`) — zero new
pseudo-element, zero new DOM, zero new `ViewPlugin`. Gap lines stay explicitly
marker-free (they carry no `decorate()` fact/kind at all — verified by a dedicated e2e
test).

**The real integration wrinkle, exactly as flagged going in**: `lineDecoration()`'s
`to-decor-guides` gate (driving `position: relative` and the whole `::after` rule) was
guide-only (`guideDepths.length > 0`); changed to `guideDepths.length > 0 || hasMarker` so
a depth-0 node with zero ancestors (e.g. a bare top-level heading, which has no guide of
its own today) still shows a marker — confirmed live and by a dedicated e2e test
(`getLinePseudoComputedStyle` reads a non-empty resolved background at depth 0). This
touches the shared `MarginCompensation` `ViewPlugin` too (for widget-rendered atoms:
table/callout/html/hr), which needed the identical gate change plus setting `--to-marker`
alongside its existing `--to-guides` handling.

**Bugs found and fixed** (all caught only by actually looking at a rendered screenshot,
not by any DOM/computed-style assertion — directly reinforcing this project's recurring
lesson that visual claims need an actual look, not box-model reasoning alone):

1. **Depth-0 markers were completely invisible, caught by zooming into a screenshot of
   the `mixed` fixture's top-level `"# Top"` heading.** The marker's `background-position`
   is deliberately negative at shallow depths (it sits `MARKER_GAP` left of the node's own
   indent column, which is column 0 at depth 0) — but a background can *never* paint
   outside its own element's box, regardless of what any ancestor's `overflow`/`contain`
   allows. This is a **stricter** rule than the one guides rely on: guides' own doc comment
   established that a pseudo's box can be *widened* via `left`/`right` to reach a shallower
   column, but a first pass here wrongly assumed the same finding covered a marker's own
   small negative position too, without the box actually being widened for it. Fixed by
   computing `markerShortfall(depth)` — `max(0px, MARKER_RESERVE − depth × unit)`, the same
   `max(0px, ...)` clamp idiom Experiment 1's own table-padding fix established — and
   folding it into `--to-own-shift` (which now activates whenever `ownShiftUnits > 0 ||
   marker`, not just for margin-shifted kinds) *and* into every guide layer's own position
   formula active on the same line (`guideLayer` gained an `extra` parameter), since the
   pseudo's local coordinate origin is one shared thing for the whole box — widening it for
   the marker's sake shifts everything else painted in that same box too. At this module's
   default sizes, only depth 0 actually needs the extra reach — confirmed live that every
   depth ≥ 1 marker rendered correctly even before this fix, which is exactly why the bug
   surfaced only on the flat/mixed fixtures' top-level nodes and not on any nested one.
2. **(Per-kind design, since reverted) The table's diamond mark rendered as a lopsided
   pinwheel**, caught by zooming into a screenshot of the `widget-atoms` fixture — the
   standard 4-gradient diamond recipe requires every quadrant's gradient to list
   `transparent 50%` before the color, consistently across all four; an earlier version
   flipped that order on two of the four quadrants, producing a shape with the wrong
   halves filled.
3. **(Per-kind design, since reverted) The callout's plus-sign rendered as a lopsided "⊥"**
   (vertical bar with the crossbar near its bottom, not its middle), caught by zooming into
   the same `widget-atoms` screenshot. Root cause: the vertical-centering formula used `%`,
   and `background-position`'s `%` component resolves relative to *that specific layer's
   own image size* subtracted from the box — which differed between the vertical bar (a
   full-height image) and the horizontal bar (a much thinner one), so the "same" `50%`
   position landed at two different absolute heights for the two layers making up one
   shape. Invisible on single-line plain `.cm-line`s (box height ≈ marker size, so the
   discrepancy was too small to notice) but glaring on a widget atom whose box spans its
   *entire* rendered height (a multi-line callout, not just its title line).
4. **Heading markers sat noticeably above the native fold chevron on H1–H5, and merely
   collided with it on H6 — reported directly from a real-vault look, not
   caught by any fixture or assertion.** The fix for bug 3 above replaced `%`-based
   vertical centering with a FIXED length from the box's own top, chosen to solve the
   widget-atom case — but a fixed length doesn't scale with a *heading's own* line-height,
   which varies by level (H1's line box is taller than H6's). Measured live, not guessed:
   `.cm-fold-indicator`'s own `getBoundingClientRect()` against its line's, for H1 through
   H6 in a real running Obsidian instance. Two findings: the chevron's own vertical
   *center* sits at a level-dependent ~67–70% down the line box (not a clean, reusable
   constant), but its **top** is a robust, level-independent constant — exactly 1rem below
   the line's own top at every level measured — because the chevron's position is fixed
   while only *its own icon size* (not its position) scales with the heading's font-size.
   First fix: gave heading lines specifically a measured fixed-top anchor (`1rem`, matching
   the chevron's own measured top). Confirmed live via screenshot — no longer "above" on
   any level — but this fix didn't survive the NEXT round of real-vault review (bug 5).
5. **The whole "one CSS formula per box-type" approach was still wrong — a full-suite
   real-vault review found FIVE distinct placement failures at once, all reported directly
   by manual review, none caught by any fixture/assertion.** Headings still sat above their own
   text (the bug-4 fixed-top anchor didn't move with a font-size-driven line-height
   *increase* the same way the chevron's OWN top didn't, but our own read of "middle
   of the heading text" wanted the TEXT's center, and a bare fixed length can't track a
   font-size it has no knowledge of at layout time); single-line paragraphs sat at their own
   top edge (the still-present double-`HALF`-subtraction bug from bug 3, never actually
   fixed for the plain-line case, only worked around for widget atoms); wrapped multi-row
   paragraphs/blockquotes centered on their ENTIRE wrapped height instead of just the first
   visual row; callouts and code blocks sat at the literal top of the whole block instead of
   near their own first content row. Root cause, named directly in review: **no CSS-only
   formula (percentage, fixed length, or any mix) can know where "the first rendered visual
   row of this specific box's content" actually is** — that's fundamentally a *rendering*
   fact, not a static layout constant, and every earlier fix in this area was really just a
   differently-shaped guess at it. Fixed by abandoning CSS-only positioning for `Y` entirely
   and measuring it live: `MarginCompensation` (already the established "StateField draws a
   default, ViewPlugin patches in the true live-read value" mechanism for `nativeMarginBasePx`
   and table-padding compensation) now computes a real per-line pixel offset via
   `document.createRange().selectNodeContents(lineEl); range.getClientRects()[0]` — the DOM's
   own notion of an element's first wrapped visual row, which handles word-wrap for free and
   scales with whatever font-size is actually in effect, no guessing required. Written to a
   new `--to-decor-marker-y` custom property; `markerBackground()` itself only ever emits a
   `var(--to-decor-marker-y, 50%)` reference (the `50%` fallback is now CORRECTLY centering,
   not double-subtracted, for the brief window before the ViewPlugin's own pass overrides
   it). Widget atoms get the same technique aimed at a kind-appropriate reference element
   instead of the widget's own root (a callout's `.callout-title`, a table's first `<tr>`;
   `hr` has no text content at all, so its own half-height stands in; `html`, arbitrary raw
   markup with no fixed structure, falls back to the same first-row Range technique applied
   to its own root). One deliberate, documented exception: a code fence's structural first
   `.cm-line` is the OPENING marker row (confirmed live to be a REAL, normal-height row —
   not collapsed to zero — that Live Preview just renders with nothing but a language badge
   on it, with the actual code text starting on the NEXT line down) — reaching into that next
   line for a "true" measurement was rejected because this pseudo-element's own box is
   exactly ONE line tall and a background can never paint outside its own box (the same hard
   rule bug 1 already established), so doing this safely would need the same kind of
   vertical box-widening `--to-own-shift` already does horizontally, introducing an unverified
   NEW paint-order risk against the next (opaque-backgrounded) code line. Per an explicit review
   decision (accepting a slightly-lower offset over the harder exact calculation), code
   fences instead bias toward the bottom of their own (still fully in-bounds, zero clipping
   risk) opener row via a plain `95%` — confirmed live via computed style (`background-position:
   12px 95%`) to land within ~1px of the next line's own top, a pragmatic near-miss rather than
   an exact, mechanism-stretching alignment. All five cases now covered by dedicated e2e tests
   (see `52-block-markers-shapes.e2e.ts`'s "marker vertical position" suite) reading the
   resolved `background-position` directly, not just the raw custom property.

**Code cost (current, single-dot design + live-measured Y)**: ~110 lines added to
`decorations.ts` (marker position/color constants, `markerBackground()`, `firstRowCenterPx`/
`widgetMarkerYPx`, and the `lineDecoration()`/`MarginCompensation` integration — still
meaningfully SMALLER than the original 8-shape version's ~150 lines despite the added
live-measurement code, since one shape needs no per-kind switch, no quadrant/tick/bar helper
functions, and no color table), ~1 line changed in `styles.css` (the `::after` rule's
`background` shorthand, plus an expanded doc comment), ~10 lines added to `decorate.ts`
(`kind` field on `LineDecorationFact` — still used by `MarginCompensation`'s widget-Y
dispatch and the code-fence Y exception, even though `markerBackground()` itself no longer
branches on kind). Reuses 100% of 2b's existing plumbing (custom property → single
`::after`, `--to-own-shift` compensation, `MarginCompensation`'s widget-DOM patching loop)
for X-axis positioning and shape/color — no new CM6 mechanism, no new pseudo-element, no
new `ViewPlugin`. Y-axis positioning is a GENUINELY new piece of live-measurement code
(not reused from guides, which never needed it), the first real net-new mechanism this
experiment added rather than reused. The one real *design* cost independent of Y (not
code-size cost) is that `--to-own-shift` and every guide layer's X position formula are no
longer independent of whether a marker is *also* active on the same line — a coupling 5a's
separate-DOM-element mechanism wouldn't have, since a real DOM child element doesn't need
to share a single pseudo-element's one coordinate space with the guide gradient.

**Known limitation, not fixed on this branch**: markers and guides share one `::after`'s
single `opacity: 0.6`, inherited from the guide rule (subtle-on-purpose, for a background
grid). A marker dot at 60% opacity is legible but visibly softer than surrounding text —
CSS has no way to give two background layers on the *same* element independent opacity.
Splitting them (e.g. painting the marker at full opacity some other way) would cost exactly
the "claim a third pseudo-element" move this experiment's own design explicitly ruled out
as unavailable. Worth a deliberate follow-up decision (accept the shared opacity, or
promote markers off `::after` onto a real DOM node as 5a already does) once both variants
are compared side by side.

**Follow-up refinement: guide columns now align with a marker's own CENTER, not the raw
depth boundary**, requested in review to read more like native nested lists (a connecting
line running straight through each bullet, not stopping short of it). Previously a guide at
ancestor depth `d` was drawn at column `d * unit` exactly — the same column the NEXT depth
level's indentation starts at, which is also where a marker's own reach calculation
happened to START (its left edge), not where it visually CENTERS. This left a real, visible
gap: the guide line sat to the right of the marker dot above/below it, a seam rather than a
continuous line. Fixed by shifting every guide's own column left by `MARKER_HALF +
MARKER_GAP` (`GUIDE_COLUMN_OFFSET`) — exactly the offset between a marker's own depth
column and its rendered center (confirmed live, pixel-exact: a dedicated e2e test reads
both a heading's own marker center and its descendant's guide column as independent
absolute screen positions — accounting for the pseudo-element's own `left` CSS offset
*and* `background-position`, a real bug in the test's first draft, not the implementation —
and asserts they match within 1px).

This shift itself went negative for shallow (in practice, depth-0) ancestors, the same
"background can't paint outside its own box" constraint markers already ran into — fixed by
generalizing the existing `markerShortfall`/`--to-own-shift` widening mechanism
(`combineExtra`) to also cover the shallowest active guide's own reach, not just a line's
own marker. The two are independent reasons a line's pseudo box might need widening (its
OWN marker's left edge; a shallow ancestor's now marker-center-aligned guide column) that
happen to share one box, so `combineExtra` takes the `max()` of whichever apply. This also
meant a blank trailingGap line (which never carries a marker, only ever a guide) can now
independently need `--to-own-shift` too — previously true only for a small minority of
gap lines with genuinely shallow guides, but the mechanism generalizes without needing a
gap-specific carve-out.

**Real bug shipped in the above fix, caught by manual review from a real-vault screenshot
(not by the dedicated alignment test) — mid-chain markers drifted visibly left of their
own guide column.** The screenshot showed a real note (`Wednesday — review day` → `Aurora
review` → paragraphs): the FIRST guide (from the top-level heading) correctly passed
through the second level's marker, but every level from there down drifted — the report correctly
diagnosed the guides themselves as evenly spaced and fine, and the markers (from the
second level on) as the ones shifted left. Root cause: the fix above computes ONE combined `extra` per
line — `max` of the line's own marker shortfall and its shallowest active guide's shortfall
— and that combined value is what the box is ACTUALLY widened by (`--to-own-shift`). The
marker's own X-position formula must use that SAME combined value for the cancellation
algebra to hold (`--to-own-shift` and the position formula need to widen/shift by identical
amounts, or the difference leaks into the rendered position) — but the code built the
marker's background string from its own (narrower) `markerShortfall` alone, computed
*before* combining with the guide's requirement, then combined separately only for
`--to-own-shift`. For a depth-0 node this is invisible (no guide of its own exists to
diverge from, so the two values coincide) — exactly the case the dedicated alignment test
used, which is why it passed despite the bug. For a MID-chain node like "Aurora review"
(depth 1, carries both its own marker AND an active depth-0 guide bridging through it),
its own shortfall alone is 0 (depth 1 doesn't need widening for its OWN marker), but the
combined value is nonzero (the depth-0 guide does need it) — using the narrower value for
the marker's position while the box widens by the larger one drifted the marker left by
exactly `MARKER_RESERVE` (~12px at default sizes), confirmed by hand-deriving the algebra
and matching it against live computed-style output before fixing. Fixed by computing the
combined `extra` FIRST and using it for both the box widening AND the marker's own X
formula. New e2e test added specifically for this shape (heading → heading → paragraph,
three levels) rather than trusting the depth-0/depth-1 case again — verifies every
ancestor's marker center against its immediate child's guide column, not just the
top-level pair. A concrete, second instance of this project's own recurring lesson: a
real multi-level scenario is a different (and necessary) test from its simplest two-level
stand-in, and a screenshot a reviewer actually looked at caught what a passing assertion
suite didn't.

**Follow-up: the native fold chevron overlapped our marker on headings, fixed with a
second, real multi-part bug of its own.** Reported directly in review: Obsidian's own
fold/collapse indicator (`.collapse-indicator.collapse-icon` — the actual glyph; its
wrapper, `.cm-fold-indicator`, measured 0 width live and isn't itself a useful reference)
sits in the exact same pixels our marker does, on every heading (confirmed live: the
chevron's own gutter is reserved even on a heading with no children yet, painted at
`opacity: 0` until hovered/foldable — so the reach is needed unconditionally, not only once
a heading actually has a child, which also avoids the marker jumping sideways the moment
one is added). Its own width doesn't vary by heading level (confirmed live, H1 through H3
identical in the bundled theme), unlike its vertical position, so it's measured ONCE per
render from any one heading line and applied uniformly — the same "measure a single
representative reference" pattern `nativeMarginBasePx` already established, not a new one.

Fixed by folding this reach into the SAME `markerShortfall`/`--to-own-shift` mechanism
markers already use (not a parallel, independently-applied offset — an earlier draft of
this exact fix tried that shape and it silently double-subtracted). Two real bugs shipped
in getting there, both caught by review pushing on the result rather than by any
assertion in this experiment's own suite at the time:

1. **Shifting a heading's own marker left of the chevron broke every DESCENDANT's guide
   column, which still pointed at the marker's OLD (un-shifted) center.** A first version
   only recomputed the fold-adjusted marker on the heading's OWN line, live, via
   `MarginCompensation` — correct for that one line in isolation, but guides (already fixed
   to align with a marker's CENTER, see above) are computed independently on every
   DESCENDANT line, with no way to know the ancestor's marker had moved. Root cause,
   structurally: only HEADINGS (and list items, which never own a guide at all) can fold in
   Obsidian's own UI — a `paragraph`-owned guide (this project's tree lets a paragraph have
   children too) never needs the extra reach, so the fix couldn't be a single per-line
   constant; it needed to know, PER ACTIVE GUIDE DEPTH on a given line, whether THAT
   specific depth's owning ancestor is a heading. Fixed by extending `computeLineGuides`
   (decorate.ts) with a new `headingGuideDepths` field — the subset of `guideDepths` whose
   owner is a heading — and generalizing `guideShortfall`/`guideLayer`/`guideBackground`/
   `combineExtra` to accept a per-depth fold-gap reach instead of one shared value. Checking
   only the shallowest active guide depth (the pre-existing optimization, valid without
   fold-gap since shortfall strictly decreases with depth) also had to go: fold-gap breaks
   that monotonicity, since it applies only to SOME depths — a deeper heading-owned guide
   can now need more reach than a shallower paragraph-owned one on the same line, so
   `combineExtra` checks every active depth, not just the first. The live-measurement pass
   in `MarginCompensation` was correspondingly widened from "the heading's own line only" to
   "every line that carries a marker OR bridges a heading-owned guide" — consolidated
   through one new shared function, `computeMarkerAndGuideBg`, so `lineDecoration()`,
   `gapLineDecoration()`, the widget loop, and this live pass all funnel through the exact
   same computation (foldGapPx defaulting to 0 for the three static callers) rather than
   four independently-maintained copies.
2. **The fix for bug 1 then dropped the `ownShiftUnits * unit` term for margin-shifted
   lines (atoms/list items) when recomputing `--to-own-shift` live**, caught by a dedicated
   e2e test (not a screenshot this time — the discrepancy was small enough, and the
   fixture specific enough, that a computed-style assertion was the right tool) failing by
   exactly one `--to-decor-unit` (24px at default sizes): `--to-own-shift` for these kinds
   must equal `ownShiftUnits * unit + extra` (their OWN depth-based margin shift, plus the
   marker/guide widening) — the new general live-override path set it to `extra` alone,
   which happens to be correct ONLY for block-kind lines (`ownShiftUnits === 0` there,
   invisible on a heading-only smoke test), silently wrong for anything margin-shifted.
   Fixed by reconstructing `ownShiftUnits` from the line's own fact (`isListItem` →
   `supplementalDepth`, `isAtom` → `depth`, else 0) the same way `lineDecoration()` already
   does, inside the live-override path too.

New tests added for both: a heading-with-list-item-child fixture (the exact shape that
exposed bug 2) checking the marker/guide alignment invariant survives the fold-gap
interaction, plus the existing chevron-overlap check extended across three heading depths.
All pass; full suite green (127 unit tests, 71 e2e tests across all 8 spec files).

**Experiment 5b close-out.** Final design: one uniform dot, `var(--text-faint)` (matching
the guide lines), on every eligible kind, positioned to clear both the node's own
indentation column and (for headings) the native fold chevron, vertically centered on the
node's own first rendered visual row, and horizontally centered on any bridging guide line
from a shallower ancestor. Eight real bugs were found and fixed across three follow-up
rounds after the initial "keep" verdict — none caught by this experiment's own fixture
corpus or assertions at the time they shipped; every one came from a reviewer looking at real
rendered output — a shared screenshot, in most cases — and pushing back on what they saw.
Total code cost stayed smaller than the initial 8-shape design despite three rounds
of bug fixes and the addition of a genuinely new live-measurement subsystem (Y-position,
fold-gap) that guides never needed — see the "Code cost" paragraph above and the
`combineExtra`/`computeMarkerAndGuideBg` consolidation in `decorations.ts` for why: fixing
each successive bug generally *simplified* the code by collapsing near-duplicate
computations into one shared function, not by adding new special cases. The two most
consequential lessons — recurring bug shapes, not one-off mistakes — are recorded as
their own entries in [11-decoration-lessons.md](11-decoration-lessons.md), since they apply
well beyond this one experiment.

## Head-to-head: comparison and verdict (2026-07-19)

**Verdict: 5a is the keeper.** PR #12 (5a) merged into the Experiment 5 integration branch;
PR #13 (5b) closed unmerged, with its results and lessons preserved here and in
[11-decoration-lessons.md](11-decoration-lessons.md).

### The two branches diverged on two axes, not one

The plan framed this as one head-to-head (icons vs. CSS shapes), but the experiments
actually diverged on two independent axes:

- **Mechanism**: a real DOM element (5a: CM6 `Decoration.widget` in inline flow for plain
  lines, direct DOM injection for widget atoms) vs. one more background layer on the same
  `::after` pseudo-element the guides already use (5b).
- **Design**: 5a kept 8 distinct per-kind icons (plus a `markerVisibility` setting); 5b
  *pivoted mid-experiment* from 8 CSS-drawn shapes to a single uniform dot, after
  real-content review found the shape variety "cryptic, not helpful."

Keeping the axes separate matters for interpreting the outcome: 5b's design pivot was a
verdict on *abstract CSS-gradient shapes* (lopsided pinwheels, a "⊥" for a plus-sign —
gradient recipes are hard to draw well and harder to distinguish at 60% opacity), not on
per-kind markers as such. 5a's real SVG icons are expressive and read clearly — our own
assessment after living with both. So the design question resolved *differently per
mechanism*, and the decisive comparison is chiefly about the mechanism.

### Comparison table

| Axis | 5a — SVG icons (DOM element) | 5b — uniform dot (background layer) |
|---|---|---|
| Final design | 8 distinct per-kind icons + `markerVisibility` setting (all / with-children / headings-and-paragraphs) | One `--text-faint` dot on every eligible kind (pivoted away from 8 shapes) |
| Mechanism | `Decoration.widget` in inline flow (plain lines) + DOM child injection (widget atoms) | One more background layer on the same `::after` guides use |
| Vertical alignment | **Free, by construction** — inline flow + `baseline` tracks the text's own font metrics at every heading level | Required a genuinely new live-measurement subsystem (`Range.getClientRects()[0]` per line, written to `--to-decor-marker-y`) |
| Coordinate coupling | Mild — marker gutter folded into `--to-own-shift` for atoms | Strong — markers and guides share one pseudo-element's coordinate space; produced 5b's most-repeated bug shape (3 shipped bugs from the same "two formulas must stay in sync" mistake, eventually consolidated into `computeMarkerAndGuideBg`) |
| Rendering quality | Crisp SVG at full opacity, own color | Inherits the guide rule's `opacity: 0.6` — dot reads visibly softer than text; **not fixable without moving to a DOM node** (i.e. adopting 5a's mechanism) |
| Text layout impact | Reserves a 1.25rem marker gutter on all non-list lines — text sits further right than the 2b baseline (depth-0 headings now have nonzero padding; two pre-existing tests deliberately updated) | Zero — dot lives in existing whitespace left of the indent column; text stays exactly at 2b's columns |
| Fold chevron conflict | Moved the *chevron* (static CSS transform on Obsidian's native element — a native-chrome touch, theme-fragile in principle) | Moved the *marker* — but this required per-ancestor-depth machinery (`headingGuideDepths`) because only heading-owned guides need the reach |
| Live measurement | Minimal (inherited `nativeMarginBasePx` etc. from 2b) | Substantial: Y-position, fold-gap, per-kind widget reference elements |
| Architecture | 3 ViewPlugins; nested-editor guard **included** (see 5a results, round 4) | StateField + 1 ViewPlugin; nested-editor guard **missing** (the leak was discovered on 5a after 5b concluded) |
| Code size | ~890-line decorations.ts, 240-line styles.css, + ~50 lines settings plumbing | ~890-line decorations.ts, 164-line styles.css |
| Extensibility | Wide open: per-kind color, hover states, future interactivity (it's a real element), visibility axis already shipped | Endpoint reached: any richer visual (full opacity, interaction, crisp shapes) pushes toward DOM anyway |

### Why 5a wins on robustness, not just looks

The headline surprise: **the "simple" variant didn't stay simpler.** 5b's premise was
"reuse proven plumbing, zero new mechanism" — and for the X axis that held. But vertical
centering on "the first rendered visual row" is fundamentally a *rendering* fact no
CSS-only formula can know (5b's own results establish this precisely, after two failed
CSS-only rounds), so 5b ended up building a live pixel-measurement subsystem anyway —
ironic, given 2b was originally chosen over 2a for "zero pixel measurement." Meanwhile
5a's inline-flow widget got vertical alignment for free from the browser's own text
layout. Both `decorations.ts` files converged to ~890 lines.

5a's structural bets — inline-flow widget for plain lines, ViewPlugin injection for opaque
widgets, DOM-ancestry gating for nested editors — all held up under four rounds of
adversarial real-vault review. 5b's mechanism, by contrast, kept generating instances of
one recurring bug shape (the shared-coordinate-space divergence recorded in
[11-decoration-lessons.md](11-decoration-lessons.md)), and its one unfixable limitation
(markers share the guides' 0.6 opacity) can only be fixed by adopting 5a's mechanism.

What 5b genuinely kept simpler: zero added DOM nodes, and zero text-layout impact (no
gutter — text stays exactly at the 2b baseline columns, where 5a shifts everything
non-list right by 1.25rem).

**Asymmetry that decides it**: 5a's mechanism can trivially render 5b's design (a uniform
dot is just one more SVG icon, and the `markerVisibility` setting already exists to tune
where markers appear). The reverse is not true — 5b's mechanism cannot reach full opacity,
crisp shapes, or interactivity without becoming 5a.

### What both experiments independently converged on

Both branches arrived, through separate review rounds, at the same geometry: **the guide
line runs straight through the marker's center**, like a native nested list's connecting
line through its bullets (5a via placement exploration settling on "centered on the guide
column"; 5b by shifting guide columns to the marker centers). Both excluded list items
entirely. Both had to clear the native fold chevron. That convergence is itself a
validated design fact, independent of mechanism.

### What carries over from 5b

- The **design restraint lesson**: variety without established meaning reads as noise.
  5a's per-kind icons passed real-content review where 5b's abstract shapes didn't, but
  the burden of proof stays on variety — the `markerVisibility` setting exists precisely
  because even good icons can be more than a leaf node needs.
- The **guide-through-marker-center geometry** (already independently present in 5a).
- **Five cross-experiment findings** (shared-value coupling, `background-position` `%`
  semantics, measure-the-glyph-not-the-wrapper, per-depth vs. per-line adjustments,
  simplification-as-legitimate-outcome) — merged into
  [11-decoration-lessons.md](11-decoration-lessons.md).
- The **live chevron measurement** approach — 5b measured the fold chevron's reach live
  per render; 5a hardcoded two measured constants. Porting 5b's approach is hardening
  item 1 below.

### Cross-branch bug alert (important beyond this experiment)

5a's round 4 discovered that decorations leak into Obsidian's **nested per-cell table
editors** (a bare word in an actively-edited cell classifies as a "paragraph" and picks up
indentation + a marker *inside the cell*). The fix (ViewPlugins gated on a DOM-ancestry
`isNestedEditor()` check) exists **only on 5a**. The latent leak affects the un-merged 5b
*and the upstream 2b/1 branches* (indentation alone leaks, markers just made it obvious).
No action needed on the chosen path — 5a carries the fix and everything merges through it
— but if the upstream experiment branches are ever revived independently, they need the
same guard.

## Next steps: hardening 5a

Concerns identified in the post-experiment code review (2026-07-19), ranked. None are
architecture-threatening; they're hardening tasks, invariants to protect, and deferred
polish for when 5a graduates from experiment to the real implementation.

1. **Replace the two hardcoded fold-chevron constants with live measurement.**
   **Status (hardening pass): done** — `MarginCompensation.measureChevron()` reads the
   chevron's right-side dead space live (`.collapse-indicator` box vs. its painted `<svg>`
   glyph) into `--to-chevron-dead-right`; the icon-size term is threaded from
   `MARKER_ICON_CSS`; CSS fallbacks reproduce the old constants. Originally: the chevron
   repositioning is a static CSS transform (`translateX(calc(-1 * (var(--to-marker-gutter)
   + 0.425rem - 3px)))`) where `0.425rem` is half the chevron wrapper's measured 22px width
   and `3px` is measured internal dead space. This is the one place 5a violates the
   project's own "read native values live instead of hardcoding compensations" rule
   ([11-decoration-lessons.md](11-decoration-lessons.md)); a theme or Obsidian update that
   resizes the chevron silently degrades the layout (cosmetic-only failure). 5b's session
   solved the same problem with live measurement — port that approach.
2. **Protect two documented invariants in code review.** (a) DOM injection into widget-atom
   subtrees works because Obsidian never re-diffs those opaque subtrees — an undocumented
   invariant; failure mode on an Obsidian change is re-injection flicker or duplicated
   markers. (b) Never append children into a plain `.cm-line` — confirmed to peg the
   renderer at 100%+ CPU via CM6's mutation-observer feedback loop (documented in
   `decorations.ts`'s module comment). Both must survive future refactors.
3. **Evaluate `app.workspace.updateOptions()` as a replacement for the `forceRedraw`
   off/on mode-toggle hack.**
   **Status (hardening pass): evaluated, rejected with evidence — the hack stays.** With
   `updateOptions()` swapped in, the table-only marker-visibility e2e test fails (stale
   marker): a reconfigure with byte-identical decoration output produces no diff for CM6,
   so `MarginCompensation.docViewUpdate` never fires. Lapel's usage works only because it
   swaps its extension array entry in place — a real reconfigure diff, which our
   read-the-setting-live extension deliberately doesn't produce. Full account in
   `forceRedraw`'s doc comment (main.ts). Originally: (used to refresh `MarginCompensation` after a settings change
   when decoration output is byte-identical). The hack works and its reasoning is sound,
   but toggling a user-visible mode as an internal refresh is fragile if mode toggling
   ever gains side effects. `updateOptions()` is Obsidian's public API for exactly
   "editor-extension-affecting settings changed" — and obsidian-lapel (see the prior-art
   addendum below) confirms the pattern works in the wild: it swaps the registered
   extension array's entry in place and makes this one call.
4. **Consolidate to one shared `parse()`/`decorate()` pass per transaction.**
   **Status (hardening pass): done** — `docFacts()` in `decorations.ts` computes the pure
   facts once per document, cached by the CM6 `Text` instance in a WeakMap; all three
   ViewPlugins share it, and non-doc updates reuse the cache entirely. Originally: currently
   three ViewPlugins each re-parse the full document on every update (the 2b baseline did
   it twice). Same asymptotics, tripled constant; fine for normal notes, worth
   consolidating before testing against multi-thousand-line files. Decoration sets are
   also built for the whole document, not the viewport — a further (deferred) option;
   obsidian-lapel demonstrates the standard viewport-limited shape (build only over
   `view.viewport`, rebuild on `docChanged || viewportChanged`), and additionally shows
   that per-line *kind* facts can come from CM6's own incremental `syntaxTree` (via
   `lineClassNodeProp`) with no separate reparse at all — not a fit for our own tree
   depths (our universal-tree semantics aren't in CM6's grammar), but potentially a fit
   for the kind-classification part of the work.
5. **Resolve the `eslint-plugin-obsidianmd` violations 5a introduced.** The marker
   widget's inline styles trip `obsidianmd/no-static-styles-assignment` (14 errors) and
   `obsidianmd/prefer-create-el` — the official lint rules this project's "perfect
   scorecard" bar (decision Q1) commits to satisfying. Static styles should move to CSS
   classes; genuinely dynamic ones (`left`, per-kind expressions) to `setCssProps`. Found
   by `npm run lint` on the merged branch, 2026-07-19; pre-existing warnings aside, the
   errors are all in 5a's marker code. **Status (2026-07-19 backfill): resolved on `main`**
   (`npm run lint`: 0 errors) — static styles moved to CSS classes, dynamic ones to
   `setCssProps`, per the plan above. Only one warning remains
   (`obsidianmd/settings-tab/prefer-setting-definitions`, unrelated to marker code — the
   settings tab predates Experiment 5 and was never migrated to the declarative settings
   API), now tracked as its own hardening task
   ([tasks.md item 5.5](../../openspec/changes/outline-decorations/tasks.md)) rather than
   bundled here.
6. **Polish**: `aria-hidden="true"` on the marker SVGs (decorative, screen readers should
   skip them); untested contexts — RTL text, IME composition at line start, community
   themes beyond those exercised.
7. **Accepted design costs, restated so they aren't rediscovered as "bugs" later**: every
   non-list line reserves the 1.25rem marker gutter, so text visibly shifts when toggling
   outline mode; two Experiment-1 invariants were knowingly relaxed (depth-0 lines are no
   longer padding-free; same-depth list items vs. atoms no longer share a column). The
   pure-list invariant (a list with no non-list ancestors renders byte-identical to
   outline-mode-off) still holds — list items reserve nothing.

## Prior-art addendum: obsidian-lapel (2026-07-19)

Reviewed after the head-to-head verdict, before calling the experiment wrapped:
[obsidian-lapel](https://github.com/liamcain/obsidian-lapel) (by Liam Cain, an Obsidian
team member) ships a related idea — per-level heading markers ("H1"…"H6") with a
click-to-change-level menu. Four source files, so the whole implementation was read.

**Mechanism: a third approach neither 5a nor 5b tried.** Lapel renders markers in a CM6
`gutter()` — a dedicated column left of the content area, ordered relative to the
line-number gutter via extension precedence (`Prec.high`/`Prec.low`). Because a gutter
marker lives entirely outside `.cm-content`, *every* hard problem this experiment fought
simply doesn't exist there: no text-layout impact, no gutter reservation, no
`contain: paint`, no fold-chevron collision, no blockquote `::before` conflict, no
readable-line-width margin interaction. The trade-off is structural: a gutter is a flat,
fixed column — it cannot place a marker at the node's own indent depth, which is the whole
point of our design (the marker as a crown on the guide line, at the node's own column).
So it doesn't replace 5a's mechanism for us, but it is the right tool for flat per-line
chrome, worth remembering if we ever add any (e.g. node handles, diagnostics).

**Independent confirmation of the nested-editor leak (5a's round 4).** Lapel hit the exact
same bug class: its gutter renders inside Obsidian's per-table-cell nested editors. Their
fix is a CSS hide (`.table-cell-wrapper .cm-gutters { display: none }`) with a comment
calling it a hack to remove "once there's a proper way to not register the editor
extension inside table cells" — i.e. they too found no official API to scope
`registerEditorExtension`, and their workaround only hides the symptom (the extension
still runs). Our DOM-ancestry `isNestedEditor()` gate is structurally stronger: it stops
the computation, not just the paint.

**Confirmations picked up into the hardening checklist** (items 3 and 4 above):
`app.workspace.updateOptions()` as the settings-refresh mechanism, viewport-limited
building, and CM6's own `syntaxTree` as a kind-classification source.

### Potential follow-ups (deliberately out of Experiment 5's scope)

- **Per-level heading markers (H1–H6).** Considered during the experiment but kept out to
  avoid scope creep; lapel validates the idea in the wild. Under 5a's mechanism this is
  small: carry the heading `level` (already on `OutlineNode`, present iff
  `kind === 'heading'`) through `LineDecorationFact`, and either branch
  `buildMarkerIcon` per level or render a small text label. Lapel's customization
  pattern is worth copying regardless of the visual: a `data-level` attribute plus a
  CSS-custom-property indirection (`--heading-marker`, consumed by `content:`) lets
  themes/snippets restyle markers per level without touching the plugin — our markers
  could expose `data-kind` (and `data-level`) the same way.
- **Marker interactivity.** Lapel's markers are clickable: a `Menu` listing heading
  levels 1–6 (checked state on the current level, `lucide-heading-N` icons) plus a
  "Body" option, dispatching a line rewrite. This is exactly the "future interactivity"
  potential the head-to-head credited 5a's real-DOM mechanism with — a node's marker as
  a click target for outline operations (change kind/level, fold, zoom, structural
  moves). Two caveats from lapel's own code: our `MarkerWidget` currently sets
  `pointer-events: none` + `ignoreEvent() { return true }`, both of which would need
  revisiting carefully (CM6 widget event handling interacts with editor focus/cursor);
  and lapel positions its menu via `Menu.setParentElement`, which is NOT public API
  (they augment `obsidian.d.ts` locally) — a public-API-only equivalent
  (`showAtMouseEvent` alone) needs verifying against our bar first.

## Open question: shrinking only our own added list margin

Raised during Experiment 1's review, not yet decided. The deferred list-hang issue (see [Experiment 1's results](08-experiment-1-additive-indentation.md)) is native
Obsidian chrome and explicitly out of scope for direct edits in this experiment. But a
narrower variant stays inside the additive-only discipline: **reduce only the margin *we*
add** to list items — not native `text-indent`/`padding-left` — by the list's own native
hang width, read live via `getComputedStyle` the same way Experiment 1's table fix (bug #3 in
[08-experiment-1-additive-indentation.md](08-experiment-1-additive-indentation.md))
reads and compensates for native padding. Worth exploring as a follow-up, with two open
risks to resolve before trying it: (a) clamping so a shallow `supplementalDepth` never goes
negative once the hang is subtracted (the table fix's `max(0px, ...)` pattern applies
directly), and (b) the compensation must be based on the list **root**'s own hang, not each
item's — nested items can have wider markers (e.g. `10.` vs `-`) with different native hang
widths, and compensating per-item instead of per-root-chain would reintroduce exactly the
kind of within-list misalignment the wide-numbering fixture exists to catch.
