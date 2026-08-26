## 1. Measure the levers before writing a rule (design D1)

- [ ] 1.1 With the caret on an empty `- ` item in a running Obsidian, dump the marker span's own
      subtree: whether `.list-bullet` is present, its computed `display`, `width` and padding,
      and where its `::after` dot paints relative to the span's content-box origin. The rules in
      `styles.css` assume the dot centres on a zero-width CONTENT box; this is the check that it
      does, and that the element exists at all while the caret is on its line.
- [ ] 1.2 The same for an empty `2. ` item: whether `.list-number` wraps the digits on the
      caret's own line, and what the span, the number and the trailing space each measure. If it
      is absent, D3 has no lever and the ordered scenarios come out of the delta — record the
      finding and say so rather than substituting a different mechanism.
- [ ] 1.3 Confirm the range semantics D1 rests on, directly rather than by reasoning: give a
      list-bullet element a trailing padding by hand, then read `.cm-cursor`'s x on that line.
      The caret moves by the padding or D2's fallback (width plus a re-centred `::after`) is the
      one to build.
- [ ] 1.4 Record all three in `docs/research/12-decoration-follow-ups.md` alongside the
      measurement table this change already carries, whichever way they come out. A measurement
      that decided a design is worth as much as one that found a defect.

## 2. The bullet's own width (design D2)

- [ ] 2.1 In `styles.css`, move the gutter onto `.list-bullet` as
      `padding-inline-end: calc(var(--to-marker-gutter) - var(--to-space-advance))`, keeping
      `width: 0`. Leave `min-width` on `.cm-formatting-list` in place — it stops binding for
      bullets and is still what a wider-than-gutter marker and the other kinds rely on.
- [ ] 2.2 State the reason in the rule's own comment: the caret is measured from the text run,
      so a width on the span around it is invisible to the caret while a padding on an element
      inside it is not. Explain the mechanism; do not restate the declaration and do not argue
      for it.
- [ ] 2.3 Check the bullet's own column is untouched — the dot's painted centre is still on the
      depth column at every depth, which is `outline-decorations`' shared-column requirement and
      already has assertions in `56-list-grid`. Run them; do not add a second copy.

## 3. The ordered number's shift and width (design D3)

- [ ] 3.1 Replace the `transform` on `.cm-formatting-list-ol` with the pair on `.list-number`:
      `min-width: calc(var(--to-marker-gutter) - var(--to-space-advance) + var(--to-marker-icon-size) / 2)`
      and `margin-inline-start: calc(var(--to-marker-icon-size) / -2)`.
- [ ] 3.2 Re-measure the two things the existing rule was written for, and state the numbers:
      an ordered number's painted left edge against a block marker icon's, and a wide `10. `
      pushing its own text out rather than crossing the column. Both are asserted in
      `56-list-grid`; both must hold with no change to those assertions.
- [ ] 3.3 Fold the old comment's reasoning into the new rule rather than dropping it — the fixed
      half-icon shift, why it is not half the number's own width, and what a wide marker does —
      and add only what the move itself needs explaining.
- [ ] 3.4 Confirm the fold chevron rule is unaffected: it is positioned from the gutter and the
      icon size, not from the marker span's box, and `56-list-grid` measures its distance from
      the mark. Run those cases.

## 4. Where the space advance comes from (design D4)

- [ ] 4.1 Widen `MarginCompensation.measureSpaceAdvance` (src/plugin/decorations.ts) to measure
      from an ordinary list line's marker span when no task line is in the viewport: the span's
      last text node is exactly one space. Keep the existing guard shape — a measurement whose
      character is not a space, or whose width is zero, is refused rather than published.
- [ ] 4.2 Update the doc comment above it: three kinds read this variable now, so it is a list
      line's metric rather than a task label's, and any list line may supply it.
- [ ] 4.3 E2e: a document containing only bullet items publishes a MEASURED `--to-space-advance`,
      not the CSS fallback. `56-list-grid` already asserts this for the task-line source; extend
      that case rather than writing a parallel one.

## 5. The task item's caret (design D5)

- [ ] 5.1 In `src/caret-policy.ts`, apply the exception on the resulting position, after the
      per-case branch: a caret at the content start of an item `itemContentIsEmpty` recognises
      moves to that item's content end. Import the predicate from `ops.ts`; do not restate what
      empty means.
- [ ] 5.2 Comment it where the rule sits: the marker at that position is one the grammar's own
      continuation rule wrote, typing at the content start destroys it, and the outcome form is
      what keeps a future `CaretOp` case from forgetting the rule.
- [ ] 5.3 Unit-test in `tests/caret-placement.test.ts`: Enter at the end of `- [x] done` leaves
      the caret at the end of the new `- [ ] ` line; `- [ ] alpha` and `- [x] ` both keep the
      ordinary content start; a plain `- ` is unchanged, its two positions coinciding.
- [ ] 5.4 Pin what does NOT change, in the same file: `content-space-caret`'s boundary, so every
      position inside `[ ] ` stays addressable, and Home's landing on an empty task item. These
      are the invariants `enter-and-shift-enter-grammar` D5 protects.
- [ ] 5.5 Negative control for the group: remove the exception and confirm 5.3's first case
      fails while 5.3's later cases and 5.4 still pass — the ones that would pass either way are
      exactly the ones that must be shown to.
- [ ] 5.6 E2e in `30-keyboard-grammar.e2e.ts`: Enter on a task item, then type a character, and
      the buffer reads `- [ ] foo`. This is the defect as it was reported — a document outcome,
      not a caret coordinate.

## 6. Rendered verification (design D6, D7)

- [ ] 6.1 New cases in `e2e/specs/56-list-grid.e2e.ts`, measuring `.cm-cursor`'s own client rect
      and never `coordsAtPos` — that function reports the end of a marker's text and so agrees
      with this defect, as the suite's own header already records for the soft-wrap case.
- [ ] 6.2 An empty `- ` item's caret sits on that item's own text column, at the top level and
      nested two levels deep. Take the text column the way this suite already takes one — from a
      sibling item's text node — so the assertion is a relationship and not a pixel.
- [ ] 6.3 An empty `2. ` item's caret sits on the same column as an empty `- ` item's at the same
      depth.
- [ ] 6.4 Typing the first character into an empty item does not move the caret's column: measure
      before and after, and assert the character renders where the caret was.
- [ ] 6.5 An item WITH content is unchanged — the caret at its content start is on its text's
      first character, as it was before this change.
- [ ] 6.6 Negative controls: remove 2.1's padding and confirm 6.2 and 6.4 fail; remove 3.1's pair
      and confirm 6.3 fails. Neither is optional — an assertion stated loosely enough to pass
      against the unfixed rules is the failure mode this suite has hit four times.
- [ ] 6.7 Run the whole of `56-list-grid` and confirm every existing case passes unchanged. That
      suite IS the guarantee that the text column, the marker column, the hanging indent and the
      wrapped-row column did not move, and the new requirement's last scenario is exactly that
      claim.

## 7. The continuation line, measured and recorded (design, Open Questions)

- [ ] 7.1 Measure the caret on a whitespace-only continuation line now that
      `.cm-hmd-list-indent` carries a stated width — the second offset
      `docs/research/12-decoration-follow-ups.md` records as still open, whose recorded number
      predates that width and is stale in an unknown direction.
- [ ] 7.2 If the same lever closes it, close it here and add the case to 6's group. If it does
      not, update the entry in `docs/research/12-decoration-follow-ups.md` with what it now
      measures and why the lever does not reach it. Either outcome is a completed task; leaving
      the stale number standing is not.

## 8. The gate

- [ ] 8.1 Real-vault pass by hand over `test-vault/`, in both bundled themes: press Enter on a
      bullet, an ordered item and a task item at several depths, delete an item's text down to
      its marker, and watch the caret rather than the columns. The fixtures can say the caret is
      on the right column; only this can say the jump is gone.
- [ ] 8.2 Fold anything the pass turns up into
      `docs/research/12-decoration-follow-ups.md` rather than into new tasks here.
