## 1. Measure the margin from the item

- [ ] 1.1 In `src/parse.ts`, add `fromMargin` and the open-item stack in `segment`; apply the
      margin to `QUOTE_RE`, `CALLOUT_RE`, `HR_RE` and `HTML_OPEN_RE` (D1, D2).
- [ ] 1.2 Pass the margin to the quote run, the list item's continuation loop and
      `startsNewBlock`, leaving a setext-shaped rule at column 0 (D3, D4).
- [ ] 1.3 Give `kindAsWritten` and `tailAsWritten` a margin, and thread it through
      `normalizeBoundaries` and `needsBlankBetween` (D5).

## 2. Tests

- [ ] 2.1 `tests/corpus.test.ts` or a parse test: #136's four cases — the quote at two spaces,
      one tab and four spaces under `- alpha`, and the tab-indented heading, which stays a
      paragraph (D4). Negative control: reverting 1.1 turns the tab and four-space quotes back
      into paragraphs.
- [ ] 2.2 Each margin-anchored kind at a depth-2 child column, with and without a blank line,
      parses as its kind and as a child of the inner item; at the same column plus four it is a
      paragraph. Negative control: 1.1 reverted.
- [ ] 2.3 A quote's run ends at a `>` line indented short of the margin. Negative control: drop
      the indentation check from the run.
- [ ] 2.4 `tests/edit-ops.test.ts`: #158's case 1 through `insertSubtrees` — the `---` arrives as
      an `hr`. Negative control: `kindAsWritten` without the margin, which fails the
      payload-survival property.
- [ ] 2.5 `kindAsWritten` at both sides of `margin + OPENING_MARGIN`.

## 3. Decorations, in a real instance

- [ ] 3.1 A narrow e2e case for a tab-indented quote under a list item: it takes the quote's
      block marker and stands in the item's child column.
- [ ] 3.2 Manual check in Obsidian: #136's case 2 and #158's case 1 in outline mode, including
      Q38's `HyperMD-quote-lazy` line.

## 4. Land

- [ ] 4.1 `npm test`, `npm run lint`, `npm run build`.
- [ ] 4.2 Update `open-questions` Q38 to point at this change.
- [ ] 4.3 `openspec validate block-start-margin-from-the-item --strict`.
