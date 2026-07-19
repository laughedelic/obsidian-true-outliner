# Decoration experiments: plan & results (2026-07-13 → 2026-07-19)

Answers the postmortem's open question — is cross-kind visual unification achievable, and
how — by running small, isolated, falsifiable prototypes instead of another multi-attempt
scramble. See [06-outline-decorations-postmortem.md](06-outline-decorations-postmortem.md)
for what failed and why, and the git history of this doc's own introduction for the
external research that shaped this plan (obsidian-outliner's measure-don't-fight technique,
Logseq's per-block-component architecture, Silverbullet's declined-to-unify precedent).

**All experiments have concluded.** This document is the series hub: the shared ground
rules and fixture corpus, the final results table, and the two experiments that were never
triggered. Each completed experiment's full design and results (including every bug's
history) lives in its own document; the cross-experiment lessons are accumulated
separately. Earlier revisions of this file also carried the per-experiment setup mechanics
and self-contained handoff prompts used to launch each experiment session — those served
their purpose and are preserved in this file's git history, not here.

| Doc | Contents |
| --- | --- |
| [08-experiment-1-additive-indentation.md](08-experiment-1-additive-indentation.md) | Experiment 1: additive-only indentation — design, results, 3 real bugs. **Keep** — the foundation everything else builds on |
| [09-experiment-2-guide-lines.md](09-experiment-2-guide-lines.md) | Experiment 2: guide lines, 2a (pixel-measured overlay) vs. 2b (CSS stacked-gradient) head to head — **2b chosen** |
| [10-experiment-5-block-markers.md](10-experiment-5-block-markers.md) | Experiment 5: per-kind block markers, 5a (SVG icons, DOM mechanism) vs. 5b (CSS shapes → uniform dot) head to head — **5a chosen**; includes the comparison verdict and the hardening checklist for productionizing 5a |
| [11-decoration-lessons.md](11-decoration-lessons.md) | Accumulated cross-experiment findings, grouped by theme — read before touching decorations, CM6 extensions, or native-chrome interactions |

## Results

Final status of every experiment in the series. The chosen implementation path is
**1 → 2b → 5a** (PR stack: #8 → #10 → #11/#12); 2a and 5b were fully built, verified,
and closed in favor of their head-to-head counterparts, with all learnings preserved.

| # | Technique | Status | Verdict |
|---|---|---|---|
| 1 | Additive indentation, no marker | Done, three real bugs found and fixed — [details](08-experiment-1-additive-indentation.md) | **Keep** — merging (PR #8) |
| 2a | Guides — overlay-measured | Done, three real bugs found and fixed — [details](09-experiment-2-guide-lines.md) | Fully capable, **superseded by 2b** (simpler at equal coverage); PR #9 to be closed |
| 2b | Guides — CSS stacked-gradient | Done, full corpus coverage confirmed — [details](09-experiment-2-guide-lines.md) | **Keep — chosen** (PR #10): full parity with 2a at smaller code size, zero pixel measurement |
| 3 | Minimal marker fallback (conditional) | Not triggered — see below | Deprioritized; the marker question was later answered properly by Experiment 5 |
| 4 | Widget-spacer spike (optional) | Not triggered — see below | No fragility observed that would call for it |
| 5a | Block markers — real icons, DOM widget mechanism | Done; four follow-up rounds (fold-chevron fix, centered placement, visibility setting, nested-editor leak found & fixed) — [details](10-experiment-5-block-markers.md) | **Keep — chosen** (PR #12, merged): mechanism solves vertical alignment/opacity/coupling by construction; icons proved expressive on real content |
| 5b | Block markers — CSS shapes → uniform dot | Done; pivoted from 8 per-kind shapes to one dot after real-content review; 8 real bugs found and fixed — [details](10-experiment-5-block-markers.md) | Closed (PR #13): mechanism superseded by 5a (shared-opacity limit, coordinate coupling, live-measurement irony); design restraint lesson and findings preserved in [10](10-experiment-5-block-markers.md)/[11](11-decoration-lessons.md) |

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
4. **Record results in the comparison table (the Results section above) before moving to
   the next experiment.** Verdict is one of: keep, reject, or needs-follow-up — with the concrete
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

> **Corpus growth since this section was written** (ground rule #2 allows growing, never
> shrinking): Experiment 1's real-vault bugs added **widget-atoms**; Experiment 2b's table
> finding added **wide-table**; Experiment 5's shared prerequisite promoted a **quote**
> fixture. [e2e/fixtures/decorations.ts](../../e2e/fixtures/decorations.ts) is the
> authoritative list.

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
reserve since it's more implementation work than the compromise Experiment 1 proposes.

**Outcome.** Not triggered in practice. Its trigger condition (flat fixture unreadable) technically
fires, but our real-content read is that it's not actually a legibility gap (see
Experiment 1's "also confirmed not a bug" note in
[08-experiment-1-additive-indentation.md](08-experiment-1-additive-indentation.md)). Markers are judged less important than
initially scoped now that indentation alone reads as hierarchy.

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

**Outcome.** Not triggered. Experiment 1 showed no cascade fragility against the synthetic corpus or
real vault notes once its three bugs were fixed
(see [08-experiment-1-additive-indentation.md](08-experiment-1-additive-indentation.md)) — nothing suggests the
`padding-left`/`margin-left` approach is running out of road.

## Verification infrastructure (Track 5 — applied across all experiments)

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

Researched via the author's `continuous-journal` plugin as the concrete test case.
Verdict: not a lighter alternative to the already-rejected custom-view path — it requires a
comparable-or-larger private-API footprint (leaf-grafting, `setActiveLeaf` monkey-patching)
plus a genuinely unsolved new problem (N editors bound to overlapping ranges of one shared
file, kept consistent as any one of them edits). Shelved against this project's decided
100%-public-API bar (Q1); revisit only if that bar itself is ever renegotiated.
