# Tasks

## 1. What the carrying plans state

- [ ] 1.1 Add `carryReversal` to `TxPlan`. Make indent and outdent state it, and make indent state
  `drop-line` as its `abandon`, only when handed a place line. Record this in
  `STRUCTURAL_DISPATCH` (`src/plugin/grammar.ts`, D2).

  Verify in `tests/grammar.test.ts`:
  - a Tab handed a place line states both;
  - a Tab with none states neither;
  - Shift+Tab's `abandon` over a gap is unchanged.

  Negative control: stating them unconditionally breaks the Tab-with-no-place case.
- [ ] 1.2 Verify the composition in `tests/undo-on-abandon.test.ts`, over the table in
  `docs/research/carried-place-removal`, "Removing a carried empty node". For every row, the
  reversal composed with the opening removal gives the original exactly: the ladder with a
  following sibling, the blank line after the list, the loose list, the nested ordered Shift+Tab,
  the heading, and a Tab followed by Shift+Tab. Negative control: replacing the composition with deleting the node
  fails the blank-line and sibling rows.

## 2. The recorder keeps the removal across a carry

- [ ] 2.1 Add `carriedRecord(record, startState, startedOn)` to `src/plugin/provisional-cleanup.ts`
  (D3). Add `carried` and `reversal` to `DispatchFacts`, and add the carrying branch and the
  creating branch's `startedAt` preference to `recordDispatch` (D4, D5). The listener supplies both
  from `update.startState`, its own record and the transaction's annotations.

  Verify in `tests/provisional-place-record.test.ts`, calling `carriedRecord` and `recordDispatch`'s
  decision rather than a restatement. Rewrite "a carrying key leaves a place record and no removal
  record" to expect a removal record after Tab and after Tab Tab. Add cases where it is absent:
  - after a carry that began with no removal record;
  - after typing on the place;
  - where the record's depth does not match the start state.

  Negative controls:
  - dropping the `carried` requirement makes the no-record case write one;
  - checking the depth against the end state makes the keyboard carry write none.
- [ ] 2.2 Supply `carried` and `reversal` from `runOp` in `src/plugin/main.ts`: read before
  `editor.transaction`, with `startedAt` mapped through the command's changes. Verify with the e2e
  case in 3.2.

## 3. End to end

- [ ] 3.1 Add e2e cases to `e2e-tests/specs/30-keyboard-grammar.e2e.ts`, one per scenario of "A
  carried place is declined like a fresh one":
  - ⇧⏎ ⇥ ⌫;
  - ⇧⏎ ⇥ ↑, and ⇧⏎ ⇥ ⇥ ↑;
  - ⇧⏎ ⇥ ⏎;
  - ⇧⏎ ⇧⇥ ⌫;
  - bullet ⏎ ⇥ ↑;
  - ordered ⏎ ⇥ ↑;
  - nested ordered ⏎ ⇧⇥ ↑;
  - ladder ⏎ ⏎ ↑, with and without a following sibling;
  - a list followed by a blank line and a paragraph, then ⏎ ⇥ ↑;
  - one ⌘Z after an abandon;
  - typed then deleted then ↑.

  Each node case asserts the document before the opening key byte for byte. Verify in narrow mode
  on desktop and mobile. Negative control: with 2.1's carrying branch removed, every case except
  the typed one fails.
- [ ] 3.2 Add the command-path case: ⇧⏎, "Indent node", ↑, compared with the ⇧⏎ ⇥ ↑ control in the
  same test. Negative control: omitting `carried` in `runOp` fails it.

## 4. Notes and specs

- [ ] 4.1 Rewrite `keymap.ts`'s note on the selection handlers, and the carry comments in
  `provisional-cleanup.ts` (Risks). Close the abandon entry in
  `docs/research/decoration-follow-ups.md`, pointing to this change. Verify: a grep for "removal
  record does not" finds no stale claim.
- [ ] 4.2 Add an "After" section to `docs/research/carried-place-removal.md`, recording each shape
  on the branch. Verify with `npm run lint`.
- [ ] 4.3 `openspec validate abandon-carried-place --strict`
