# Proposal

## Why

A structural command run within half a second of a structural key joins that key's undo step, so
one undo reverts both ([#250](https://github.com/laughedelic/obsidian-true-outliner/issues/250)).
`editor-structural-commands` already asks for one undo step per command, but the transaction
discipline it prescribes only keeps a command apart from what comes AFTER it. CodeMirror decides
a join from the new change's own `userEvent` and the previous entry's recorded selection, so a
command is exposed to whatever came before it (`docs/research/command-undo-join`, "The
mechanism"). The measurements there find the indent command joining the ⇧⏎ before it in the app.

## What Changes

- A structural command's undo step never takes in the edit before it. Undoing a command returns
  the document to its state just before the command, whatever edit preceded it and however soon.
- The command states the current selection to the editor, unchanged, before it dispatches its
  change. That closes the previous entry, the way the selection it re-asserts after its change
  already closes its own.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `editor-structural-commands`: "Single-transaction dispatch with undo grouping" states that a
  command's undo step is closed on both sides, with a scenario for a command run straight after a
  structural key.

## Non-goals

- The keyboard path. A structural key carries a `userEvent` CodeMirror never joins, so it is
  already its own step on both sides.
- Giving the command a `userEvent` of its own. Every listener that reads our `userEvent`s would
  start treating the command as a keypress (`design.md`, "Decisions").
- Other edits that dispatch without a `userEvent`. The command is the only one of ours.

## Impact

- `src/plugin/main.ts`: `runOp` re-asserts the selection before its dispatch.
- Tests: an e2e case in `20-structural-commands` and a CodeMirror-level unit case in
  `tests/minimal-change-history.test.ts`.
