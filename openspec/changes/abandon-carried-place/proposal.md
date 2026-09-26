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
  place afterwards removes it exactly as declining it before the carry would have: one ⌫, one
  Delete, or moving away with nothing typed. Everything the carrying key did stays.
- The removal is restated against the document the carrying key produced, by the operation that
  carried it. It is not carried over from the edit the place was opened with.
- A carried provisional position is removed as a line. A carried EMPTY NODE is removed as a node,
  whatever its indentation. An ordered run it belonged to is renumbered as if it had never been
  there.
- A carry that begins on a place with no removal record creates none. An already-empty item the
  user moved is still left alone.
- ⌫ on a carried place returns the caret to where the key that opened the place started, as it
  does for a fresh one.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-history-integration`: the open-place requirement stops saying that the removal record
  does not survive a carry. A new requirement states what a carried place's removal does.

## Impact

- `src/plugin/grammar.ts`: a removal form that removes whatever place the caret is on — a line for a
  position, the node for an empty node. Indent and outdent state it.
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
- An empty node that has children is not removed on abandon. Nothing that creates a place creates
  one with children, and removing its line would re-parent them.
