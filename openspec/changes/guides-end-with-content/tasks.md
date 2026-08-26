## 0. Sequencing check (design D8)

- [x] 0.1 Confirm `lists-on-the-outline-grid` has been archived, so
      `openspec/specs/outline-decorations/spec.md` carries the requirement this delta targets
      ("Indentation guides render every ancestor level, including list levels"). That ordering is
      decided; this is the check that it happened, and the delta cannot apply before it does.

## 1. The extent, in the facts

- [x] 1.1 Trim a gap line's guides in `computeLineGuides` (src/plugin/decorate.ts): after the
      existing walk, one pass from the bottom of the fact array remembering the depths of the
      last content line seen, with each gap fact keeping only the depths that line also carries.
      Both tracks — `guideDepths` and `listGuideDepths` — take the rule (design D1, D7).
- [x] 1.2 State the reasoning in the doc comment where the current "covers every gap line" text
      sits: a gap keeps a guide when the next content line carries it, which is the same
      question as "does this ancestor have content below", because subtrees are contiguous and
      the facts are emitted in document order. Explain that; do not sell it.
- [x] 1.3 Confirm the fact shape is unchanged: every gap line still gets a fact (possibly with
      empty depths), so `computeLineGuides` stays a strict superset of `decorate()`'s line
      coverage and `isGapLine` keeps its meaning.

## 2. Unit-test the extent

- [x] 2.1 A guide stops at its subtree's last content line: a section whose last paragraph is
      followed by blanks and then a heading at the section's own level — the paragraph's row
      carries the guide, the blank rows do not.
- [x] 2.2 A guide does not run off the end of the document: the final blank row of a file
      ending inside a nested section carries nothing.
- [x] 2.3 Interior continuity is untouched: a blank line between two siblings inside the same
      ancestor still carries that ancestor's guide, and a node-with-children's "before my first
      child" gap still carries its child's depths. These are the existing cases — assert they
      still hold rather than rewriting them.
- [x] 2.4 A run of blanks closing three nested levels at once, with content at the outermost
      level below it: every row of the run carries the same depths, namely only those whose
      subtrees continue below it. Separately, that two depths DO end on different rows when
      content separates their subtrees' last lines.
- [x] 2.5 A blank line inside an atom is content, not a tail: a fenced code block containing an
      empty line keeps its guides on that row (design D3).
- [x] 2.6 A list guide takes the same rule as any other: the trailing blank after a nested
      list's last item carries neither the list level's guide nor a bridging ancestor's.
- [x] 2.7 Negative control for the group: disable the trim and confirm 2.1, 2.2, 2.4 and 2.6
      fail — a test that passes against the old code is testing nothing here.

## 3. The provisional extension (design D4)

- [x] 3.1 `computeLineGuides` takes the open provisional row and treats it as a content line in
      the bottom-up pass, so the extension covers the position's own row and every blank row
      between it and the last real content line.
- [x] 3.2 Hand that row over from `factsFor` (src/plugin/decorations.ts), in both branches —
      it is a no-op in the joins branch, where the resolved outline already makes the row one of
      a node's own lines, and passing it unconditionally is one fewer gate to get wrong.
- [x] 3.3 Unit-test the extension: a position opened past a section's last content line gets
      that section's guides on its own row; the blank rows between carry them too; the same
      document with no position open carries none of them (the negative control is the same
      document, which is what makes it exact).
- [x] 3.4 Unit-test that the extension adds no DEPTH: the position's row carries exactly the
      guides the last content line above it carries, never one more — in particular a childless
      heading with a position below it does not start owning a guide.

## 4. The `full` accent (design D5)

- [x] 4.1 Add `contentEnd` to `ChainEntry` — the subtree's last own-line, filled in on the way
      back out of the walk as `subtreeEnd` already is — and iterate `'full'` to it. Leave
      `subtreeEnd` as it is: it also resolves a caret parked on a gap line to the node owning
      the gap, which this change does not touch.
- [x] 4.2 Unit-test that a `'full'` accent ends on its guide's last row and renders on no blank
      row below it, and that `'lineage'` is unchanged (its segments end on the next rung's own
      first line, always inside the extent).
- [x] 4.3 Unit-test that with a position open the accent reaches the caret's row, matching the
      extended guide. The trail is computed against the MATERIALIZED document, so it reaches the
      row on its own — and for the same reason it can reach a DEPTH the document has no guide at:
      a position below a childless node makes that node a parent and the trail accents its depth.
      Cover that case here as a fact about the trail, and clip it at 4.4.
- [x] 4.4 Clip accents against the line's own guide depths in `guideBackground`
      (src/plugin/decorations.ts): build an accent layer only for a depth the line actually
      carries, and give `hasOverlay` the same filter so a line left with neither a guide nor a
      surviving accent renders no decoration. This is the choke point every accent passes
      through, so it holds whatever computation produced one (design D5b).

## 5. Rendered verification

- [x] 5.1 E2e in `51-guides-gradient.e2e.ts`: on a fixture whose section ends in blank lines,
      the last content row resolves a gradient and the blank rows below it resolve none, while
      an interior blank row between two siblings still resolves the same layer count as its
      neighbours. Assert the RELATIONSHIP between rows, not pixel values.
- [x] 5.2 E2e a run of blanks closing nested subtrees: every row of the run resolves the same
      layer count, it is lower than the last content row above the run, and it matches the depth
      of the content that follows.
- [x] 5.3 E2e the provisional extension: with the caret on a position past a section's end its
      row resolves the section's gradient, and after the caret leaves that row resolves none.
- [x] 5.4 E2e in `55-position-indicators.e2e.ts`: no accent renders on a blank row past the end
      of an accented guide, and the existing "accents the ancestor guide on gap lines too" case
      still passes on interior gaps.
- [x] 5.5 E2e the column clip, which cannot be unit-tested — `guideBackground` lives in
      decorations.ts, which imports `obsidian` and so cannot be loaded by vitest. With a position
      open below a childless heading, the position's row resolves the guide its ancestor really
      owns and NO layer on the childless node's own column. Negative control: remove the clip and
      the stray layer comes back.

## 6. The gate

- [ ] 6.1 Real-vault pass by hand over `test-vault/`, in both bundled themes, on documents with
      several nested sections that end together, a file ending in a blank line, and a list at
      the end of a section. The fixtures cannot judge whether the shortened guides read well;
      this is the check that can.
- [ ] 6.2 Fold anything the pass finds and this change does not fix into
      `docs/research/12-decoration-follow-ups.md` rather than into a new change.
- [ ] 6.3 Run the full unit and e2e suites and confirm the existing guide-continuity cases —
      "Guides span blank lines between siblings", "every blank gap line between … also carries
      the guide" — still pass unmodified. They assert the half of the rule this change keeps.
