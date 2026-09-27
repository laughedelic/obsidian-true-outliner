## MODIFIED Requirements

### Requirement: Single-transaction dispatch with undo grouping
An accepted operation's minimal edit list SHALL be applied as one editor transaction via
the public `Editor` API: one undo step reverts the whole structural operation, and no
lines outside the edit ranges are touched.

That undo step SHALL be closed on both sides. It SHALL NOT take in the edit that came before
the command, however soon before it the command runs, and the edit after it SHALL NOT join it.
The history joins a change that carries no `userEvent` into the entry before it unless a
selection has been recorded on that entry, and the edit before a command is often one that
records none: a structural keypress dispatches its caret in the same transaction as its change.
So a command SHALL re-assert the current selection, unchanged, in a selection-only transaction
before its change, as it re-asserts its own cursor after it (see "Cursor follows the operation's
result"). It shows the current selection against the current document, so no observer sees a
cursor for a document it has not been shown.

*(Amendment 2026-09-27, `command-undo-step-after-key`: this requirement previously kept a command
apart only from what followed it. A command run within half a second of a structural key joined
the key's undo step. Measured in `docs/research/command-undo-join`.)*

#### Scenario: One undo step per op
- **WHEN** a structural command succeeds and undo is invoked once
- **THEN** the document returns byte-identically to its pre-command state

#### Scenario: A command run straight after a structural key is its own undo step
- **WHEN** the caret is at the end of `- foo` under `- one`, Shift+Enter opens a new place
  below it, and the indent command runs straight after, then undo is invoked once
- **THEN** the document is the one Shift+Enter left, with the caret on the new place, and a
  second undo returns the document to `- one` / `- foo`
