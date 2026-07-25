## 0. Root-cause findings already recorded

Done during the proposal round; listed so the reasoning behind D1/D2 is traceable.

- [x] 0.1 Root-cause the Home-vs-ArrowLeft clamp inconsistency via the stats counters:
      Home classifies `programmatic` (no `userEvent`), ArrowLeft classifies `selection-only`.
      The funnel is behaving as specified; the clamp simply never sees Home
- [x] 0.2 Measure Escape on a covering selection: first press changes nothing, second
      collapses to the head edge, which is a gap-line position
- [x] 0.3 Measure caret behavior in frontmatter: Live Preview already keeps the caret out of
      rendered properties, landing it on the blank line below the closing `---`
- [ ] 0.4 Re-run the measurement set against `latest-beta` — the probe ran on Obsidian 1.12.7,
      and Q21 showed automated and manual testing can sit on different CodeMirror cores, which
      hid a real bug through three reports

## 1. Vertical-motion prototype (gate for D3)

Nothing downstream is settled until this answers. `docs/research/13` names goal-column
drift as the specific reason this work was deferred, and says it needs hands-on testing
against real navigation rather than a code-review call.

- [ ] 1.1 Prototype ArrowUp/ArrowDown as keymap commands that delegate to CM6's native
      vertical motion, then apply D3's two corrections — CONTINUE past a line with no
      content, CLAMP within a line whose content the goal column merely missed — without
      recomputing the goal column
- [ ] 1.2 Hands-on pass in the real vault: long ragged paragraphs, loose lists, deep
      nesting, headings with sections, a wrapped paragraph — checking whether repeated
      presses stay visually aligned
- [ ] 1.3 Confirm the marker-clamp case survives (examples.md A5): vertical motion onto a
      list item whose marker occupies the goal column lands on that item's content, never
      skipping it
- [ ] 1.4 Record the verdict in `docs/research/04` as a numbered finding; if the goal
      column drifts, revise design.md D3 before continuing

## 2. Pure decision modules

- [ ] 2.1 Add the addressable-position predicate over `OutlineDoc` — content spans of
      every node, excluding gap lines and list-item marker prefixes, including heading
      `#` prefixes, atom interiors, continuation-line content columns, and the whole
      preamble (out of jurisdiction, always addressable)
- [ ] 2.2 Add the placement resolver (D2): a non-addressable position maps to the owning
      node's content end for gap lines, and to the line's content-start column for marker
      prefixes — no proximity heuristic, and no effect in the preamble
- [ ] 2.3 Add the horizontal-motion planner: content-boundary crossing in both directions,
      silent no-op at document boundaries, stock pass-through in the preamble
- [ ] 2.4 Add the Home/End rung planner: visual-row boundary, then node content boundary,
      with adjacent-identical-rung collapse
- [ ] 2.5 Add the extension planner as an ordered SEQUENCE OF COVERS per (anchor node,
      direction), omitting steps that leave the cover unchanged — derived from the current
      cover plus the range's orientation, never from a stored head node, since one cover can
      correspond to several head nodes
- [ ] 2.6 Unit tests for each module, mirroring `tests/escalate.test.ts`'s style
- [ ] 2.7 Property tests: every position a planner returns is addressable OR lies in the
      preamble; consecutive covers in a sequence are strictly nested; opposite presses are
      mutual inverses **over covers**, not over head-node identity

## 3. CM6 wiring

- [ ] 3.1 Bind the motion keys in the existing high-precedence, outline-mode-gated keymap
      alongside the structural grammar
- [ ] 3.2 Bind Shift+ArrowUp/Shift+ArrowDown to the extension planner, per-range
- [ ] 3.3 Wire the resolver at `clampCursorToContent`'s existing call site in
      `src/plugin/transaction-filter.ts`, inheriting its jurisdiction exactly: it runs for
      `selection-only` transactions in outline-mode editors and for nothing else. Add an
      explicit regression that `programmatic` and `plugin-own` placements pass through
      untouched
- [ ] 3.4 Retire `clampCursorToContent` from `src/escalate.ts`; confirm no escalation math
      changes
- [ ] 3.5 Verify extension dispatches pass through the filter uncorrected, the way
      `progressive-select-all`'s ladder rungs already do

## 4. Regression and invariant updates

- [ ] 4.1 Update `tests/escalate.test.ts`: the "cursors are never moved" property is
      reversed for gap lines and the marker clamp is gone; keep empty-range pass-through
      through `escalateRanges` itself
- [ ] 4.2 Confirm `node-edit-enforcement`'s merge and veto behavior is unchanged with the
      gap-line escape hatch unreachable — the merge path reads the cursor's node, which
      can no longer be a gap
- [ ] 4.3 Confirm `structural-history-integration`'s redo behavior is intact: the
      `CURSOR_REASSERT_USER_EVENT` transaction must land byte-exactly, so `selectionsAfter`
      records the intended cursor. This is the specific way the resolver could reintroduce
      the bug Q21 closed
- [ ] 4.4 Confirm `progressive-select-all`'s ladder is untouched, including its
      list-item content rung and multi-range independence
- [ ] 4.5 Confirm block-selection chrome still renders for extension-produced covers
      (`escalated-selection-decoration` reads covers, not their provenance)
- [ ] 4.6 Re-point `61-selection-enforcement.e2e.ts`'s keyboard-crossing assertion at a
      pointer drag — after this change Shift+ArrowDown no longer reaches escalation, and the
      existing assertion passes only coincidentally (two presses reach the same cover)

## 5. End-to-end verification

- [ ] 5.1 New e2e spec driving real keyboard input for every example in examples.md
      sections A–C and F
- [ ] 5.2 Real-pointer coverage for examples.md section D (gap click, marker click)
- [ ] 5.3 Extension coverage for section E, including E4b's jump, E5/E6's shrink and
      reversal, and E8's two-cursor case
- [ ] 5.4 Preamble coverage for section G: motion in and around frontmatter is stock in both
      Live Preview and Source mode, and extension does not reach into it
- [ ] 5.5 Off-mode reference assertions for every bound key, confirming stock behavior
- [ ] 5.6 Mobile-emulation run of the same suite

## 6. Real-vault manual pass

The gate this project applies to every foundational change; the probe pass that produced
examples.md measured today's behavior, not the new behavior.

- [ ] 6.1 Manual pass on real notes, working from examples.md as the script
- [ ] 6.2 Feel out the two flagged questions: E4b's jump (a down key extending upward),
      and Home's first rung on a genuinely wrapped paragraph
- [ ] 6.3 Exercise node kinds outside the fixtures — callouts, tables, code blocks,
      front-matter adjacency, embeds — and record what breaks rather than pre-guessing
- [ ] 6.4 Investigate why the first Escape on a covering selection does nothing; likely the
      blur-based chrome mechanism. Not a blocker — the placement rule handles the landing
      either way — but worth understanding before it is mistaken for a new bug
- [ ] 6.5 Record findings in `docs/research/04`; fold clean fixes into this change, spin
      out anything that changes a different capability's committed contract

## 7. Documentation

- [ ] 7.1 Update examples.md with any behavior the manual pass revises, keeping measured
      and intended frames distinguished
- [ ] 7.2 Update `docs/research/13`'s deferred entries: mark "Gap-line cursor
      transparency" resolved, and note what modal block selection still owns
- [ ] 7.3 Record the Esc decision (left native, D8) where the modal-selection thread can
      find it
