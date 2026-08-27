## 1. Measure the levers before writing a rule (design D1)

- [x] 1.1 With the caret on an empty `- ` item in a running Obsidian, dump the marker span's own
      subtree: whether `.list-bullet` is present, its computed `display`, `width` and padding,
      and where its `::after` dot paints relative to the span's content-box origin. The rules in
      `styles.css` assume the dot centres on a zero-width CONTENT box; this is the check that it
      does, and that the element exists at all while the caret is on its line.
- [x] 1.2 The same for an empty `2. ` item: whether `.list-number` wraps the digits on the
      caret's own line, and what the span, the number and the trailing space each measure. If it
      is absent, D3 has no lever and the ordered scenarios come out of the delta — record the
      finding and say so rather than substituting a different mechanism.
- [x] 1.3 Confirm the range semantics D1 rests on, directly rather than by reasoning: give a
      list-bullet element a trailing padding by hand, then read the caret's x on that line. The
      caret moves by the padding or D2's fallback (width plus a re-centred `::after`) is the one
      to build. Measured: it moves by exactly the padding, and the dot stays on its column. This
      task was written to read `.cm-cursor`; the same pass found there is no such element —
      Obsidian leaves the cursor layer empty and the browser draws the caret from the DOM
      selection, so it was read through `coordsAtPos`, which agrees with that selection's own
      rect to the hundredth of a pixel (design D6).
- [x] 1.4 Record all three in `docs/research/12-decoration-follow-ups.md` alongside the
      measurement table this change already carries, whichever way they come out. A measurement
      that decided a design is worth as much as one that found a defect.

## 2. The bullet's own width (design D2)

- [x] 2.1 In `styles.css`, move the gutter onto `.list-bullet` as
      `padding-inline-end: calc(var(--to-marker-gutter) - var(--to-space-advance))`, keeping
      `width: 0`. Leave `min-width` on `.cm-formatting-list` in place — it stops binding for
      bullets and is still what a wider-than-gutter marker and the other kinds rely on.
- [x] 2.2 State the reason in the rule's own comment: the caret is measured from the text run,
      so a width on the span around it is invisible to the caret while a padding on an element
      inside it is not. Explain the mechanism; do not restate the declaration and do not argue
      for it.
- [x] 2.3 Check the bullet's own column is untouched — the dot's painted centre is still on the
      depth column at every depth, which is `outline-decorations`' shared-column requirement and
      already has assertions in `56-list-grid`. Run them; do not add a second copy.

## 3. The ordered marker's digits (design D3)

- [x] 3.1 Emit a `Decoration.mark` over an ordered marker's digits and punctuation
      (`computeOrderedDigits`, src/plugin/decorations.ts), from its own ViewPlugin as the
      marker widgets and the selection chrome already do. The mark stops before the marker's
      trailing whitespace: that whitespace is what the caret's range ends at, and a box the
      range ends inside contributes nothing.
- [x] 3.2 In `styles.css`, size the class with
      `min-width: calc(var(--to-marker-gutter) - var(--to-space-advance) + var(--to-marker-icon-size) / 2)`,
      and give the marker span `margin-inline-end: calc(var(--to-marker-icon-size) / -2)` so the
      transform stops leaving a gap between a number and its own text.
- [x] 3.3 Explain the mechanism where each rule sits — why a width on the span around the
      glyphs cannot reach the caret, and what the span's new margin gives back. Do not restate
      the declarations.
- [x] 3.4 Re-measure what the old rule was written for and state the numbers: an ordered
      number's painted left edge against a block marker icon's, and a wide `10. ` pushing its
      own text out. Both are asserted in `56-list-grid`; both must hold with those assertions
      unchanged.
- [x] 3.5 Confirm the fold chevron is unaffected — it is positioned from the gutter and the
      icon size, not from the marker span's box, and `56-list-grid` measures its distance from
      the mark. Run those cases.

## 3a. Gate the compensation on a one-space marker (design D2a)

- [x] 3a.1 Mark the lines the sizing rules can apply to (`ONE_SPACE_MARKER_CLASS`,
      decorations.ts): a list marker followed by exactly one space, nothing else.
- [x] 3a.2 Scope the bullet padding, the ordered digits' width and the ordered span's margin to
      that class, so a marker with more whitespace renders as it did before this change.
- [x] 3a.3 E2e in `56-list-grid.e2e.ts`: a two-space bullet's text begins where a one-space
      bullet's does, and a tab-separated marker keeps its own stop — asserted as relationships,
      never as pixels a space's width decides.
- [x] 3a.4 Negative control: ungate the rules and confirm that case fails.
- [x] 3a.5 Record what the gate leaves unfixed — an empty multi-space bullet's caret is still
      short of its column, which is where it was before this change.

## 4. Where the space advance comes from (design D4)

- [x] 4.1 Widen `MarginCompensation.measureSpaceAdvance` (src/plugin/decorations.ts) to measure
      from an ordinary list line's marker span when no task line is in the viewport: the span's
      last text node is exactly one space. Keep the existing guard shape — a measurement whose
      character is not a space, or whose width is zero, is refused rather than published.
- [x] 4.2 Update the doc comment above it: three kinds read this variable now, so it is a list
      line's metric rather than a task label's, and any list line may supply it.
- [x] 4.3 E2e: a document containing only bullet items publishes a MEASURED `--to-space-advance`,
      not the CSS fallback. `56-list-grid` already asserts this for the task-line source; extend
      that case rather than writing a parallel one.

## 5. The task item's caret (design D5)

- [x] 5.1 In `src/caret-policy.ts`, apply the exception on the resulting position, after the
      per-case branch: a caret at the content start of an item `itemContentIsEmpty` recognises
      moves to that item's content end. Import the predicate from `ops.ts`; do not restate what
      empty means.
- [x] 5.2 Comment it where the rule sits: the marker at that position is one the grammar's own
      continuation rule wrote, typing at the content start destroys it, and the outcome form is
      what keeps a future `CaretOp` case from forgetting the rule.
- [x] 5.3 Unit-test in `tests/caret-placement.test.ts`: Enter at the end of `- [x] done` leaves
      the caret at the end of the new `- [ ] ` line; `- [ ] alpha` and `- [x] ` both keep the
      ordinary content start; a plain `- ` is unchanged, its two positions coinciding.
- [x] 5.4 Pin what does NOT change, in the same file: `content-space-caret`'s boundary, so every
      position inside `[ ] ` stays addressable, and Home's landing on an empty task item. These
      are the invariants `enter-and-shift-enter-grammar` D5 protects.
- [x] 5.5 Negative control for the group: remove the exception and confirm 5.3's first case
      fails while 5.3's later cases and 5.4 still pass — the ones that would pass either way are
      exactly the ones that must be shown to.
- [x] 5.6 E2e in `30-keyboard-grammar.e2e.ts`: Enter on a task item, then type a character, and
      the buffer reads `- [ ] foo`. This is the defect as it was reported — a document outcome,
      not a caret coordinate.

## 5a. Where a task item's content starts, for splitting (design D5a)

- [x] 5a.1 Give `splitNode` its own content-start column (`src/ops.ts`): past the indentation,
      the list marker, and a leading task marker. Use it for both the clamp and the
      content-start test, so the marker-interior case keeps needing no rule of its own.
      `contentColumnCh` is unchanged and keeps its other callers.
- [x] 5a.2 Unit-test in `tests/split.test.ts`: the insert-before outcome and its anchor; the
      children case, which is where the old path corrupted the tree; every position from the
      list marker's end through the task marker's end giving one result; and a CHECKED item,
      whose box is content to the caret but a prefix to the split.
- [x] 5a.3 Pin the interior splits unchanged — mid-text and end-of-node still divide the item
      and still carry the marker to the new one.
- [x] 5a.4 Negative control: restore the old column and confirm 5a.2's four cases fail while
      5a.3's still pass.
- [x] 5a.5 E2e in `30-keyboard-grammar.e2e.ts`: the gesture as reported — cursor where a task
      item's text begins, Enter, then type — and the children case as a buffer assertion.

## 5b. The same column in the Backspace path (design D5b)

- [x] 5b.1 One exported predicate over the two content-start columns (`isContentStartCh`,
      src/ops.ts), called by both gates rather than written twice — they have to agree
      exactly or the keypress either falls through or arrives with nothing to do.
- [x] 5b.2 `classify.ts`'s marker-space deletion shape accepts either column. This is the gate
      that was missing: without it the keypress never reached the enforcement layer at all.
- [x] 5b.3 `enforce.ts`'s merge recognition reads the same predicate.
- [x] 5b.4 `mergeNodes` strips an absorbed item's task marker with its list marker, keeping the
      strip on `LIST_MARKER_SPLIT_RE` so `- # title` keeps its `#` and a bare `-` its marker.
- [x] 5b.5 Unit-test the CLASSIFICATION, not just the verdict: both columns classify as
      boundary-crossing, positions inside `[ ]` do not. A verdict-level test passes against
      the unfixed code, because the class it is handed is the thing that was missing.
- [x] 5b.6 Unit-test the merge itself in `tests/edit-ops.test.ts`, with the two shapes the
      shorter strip would break pinned beside it.
- [x] 5b.7 Negative controls: narrow the predicate and confirm the classification and both
      Backspace cases fail while the OTHER column's case still passes; disable the strip and
      confirm the merge cases fail while the hash and bracket pins hold.
- [x] 5b.8 E2e in `62-outline-edit-enforcement.e2e.ts`: the keypress, the buffer, the join-point
      cursor, and one undo step.

## 5c. The placement rule, widened past the empty case (design D5)

- [x] 5c.1 Condition the rule on a task marker at the item's content start rather than on
      `itemContentIsEmpty`: an interior split of `- [ ] foobar` left the caret in front of the
      new item's box, and a ticked box was exempted by a carve-out that belongs to the unwrap
      ladder, not to where an item's text begins.
- [x] 5c.2 Measure from `caret.ts`'s own boundary, adding the task marker's exported length —
      `ops.ts`' finished column swallows an ATX prefix and would move this caret onto the `#`
      of `- # title`, which the same requirement forbids.
- [x] 5c.3 Flip the two expectations the narrow rule pinned, each naming what it now says and
      what it used to, per that file's own convention.
- [x] 5c.4 Pin what the widening must not take: a column the user chose inside `[ ]` is carried
      forward by an operation that preserves one, not snapped to the marker's end.
- [x] 5c.5 Negative control: five cases fail with the rule disabled, including the two flipped.
- [x] 5c.6 E2e in `30-keyboard-grammar.e2e.ts`: Enter mid-text in a task item, then type.

## 6. Rendered verification (design D6, D7)

- [x] 6.1 New cases in `e2e/specs/56-list-grid.e2e.ts`, measuring the caret through
      `coordsAtPos`. This task originally said the opposite — measure `.cm-cursor` and never
      `coordsAtPos` — on the strength of the suite's own header, which warns off that function
      for a MARKER's box. Task 1.3 measured that there is no `.cm-cursor` to read and that for a
      CARET the function agrees with the DOM selection exactly, so D6 was rewritten and this
      with it.
- [x] 6.2 An empty `- ` item's caret sits on that item's own text column, at the top level and
      nested two levels deep. Take the text column the way this suite already takes one — from a
      sibling item's text node — so the assertion is a relationship and not a pixel.
- [x] 6.3 An empty `2. ` item's caret sits on the same column as an empty `- ` item's at the same
      depth.
- [x] 6.4 Typing the first character into an empty item does not move the caret's column: measure
      before and after, and assert the character renders where the caret was.
- [x] 6.5 An item WITH content is unchanged — the caret at its content start is on its text's
      first character, as it was before this change.
- [x] 6.6 Negative controls: remove 2.1's padding and confirm 6.2 and 6.4 fail; remove 3.1's pair
      and confirm 6.3 fails. Neither is optional — an assertion stated loosely enough to pass
      against the unfixed rules is the failure mode this suite has hit four times.
- [x] 6.7 Run the whole of `56-list-grid` and confirm every existing case passes unchanged. That
      suite IS the guarantee that the text column, the marker column, the hanging indent and the
      wrapped-row column did not move, and the new requirement's last scenario is exactly that
      claim.

## 7. The continuation line, measured and recorded (design, Open Questions)

- [x] 7.1 Measure the caret on a whitespace-only continuation line now that
      `.cm-hmd-list-indent` carries a stated width — the second offset
      `docs/research/12-decoration-follow-ups.md` records as still open, whose recorded number
      predates that width and is stale in an unknown direction.
- [x] 7.2 The lever does not reach it: the stated width is NARROWER than the whitespace's own
      text (44px against 48.38px), so the caret overshoots its column by 4.38px where the old
      entry recorded it falling 19.25px short. Closing it means making `.cm-indent` and
      `.cm-indent-spacing` sum to the hang, not adding a box to the run. Recorded in
      `docs/research/12-decoration-follow-ups.md`, with the sign change called out.

## 8. The gate

- [x] 8.1 Visual pass in a real vault, in both bundled themes: Enter on a nested bullet, on an
      ordered item and on a task item, and an item deleted back down to its marker — driven
      through the harness with the rendered result looked at, rather than typed by hand. All
      four read as intended at both themes: the caret sits on its item's own text column with
      the marker clear of it, and a new task item renders its checkbox with the caret after it.
      Worth a keyboard pass by a person before release; the shapes and the themes are covered.
- [x] 8.2 Nothing to fold in — the pass turned up no shape the assertions do not already cover.
      The one adjacent finding (the continuation line, task 7) was recorded under its own task.
