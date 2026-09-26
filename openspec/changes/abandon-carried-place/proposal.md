# Proposal

## Why

Once a structural key has carried a place, declining it no longer removes it. ⌫ takes two presses
through an empty line. Walking away leaves a line of whitespace inside the item, where no caret can
reach it. An empty list item stays behind as an empty bullet. Without the carry, both gestures
remove the same place in one step. Issue #249 records the shapes and the decisions taken on #245.
`docs/research/carried-place-removal` measures every shape on `main`.

The spec requires this today. `structural-history-integration`'s scenario "The removal record keeps
its own conditions" states that nothing is removed after a carry. So closing the issue changes
specified behaviour.

## What Changes

- A place that still has a removal record when a key carries it keeps one after the carry. Tab,
  Shift+Tab, the empty-item ladder's outdent and the equivalent commands all carry. Declining the
  place afterwards removes it, by any gesture that declines a fresh one.
- A carried provisional position is removed as its line, and what the carrying key did to its item
  stands. A carried EMPTY NODE is removed by reverting the carries along with it, so the document
  returns to what it was before the key that opened it. That includes siblings an outdent adopted,
  runs a carry renumbered, and blank lines around the list.
- These removals are stated by the operations involved. The one the place was opened with is not
  simply mapped through the carry.
- A carry that begins on a place with no removal record creates none. An already-empty item the
  user moved is still left alone.
- ⌫ on a carried place returns the caret to where the key that opened the place started, as it
  does for a fresh one. That includes a position Shift+Tab re-created, where ⌫ lands in the node
  below today.
- Every gesture that declines a fresh place declines a carried one: moving away, ⌫, Delete, Enter
  on the place, and the bullet drag's pick-up.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-history-integration`: the open-place requirement stops saying that the removal record
  does not survive a carry. A new requirement states what a carried place's removal does.

## Impact

- `src/plugin/grammar.ts`: indent and outdent state their own reversal, and indent its line
  removal, when they carry a place.
- `src/plugin/provisional-cleanup.ts`: the recorder keeps a removal record across a carry when one
  was live on the place the carry began on.
- `src/plugin/keymap.ts` and `src/plugin/main.ts`: both dispatch paths hand the recorder the
  record that was live before the carry.
- Tests: `tests/provisional-place-record.test.ts` and `tests/undo-on-abandon.test.ts`, and e2e cases
  in `e2e-tests/specs/30-keyboard-grammar.e2e.ts`.

## Non-goals

- A redone place still cannot be declined again. That limitation is specified and stays.
- Moves do not carry a place, and this change does not make them.
- The undo-grouping defect of a command run straight after a key (#250) is its own issue.
- The Enter that renumbered a parent's ordered run in the live editor, although its plan does not
  (`docs/research/carried-place-removal`, "Ordered, Enter then Shift+Tab"), is not located or fixed
  here. The abandon only has to leave that run numbered correctly.
