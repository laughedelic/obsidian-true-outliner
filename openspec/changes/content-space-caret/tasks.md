## 0. Root-cause findings already recorded

Done during the proposal round; listed so the reasoning behind D1/D2 is traceable.

- [x] 0.1 Root-cause the Home-vs-ArrowLeft clamp inconsistency via the stats counters:
      Home classifies `programmatic` (no `userEvent`), ArrowLeft classifies `selection-only`.
      The funnel is behaving as specified; the clamp simply never sees Home
- [x] 0.2 Measure Escape on a covering selection: first press changes nothing, second
      collapses to the head edge, which is a gap-line position
- [x] 0.3 Measure caret behavior in frontmatter: Live Preview already keeps the caret out of
      rendered properties, landing it on the blank line below the closing `---`
- [x] 0.4 Instrument the keydown path to check nothing consumes Home ahead of CodeMirror:
      Home is unprevented at document-capture and prevented by the time it passes
      `contentDOM`, the same profile as ArrowLeft, so no document-level scope handler takes
      it first and research 13's `runScopeHandlers` double-fire mode does not apply
- [ ] 0.5 Close the remaining inference directly, BEFORE retiring `clampCursorToContent`:
      bind Home in the plugin's own `Prec.highest` keymap, press it once, and confirm the
      handler fires exactly once and the caret does not also move from Obsidian's own
      handler. This is the single assumption D1 rests on
- [ ] 0.6 Re-run the measurement set against `latest-beta` — the probe ran on Obsidian 1.12.7,
      and Q21 showed automated and manual testing can sit on different CodeMirror cores, which
      hid a real bug through three reports

## 1. Vertical-motion prototype (gate for D3)

Nothing downstream is settled until this answers. `docs/research/13` names goal-column drift as
the specific reason this work was deferred, and says it needs hands-on testing against real
navigation rather than a code-review call.

- [ ] 1.1 Prototype ArrowUp/ArrowDown as keymap commands that delegate to CM6's native vertical
      motion, then apply D3's two corrections — CONTINUE past a line with no content, CLAMP
      within a line whose content the goal column merely missed — without recomputing the goal
      column
- [ ] 1.2 Hands-on pass in the real vault: long ragged paragraphs, loose lists, deep nesting,
      headings with sections, a wrapped paragraph — checking whether repeated presses stay
      visually aligned
- [ ] 1.3 Confirm the marker-clamp case survives (examples.md A5): vertical motion onto a list
      item whose marker occupies the goal column lands on that item's content, never skipping it
- [ ] 1.4 Record the verdict in `docs/research/04` as a numbered finding; if the goal column
      drifts, revise design.md D3 before continuing

## 2. Pure decision modules

- [ ] 2.1 Add the addressable-position predicate over `OutlineDoc` — content spans of every
      node, excluding gap lines and list-item marker prefixes, including heading `#` prefixes,
      atom interiors, continuation-line content columns, and the whole preamble
- [ ] 2.2 Add the placement resolver (D2): a non-addressable position maps to the owning node's
      content end for gap lines, and to the line's content-start column for marker prefixes —
      no proximity heuristic, and no effect in the preamble
- [ ] 2.3 Add the horizontal-motion planner: content-boundary crossing in both directions,
      silent no-op at document boundaries, stock pass-through in the preamble
- [ ] 2.4 Add the Home/End rung planner: visual-row boundary, then node content boundary, with
      adjacent-identical-rung collapse
- [ ] 2.5 Unit tests for each module, mirroring `tests/escalate.test.ts`'s style
- [ ] 2.6 Property test: every position any planner returns is addressable OR lies in the
      preamble, over generated documents

## 3. CM6 wiring

- [ ] 3.1 Bind the motion keys in the existing high-precedence, outline-mode-gated keymap
      alongside the structural grammar
- [ ] 3.2 Wire the resolver at `clampCursorToContent`'s existing call site in
      `src/plugin/transaction-filter.ts`, inheriting its jurisdiction exactly: it runs for
      `selection-only` transactions in outline-mode editors and for nothing else. Add an
      explicit regression that `programmatic` and `plugin-own` placements pass through untouched
- [ ] 3.3 Retire `clampCursorToContent` from `src/escalate.ts`; confirm no escalation math
      changes

## 4. Regression and invariant updates

- [ ] 4.1 Update `tests/escalate.test.ts`: the "cursors are never moved" property is reversed
      for gap lines and the marker clamp is gone; keep empty-range pass-through through
      `escalateRanges` itself
- [ ] 4.2 Confirm `node-edit-enforcement`'s merge and veto behavior is unchanged with the
      gap-line escape hatch unreachable — the merge path reads the cursor's node, which can no
      longer be a gap
- [ ] 4.3 Confirm every `plugin-own` dispatch still lands byte-exactly through the resolver's
      call site — the class-level guarantee, not any single mechanism
- [ ] 4.4 Confirm `progressive-select-all`'s ladder is untouched, including its list-item
      content rung

## 5. End-to-end verification

- [ ] 5.1 New e2e spec driving real keyboard input for every example in examples.md sections
      A–C and F
- [ ] 5.2 Real-pointer coverage for section D (gap click, marker click)
- [ ] 5.3 Preamble coverage for section G: motion in and around frontmatter is stock in both
      Live Preview and Source mode
- [ ] 5.4 Off-mode reference assertions for every bound key, confirming stock behavior
- [ ] 5.5 Mobile-emulation run of the same suite

## 6. Real-vault manual pass

- [ ] 6.1 Manual pass on real notes, working from examples.md as the script
- [ ] 6.2 Feel out Home's first rung on a genuinely wrapped paragraph — design D5's open question
- [ ] 6.3 Exercise node kinds outside the fixtures — callouts, tables, code blocks, embeds — and
      record what breaks rather than pre-guessing
- [ ] 6.4 Investigate why the first Escape on a covering selection does nothing; likely the
      blur-based chrome mechanism. Not a blocker — the placement rule handles the landing
      either way
- [ ] 6.5 Record findings in `docs/research/04`

## 7. Documentation

- [ ] 7.1 Update examples.md with any behavior the manual pass revises, keeping measured and
      intended frames distinguished
- [ ] 7.2 Update `docs/research/13`: mark "Gap-line cursor transparency" resolved
- [ ] 7.3 Record the Esc decision (left native, D6) where the modal-selection thread can find it
