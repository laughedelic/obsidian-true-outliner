## 1. Measure what a blank line renders as today

The design's one unmeasured branch (Risks): our own contribution is known, Obsidian's is not.
Settle it before building on it — the answer decides whether a pure-list continuation position
still needs anything after the fact is restored.

- [x] 1.1 In a running vault with outline mode on, put the caret on a Shift+Enter continuation
      position inside a PURE list (no non-list ancestor) and record the caret's rendered x
      against the x the same text occupies once a character is typed there. Record the line's
      computed `padding-inline-start` / `text-indent` / `margin-left` in both states.
- [x] 1.2 Repeat inside a list under a heading (`supplementalDepth` ≥ 1) and confirm the
      difference is exactly the missing `supplementalDepth` margin, as the report describes.
- [x] 1.3 Repeat for Enter's provisional position at a non-zero depth, recording the caret x
      against a real paragraph at the same depth, and whether the caret overlaps the depth-0
      guide column.
- [x] 1.4 Append the findings to `docs/research/12-decoration-follow-ups.md` under the gap-line
      entry this change graduates. If 1.1 shows a residual our own contribution cannot close,
      record it there as a separate, still-deferred item rather than widening this change.

## 2. The provisional position carries its destination's indentation

- [x] 2.1 In `src/ops.ts`, make `splitNode`'s gap-widening branch write the destination scope's
      indentation on the anchor's line — `destinationIndent(doc, node, node.children, unit)` for
      a node with children and for a heading, the node's own leading whitespace otherwise — and
      point the anchor after it.
- [x] 2.2 Extend `tests/split.test.ts`: a list item with a paragraph child, split at its end,
      opens an indented position; typing there yields the item's new FIRST child with the
      existing child still attached to the same item. Assert the tree, not just the text.
- [x] 2.3 Cover the two unchanged shapes in the same file: a top-level paragraph and a heading
      both still produce byte-identical output, with the anchor at column 0.
- [x] 2.4 Cover a paragraph that is itself a child of a list item: the position it opens is at
      its own level, and typing there makes a sibling, not a top-level node.
- [x] 2.5 Extend `tests/undo-on-abandon.test.ts` with an indented position: abandoning it leaves
      the document byte-identical, with no whitespace-only line behind.
- [x] 2.6 Negative control: revert 2.1 locally and confirm 2.2, 2.4, and 2.5 fail for the
      reason stated, then restore it.

## 3. The pure "what would this line become" fact

- [x] 3.1 Add the pure preview function to `src/plugin/decorate.ts` — given the document text
      and a line number, return the `LineDecorationFact` that line would have if one character
      were typed at its end, or nothing when the line already has a fact, belongs to the
      preamble, or the document has no node owning it. No CM6 or Obsidian imports, alongside
      `decorate()` / `computeLineGuides()` / `computePositionTrail()`.
- [x] 3.2 Cover the new-node case in `tests/decorate.test.ts`: Enter's blank-separated position
      under a nested paragraph reports a first-line paragraph fact at that paragraph's own
      depth, and under a heading with list-item children reports what the destination kind
      actually gives.
- [x] 3.3 Cover the continuation case: Shift+Enter's whitespace-only position under a nested
      list item reports a list-item continuation fact (not a first line) carrying the item's own
      `supplementalDepth`.
- [x] 3.4 Cover the declines: a line that already has a fact, a blank line in the preamble, a
      preamble-only document, an empty document, and a document whose only blank line precedes
      every node.
- [x] 3.5 Cover the pure-list invariant: a continuation position inside a list with no non-list
      ancestor reports `supplementalDepth` 0, so it contributes no geometry.
- [x] 3.6 Pin the guide agreement (design D8): the preview fact's own-shift regime matches the
      regime the existing gap-line guide rule assumed for that same line.

## 4. Render it

- [x] 4.1 In `src/plugin/decorations.ts`, resolve the provisional fact for the caret's line when
      the primary selection is a single empty cursor on a line with no fact, cached per
      `EditorState` the way the position trail already is, and skipped by a leading blank test
      so a caret in content space costs nothing.
- [x] 4.2 Feed that fact into the line-decoration pass: the caret's gap line takes the full
      `lineDecoration` treatment instead of the guide-only one, and every other gap line is
      untouched.
- [x] 4.3 Feed it into the marker pass through the existing eligibility and `markerVisibility`
      gates — no special case for the provisional line (design D7).
- [x] 4.4 Compute the position trail from the preview document when a provisional position is
      open (design D4), so the current-node and ancestor accents describe the node the position
      stands for.
- [x] 4.5 Confirm no CSS change is needed: the existing `to-decor-block` / `to-decor-list` rules
      and the marker's own zero-net-width placement already apply to a line with no text. Add
      rules only if 1.x found something they do not cover.

## 5. Live coverage

- [x] 5.1 Add to `e2e/specs/50-decorations.e2e.ts`: Enter at the end of a nested paragraph
      leaves the caret at that paragraph's own content column, measured against a real
      same-depth line, and Shift+Enter at the end of a nested list item leaves it inside the
      list block rather than at the list's parent column.
- [x] 5.2 Add to the same spec: typing one character on either position changes the line's
      rendered indentation by nothing — the jump this change exists to remove.
- [x] 5.3 Add to `e2e/specs/52-block-markers-icons.e2e.ts`: Enter's position carries exactly one
      paragraph marker, a continuation position carries none, and `markerVisibility` governs the
      first exactly as it governs a real leaf paragraph.
- [x] 5.4 Add to `e2e/specs/53-decoration-contracts.e2e.ts`: opening, rendering, and abandoning a
      provisional position leaves buffer, cursor, and undo stack exactly as the keypress and its
      abandonment left them — the decoration contributes no transaction.
- [x] 5.5 Add to `e2e/specs/30-keyboard-grammar.e2e.ts`: the live keypress-then-type sequence on
      a list item with a paragraph child produces a child, with the existing child still a child.
- [x] 5.6 Pin the caret into content space in the pure-list byte-identity assertions
      (`e2e/specs/51-guides-gradient.e2e.ts`, `e2e/specs/55-position-indicators.e2e.ts`) so they
      keep measuring the base layers rather than a caret-derived one.

## 6. Close the loop

- [x] 6.1 Mark the graduated entry in `docs/research/12-decoration-follow-ups.md` (the gap-line
      caret jump) as closed by this change, keeping any residual found in 1.4 as its own item.
- [x] 6.2 Note in `docs/research/15-enter-and-shift-enter-catalogue.md` that S10's decoration
      half and the E10 encoding defect are answered here, so the catalogue stays the record of
      where each finding landed.
- [x] 6.3 Run `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e`.
- [ ] 6.4 Manual real-vault pass over both reported gestures at several depths, in a pure list
      and under a heading, with each `markerVisibility` value. Left for a human: the automated
      coverage measures columns and classes, which is not the same as the gesture reading right
      under the hand.
