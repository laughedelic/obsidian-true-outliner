## 1. Measure

- [x] 1.1 Record every transaction the view applies for Enter at the end of `> alpha`, with the
      mode on and off, and the class and verdict the funnel gives it
- [x] 1.2 Drive every row of issue #155's table through both gates with the measured transaction
      shape, plus the neighbouring paste shapes that reach the same rule
- [x] 1.3 Write `docs/research/enter-inside-a-quote.md` with the transactions, the trace through
      the funnel, the fact that separates the shapes, and the two fixes rejected; add its index row

## 2. The fact

- [x] 2.1 `TransactionFacts.emptySelectionBefore` in `src/classify.ts`, optional, with a doc
      comment stating what it tells apart
- [x] 2.2 `src/plugin/transaction-filter.ts` supplies it: every range of `tr.startState.selection`
      is empty, so a mixed selection keeps the type-over reading

## 3. The rule

- [x] 3.1 `isMultiBlockInsertion` takes the facts and declines a change that deletes something on
      its one line when the selection before it was empty
- [x] 3.2 Its doc comment says what a caret-originated replacement is and where the old reading
      sent it

## 4. Tests

- [x] 4.1 `tests/classify.test.ts`: the measured continuation from a caret is `within-node-edit`.
      Negative control: with the fact ignored, `boundary-crossing-edit` — confirmed by running the
      suite with the rule's change stashed
- [x] 4.2 The same bytes with the selection fact false or absent stay `boundary-crossing-edit`; a
      pure multi-block insertion at a caret stays `boundary-crossing-edit`; a caret replacement
      that crosses a boundary by span stays `boundary-crossing-edit`
- [x] 4.3 `tests/enforce.test.ts`: every destroying row of the issue passes through both gates;
      the selection control rewrites `> alpha` / `> beta` to `a` / `> `, which is the document the
      caret case produced before this change
- [x] 4.4 `e2e/specs/62-outline-edit-enforcement.e2e.ts`: Enter at a quote's end, mid-line, at a
      callout's body end and at the end of a list inside a quote gives the off-mode buffer and
      caret, with no rewrite verdict recorded. Negative control: with the rule's change stashed the
      on-mode buffer is `a` / `> `

## 5. Land

- [x] 5.1 `transaction-classification` gains the requirement stating the rule and its controls,
      and its class-coverage sentence says a replacement over a selection is read the same way,
      so a sync does not leave "pure insertions" beside the new requirement
- [x] 5.2 `openspec validate a-caret-edit-is-never-a-type-over --strict`
- [ ] 5.3 Sync the delta spec, archive the change and bump the patch version on this branch before
      merging
