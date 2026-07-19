# Experiment 1: additive-only indentation (2026-07-13)

Part of the decoration-experiments series — see the
[hub](07-decoration-experiments-plan.md) for the ground rules, the shared fixture corpus,
and the overall results table, and [06-outline-decorations-postmortem.md](06-outline-decorations-postmortem.md)
for the failed attempt that motivated the series. This was the series' primary first
experiment: every later experiment (guides, markers) builds on its additive-only
indentation. Cross-experiment lessons live in [11-decoration-lessons.md](11-decoration-lessons.md).

## Design (from the plan)

**Hypothesis**: our proposed compromise — drop the marker for non-list kinds entirely,
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

## Results

**Verdict: keep.** All 8 corpus fixtures pass, both themes, screenshotted and visually
reviewed (not just DOM-asserted) — see
[e2e/specs/50-decorations.e2e.ts](../../e2e/specs/50-decorations.e2e.ts). We toured every
note in the real `test-vault` by hand — the actual dev-vault pass the postmortem
insisted on, not a formality — and found three real bugs the synthetic corpus missed
entirely (below). All three are fixed, with permanent fixtures/assertions added so they
can't silently regress. The review verdict after the fixes: markedly more promising than the
prior attempt — indentation alone gives real hierarchy legibility switching modes on and
off, more than initially expected going in.

**Code cost**: ~15 lines added to `decorate.ts` (2 new fields + 1 extra walk parameter),
~150-line `decorations.ts` adapter (a `StateField` for plain lines plus a `ViewPlugin` for
widget-replaced atoms), ~25-line `styles.css`.

**Bugs found and fixed** (chronological — each was caught only by manual review of real,
organic content, never by the synthetic corpus or DOM assertions):

1. **Cascade fight, caught in the synthetic corpus.** Obsidian's own `app.css` has
   `.markdown-source-view.mod-cm6 .cm-content > * { margin: 0px !important; }` — three
   classes of specificity, which beat our original two-class `.cm-line.to-decor-*` selector
   outright even with `!important` on both sides. Fixed by matching Obsidian's own
   ancestor-chain specificity, not by escalating `!important` further (there's nowhere
   further to escalate — the tie-break past equal `!important` is specificity, then source
   order).
2. **Tables and callouts not indenting at all, caught by manual review in the real vault.**
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
3. **Table still visibly offset from code/callout after fix #2, caught by manual review.** Once
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
[open question](10-experiment-5-block-markers.md#open-question-shrinking-only-our-own-added-list-margin) for a
narrower variant that stays additive-only.

Also confirmed **not** a bug: the flat fixture (3 top-level paragraphs, all depth 0) shows
no visual change from outline-mode-off. This was flagged going in as Experiment 3's
trigger condition, but real-content review confirmed that this reads correctly the
moment a heading sits above the paragraphs — depth-0-with-no-ancestor genuinely has nothing
to convey, which is correct, not a legibility gap.
