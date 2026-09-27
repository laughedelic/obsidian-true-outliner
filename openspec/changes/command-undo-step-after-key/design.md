# Design

## Context

`runOp` in `src/plugin/main.ts` dispatches a command's change and its cursor in one
`Editor.transaction`, with no `userEvent`, and then re-asserts the cursor with `setCursor`. The
history's join rule and the sequences that meet it are in `docs/research/command-undo-join`: the
indent command joins a ⇧⏎ right before it; a move does not, and neither does typing in the app.

## Goals / Non-Goals

**Goals:**

- A command is one undo step whatever precedes it, on the palette and on a custom hotkey alike.
- The change and its cursor stay in one transaction (`editor-structural-commands`, the
  table-widget case).

**Non-Goals:**

- Changing what the keyboard path dispatches.
- Reworking which `userEvent`, if any, the command carries.

## Decisions

**Re-assert the current selection before the change.** A selection-only transaction records the
current selection on the previous history entry, and an entry with a recorded selection is never
joined. The selection is the one the editor already holds, against the document it already
shows, so nothing that watches selections reacts: the open place stays open because the caret
stays on its line (`provisional-cleanup`), and the fold, focus and goal-column listeners see the
same selection they saw.

- It is dispatched on the view with `filter: false`, as `history-caret` re-asserts its recorded
  cursor. Through `Editor.setSelections` the enforcement funnel would see a programmatic
  selection it may clamp, and the caret could then move between the operand read and the
  dispatch. `Editor.setSelections` stays the fallback when no view is found.
- It goes before the start state is read for `planned-changes`, which drops its statement on the
  next transaction from that state, whatever the transaction is.

**Alternative: a `userEvent` on the command.** `Editor.transaction` takes an origin that becomes
the transaction's `userEvent`. A plugin-own value would stop the join in both directions with no
extra transaction. It would also make the command visible to everything that reads our
`userEvent`s: `provisional-cleanup` would record the command itself as well as `recordDispatch`,
and the transaction classification and `record-decision` would start judging it. Rejected as a
larger change than the bug asks for.

**`structural-history-integration` is unchanged.** Its account of the palette path is about what
the command records on its OWN entry, which is still the value mapping gives. The new
re-assertion records a selection on the entry BEFORE the command, and the selection it records
is the one that entry's edit left, unchanged. Undoing the command restores that same selection,
so the entry reads the same value when it is undone in turn as it did without the re-assertion.
Only a selection change between the two undos differs, and then the entry keeps the caret its
own edit produced rather than the later one, which is the position "Redo restores a structural
operation's own cursor" asks for.

## Risks / Trade-offs

- **A foreign edit before the command now has its caret recorded.** For an edit whose caret
  mapping cannot reproduce, redo of that edit lands where the edit put the caret rather than
  where mapping would. Not measured; it is the value any caret movement would have recorded
  there.
- **Table-cell focus.** A command run while a nested table-cell editor has focus re-asserts a
  host selection inside the table. It is the selection the host already holds, against the
  document the widget already shows, which is not the case the single-transaction rule guards
  against. Not measured.
