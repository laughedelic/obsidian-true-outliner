## ADDED Requirements

### Requirement: A list marker's surplus whitespace is marked

In outline mode, the whitespace a list marker carries beyond the one character it needs
SHALL be marked on the line: the run past the first space after `-`, `1.` or a task
marker's `]`, on the item's first line. The mark SHALL keep the run's width, so a
whitespace-only run stays visible, and SHALL carry a title naming what the run is and that
Backspace at the start of the text removes it.

Live Preview draws the run as blank whatever its width, while the run sets the item's
content column, so a child indented short of it is a sibling to Obsidian and its deeper
descendants after a blank line an indented code block
(`docs/research/list-marker-content-column`). The mark puts the cause on the line that has
it. It is a decoration like every other here: scoped to outline mode, never mutating the
document, and absent from a nested per-cell editor.

#### Scenario: Every marker shape with a surplus is marked, and a one-space marker is not

- **WHEN** a note holds `- a`, `-  b`, `1.  c`, `- [ ]  d` and `-   e` with outline mode on
- **THEN** the first line carries no mark, each of the other four carries exactly one, each
  mark has a non-zero width, and the mark on `-   e` is wider than the mark on `-  b`

#### Scenario: The mark is an outline-mode decoration

- **WHEN** outline mode is off for the note
- **THEN** no line carries the mark, and turning the mode on renders it without any
  document change

#### Scenario: Removing the surplus removes the mark

- **WHEN** Backspace at `-  b`'s content start deletes the surplus space
- **THEN** the line reads `- b` and carries no mark
