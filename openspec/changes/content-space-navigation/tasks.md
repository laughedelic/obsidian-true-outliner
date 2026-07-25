## 1. Vertical-motion prototype (gate for D3)

Nothing downstream is settled until this answers. `docs/research/13` names goal-column
drift as the specific reason this work was deferred, and says it needs hands-on testing
against real navigation rather than a code-review call.

- [ ] 1.1 Prototype ArrowUp/ArrowDown as keymap commands that delegate to CM6's native
      vertical motion and continue in the same direction while the landing position is a
      gap line, without recomputing the goal column
- [ ] 1.2 Hands-on pass in the real vault: long ragged paragraphs, loose lists, deep
      nesting, headings with sections, a wrapped paragraph — checking whether repeated
      presses stay visually aligned
- [ ] 1.3 Record the verdict in `docs/research/04` as a numbered finding; if the goal
      column drifts, revise design.md D3 before continuing

## 2. Pure decision modules

- [ ] 2.1 Add the addressable-position predicate over `OutlineDoc` — content spans of
      every node, excluding gap lines and list-item marker prefixes, including heading
      `#` prefixes, atom interiors, and continuation-line content columns
- [ ] 2.2 Add the placement resolver (D2): a non-addressable position maps to the owning
      node's content end for gap lines, and to the line's content-start column for marker
      prefixes — no proximity heuristic
- [ ] 2.3 Add the horizontal-motion planner: content-boundary crossing in both directions,
      silent no-op at document boundaries
- [ ] 2.4 Add the Home/End rung planner: visual-row boundary, then node content boundary,
      with adjacent-identical-rung collapse
- [ ] 2.5 Add the extension planner: (anchor node, head node) walk over content order,
      skipping steps that leave the cover unchanged, symmetric in both directions,
      bottoming out at the anchor node — reusing `escalate.ts`'s cover geometry, not
      `select-all-ladder.ts`'s rungs
- [ ] 2.6 Unit tests for each module, mirroring `tests/escalate.test.ts`'s style
- [ ] 2.7 Property tests: every position any planner returns is addressable; extension
      walks are exact inverses; extension output is always an exact cover

## 3. CM6 wiring

- [ ] 3.1 Bind the motion keys in the existing high-precedence, outline-mode-gated keymap
      alongside the structural grammar
- [ ] 3.2 Bind Shift+ArrowUp/Shift+ArrowDown to the extension planner, per-range
- [ ] 3.3 Route pointer clicks and other non-motion placements through the resolver
- [ ] 3.4 Retire `clampCursorToContent` from `src/escalate.ts` and its call site in
      `src/plugin/transaction-filter.ts`; confirm no escalation math changes
- [ ] 3.5 Verify extension dispatches pass through the filter uncorrected, the way
      `progressive-select-all`'s ladder rungs already do

## 4. Regression and invariant updates

- [ ] 4.1 Update `tests/escalate.test.ts`: the "cursors are never moved" property is
      reversed for gap lines and the marker clamp is gone; keep empty-range pass-through
      through `escalateRanges` itself
- [ ] 4.2 Confirm `node-edit-enforcement`'s merge and veto behavior is unchanged with the
      gap-line escape hatch unreachable — the merge path reads the cursor's node, which
      can no longer be a gap
- [ ] 4.3 Confirm `progressive-select-all`'s ladder is untouched, including its
      list-item content rung and multi-range independence
- [ ] 4.4 Confirm block-selection chrome still renders for extension-produced covers
      (`escalated-selection-decoration` reads covers, not their provenance)

## 5. End-to-end verification

- [ ] 5.1 New e2e spec driving real keyboard input for every example in examples.md
      sections A–C and F
- [ ] 5.2 Real-pointer coverage for examples.md section D (gap click, marker click)
- [ ] 5.3 Extension coverage for section E, including E4b's jump, E5/E6's shrink and
      reversal, and E8's two-cursor case
- [ ] 5.4 Off-mode reference assertions for every bound key, confirming stock behavior
- [ ] 5.5 Mobile-emulation run of the same suite

## 6. Real-vault manual pass

The gate this project applies to every foundational change; the probe pass that produced
examples.md measured today's behavior, not the new behavior.

- [ ] 6.1 Manual pass on real notes, working from examples.md as the script
- [ ] 6.2 Feel out the two flagged questions: E4b's jump (a down key extending upward),
      and Home's first rung on a genuinely wrapped paragraph
- [ ] 6.3 Exercise node kinds outside the fixtures — callouts, tables, code blocks,
      front-matter adjacency, embeds — and record what breaks rather than pre-guessing
- [ ] 6.4 Record findings in `docs/research/04`; fold clean fixes into this change, spin
      out anything that changes a different capability's committed contract

## 7. Documentation

- [ ] 7.1 Update examples.md with any behavior the manual pass revises, keeping measured
      and intended frames distinguished
- [ ] 7.2 Update `docs/research/13`'s deferred entries: mark "Gap-line cursor
      transparency" resolved, and note what modal block selection still owns
- [ ] 7.3 Record the Esc decision (left native, D8) where the modal-selection thread can
      find it
