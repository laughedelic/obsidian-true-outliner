## ADDED Requirements

### Requirement: Delete to line start stops at the content start
A "delete to the start of the line" gesture — Mod-Backspace where the editor binds it, and
the `Delete to content start` command everywhere — SHALL, on a list item's own line, delete
from the caret back to that line's content start and no further: on the item's first line the
column where its text begins, past the list marker and past a task marker when the item
carries one, so the checkbox survives; on a continuation line, the line's alignment column.
The marker, the indentation and the node itself SHALL survive, and the caret SHALL rest at
the content start. The range SHALL never be read as a deletion of the node, whatever follows
the item.

With the caret at or inside the content start the gesture SHALL do what Backspace does there:
the merge or veto the content-adjacent deletion rules give at the content start, and ordinary
editing inside the marker. On a provisional position it SHALL cancel the position as
Backspace does.

Outside a list item's own line — a paragraph, a heading, an atom, a gap line — the gesture
SHALL be stock. A non-empty selection or a multi-cursor SHALL be stock too.

#### Scenario: An item followed by its sibling keeps its marker and its line
- **WHEN** the caret is at the end of `- alpha beta`, the next line is `- gamma`, and the
  user presses Mod-Backspace
- **THEN** the line reads `- ` with the caret after the marker, `- gamma` is untouched, and
  no structural verdict is computed

#### Scenario: A task item keeps its checkbox
- **WHEN** the caret is at the end of `- [ ] task text` and the user presses Mod-Backspace
- **THEN** the line reads `- [ ] ` with the caret after the task marker

#### Scenario: A continuation line keeps its alignment
- **WHEN** the caret is at the end of a list item's continuation line and the user presses
  Mod-Backspace
- **THEN** the line keeps its alignment whitespace and the caret rests after it

#### Scenario: At the content start the gesture is a Backspace
- **WHEN** the caret sits at `- beta`'s content start below `- alpha` and the user presses
  Mod-Backspace
- **THEN** the two items merge into `- alphabeta`, exactly as Backspace there does

#### Scenario: A paragraph is stock
- **WHEN** the caret is at the end of a paragraph line and the user presses Mod-Backspace
- **THEN** the editor's own line-start deletion runs, unchanged

**Covered by**: `tests/caret-policy.test.ts` ("planDeleteToContentStart");
`e2e/specs/65-content-space-caret.e2e.ts` ("delete to content start", D1–D6).
