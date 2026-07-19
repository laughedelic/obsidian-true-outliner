## 0. Experiments (concluded)

All experiments have concluded; see
[docs/research/07-decoration-experiments-plan.md](../../../docs/research/07-decoration-experiments-plan.md)
for the full results table. Chosen path: **1 → 2b → 5a** (PR stack: #8 → #10 → #11/#12).

- [x] 0.1 Experiment 1: additive-only indentation — **kept**, merged (PR #8). Details:
      [08-experiment-1-additive-indentation.md](../../../docs/research/08-experiment-1-additive-indentation.md)
- [x] 0.2 Experiment 2a: guide lines via pixel-measured overlay — fully capable, superseded
      by 2b, closed unmerged (PR #9). Details:
      [09-experiment-2-guide-lines.md](../../../docs/research/09-experiment-2-guide-lines.md)
- [x] 0.3 Experiment 2b: guide lines via CSS stacked-gradient — **chosen**, merged (PR #10)
- [x] 0.4 Experiment 3 (minimal marker fallback): not triggered — the marker question was
      later answered by Experiment 5 instead; see doc 07's own results table
- [x] 0.5 Experiment 4 (widget-spacer risk-spike): not triggered — no fragility observed
      that would have called for it
- [x] 0.6 This task: comparison table filled in (doc 07), winning techniques picked (1, 2b,
      5a), design.md/spec.md/tasks.md (this file) rewritten with validated decisions

Experiment 5 (per-kind block markers, added after 0.6 was originally scoped, run to the
same discipline): 5a (SVG icons, DOM mechanism) **chosen**, merged (PR #11/#12); 5b (CSS
shapes → uniform dot) closed unmerged (PR #13), full account and head-to-head verdict in
[10-experiment-5-block-markers.md](../../../docs/research/10-experiment-5-block-markers.md).
Cross-experiment lessons:
[11-decoration-lessons.md](../../../docs/research/11-decoration-lessons.md).

## 1. Depth/marker computation (pure module) — done

- [x] 1.1 `src/plugin/decorate.ts`: `decorate(doc)` computes per-line
  `{ lineNumber, depth, isFirstLine, hasNativeMarker, isAtom, isListItem,
  supplementalDepth, kind, hasChildren }`, walking the tree in document order (own lines,
  then children). `computeLineGuides(doc)` computes per-line `{ lineNumber, guideDepths,
  isGapLine }` in a separate single-pass walk, covering blank `trailingGap` lines too (a
  strict superset of `decorate()`'s coverage). No CM6 imports; both unit-tested directly
  against parsed fixtures.
- [x] 1.2 Unit tests (`tests/decorate.test.ts`, 32 cases): heading/list/paragraph-adjacency
  depth agreement, gap-line handling, multiline continuation, empty/preamble-only documents,
  `supplementalDepth`'s byte-identical-pure-list invariant, `kind`/`hasChildren` tracking for
  the marker layer, and the full `computeLineGuides` suite (bridging, exclusion, gap
  continuity, superset coverage). See the spec's per-requirement "Covered by" notes for the
  exact mapping.

## 2. CM6 decoration extension — done

- [x] 2.1 `src/plugin/decorations.ts`: three `ViewPlugin`s (`DecorationsPlugin` for
  indentation + guides, `MarkersPlugin` for the plain-line marker widget, `MarginCompensation`
  for widget-atom DOM patching and native-base-margin compensation), each gated on
  `DecorationSource` (`ModeSource` + `markerVisibility`) and each checking `isNestedEditor(view)`
  before computing. Recomputes on every `ViewUpdate` (not just `docChanged`), since toggling
  outline mode has no document change of its own.
- [x] 2.2 `styles.css`: `--to-depth`/`--to-guides` custom properties consumed by `calc()` and
  a shared `::after` gradient stack; marker gutter reservation; `contain`/`overflow`
  overrides for widget atoms (matching Obsidian's own selector specificity); fold-chevron
  repositioning. Verified against bundled light/dark themes and (guides) one community theme.
- [x] 2.3 Registered in `main.ts` via `registerEditorExtension`, alongside `grammarExtension`.

## 3. Verification — done for the chosen path

- [x] 3.1 Full gate green: `tsc`, `lint` (0 errors; 1 pre-existing warning unrelated to
  decorations — see section 4), `vitest`, plugin build — reverified after each experiment's
  merge.
- [x] 3.2 `e2e/specs/`: `50-decorations.e2e.ts` (indentation, additive invariant, widget
  atoms, fold-indicator non-collision), `51-guides-gradient.e2e.ts` (guide bridging/exclusion,
  gap continuity, blockquote/table coexistence, native-base-margin composition),
  `52-block-markers-icons.e2e.ts` (per-kind markers, visibility setting, fold-chevron
  clearance, size invariance) — see spec.md's per-requirement "Covered by" notes for the
  full mapping.
- [x] 3.3 Manual/visual residue: theme sweep done per-experiment (bundled light/dark
  throughout; one community theme for guides). No single consolidated `verification.md`
  entry was added — recorded instead in each experiment's own results doc (08 §Results, 09
  §Results, 10 §Results/head-to-head). Consider consolidating into `verification.md` in a
  future pass if that split proves hard to navigate.
- [x] 3.4 Dev-vault visual pass: done per-experiment against the bundled `test-vault`'s real
  notes (journal/notes/README), screenshotted both themes, reviewed by eye each round — see
  each experiment doc's "real-vault" findings. The original open-questions.md motivating
  finding (flat paragraph-heavy documents give no visual signal) is resolved: indentation +
  guides alone give real hierarchy legibility even before a marker is added (08's "also
  confirmed not a bug" note); markers add per-kind identification on top.
  **Not yet done**: a pass by the plugin author's own hand, in their own personal Obsidian
  vault, on the final merged (1+2b+5a) combination together — every experiment's own
  "real-vault" pass used the bundled `test-vault` proxy or, per doc 10, review of the
  bundled `test-vault`'s content through the e2e harness, not the author's live instance.
  Doc 10 flags this explicitly as the "stronger bar" still outstanding.

## 4. Traceability gaps found during the 0.6 backfill

Requirements in `specs/outline-decorations/spec.md` with no direct covering test (recorded
so they don't silently stay uncovered):

- [ ] 4.1 **Nested per-cell editor decoration state** has no dedicated e2e test. The only
  evidence is indirect: a marker-visibility test's intermittent failure was traced to this
  exact leak and is now passing deterministically, but no test explicitly opens a table cell
  for editing and asserts the nested editor's own line carries no padding/margin/marker. Add
  one to `e2e/specs/52-block-markers-icons.e2e.ts` (or a new nested-editor-focused spec).
- [ ] 4.2 **The non-mutation contract** (no transaction/cursor/undo-stack side effect from a
  decoration recompute) has no dedicated e2e assertion — only inferable from the pure
  module's own lack of side effects and the absence of any reported regression. Add an e2e
  test that snapshots cursor position and undo-stack depth before/after a decoration
  recompute (e.g. triggered by a mode toggle) and asserts both are unchanged.

Code behaviors present in `decorations.ts` with no explicit spec requirement (recorded as
either intentionally-undocumented implementation detail or a genuine gap — reviewed and
judged not to need their own requirement, since they're implementation strategies for
requirements already stated, not separately-observable behavior):

- Kept as implementation detail, not spec'd: the specific choice of two `ViewPlugin`s
  (`DecorationsPlugin`/`MarkersPlugin`) vs. one merged one — the spec cares about the
  observable outcome (guides + markers both render correctly together), not this
  implementation split.
- Kept as implementation detail: `MarginCompensation`'s idempotent DOM-patch skip (avoiding
  a rebuild when kind/position haven't changed) — a performance detail, not user-observable
  behavior.

## 5. Remaining work: hardening 5a for production

Ranked, from
[docs/research/10-experiment-5-block-markers.md](../../../docs/research/10-experiment-5-block-markers.md)'s
"Next steps: hardening 5a" section. None are architecture-threatening.

- [ ] 5.1 Replace the two hardcoded fold-chevron measurement constants
  (`0.425rem`/`3px` in the chevron-repositioning `translateX`) with live measurement,
  porting 5b's approach (`getBoundingClientRect()` against the chevron's own glyph, not its
  wrapper). Currently the one place this design violates its own "read native values live"
  rule; a theme/Obsidian update that resizes the chevron silently degrades layout
  (cosmetic-only failure mode).
- [ ] 5.2 Protect two documented invariants in code review going forward: (a) DOM injection
  into widget-atom subtrees relies on Obsidian never re-diffing those opaque subtrees
  internally — undocumented-to-Obsidian, failure mode is re-injection flicker/duplicated
  markers; (b) never append a child into a plain `.cm-line` — confirmed to peg CM6's
  renderer at 100%+ CPU via its mutation-observer feedback loop (already documented inline
  in `decorations.ts`'s module comment; this task is about keeping it true across future
  refactors, e.g. by adding a lint rule or a regression test if a lightweight one is
  feasible).
- [ ] 5.3 Evaluate `app.workspace.updateOptions()` as a replacement for the `forceRedraw`
  off/on mode-toggle hack currently used to refresh `MarginCompensation` after a settings
  change when decoration output is byte-identical (e.g. `markerVisibility` changing on a
  table-only note). The hack works and its reasoning is sound, but toggling a user-visible
  mode as an internal refresh mechanism is fragile if mode toggling ever gains side effects.
  `updateOptions()` is Obsidian's public API for "editor-extension-affecting settings
  changed"; obsidian-lapel confirms the pattern works in the wild.
- [x] 5.4 Consolidate to one shared `parse()`/`decorate()` pass per transaction — done:
  `docFacts()` in `decorations.ts` computes parse/decorate/computeLineGuides once per
  document and caches by the CM6 `Text` instance (WeakMap, no invalidation logic — entries
  die with the document; sound because the facts depend on nothing but the text, with mode
  gating and `markerVisibility` filtering both applied downstream by the consumers). All
  three `ViewPlugin`s now share it; non-doc updates (mode toggles, selection nudges) reuse
  the cache too, so they no longer reparse at all. Building only over `view.viewport`
  (rebuild on `docChanged || viewportChanged`) remains a further, separately-deferred
  option — obsidian-lapel demonstrates the standard shape, and additionally shows CM6's
  own incremental `syntaxTree` could supply per-line *kind* classification with no
  separate reparse, though not our tree *depths* (our universal-tree semantics aren't in
  CM6's grammar).
- [ ] 5.5 Adopt the declarative settings API (`getSettingDefinitions`) for
  `TrueOutlinerSettingTab` in `main.ts` — the one remaining `npm run lint` warning as of this
  backfill (`obsidianmd/settings-tab/prefer-setting-definitions`; confirmed 0 errors, 1
  warning on `main`). Split out as its own task rather than bundled with 5.6, since the
  `eslint-plugin-obsidianmd` *errors* Experiment 5a originally introduced (inline styles
  tripping `no-static-styles-assignment`/`prefer-create-el`) are already resolved on `main`
  — see the corresponding status note in doc 10.
- [ ] 5.6 Polish: `aria-hidden="true"` on the marker SVGs (decorative, screen readers should
  skip them); untested contexts — RTL text, IME composition at line start, community themes
  beyond those already exercised (bundled light/dark, one community theme for guides only).
- [x] 5.7 Mobile-emulation verification pass — done (PR #7, "test: automate mobile smoke
  testing via Obsidian mobile emulation"). This is a feedback loop for continuously
  assessing mobile feasibility, not a hard mobile-support requirement — full mobile support
  isn't a goal at this stage; the project's standing bar remains "mobile-safe from day 1,
  desktop-tested for v1.0" (docs/research/04-open-questions.md Q7). The value is early
  discovery: if a design or architecture choice here would make mobile support harder or
  impossible later, we want that insight now, while it's cheap to react to, rather than once
  mobile becomes the focus.

  Ran the full decoration corpus (`50-decorations.e2e.ts`, `51-guides-gradient.e2e.ts`,
  `52-block-markers-icons.e2e.ts`) plus the real-vault-equivalent screenshots, under
  Obsidian's mobile emulation (390×844 viewport) against the merged 1 → 2b → 5a
  implementation — never previously exercised under mobile emulation. Result: no
  mobile-specific rendering issues found. Indentation, guides, and markers all render
  correctly at the narrow viewport; the "mobile-safe" goal (CM6 `Decoration`/CSS/DOM only, no
  Node/Electron APIs) holds under emulation, consistent with `no-nodejs-modules` already
  enforcing it statically. One local-machine artifact was observed and ruled out during this
  pass: screenshot-heavy tests in `50-decorations.e2e.ts` timed out (chromedriver render
  timeouts) when run as part of the full suite on a memory-pressured dev machine, but passed
  cleanly in three separate isolated reruns against the same code — attributed to session
  degradation from local system load, not a defect; confirmed clean on a fresh CI runner.

  Not covered by this pass: the real Capacitor mobile app (emulation is still Electron under
  a phone-sized viewport, so it can't surface a platform gap that isn't viewport/CSS) — see
  README's "Mobile testing" section for the real-Android/iOS coverage gap and options.
- [ ] 5.8 Accepted design costs, restated so they aren't rediscovered as bugs: every
  non-list line reserves a 1.25rem marker gutter, so text visibly shifts when toggling
  outline mode; two Experiment-1 invariants were knowingly relaxed (depth-0 lines are no
  longer padding-free; same-depth list items vs. atoms no longer share a column). The
  pure-list invariant (spec.md's "A pure list renders byte-identical to outline-mode-off")
  still holds unconditionally.

## 6. Open question (not yet decided, not a committed task)

**Shrinking only our own added list margin.** Raised during Experiment 1's review. List
items sit visibly further right than a same-depth sibling paragraph/blockquote — this is
Obsidian's own native list hang (`text-indent`/`padding-left`), present in vanilla Obsidian
regardless of outline mode, not a regression this design introduces. A narrower,
still-additive-only fix stays open as a possible follow-up: reduce only the margin *we* add*
to list items by the list root's own native hang width, read live via `getComputedStyle`
(the same technique Experiment 1's table-padding fix already established). Two risks noted
but unresolved before attempting it: (a) clamping so a shallow `supplementalDepth` never
goes negative once the hang is subtracted; (b) the compensation must be based on the list
**root**'s own hang, not each item's, since nested items can have wider markers (e.g. `10.`
vs. `-`) with different native hang widths — compensating per-item would reintroduce the
kind of within-list misalignment the wide-numbering fixture exists to catch. See
[docs/research/10-experiment-5-block-markers.md](../../../docs/research/10-experiment-5-block-markers.md#open-question-shrinking-only-our-own-added-list-margin)
for the full framing. Not scheduled; revisit only on deliberate follow-up, not as part of
the hardening checklist above.
