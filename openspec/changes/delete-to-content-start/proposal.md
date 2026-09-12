## Why

Cmd+Backspace on a list item deletes too much: CodeMirror's own binding deletes back to the
visual row's start, column 0 on an unwrapped line, so the indentation and the marker go with
the text, and when the item is followed directly by its sibling the range is an exact subtree
cover and the enforcement layer removes the whole node, leaving the caret on the next item.
Measured in [docs/research/delete-to-content-start.md](../../../docs/research/delete-to-content-start.md).
`Home` on the same line already stops at the content start; the deletion should reach no
further than the motion does.

## What Changes

- Mod-Backspace, bound on macOS as CodeMirror binds it, deletes from the caret back to the
  caret's line's content start on a list item's own line: past the list marker and, on a task
  item, the task marker, so the checkbox survives; on a continuation line, to its alignment
  column. The range never starts at column 0, so it is never read as a subtree cover.
- At or inside the content start the key does what Backspace does there — the merge or veto
  the content-start rules already give, and ordinary editing inside the marker.
- Outside a list item's own line the key stays stock: a paragraph's or a heading's content
  start is column 0.
- A `Delete to content start` command carries the same rule, so the gesture can be given a
  hotkey where the key itself is not bound, and so the e2e runner can drive it on Linux.
- Unit cover for the planner and e2e cover for every measured shape.

No breaking changes: nothing bound before is rebound, and Ctrl-Backspace on Windows and Linux
stays word deletion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `content-space-caret`: a new requirement beside Home and End states where a line-start
  deletion stops, and what it does at the content start.

## Impact

- `src/caret-policy.ts` — the pure planner.
- `src/plugin/keymap.ts` — the handler and the `mac`-only binding.
- `src/plugin/main.ts` — the command.
- `tests/caret-policy.test.ts`, `e2e/specs/65-content-space-caret.e2e.ts`.
- `docs/research/delete-to-content-start.md`; a parking-lot entry in
  `docs/research/selection-follow-ups.md`.

## Non-goals

- **Widening classification.** A caret-derived line-start deletion and a selection of the
  whole line produce identical facts; the classifier cannot tell them apart, so the fix is at
  the key, not in `classify`.
- **Paragraphs and headings.** Their content start is column 0, where the key already stops;
  the exact-cover reading of a childless paragraph followed directly by another node is
  recorded in the parking lot as a question about covers, not about this key.
- **Mod-Delete.** CodeMirror binds it to word deletion on macOS, not to the line boundary;
  nothing to correct.
- **The R7 row of `docs/research/zoom-editing-boundary`**, which records the stock reading of
  this keystroke; it stays a record of what was measured then.
