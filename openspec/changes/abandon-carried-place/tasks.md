# Tasks

## 1. What the carrying plans state

- [x] 1.1 Add `carryReversal` to `TxPlan`. Indent, outdent, and the ladder's outdent and unwrap state
  it when handed a place line, and indent then also states `drop-line` as its `abandon`. The ladder
  passes whether `planKey` received a place line (D2). Record indent's "only when carrying" in
  `STRUCTURAL_DISPATCH` (`src/plugin/grammar.ts`, D2).

  Verify in `tests/grammar.test.ts`:
  - a Tab handed a place line states both;
  - a Tab with none states neither;
  - the ladder's second Enter on a carried empty item states a reversal;
  - Shift+Tab's `abandon` over a gap is unchanged.

  Negative controls:
  - stating them unconditionally breaks the Tab-with-no-place case;
  - not forwarding the place line in the ladder breaks the ladder case.
- [x] 1.2 Verify the composition in `tests/undo-on-abandon.test.ts`, over the table in
  `docs/research/carried-place-removal`, "Removing a carried empty node". For every row, the
  reversal composed with the opening removal gives the original exactly: the ladder with a
  following sibling, the blank line after the list, the loose list, the nested ordered Shift+Tab,
  the heading carried by ⇥ and by ⇧⇥, a Tab followed by Shift+Tab, and the ladder under a paragraph that dissolves the item
  and moves its sibling out. Negative control: replacing the composition with deleting the node
  fails the blank-line and sibling rows.

## 2. The recorder keeps the removal across a carry

- [x] 2.1 Add `carriedRecord(record, startState, startedOn)` to `src/plugin/provisional-cleanup.ts`
  (D3). Add `opened` to the removal record and `carried` and `reversal` to `DispatchFacts`. Put
  the carrying branch ahead of the creating one in `recordDispatch`, and select its removal by
  `carried.opened` (D4, D5). The listener supplies both
  from `update.startState`, its own record and the transaction's annotations.

  Verify in `tests/provisional-place-record.test.ts`, calling `carriedRecord` and `recordDispatch`'s
  decision rather than a restatement. Rewrite "a carrying key leaves a place record and no removal
  record" to expect a removal record after Tab and after Tab Tab. Add these cases:
  - after an undo of the carry, no record;
  - where the record's depth does not match the start state, no record;
  - Shift+Enter on an empty item keeps its own start;
  - Shift+Tab over an opened gap takes the opening start.

  Negative controls:
  - checking the depth against the end state makes the keyboard carry write none;
  - selecting the removal by the kind after the carry breaks the ladder-under-a-paragraph case;
  - running the creating branch first breaks the Shift+Tab start case.
- [x] 2.2 Export `carriedRecordOf(view, startedOn)` from `provisional-cleanup.ts` (D3). Supply
  `carried` and `reversal` from `runOp` in `src/plugin/main.ts`: `carried` read through that export
  before `editor.transaction`, with `startedAt` mapped through the command's changes. Verify with the
  e2e cases in 3.2. The unit suite has no DOM, so it cannot mount the view `carriedRecordOf` reads
  (#156). Its gate is `carriedRecord`'s, which 2.1 unit-tests.

## 3. End to end

- [x] 3.1 Add e2e cases to `e2e-tests/specs/30-keyboard-grammar.e2e.ts`, one per scenario of "A
  carried place is declined like a fresh one":
  - ⇧⏎ ⇥ ⌫;
  - ⇧⏎ ⇥ ↑, and ⇧⏎ ⇥ ⇥ ↑;
  - ⇧⏎ ⇥ ⏎;
  - ⇧⏎ ⇧⇥ ⌫;
  - ⏎ ⇧⏎ ⌫, where the empty item stays;
  - bullet ⏎ ⇥ ↑;
  - ordered ⏎ ⇥ ↑;
  - nested ordered ⏎ ⇧⇥ ↑;
  - ladder ⏎ ⏎ ↑, with and without a following sibling, and under a paragraph;
  - nested ordered ⏎ ⇧⇥ ↑ where the parent run crosses a digit boundary (`9.` to `10.`);
  - a list followed by a blank line and a paragraph, then ⏎ ⇥ ↑;
  - a drafted heading: ⇧⏎ at the end of a heading that has a section, then ⇥ ↑ and ⇧⇥ ↑, back to the
    document before the ⇧⏎;
  - one ⌘Z after an abandon;
  - typed then deleted then ↑.

  Each node case asserts the document before the opening key byte for byte. Verify in narrow mode
  on desktop and mobile. Negative control: with 2.1's carrying branch removed, every case fails
  except the typed one and the second-place one, which the creating branch decides.

  Two cases were measured to differ from the plan, and neither is this change's defect:
  - With `2. b` after the nested `a`, the Enter itself renumbers `q` (#252), and walking away
    from the FRESH item leaves that renumbering too. That shape is compared against the fresh
    control. The byte-exact case uses the shape without `b`.
  - On a line holding only `#`, the arrow keys do not move the caret, so ↑ never leaves a
    drafted heading Shift+Tab reduced to `#`. That case declines with ⌫.
- [x] 3.2 Add the command-path cases, each compared with its keyboard control in the same test:
  - ⇧⏎, "Indent node", ↑, against ⇧⏎ ⇥ ↑;
  - ⏎ on an ordered item, "Indent node", ↑, against ⏎ ⇥ ↑, back to the document before the ⏎;
  - ⏎ at a nested item with a following sibling, "Outdent node", ↑, against ⏎ ⇧⇥ ↑.

  Retitle "Backspace on a place the outdent command leaves returns where the command started":
  both paths now return to where the Shift+Enter started.

  Negative controls:
  - omitting `carried` in `runOp` fails every command case;
  - omitting `reversal` fails only the two node cases.

## 4. Notes and specs

- [ ] 4.0 Remove the drag pick-up's place resolution (`press.placeLine` and its `placeOutline` call
  in `src/plugin/zoom-click.ts`), which no state reaches once a pick-up over an open place
  declines it. Verify with e2e cases in the drag specs, one per scenario of `node-dragging`'s new
  requirement:
  - after ⇧⏎, pressing a bullet removes the place and starts no drag;
  - the same after ⇧⏎ ⇥;
  - a second press drags.

  The drag and selection groups stay green in narrow mode.

- [ ] 4.1 Rewrite `keymap.ts`'s note on the selection handlers, and the carry comments in
  `provisional-cleanup.ts` (Risks). Close the abandon entry in
  `docs/research/decoration-follow-ups.md`, pointing to this change. Verify: a grep for "removal
  record does not" finds no stale claim.
- [ ] 4.2 Add an "After" section to `docs/research/carried-place-removal.md`, recording each shape
  on the branch. Verify with `npm run lint`.
- [ ] 4.3 `openspec validate abandon-carried-place --strict`
