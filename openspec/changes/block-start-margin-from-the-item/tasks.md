## 1. Measure the margin from the item

- [x] 1.1 In `src/parse.ts`, add `fromMargin` (spaces and tabs only) and the open-item stack in
      `segment`, cleared by an ATX heading and by a setext underline; apply the margin to
      `QUOTE_RE`, `CALLOUT_RE` and `HR_RE`, and leave `HTML_OPEN_RE` and `ATX_RE` at column 0
      (D1, D2, D4).
- [x] 1.2 Pass the margin to the quote run, the list item's continuation loop and
      `startsNewBlock`, leaving a setext-shaped rule at column 0 (D3, D4).
- [x] 1.3 Give `kindAsWritten` and `tailAsWritten` a margin, judge a heading and an HTML block at
      column 0 in both, and thread the margin through `normalizeBoundaries` and
      `needsBlankBetween` (D5).
- [x] 1.4 Rewrite the doc comments that still describe a column-0 margin: `OPENING_MARGIN`,
      `kindAsWritten`, `tailAsWritten`, and the header of `needsBlankBetween`.

## 2. Tests

- [x] 2.1 A parse test for #136's four cases — the quote at two spaces, one tab and four spaces
      under `- alpha`, and the tab-indented heading, which stays a paragraph (D4). Negative
      control: reverting 1.1 turns the tab and four-space quotes back into paragraphs.
- [x] 2.2 Each of `> q`, `> [!note] c`, `***` and `- - -` at a depth-2 child column, with and
      without a blank line, parses as its kind and as a child of the inner item; four columns
      further in it is not. Negative control: 1.1 reverted.
- [x] 2.3 A quote's run ends at a `>` line indented short of the margin. Negative control: drop
      the indentation check from the run.
- [x] 2.4 A setext heading closes the margin: `- a` / blank / `  para` / `  ---` / `    > q` reads
      the last line as a paragraph. Negative control: clear the stack for an ATX heading only.
      *(The insertion this task also named lost a node only while an HTML block took the margin;
      with HTML at column 0 a margin left open there can only over-separate, so the parse is
      what the test pins.)*
- [x] 2.5 An inline tag or an autolink opening a child paragraph at a tab's depth is a paragraph,
      and the nested item below it stays a list item; `<div>` at a child column does not run past
      the item. Negative control: give `HTML_OPEN_RE` the margin.
- [x] 2.6 A non-breaking space is not indentation: `- a` / blank / NBSP and two spaces then `> q`
      is a paragraph. Negative control: take the lead with `trimStart`.
- [x] 2.7 `tests/edit-ops.test.ts`: #158's case 1 through `insertSubtrees` — the `---` arrives as
      an `hr`, a child of `  - ## H`. Negative control: 1.1 reverted.
- [x] 2.8 `## H` / `* * *` inserted after `  - two` keeps the rule an `hr` with a separator above
      it. Negative control: `kindAsWritten` without the margin, which reads the rule as a list
      item and writes it flush.
- [x] 2.9 `kindAsWritten` at both sides of `margin + OPENING_MARGIN` for a quote, and at
      `OPENING_MARGIN` for an HTML block whatever the margin.

## 3. Decorations, in a real instance

- [ ] 3.1 A narrow e2e case for a tab-indented quote under a list item: it takes the quote's
      block marker and stands in the item's child column.
- [ ] 3.2 Manual check in Obsidian: #136's case 2 and #158's case 1 in outline mode, including
      Q38's `HyperMD-quote-lazy` line.

## 4. Land

- [ ] 4.1 `npm test`, `npm run lint`, `npm run build`.
- [x] 4.2 Update `open-questions` Q38 to point at this change.
- [ ] 4.3 `openspec validate block-start-margin-from-the-item --strict`.
