## Why

The operation path is TOLD which blank line holds a provisional position, because the document
cannot say (`outline-keyboard-grammar`, "Provisional positions"). It is told by
`createdPlaceLine`, which reads `provisional-cleanup`'s per-view record — and that record is
re-established only by a keypress the module counts as CREATING a place. `input.structure.indent`
is in neither event list, so a Tab that carried a place along leaves no record behind and the next
structural keypress reads an ordinary blank line.

Issue #142, measured in `docs/research/decoration-follow-ups` ("The place record is single-shot,
so a SECOND structural key mistreats the place"). In the real app, on this stack:

- `- one` / `- foo` / `␣␣bar`, Shift+Enter then Tab gives `- one` / `␣␣␣␣- foo` / `␣␣␣␣␣␣` /
  `␣␣␣␣␣␣bar` with the caret on the place, which is right.
- Shift+Tab after it gives `- one` / `- foo` / `␣␣␣␣␣␣` / `␣␣bar`, caret 1:2. The item's
  continuation returns to two columns and the place is left six deep, so the document is wrong and
  not only the caret.

The grammar is right at every step: handed the place line, `planKey` produces the correct document
and caret for both keys. Only the record differs.

The reason is that one answer is serving two questions. `recordablePlace` and its event lists ask
"was a place CREATED here", which the abandon path needs — an outdent that merely relocated an
already-empty item created nothing, and undoing it would restore a bullet the user left the list to
escape. `createdPlaceLine` asks "is this blank line a place", and inherits an answer scoped to the
first question. `liveRecord`'s `undoDepth` guard is the same story one level down: it is a backstop
for history movement the abandon path never sees, and it has nothing to say about whether a line
holds a place.

## What Changes

- **Two records, not one.** The per-view state splits into a PLACE record — the line an open place
  occupies — and the ABANDON record it has today, which keeps its stated removal edit, its
  `startedAt` and its depth backstop. `createdPlaceLine` reads the first; the cleanup reads the
  second. Design D1.
- **A dispatch that CARRIES a place keeps the place record.** Tab and Shift+Tab leave the caret on
  the place they moved, so a dispatch of ours that started on the live place and ended on an empty
  place holds it. Only a CREATING dispatch starts one. Design D2.
- **The place record is invalidated by document changes alone**, with no `undoDepth` guard:
  a history move that leaves the document alone leaves the place where it is. Design D3.
- **`createdPlaceLine` becomes `openPlaceLine`**, because it no longer answers "created". Design D4.
- **The abandon record still does not survive a carrying key.** Its edit is stated in the
  coordinates of the document the creating transaction produced, which the carrying one has since
  changed. Left where it is, with the parking-lot entry that wants it.

## Capabilities

### Modified Capabilities

- `structural-history-integration`: gains "An open place stays known for as long as it is open" —
  which line holds a place is a separate fact from whether the keypress in front of it created one,
  with its own test and its own invalidation. The removal requirement beside it is untouched.

`outline-keyboard-grammar` needs no edit. "Provisional positions" already says the operation path
is told which line holds one and that a blank line without that record is an ordinary gap; what was
missing was the record keeping up, which is this capability's to state.

## Impact

- `src/plugin/provisional-cleanup.ts`: the record splits; `createdPlaceLine` becomes
  `openPlaceLine` and reads the place record.
- `src/plugin/keymap.ts`, `src/plugin/main.ts`: the renamed call sites.
- `tests/provisional-place-record.test.ts` (new), `tests/undo-on-abandon.test.ts`.
- `e2e/specs/30-keyboard-grammar.e2e.ts`.
- `docs/research/decoration-follow-ups`: the entry closes.

## Out of scope

- **Carrying the ABANDON record through a structural key.** Abandoning after a Tab still leaves the
  blank line in the file, which is the parking-lot entry "A structural key pressed on a provisional
  position leaves the blank line in the file". Closing it means re-stating the removal edit in the
  carrying transaction's coordinates, which is an edit to the user's document computed from a
  mapping this change has no measurement for.
- **The moves.** `caret-placement-policy` sends a move's caret to the moved node's content start,
  not to the place, so there is no place at the caret for a record to be about — and `placeOutline`
  resolves only where the place line and the caret agree, so a record kept through a move would not
  be read. Measured and recorded rather than closed.
- **The palette's record.** `main.ts`'s `runOp` dispatches with no `userEvent` and states no
  `abandon` edit, so it writes no record for a place it creates OR carries. Recorded in the same
  research entry; its fix is `runOp`'s dispatch, not this record.
- **Provenance that outlives the per-view record** — the `StateField` several parked entries want,
  which would also close the redone-place limitation. Not this change.
