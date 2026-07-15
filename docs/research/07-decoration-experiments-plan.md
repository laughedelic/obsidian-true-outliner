# Decoration experiments: plan (2026-07-13)

Answers the postmortem's open question — is cross-kind visual unification achievable, and
how — by running small, isolated, falsifiable prototypes instead of another multi-attempt
scramble. See [06-outline-decorations-postmortem.md](06-outline-decorations-postmortem.md)
for what failed and why, and the git history of this doc's own introduction for the
external research that shaped this plan (obsidian-outliner's measure-don't-fight technique,
Logseq's per-block-component architecture, Silverbullet's declined-to-unify precedent).

## Ground rules for every experiment below

1. **One technique per experiment, isolated.** Each gets its own branch off a clean
   baseline (outline mode + grammar + structural ops, zero decoration code) so results are
   attributable and comparable, not entangled the way attempt 1→2→3 was last time.
2. **A fixed, shared fixture corpus, screenshotted every time — not just the fixture for
   the thing being fixed.** Every experiment runs against the *same* corpus (below), in
   both bundled light and dark themes. Growing the corpus is fine; shrinking scope of what
   gets screenshotted is not.
3. **A real-vault pass is mandatory before an experiment is called done**, not just the
   synthetic corpus. This was the single biggest false-confidence source last time.
4. **Record results in the comparison table at the bottom before moving to the next
   experiment.** Verdict is one of: keep, reject, or needs-follow-up — with the concrete
   reason.
5. **No experiment is "done" on green tests alone.** Unit tests here can only prove the
   pure computation is internally consistent; they cannot prove anything about rendering.
   Screenshot + real-vault verification is the actual gate.

## The fixture corpus (shared across all experiments)

- **Flat**: 3 top-level paragraphs, no lists or headings at all — the original motivating
  bug (`04-open-questions.md`: "with no bullets/indent chrome, outline mode is hard to
  verify by eye in flat documents").
- **Mixed**: heading → heading → nested bullet list → paragraph-as-sibling-of-list-item →
  code fence, matching `MIXED_MD` in the existing e2e spec.
- **Checkbox/task**: a top-level paragraph followed by a checkbox list, mixed
  checked/unchecked — the exact shape that broke in the field last time.
- **Heading-then-list, no paragraph**: a list directly under a heading with *no*
  intervening paragraph — isolates the "list item's native indentation doesn't know about
  heading ancestors" case, the crux of the additive-margin hypothesis.
- **Multi-line continuation**: a paragraph and a list item each spanning 2+ lines via
  `Shift+Enter` — never actually screenshotted last time; explicitly in scope now.
- **Wide numbering**: an ordered list crossing a digit-width boundary (items 9 and 10) —
  checks whether any supplemental indentation clashes with native marker-width variance.
- **Deep nesting**: 4+ levels mixing bullet and ordered markers.

Committed once as [e2e/fixtures/decorations.ts](../../e2e/fixtures/decorations.ts) —
exported markdown-string constants (matching the project's existing `createNote(path,
content)` convention, not on-disk `.md` files) plus an `ALL_DECORATION_FIXTURES` array for
"screenshot everything" loops. Every experiment branch imports from here; don't fork or
re-type fixtures per experiment, or results stop being comparable.

---

## Experiment 1 (primary): additive-only indentation, no synthetic marker

**Hypothesis**: your proposed compromise — drop the marker for non-list kinds entirely,
keep list items' native marker completely untouched, and get indentation right by *adding*
to what's there rather than *replacing* it.

**Mechanism**:
- Paragraphs/headings/atoms: `padding-left` (atoms: `margin-left`) = `depth × unit`. Purely
  additive — nothing native to fight here, this part already worked in the D9 walk-back.
- List items: **never touch `text-indent`/`padding-left`.** Compute a new quantity —
  *supplemental depth* = total tree depth − depth-within-nearest-list-root (i.e. how many
  non-list-item ancestors sit above the nearest list root) — and apply `margin-left` =
  `supplemental-depth × unit` on top of native rendering. A list with no heading/paragraph
  ancestors above its root gets supplemental depth 0 → byte-identical to
  outline-mode-off, which becomes a permanent regression invariant, not a one-time check.

**New code needed**: `decorate.ts`'s walk already computes total depth; add a second
counter that resets to 0 whenever a list-item ancestor chain starts, to get
depth-within-nearest-list-root. Keep the existing pure module's shape (no CM6 imports);
this is a pure-function change, unit-testable the same way the current tests are.

**Success criteria**:
- Every fixture's non-list lines render additively (no property replaced, only added).
- Heading-then-list fixture: the list visibly shifts right by the heading's depth
  contribution, while its own internal per-level spacing is pixel-identical to
  outline-mode-off.
- Wide-numbering fixture: no overlap/misalignment between marker and text.
- Multi-line continuation: continuation lines indent identically to their node's first
  line, in both directions (paragraph and list item).

**What would kill it**: if `margin-left` on a list item interacts badly with anything
Obsidian's own list CSS assumes about the box it's positioned in (e.g. the fold-indicator's
absolute positioning might be relative to a box `margin-left` moves but `padding-left`
wouldn't have) — check the fold-indicator specifically, since it's the one native element
that already burned an attempt this cycle.

## Experiment 2 (primary): guide lines — two implementations, head to head

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

## Experiment 3 (conditional — only run if Experiment 1's flat fixture fails review)

**Trigger**: if dropping the marker means the **flat** fixture (3 top-level paragraphs, all
at depth 0, so indentation alone conveys nothing) still doesn't read as "outline mode is
on" — which is the *original* motivating bug this whole change exists to fix — try a
minimal, low-risk marker that avoids the em/rem bug class *by construction*: a fixed-px-
width left border or background tint (not a `::before` glyph with a font-size), so there's
no font-size context to inherit incorrectly regardless of which kind's line it's on.

**Success criteria**: flat fixture reads as distinct nodes at a glance, in a screenshot,
without reintroducing any font-size-dependent sizing.

**If this also isn't good enough**: fall back to the overlay-measured marker (same
mechanism as 2a, sized as a fixed absolute value, never inheriting font-size by
construction) — this is the "real" fix for the original marker-size bug, just held in
reserve since it's more implementation work than the compromise you proposed.

## Experiment 4 (optional risk-spike — only if Experiment 1 still feels fragile on real content)

Spike the `Decoration.widget` spacer technique (real inline content pushing text via layout
width, instead of any CSS box-model property) in isolation, specifically against the
multi-line/wrapped-continuation fixture, to test the one confirmed real gotcha found in
research: CM6 wraps every widget in an invisible `.cm-widgetBuffer` that can introduce
stray line-wrap points. Go in expecting this might kill the idea — it's unproven in the
wild for exactly this reason, and the whole CM6 community converged on CSS `Decoration.line`
instead. Only worth spending time on if Experiment 1's `padding-left`/`margin-left`
approach keeps showing cascade fragility against real themes despite the additive-only
discipline.

## Track 5 (parallel infrastructure, not gated — apply to all of the above)

- Commit the fixture corpus once; every experiment's verification re-screenshots all of it,
  not just its own new fixture.
- One automated check: render two elements of deliberately different font-size (a heading
  line and a paragraph line) at the same computed tree depth, diff *every*
  decoration-related computed style at once (`padding-left`, `margin-left`, any marker
  `font-size`/`width`/`height`). This single mechanism would have caught both the
  indentation em/rem bug and the marker-size em/rem bug last time, instead of two separate
  manual catches.
- Fix `npm run build` to actually invoke esbuild, or add an explicit pre-verification step
  (`npm run build:plugin && npm run vault:install`) to the checklist so a stale bundle
  can't produce a false "verified" result again.
- A real dev-vault pass is part of *every* experiment's exit criteria, not a final step
  after all experiments conclude.

## Architecture question: per-block editor tree — resolved, not prototyped

Researched via your `continuous-journal` plugin as the concrete test case (see chat).
Verdict: not a lighter alternative to the already-rejected custom-view path — it requires a
comparable-or-larger private-API footprint (leaf-grafting, `setActiveLeaf` monkey-patching)
plus a genuinely unsolved new problem (N editors bound to overlapping ranges of one shared
file, kept consistent as any one of them edits). Shelved against this project's decided
100%-public-API bar (Q1); revisit only if that bar itself is ever renegotiated.

## Results

Quick-scan status; full detail in the subsections below.

| # | Technique | Status | Verdict |
|---|---|---|---|
| 1 | Additive indentation, no marker | Done, three real bugs found and fixed | **Keep** |
| 2a | Guides — overlay-measured | Done, three real bugs found and fixed | **Keep** |
| 2b | Guides — CSS stacked-gradient | Not started | Head-to-head comparison against 2a still open |
| 3 | Minimal marker fallback (conditional) | Not triggered | Deprioritized — see below |
| 4 | Widget-spacer spike (optional) | Not triggered | No fragility observed that would call for it |

### Experiment 1 — additive indentation, no marker

**Verdict: keep.** All 8 corpus fixtures pass, both themes, screenshotted and visually
reviewed (not just DOM-asserted) — see
[e2e/specs/50-decorations.e2e.ts](../../e2e/specs/50-decorations.e2e.ts). The user toured
every note in the real `test-vault` by hand — the actual dev-vault pass the postmortem
insisted on, not a formality — and found three real bugs the synthetic corpus missed
entirely (below). All three are fixed, with permanent fixtures/assertions added so they
can't silently regress. User's assessment after the fixes: "much more promising" than the
prior attempt — indentation alone gives real hierarchy legibility switching modes on and
off, more than initially expected going in.

**Code cost**: ~15 lines added to `decorate.ts` (2 new fields + 1 extra walk parameter),
~150-line `decorations.ts` adapter (a `StateField` for plain lines plus a `ViewPlugin` for
widget-replaced atoms), ~25-line `styles.css`.

**Bugs found and fixed** (chronological — each was caught only by a human looking at real,
organic content, never by the synthetic corpus or DOM assertions):

1. **Cascade fight, caught in the synthetic corpus.** Obsidian's own `app.css` has
   `.markdown-source-view.mod-cm6 .cm-content > * { margin: 0px !important; }` — three
   classes of specificity, which beat our original two-class `.cm-line.to-decor-*` selector
   outright even with `!important` on both sides. Fixed by matching Obsidian's own
   ancestor-chain specificity, not by escalating `!important` further (there's nowhere
   further to escalate — the tie-break past equal `!important` is specificity, then source
   order).
2. **Tables and callouts not indenting at all, caught by the user in the real vault.**
   Obsidian renders tables, callouts, raw HTML blocks, and (surprisingly) horizontal rules
   as opaque replacement widgets in Live Preview (`.cm-embed-block`, or `.hr` for the rule,
   which oddly still carries a `cm-line` class despite being widget-rendered). A
   `Decoration.line` targeting that source line has **no effect at all** — not even a
   partial class-merge win, confirmed live by dumping the DOM: both class and inline style
   come back completely empty. Code fences and plain blockquotes are genuinely plain
   `.cm-line`s and were unaffected, which is exactly why the synthetic corpus (which only
   exercised those two atom kinds) never caught this. Fixed with a companion `ViewPlugin`
   that finds these widgets directly after each render (`docViewUpdate`, not the pre-render
   `update()` hook — DOM reads/writes need the widget to already exist) and sets
   `margin-left` inline with `!important`, which always wins over *any* stylesheet rule
   regardless of specificity — a clean escape hatch for exactly this class of native-widget
   cascade fight. It reads the same `--to-decor-unit` CSS variable the class-based rules
   use, so the unit constant stays single-sourced.
3. **Table still visibly offset from code/callout after fix #2, caught by the user.** Once
   tables got a margin at all, they still sat slightly further right than a same-depth code
   block or callout. Root cause: `.cm-embed-block.cm-table-widget` carries its own native
   left padding (for the row/column drag-handle icons) that callout's wrapper doesn't have.
   Padding never moves an element's own box — invisible for code/callout, whose *background*
   fills their whole padded box — but the table's actual visible content (a `<table>` nested
   two levels inside the padded wrapper) sits in normal flow within that padding, so it
   visually renders offset by exactly that amount. Fixed by reading the widget's own
   `getComputedStyle(...).paddingLeft` live (not a hardcoded pixel constant, which would be
   theme/version-fragile) and subtracting it from the applied margin, clamped at zero so a
   depth-0 atom never goes negative.

**Deferred, not fixed on this branch**: list items sit visually further right than a
sibling paragraph/blockquote at the same tree depth. Traced to a real file
(`Kitchen Renovation.md`) and confirmed via measurement that our own added margin is
*identical* across all three at that depth — the extra offset is Obsidian's own native
list-item hang (`text-indent: -Npx` / `padding-left: Npx`), which already pushes list text
right of a sibling paragraph's text in **vanilla Obsidian, mode on or off**. It's not
something this experiment introduced; it's just more noticeable now that everything else
lines up precisely. Fixing it the way `obsidian-outliner`'s `BetterListsStyles` does means
touching that native `text-indent`/`padding-left` pair directly — the single riskiest
surface the postmortem blamed for most of the prior failed attempt's bugs. Left alone
pending a deliberate, isolated follow-up; see
[open question](#open-question-shrinking-only-our-own-added-list-margin) below for a
narrower variant that stays additive-only.

Also confirmed **not** a bug: the flat fixture (3 top-level paragraphs, all depth 0) shows
no visual change from outline-mode-off. This was flagged going in as Experiment 3's
trigger condition, but the user confirmed on real content that this reads correctly the
moment a heading sits above the paragraphs — depth-0-with-no-ancestor genuinely has nothing
to convey, which is correct, not a legibility gap.

### Experiment 2a — guide lines via pixel-measured overlay

**Verdict: keep.** Branched off Experiment 1 (`experiment/decorations-2a-guides-overlay`).
All 8 corpus fixtures plus 4 real vault notes pass, both themes, screenshotted and visually
reviewed at pixel level (not just DOM-asserted) — see
[e2e/specs/51-guides-overlay.e2e.ts](../../e2e/specs/51-guides-overlay.e2e.ts), 43/43 e2e
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

### Experiment 2b — guides via CSS stacked-gradient

Not started. Per the plan, this is meant to run head-to-head against 2a on the same
corpus (correctness on multi-line continuation, robustness against themes, code
size/complexity) before either is picked — not treated as a fallback.

### Experiment 3 — minimal marker fallback

Not triggered in practice. Its trigger condition (flat fixture unreadable) technically
fires, but the user's real-content read is that it's not actually a legibility gap (see
Experiment 1's "also confirmed not a bug" above). Markers are judged less important than
initially scoped now that indentation alone reads as hierarchy.

### Experiment 4 — widget-spacer spike

Not triggered. Experiment 1 showed no cascade fragility against the synthetic corpus or
real vault notes once the three bugs above were fixed — nothing suggests the
`padding-left`/`margin-left` approach is running out of road.

### Open question: shrinking only our own added list margin

Raised by the user, not yet decided. The deferred list-hang issue (above) is native
Obsidian chrome and explicitly out of scope for direct edits in this experiment. But a
narrower variant stays inside the additive-only discipline: **reduce only the margin *we*
add** to list items — not native `text-indent`/`padding-left` — by the list's own native
hang width, read live via `getComputedStyle` the same way the table fix (bug #3 above)
reads and compensates for native padding. Worth exploring as a follow-up, with two open
risks to resolve before trying it: (a) clamping so a shallow `supplementalDepth` never goes
negative once the hang is subtracted (the table fix's `max(0px, ...)` pattern applies
directly), and (b) the compensation must be based on the list **root**'s own hang, not each
item's — nested items can have wider markers (e.g. `10.` vs `-`) with different native hang
widths, and compensating per-item instead of per-root-chain would reintroduce exactly the
kind of within-list misalignment the wide-numbering fixture exists to catch.

## Non-obvious findings

Cross-experiment learnings, carried forward the same way the postmortem's own "carried-forward
technical findings" section was meant to be used — read this before starting 2a/2b/3/4:

- **CM6 `Decoration.line` has zero effect on Obsidian's "embed-block" replacement widgets**
  (tables, callouts, raw HTML, and horizontal rules) — not a partial win, not a class-merge;
  confirmed live that both class and inline style come back completely empty. Any atom kind
  Obsidian renders this way needs direct DOM patching via a `ViewPlugin`'s `docViewUpdate`
  hook, not a CM6 decoration. Code fences and plain blockquotes are *not* in this category —
  they render as genuinely plain `.cm-line`s and decorate normally.
- **A single broad selector plus a fact lookup by document line number is enough** to handle
  all four widget-replaced kinds uniformly (`.cm-embed-block, .cm-line.hr` → `posAtDOM` →
  `decorate()` facts by line) — no need for kind-specific branches.
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
- **The synthetic corpus, even a deliberately adversarial one, missed all three real bugs
  above.** Every one was caught only by a human visually reviewing real, organic vault
  content (not synthetic fixtures, not DOM-attribute assertions). This reaffirms the
  postmortem's central lesson directly, in a new implementation: treat the real-vault pass
  as load-bearing verification for every future experiment, not a final formality after the
  fixtures pass.
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

## Setup (done, 2026-07-13)

- Full attempt-3 snapshot (broken code + the docs as they stood) preserved on
  `archive/outline-decorations-attempt-3` — reference only, do not build on it.
- `feat/outline-decorations` reset to a clean baseline: `decorate.ts` + its unit tests kept
  (never the buggy layer), `decorations.ts`/`styles.css`/the old e2e spec dropped (rebuild
  per experiment, not patched in place), `main.ts` reverted to no decoration wiring,
  `design.md`/`spec.md`/`tasks.md` annotated paused-with-context rather than left describing
  a scope no code matches, package.json/.gitignore's `styles.css`-symlink fix kept, shared
  fixture corpus committed at `e2e/fixtures/decorations.ts`.
- `experiment/decorations-1-additive-indent` branched off the clean baseline, ready to start.
- `experiment/decorations-2a-*`/`2b-*` branch off **1**, not off the clean baseline, once it
  validates — guides need some indentation already rendered to meaningfully measure/draw
  against. Create with `git checkout experiment/decorations-1-additive-indent && git
  checkout -b experiment/decorations-2a-guides-overlay` (and `-2b-guides-css-gradient`
  similarly) once 1 is done.
- Experiments 3 and 4 are conditional/optional — branch only if triggered (see below).

## Handoff prompts

Self-contained prompts, one per experiment — paste into a fresh session (or hand to a
subagent) to start that experiment in isolation. Each assumes zero prior context beyond
what's inline plus the two linked docs.

### Experiment 1 — additive-only indentation, no marker

> Branch: `experiment/decorations-1-additive-indent` (already created off a clean
> `feat/outline-decorations`, no decoration code present — `decorate.ts` and its tests are
> the only survivors from a prior failed attempt, kept because they were never the buggy
> layer). Read `docs/research/06-outline-decorations-postmortem.md` and
> `docs/research/07-decoration-experiments-plan.md` (Experiment 1's section) for full
> context before starting.
>
> Build: paragraphs/headings/atoms get plain `padding-left`/`margin-left` = `depth × unit`
> (a fixed rem/px constant, never `em` — the postmortem's marker-size bug was exactly an
> `em` resolving against the wrong element's font-size; don't repeat that class of bug for
> *any* property here). List items must **never** have `text-indent`/`padding-left`
> touched — instead add a NEW computed quantity, supplemental depth = total tree depth −
> depth-within-nearest-list-root (i.e. how many non-list-item ancestors sit above the
> nearest list root), and apply only `margin-left` = `supplemental-depth × unit` on top of
> native rendering. No synthetic marker glyph on any kind — list items keep their fully
> native, untouched bullet/number.
>
> `decorate.ts` already computes total depth; add the second counter (resets to 0 whenever
> a list-item ancestor chain starts) as a new field on `LineDecorationFact`, extending the
> existing unit tests rather than replacing them. `decorations.ts`/`styles.css` get rebuilt
> from scratch (nothing to salvage from the archived attempt) using this additive-only
> discipline.
>
> Test against every fixture in `e2e/fixtures/decorations.ts` (not just the one that seems
> relevant) — screenshot each in both bundled light and dark themes. Specifically verify:
> the heading-then-list fixture shows the list shifted right by the heading's depth
> contribution while its own internal per-level spacing stays pixel-identical to
> outline-mode-off; the wide-numbering fixture shows no marker/text overlap; multi-line
> continuation fixtures indent their continuation lines identically to the node's first
> line. Explicitly check the fold-indicator (collapse chevron on list items with children)
> for collisions — the one native element that already burned an attempt this cycle.
>
> `npm run build` only runs `tsc --noEmit` — it does NOT rebuild `main.js`. Use `npm run
> build:plugin` (or `npm run vault:install`) before any real-vault check, or you'll verify
> a stale bundle. A real dev-vault pass (not just the synthetic fixtures) is required before
> calling this done. Record the result in the comparison table in
> `docs/research/07-decoration-experiments-plan.md`.

### Experiment 2a — guide lines via pixel-measured overlay

> Prerequisite: Experiment 1 validated and merged/available. Branch off it:
> `git checkout experiment/decorations-1-additive-indent && git checkout -b
> experiment/decorations-2a-guides-overlay`. Read
> `docs/research/06-outline-decorations-postmortem.md` and
> `docs/research/07-decoration-experiments-plan.md` (Experiment 2 section) first.
>
> Build a `ViewPlugin` that, after each debounced recompute (gate on `docChanged ||
> viewportChanged`, NOT unconditionally on every `ViewUpdate` — the prior attempt's
> per-ViewUpdate recompute was more expensive than needed), reads already-rendered pixel
> positions via `view.coordsAtPos()`/`view.lineBlockAt()` and draws one absolutely-
> positioned overlay `<div>` per ancestor level, inline-styled (`el.style.top/left/height`
> set directly from JS, not via CSS classes) into a layer living outside `.cm-content` —
> this is `obsidian-outliner`'s proven technique (`VerticalLines.ts` in its source), not
> something to reinvent from scratch; read that file if you want the exact reference
> shape. Handle the out-of-band mode-toggle refresh with a dedicated `StateEffect` rather
> than an empty `view.dispatch({})` forcing a full recompute path.
>
> Test against every fixture in `e2e/fixtures/decorations.ts`, in both themes. The specific
> case to get right that was never even attempted last time: the multi-line/wrapped
> continuation fixture — a guide line must span the full rendered height of a multi-line
> node (should come free from `lineBlockAt`, which is block-level and covers all wrapped
> visual rows — verify this rather than assuming it). `npm run build:plugin`/`vault:install`
> before any real-vault check. Record results in the comparison table.

### Experiment 2b — guide lines via CSS stacked-gradient

> Prerequisite: Experiment 1 validated and merged/available. Branch off it:
> `git checkout experiment/decorations-1-additive-indent && git checkout -b
> experiment/decorations-2b-guides-css-gradient`. Read the same two docs as 2a first — this
> is a deliberate head-to-head alternative to 2a, not a fallback; build both, don't assume
> a winner in advance.
>
> Build guide lines as a single `Decoration.line` per line, with one CSS custom property
> set to a comma-joined list of `repeating-linear-gradient(...)` layers (one per ancestor
> level), consumed by a single `::before` — this is the technique
> `@replit/codemirror-indentation-markers` uses (its `src/index.ts` is the reference if you
> want the exact shape): O(1) DOM nodes per line regardless of depth, no JS pixel
> measurement, no overlay layer. Because this reintroduces a real CSS rule participating in
> the normal cascade (unlike 2a's inline-styled overlay), explicitly verify it does NOT
> resurrect any of the specificity/`!important` problems from the original postmortem — it
> shouldn't, since guide-drawing isn't a property any native rule already contests, but
> confirm rather than assume.
>
> Same fixture corpus, same both-themes requirement, same multi-line-continuation focus as
> 2a (get the line's own rendered full height for the gradient — should be free since it's
> one element per whole line, but verify). Record results in the comparison table,
> specifically comparing code size/complexity and robustness against 2a.

### Experiment 3 — minimal marker fallback (conditional)

> Only start this if Experiment 1's real-vault/screenshot review of the **flat** fixture
> (`FLAT_MD` in `e2e/fixtures/decorations.ts`) shows indentation alone doesn't read as
> "outline mode is on" — everything's at depth 0, so indentation conveys nothing, which is
> the *original* motivating bug this whole change exists to fix
> (`docs/research/04-open-questions.md`: "with no bullets/indent chrome, outline mode is
> hard to verify by eye in flat documents"). Branch off whichever of 1/2a/2b is current
> baseline at the time.
>
> Build a marker that cannot inherit font-size by construction — e.g. a fixed-px-width left
> border or background tint on paragraph/heading/atom lines, not a `::before` glyph sized in
> `em`. Verify the flat fixture reads as distinct nodes at a glance in a screenshot. If this
> still isn't legible enough, the fallback-of-the-fallback is the overlay-measured marker
> (same mechanism as 2a, fixed absolute size) — more implementation work, held in reserve.

### Experiment 4 — widget-spacer risk-spike (optional)

> Only start this if Experiment 1's `padding-left`/`margin-left` approach keeps showing
> cascade fragility against real themes/content despite the additive-only discipline. Spike
> `Decoration.widget` (an inline spacer with real computed pixel width, pushing content via
> layout rather than any CSS box-model property) in isolation, specifically against the
> multi-line/wrapped-continuation fixture. Go in expecting it might fail: CM6 wraps every
> widget in an invisible `.cm-widgetBuffer` (a confirmed, maintainer-acknowledged,
> unresolved gotcha) that can introduce stray line-wrap points — exactly the risk for
> wrapped text. The whole CM6 community converged on CSS `Decoration.line` instead for this
> exact reason; this spike exists to find out definitively whether that gotcha actually
> manifests for us; do not treat this as a preferred direction going in.
