# Tasks: outline-selection-enforcement

## 1. Pure classifier core (Phase A foundation)

- [x] 1.1 Define the transaction-facts data shape and the six-class taxonomy in a new
      pure module `src/classify.ts` (no CM6/Obsidian imports): `classify(facts, doc)`
      evaluating classes in the D2 order, default-permit
- [x] 1.2 Implement node-span resolution for change ranges and selection ends over
      `OutlineDoc` (reusing/extending `src/plugin/locate.ts` line→node resolution;
      decide whether `nodeAtLine` moves into core or classify takes a resolver) —
      moved to `src/locate.ts` (core), `src/plugin/locate.ts` re-exports it
- [x] 1.3 Unit + property tests for the classifier: every class reachable, exactly one
      class per input, order precedence, default-permit on unknown facts, gap-line and
      preamble edge cases

## 2. Funnel adapter and instrumentation (Phase A wiring)

- [x] 2.1 Add the `parsedDoc(doc)` WeakMap parse cache module with timing capture
- [x] 2.2 Implement the `transactionFilter` adapter in `src/plugin/`: outline-mode gate
      via `editorInfoField`, fact extraction (userEvent annotation, composition state,
      change spans, selection ranges), classify, pass through unmodified (Phase A:
      no transaction is altered) — implemented together with 5.1's escalation branch
      in the same adapter (`transaction-filter.ts`), since both phases ship in this
      change
- [x] 2.3 Implement the stats surface: per-class counters, timing aggregates
      (median/p95), bounded ring buffer; expose as a public field on the plugin
      instance for e2e reads
- [x] 2.4 Gate per-transaction console logging behind the existing crosscheck debug
      setting; add the dev command that prints a stats summary
- [x] 2.5 Register the extension in `main.ts` alongside grammar/decorations; verify
      off-mode notes record nothing (spec: off-mode untouched) — verified by e2e in
      section 3/5

## 3. Phase A evidence suite (choke-point assumptions, falsifiable)

- [x] 3.1 New e2e spec: coverage matrix — typing, paste, mouse drag selection, keyboard
      selection, find-and-replace, drag-drop text, programmatic edit each assert their
      observed classification via the stats surface — `60-transaction-classification.e2e.ts`;
      find-and-replace and drag-drop-text are not separately automated (see 3.8 findings:
      real mouse-driven paste/drag/type/select coverage was prioritized; find-and-replace
      and reordering-drag are UI-panel/native-DnD gestures WebDriver doesn't reliably
      synthesize — flagged as a follow-up if dedicated coverage is wanted later)
- [x] 3.2 e2e: programmatic/remote pass-through — `setValue`-style full-document
      replacement and undo/redo classified `programmatic`, applied byte-identically —
      finding: undo bypasses the filter entirely (stronger than "classified
      programmatic"); see 3.8
- [x] 3.3 e2e: plugin-own recognition — grammar Tab/Enter and structural commands
      classified `plugin-own`, output byte-identical to pre-filter behavior
- [x] 3.4 e2e: nested-editor degeneracy — type/select/drag inside a wide-table cell;
      assert no enforcement effect and stock cell behavior (D6 primary hypothesis) —
      CONFIRMED live, degeneracy holds, no fallback flag needed
- [x] 3.5 e2e: non-mutation contract — a scripted edit sequence yields a buffer
      byte-identical to the same sequence with the plugin's filter absent — compared
      on-mode vs. off-mode (off-mode's per-transaction early-return IS "filter absent"
      for any pass-through class) plus an undo-stack non-interference check
- [x] 3.6 Performance measurement on a ~2000-line stress note: record median/p95
      against the D7 budget; add the stress fixture if the corpus lacks one — budget met
      on real typing + real mouse-drag selection; see 3.8 for numbers
- [x] 3.7 IME composition check (manual if not automatable in the harness): composition
      transactions classified `composition` and uninterfered; record the verdict —
      not automatable (WebDriver has no reliable IME composition event synthesis), so
      verified manually (2026-07-20, Chinese IME in the dev vault with debug logging
      on): transactions during composition classify `composition`; the commit
      transaction once a character is selected classifies `programmatic` — both are
      pass-through classes, so composition is never interfered with at any stage
- [x] 3.8 Record Phase A findings (observed userEvent values per source, timings,
      nested-editor verdict) in design.md and docs/research/04; falsified assumptions
      block Phase B until the design is amended — no assumption was falsified in a way
      that blocks Phase B (both surprises were toward MORE safety, not less); see
      design.md's Open Questions and docs/research/04 Q14

## 4. Selection escalation core (Phase B foundation)

- [x] 4.1 Implement escalation math as a pure function in `src/` per D4: same-node
      pass-through, deepest-common-ancestor sibling-subtree cover, orientation
      preservation, preamble jurisdiction (D5), per-range multi-selection handling
      (per-range iteration lives in the adapter — `src/escalate.ts` handles one range)
- [x] 4.2 Unit + property tests: escalated ranges always start/end at subtree
      boundaries, idempotence (escalating an escalated range is a no-op), orientation
      preserved, within-node and cursor inputs unchanged, preamble ranges unchanged

## 5. Selection enforcement wiring (Phase B)

- [x] 5.1 Extend the filter adapter: for `selection-only` transactions, apply escalation
      and return `[tr, { selection }]`; all other classes keep selections untouched
- [x] 5.2 e2e: boundary-crossing mouse drag (forward and backward) escalates to whole
      subtrees; within-node drag and double-click word selection stay native — real
      `browser.action('pointer')` drags via `coordsAtPos`, not `Editor.setSelection`
- [x] 5.3 e2e: Shift+ArrowDown crossing a boundary escalates; heading→section subtree
      case; live-drag stability across multiple pointer updates (D4/risk scenario) —
      no flicker across 6-step drags, run 3x for stability confidence
- [x] 5.4 e2e: Select All with frontmatter is stock; off-mode drag is stock;
      programmatic mid-node selection restore is untouched — Select All's stock
      behavior with frontmatter turned out not to match this change's initial
      assumption (see 3.8/design.md); test compares on-mode vs. off-mode directly
      rather than asserting an assumed absolute position, so it's correct either way
- [x] 5.5 Multi-range escalation test (unit-level at minimum; e2e if the harness can
      produce multi-cursor selections) — unit: escalate.test.ts's property tests;
      e2e: real add-range mouse/keyboard gestures (Cmd+click, Cmd+drag) proved
      unreliable in this WebDriver harness (modifier state didn't survive across
      separate `performActions` calls — a harness limitation, confirmed with two
      different gesture attempts); `61-selection-enforcement.e2e.ts` instead dispatches
      a real multi-range `select`-annotated transaction directly through the live CM6
      instance, exercising the actual registered filter end-to-end

## 6. Verification and closure

- [x] 6.1 Full test suite (unit + all e2e specs) green twice consecutively; lint clean —
      655 unit tests, 84 e2e tests across 11 spec files, two consecutive green e2e runs
      (`00:01:58` and `00:02:00`), `tsc --noEmit` and `eslint src tests` clean
- [x] 6.2 Build and install into the dev vault (`npm run build:plugin && npm run
      vault:install`) — done; the *real-vault manual pass focused on selection feel*
      itself is NOT done — it requires a human actually dragging/typing in their own
      vault and judging whether escalation feels right, which this session cannot do
      (see design.md's Open Questions: the functional/correctness half is e2e-verified,
      the subjective-feel half is not)
- [x] 6.3 Record the manual-pass verdict and the open-question answers (drag timing,
      escalate-vs-clamp feel, perf numbers) in design.md; park any deferred UX ideas
      in the decoration follow-ups doc or a new follow-ups home as appropriate —
      manual pass done (2026-07-20): escalation works and feels right, live-drag
      timing confirmed, escalate (not clamp) confirmed; three follow-up findings
      parked in docs/research/13-selection-follow-ups.md (widget-internal drags are
      a native limitation; single-node selection via gap-line trigger and uniform
      multi-range escalation adopted as amendments — section 7)

## 7. Manual-pass amendments (2026-07-20)

Adopted from the real-vault manual pass (docs/research/13-selection-follow-ups.md
items 2 and 3; item 1 stays a documented native limitation):

- [x] 7.1 Amend the node-selection-enforcement delta spec and design.md D4:
      gap-line trigger (single-node selection), expand-only invariant, uniform
      multi-range escalation
- [x] 7.2 Implement the gap-line trigger and expand-only union in `src/escalate.ts`;
      unit + property tests (containment property, idempotence still holds,
      single-paragraph Select All unchanged)
- [x] 7.3 Implement uniform multi-range escalation as a pure `escalateRanges` in
      `src/escalate.ts`; rewire the adapter to use it; unit tests (mixed → all
      escalate, all-within → all native, cursors and preamble ranges untouched)
- [x] 7.4 e2e: gap-drag selects a single node whole (real mouse drag);
      no-frontmatter Select All is stock; uniform multi-range and all-within-native
      (existing mixed-range test's expectations updated to the uniform rule)
- [x] 7.5 Full verification (unit + e2e suites green, lint/typecheck clean) and
      `vault:install` — 667 unit tests, 89 e2e tests across 11 spec files, lint and
      typecheck clean; amended build installed into the dev vault
- [x] 7.6 Restructure docs/research/13 as the deferred-work home: mark adopted
      items; split remaining threads into two explicit tracks so Phase C keeps its
      original edit-rewriting scope — Phase C inputs (paste-site structural
      handling, gap-line deletion semantics) vs. a separate selection-UX track
      (select-all ladder, modal block selection, bullet-click, block-level
      selection rendering)
