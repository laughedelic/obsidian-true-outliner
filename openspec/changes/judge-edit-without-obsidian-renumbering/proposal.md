# Proposal

## Why

With Obsidian's "Smart lists" on, deleting an ordered item that has siblings after it reaches the
enforcement filter with Obsidian's renumbering of those siblings appended to the same transaction
([#260](https://github.com/laughedelic/obsidian-true-outliner/issues/260)). The verdict layer sees
a multi-range edit with a range it does not model, and passes the whole transaction:
- A block deletion leaves an empty line where the item was.
- Backspace on an emptied middle item leaves a bare `2.` paragraph that adopts the item below it.
- On a list nested at three columns, Obsidian also renumbers the parent list.

A linewise cut is worse. Its range touches the appended one, and the two reach the filter joined
as one range across two nodes, which the layer rewrites as a type-over. The item after the cut
loses its text. The same gestures on the last item of a list, or on a bullet list, are enforced,
because nothing is appended there.

`node-edit-enforcement` requires these gestures to be structural. `transaction-classification`
requires a multi-range edit with an unmodelled range to pass, and it reads every range of a
transaction as the user's. For these inputs the two requirements conflict. #260 decides which
wins: its expected results are the structural ones. The ranges
Obsidian appends, where they sit and which class they give are measured in
`docs/research/obsidian-list-renumbering`, "The ranges it appends to a user edit".

## What Changes

- **The user's ranges are separated first.** A transaction is classified and judged on the
  user's own ranges. A range that only rewrites one ordered marker's number — the shape
  Obsidian's renumbering appends — is set aside first, provided another range remains.
- **Touching ranges are split.** Where a user range touches an appended one, the two are
  separated before anything else reads them.
- **What the verdict does with the set-aside ranges.** A `rewrite` replaces the whole
  transaction, Obsidian's numbers included; the structural operation numbers the runs it changes
  itself, as `structural-operations` already requires. A `pass` keeps Obsidian's numbers, as
  today, and a `veto` dissolves the transaction.
- **The class ignores Obsidian's `userEvent`.** A dispatch with no `userEvent` of its own
  is classified as if Obsidian's `input.renumber` were absent, so it stays `programmatic`.
- **Other gestures follow.** A type-over or a paste over a selected item, and ⌦ at the end
  of an item, go from a native pass to the verdict they get without anything appended,
  whenever items follow.
- **Effects outside the verdict layer**, for the gestures that are rewritten:
  - While zoomed, such a deletion is now judged on its own edits, so Obsidian's renumbering of a
    hidden line no longer vetoes it as leaving the zoom.
  - A fold whose hidden lines Obsidian would have renumbered stays closed.
  - Backspace on an emptied FIRST item with siblings now meets the first-node veto, as a lone
    first item already does.

## Non-goals

- An edit that PASSES keeps Obsidian's renumbering, as a native edit does, with everything that
  follows from it. A linewise cut in a list nested at three columns is a within-node edit, and
  Obsidian renumbers the parent list below it and, reading three columns as its own level, the
  children of that list's later items. A fold over such children opens, and a zoom that hides
  them exits, as typing already does ("Known gaps" in the research note). One gesture moves into
  this set: a ⌫ inside an item, zoomed, with an empty item below it at the document's end. On
  `main` the appended change misclassified it, and the zoom check refused the ⌫; it now applies
  and the zoom exits, as the same ⌫ does with no empty item below. Whether outline mode should keep Obsidian's
  renumbering off the edits it passes, typing included, is
  [#263](https://github.com/laughedelic/obsidian-true-outliner/issues/263).
- Obsidian's renumbering of lines inside inserted text composes into the user's own range, and
  cannot be told apart from it. A paste of `7. x⏎8. y` over an item is judged as a paste of
  `2. x⏎3. y`, as it is on `main`.

- Obsidian's renumbering of ordinary typing is left untouched; whether outline mode should keep
  it is [#263](https://github.com/laughedelic/obsidian-true-outliner/issues/263).
- A change of ordered delimiter treated as the same list is
  [#228](https://github.com/laughedelic/obsidian-true-outliner/issues/228), not this.
- `isExactSubtreeCoverDeletion` reading a replacement as a deletion is left as it is. With the
  appended ranges set aside it no longer meets them.
- Plugin-planned dispatches keep the restoration #256 added; nothing changes there.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `transaction-classification`: a new requirement, "A transaction is judged on the user's own
  changes", sets aside a change rewriting only an ordered marker's number that another filter
  appends. "Programmatic and remote transactions pass through untouched" reads Obsidian's
  `input.renumber` as no `userEvent`.
- `node-edit-enforcement`: an ordered item's deletion that is rewritten ends with the numbers the
  structural operation writes, with scenarios for the gestures #260 reports.

## Impact

- A pure helper that separates the appended ranges and rejoins the rest, with unit tests.
- `src/plugin/transaction-filter.ts` reads the changes through it for both classification and
  the verdict.
- e2e coverage in `62-outline-edit-enforcement`, `80-outline-zoom` and `92-fold-through-edits`.
