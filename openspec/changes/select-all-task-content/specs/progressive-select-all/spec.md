## MODIFIED Requirements

### Requirement: List-item content rung excludes the marker
For a list-item node, the "own content" rung (the first, most specific rung in
the ladder) SHALL start where the item's own text begins on its first line —
the same marker-transparent boundary a split and a Backspace merge use —
excluding the leading indentation, the list marker and the space after it,
and, on a task item, the task marker (`[ ]` or `[x]`) and the space after
that. For heading and paragraph nodes, which have no marker, the "own content"
rung SHALL start at column 0 of the node's first line.

A task item whose text is empty has no content rung: its first press SHALL
take the next rung, the whole line.

The task marker is excluded here and not for the caret: Home still lands after
the list marker, before the checkbox (`content-space-caret`). A range boundary
at the list marker's end is moved onto the marker by Obsidian's own
checkbox-widget mount (`docs/research/select-all-task-content`), so a rung
starting there cannot be the item's content on screen.

#### Scenario: First press on a list item excludes its marker
- **WHEN** the cursor is inside a list item's text (e.g. `- some text`) and the
  user presses Mod-A
- **THEN** the selection covers `some text` only, not the leading `- ` marker

#### Scenario: First press on a task item excludes its checkbox too
- **WHEN** the cursor is inside a task item's text (e.g. `- [ ] buy milk`) and
  the user presses Mod-A
- **THEN** the selection covers `buy milk` only, and stays there once Obsidian's
  checkbox widget has mounted
- **AND** a further press takes the whole line, checkbox included

#### Scenario: An empty task item has no content to select
- **WHEN** the cursor sits after the marker of `- [ ] ` and the user presses Mod-A
- **THEN** the selection becomes the item's whole line

#### Scenario: First press on a heading includes the full line
- **WHEN** the cursor is inside a heading node (e.g. `## Heading`) and the user
  presses Mod-A
- **THEN** the selection covers the entire heading line including `## `

**Covered by**: `tests/select-all-ladder.test.ts`; `e2e/specs/64-progressive-
select-all.e2e.ts` ("a list item's first press selects its content only,
excluding the marker"; "a task item's first press selects its text only").
