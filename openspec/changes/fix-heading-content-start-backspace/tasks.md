## 1. Pin the defect with failing tests

- [x] 1.1 Add a `classify` unit case for Backspace at an ATX heading's content start (the
      one-character marker-space deletion, cursor at the content column) asserting
      `boundary-crossing-edit`; verify it FAILS against unmodified `src/classify.ts` with the
      measured `within-node-edit`.
- [x] 1.2 Add `computeVerdict` unit cases for the two heading vetoes — a heading with a
      content-space predecessor, and a heading that is the document's first node — asserting
      `veto` and the reason each carries; verify both FAIL today, and that the first-node case
      fails as the measured whole-document `rewrite` rather than as a `pass`, which is what
      makes the deletion-path hazard visible in the test log.
- [x] 1.3 Add a case at a column INSIDE a heading's `#` run asserting the edit stays
      `within-node-edit` and passes, and a case for an existing list-item merge asserting its
      `rewrite` is unchanged. These two are regression cover, NOT negative controls: measured,
      both hold with the kind guards dropped entirely, so neither can detect that mistake.
- [x] 1.4 Add the control that does detect it: Backspace at the content start of an INDENTED
      paragraph, through both gates, asserting `within-node-edit` and `pass`. Negative control:
      it must fail — measured as `boundary-crossing-edit` and a `rewrite` merge into the
      predecessor — if the widening is written as "drop the kind test" instead of "admit
      `heading`", because `contentColumnCh` reads a paragraph's leading indentation as its
      content prefix. This is the task that keeps the paragraph-indentation question closed.

## 2. Widen both gates together

- [x] 2.1 Admit `heading` alongside `list-item` in `crossesViaChromeDeletion`'s marker-space
      shape in `src/classify.ts`; verify 1.1 now passes.
- [x] 2.2 Admit `heading` alongside `list-item` in `recognizeMergeIntent`'s marker-space branch
      in `src/enforce.ts`; verify 1.2 now passes. Negative control for the pairing: with 2.2
      reverted and 2.1 kept, 1.2's first-node case must fail as a document-wide `rewrite` — a
      pass there would mean the two gates are not the matched pair the design claims.
- [x] 2.3 Run `npx vitest run` and verify all pre-existing unit tests still pass, the list-item
      and paragraph merge paths included.

## 3. Cover the real keypress end to end

- [x] 3.1 Correct `e2e/specs/62-outline-edit-enforcement.e2e.ts`'s existing
      structure-corrupting-merge case: it places the caret at the heading's LINE start, a
      column that already vetoed before this change, so it never exercised the content-start
      column the spec's scenario names. Add a sibling case at the heading's own content column
      asserting the buffer is byte-identical, the cue appears, and `verdictCounts.veto` moves —
      the counter assertion is what distinguishes a veto from a silently dropped transaction.
- [x] 3.2 Add an e2e case for Backspace inside a heading's `#` run asserting the level changes
      natively and `verdictCounts.veto` does NOT move. Negative control: it must fail if 2.1
      widens the column test past the single content-start column headings resolve.
- [ ] 3.3 Run `npm run test:e2e:narrow -- 62-outline-edit-enforcement` and verify the group's
      cases pass; push the checkpoint so CI runs the full sweep.

## 4. Close the change

- [ ] 4.1 Run `npm run lint` and `npx tsc --noEmit` (or the project's build) and verify both are
      clean.
- [ ] 4.2 Run `openspec validate fix-heading-content-start-backspace --strict`.
