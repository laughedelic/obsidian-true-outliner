## 1. Measure

- [x] 1.1 Re-run both sequences the issue tabulates in the REAL app on this stack, recording the
      buffer and the caret after every key
- [x] 1.2 Run each structural key once from a freshly opened place, recording where the caret lands
      and whether the record survives, so the carrying set is measured rather than assumed
- [x] 1.3 Record what the re-measurement changes about the issue's table in
      `docs/research/decoration-follow-ups`: the first row is closed by the layer below, the second
      reproduces, and the moves are a different shape

## 2. The record splits

- [x] 2.1 Split the per-view state in `src/plugin/provisional-cleanup.ts` into a PLACE record and
      the ABANDON record, written from the same update and dropped by the same document change
- [x] 2.2 State in both doc comments which question each answers, and which consumer asks it
- [x] 2.3 `createdPlaceLine` becomes `openPlaceLine` and reads the place record, with no
      `undoDepth` guard

## 3. The carry rule

- [x] 3.1 A dispatch of ours that started with the caret on the live place and left it on an empty
      place keeps the place record; only a creating dispatch starts one
- [x] 3.2 Name the carrying events — `input.structure.indent` and `input.structure.outdent` — and
      state why `move.structure` is not one of them
- [x] 3.3 Expose the decision as a pure function over the state, the event and the previous record,
      the way `recordablePlace` already is, so it is testable without a view

## 4. Tests

- [x] 4.1 `tests/provisional-place-record.test.ts`: the record survives Tab and Shift+Tab on a
      place, over the real `EditorState` and the real history. Negative control: without the carry
      rule the Tab row loses it
- [x] 4.2 The record does NOT survive a Tab that did not start on the place, a move, an
      `input.type`, or a stock newline
- [x] 4.3 The record's invalidation is a document change: an undo of a structural keypress always
      makes one, and a carrying key moves the undo depth without moving the place
- [x] 4.4 `tests/undo-on-abandon.test.ts`: the abandon record's own conditions are unchanged — an
      outdent that only relocated an already-empty item is still not recordable
- [x] 4.5 E2E in `e2e/specs/30-keyboard-grammar.e2e.ts`: Shift+Enter, Tab, Shift+Tab on
      `- one` / `- foo` / `␣␣bar` returns the document to what one Shift+Enter alone leaves, with
      the caret on the place. Negative control: without the carry rule the place is left deeper
      than the item

## 5. Artifacts

- [x] 5.1 `structural-history-integration` gains the requirement stating the two facts, their
      separate tests and their separate invalidation
- [x] 5.2 Check that `outline-keyboard-grammar`'s "Provisional positions" needs no edit — it
      already states that the operation path is told, and that an untold blank line is a gap
- [x] 5.3 Close the `docs/research/decoration-follow-ups` entry, leaving the abandon half and the
      palette half parked
- [x] 5.4 `openspec validate a-carried-place-keeps-its-record --strict`
