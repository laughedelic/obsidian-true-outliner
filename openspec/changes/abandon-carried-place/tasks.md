# Tasks

## 1. The removal a carrying plan states

- [ ] 1.1 Add the `drop-place` form to `abandonEdit` in `src/plugin/grammar.ts` (D2). Verify with
  cases in `tests/undo-on-abandon.test.ts` over the five node shapes and the gap shape in
  `docs/research/carried-place-removal`: each result is the document before the opening key. Add a
  case for an empty item with a child, which states nothing. Negative control: with `drop-line` in
  place of `drop-place`, the Shift+Tab ordered case leaves `3. q`.
- [ ] 1.2 Give `STRUCTURAL_DISPATCH` indent `drop-place` when carrying and outdent `drop-place`
  always (D3), and read it in `planFromOp` and in `runOp`. Verify in `tests/grammar.test.ts`:
  - a Tab handed a place line states a removal;
  - a Tab with none states nothing;
  - Shift+Tab over a gap states the same edit it stated before.

  Negative control: making indent's form `always` breaks the Tab-with-no-place case.

## 2. The recorder keeps the removal across a carry

- [ ] 2.1 Add `carried` to `DispatchFacts` and the carry branch to `recordDispatch`
  (`src/plugin/provisional-cleanup.ts`, D4, D5). Supply `carried` from the listener, and export
  the live-record read `runOp` needs. Verify in `tests/provisional-place-record.test.ts`: rewrite
  "a carrying key leaves a place record and no removal record" to expect a removal record after
  Tab and after Tab Tab. Add cases where it is absent:
  - after a carry that began on a place with no removal record;
  - after typing on the place.

  Negative control: dropping the "live on the line the dispatch began on" condition makes the
  no-record case write one.
- [ ] 2.2 Supply `carried` from `runOp` in `src/plugin/main.ts`, read before `editor.transaction`
  with its `startedAt` mapped through the command's changes. Verify with the e2e case in 3.2.

## 3. End to end

- [ ] 3.1 Add e2e cases to `e2e-tests/specs/30-keyboard-grammar.e2e.ts`, one per scenario of "A
  carried place is declined like a fresh one":
  - ⇧⏎ ⇥ ⌫;
  - ⇧⏎ ⇥ ↑ and ⇧⏎ ⇥ ⇥ ↑;
  - bullet ⏎ ⇥ ↑;
  - ordered ⏎ ⇥ ↑;
  - ordered nested ⏎ ⇧⇥ ↑;
  - ladder ⏎ ⏎ ↑;
  - one ⌘Z after an abandon;
  - typed then deleted then ↑.

  Verify in narrow mode on desktop and mobile. Negative control: with 2.1's carry branch removed,
  every case except the typed one fails.
- [ ] 3.2 Add the command-path case: ⇧⏎, "Indent node", ↑. Compare its buffer and caret with the
  ⇧⏎ ⇥ ↑ control in the same test. Negative control: omitting `carried` in `runOp` fails it.

## 4. Notes and specs

- [ ] 4.1 Rewrite `keymap.ts`'s note on the selection handlers, which says a carry leaves no removal
  record (Risks). Update the carry comments in `provisional-cleanup.ts`. Close the abandon entry in
  `docs/research/decoration-follow-ups.md` with a pointer to this change. Verify with a grep for
  "does not survive a carry" and "removal record does not" that finds no stale claim.
- [ ] 4.2 Add an "After" section to `docs/research/carried-place-removal.md` recording each shape
  on the branch. Verify with `npm run lint`.
- [ ] 4.3 `openspec validate abandon-carried-place --strict`
