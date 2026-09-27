# Proposal

## Why

With Obsidian's "Smart lists" on, deleting an ordered item that has siblings after it reaches the
verdict layer with Obsidian's renumbering of those siblings appended as extra change ranges. The
layer reads that as a multi-range edit with a range it does not model, and passes the whole
transaction: a block deletion leaves an empty line where the item was, and Backspace on an
emptied middle item leaves a bare `2.` paragraph that adopts the item below it. On a list nested
at three columns Obsidian also renumbers the parent list
([#260](https://github.com/laughedelic/obsidian-true-outliner/issues/260)). The same gestures on
the last item of a list, or on a bullet list, are enforced, because nothing is appended there.

The specs require both gestures to be structural — a deletion that exactly covers a subtree is
rewritten to its structural deletion, and Backspace at a list item's content start merges it
(`node-edit-enforcement`) — but `transaction-classification` also requires any multi-range edit
with an unmodelled range to pass. They do not say that ranges another filter appends are not part
of the user's edit. The shape of those ranges is measured in `docs/research/obsidian-list-renumbering`,
"The ranges it appends to a user edit".

## What Changes

- The verdict for a user edit is computed from the user's own ranges. A range that only rewrites
  one ordered marker's number — the shape Obsidian's renumbering appends — is set aside before the
  verdict is computed, provided another range remains.
- A `rewrite` then replaces the whole transaction, Obsidian's numbers included; the structural
  operation numbers the runs it changes itself, as `structural-operations` already requires.
- A `pass` still keeps Obsidian's numbers, as today, and a `veto` still dissolves the transaction.

## Non-goals

- Obsidian's renumbering of ordinary typing (`within-node-edit`) is untouched; whether outline
  mode should keep it is [#263](https://github.com/laughedelic/obsidian-true-outliner/issues/263).
- A change of ordered delimiter treated as the same list is
  [#228](https://github.com/laughedelic/obsidian-true-outliner/issues/228), not this.
- Deletions inside a quote stay `within-node-edit` and native; this change does not alter what
  class a transaction gets.
- Plugin-planned dispatches keep the restoration #256 added; nothing changes there.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `transaction-classification`: "Multi-range user edits receive verdicts" says that a range
  rewriting only an ordered marker's number, appended to a user edit, is not one of the user's
  ranges.
- `node-edit-enforcement`: scenarios for the two gestures #260 reports, a block deletion and a
  Backspace on an emptied middle ordered item.

## Impact

- `src/enforce.ts` (`computeVerdictForRanges`), and its unit tests in `tests/enforce.test.ts`.
- e2e coverage in `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts`.
- No change to classification, to the CM6 adapter, or to the planned-changes restoration.
