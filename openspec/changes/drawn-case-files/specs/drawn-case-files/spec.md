# Spec Delta

## Purpose

Defines drawn case files: a case written in the presenting-examples notation with the keys and
setup it needs, the runner that executes it in the real app on desktop and mobile emulation, the
drawing it prints when the app disagrees, and the helper that draws the editor's state for any
spec or agent.

## ADDED Requirements

### Requirement: One module reads and draws the notation

The notation of the `presenting-examples` skill SHALL be defined by one module that the skill's
layout script, the case runner and the state helper all use. It SHALL read a column of the literal
document into text and a selection, draw a text and selection into a column, and read a drawn
block back into columns. Reading what was drawn SHALL return the text and selection that were
drawn.

A selection MAY begin with `«` on one line and end with `»` on a later line; the line breaks
between are part of it, and the drawn underline continues across them. A `┃` touching one end of a
selection names its head. `▒` opens a block-selected line and a column with `▒` and a caret is
refused. A column with no `∅` reads as text ending in one newline; `∅` after a line's text is a
text with no final newline, and `∅` on a line of its own is a final newline and an empty last line.
A malformed column — a second caret, an unclosed `«`, a `┃` not touching its selection, a `∅` off
the last line — is refused with the line it is on.

#### Scenario: A drawn state reads back as itself

- **WHEN** a text and a selection are drawn, and the column is read
- **THEN** the same text and selection come back, for a caret, a forward and a backward selection
  in one line, a selection across lines, a block selection, and a text with no, one and two final
  newlines

#### Scenario: A selection across lines is one selection

- **WHEN** a column opens `«` on its second line and closes `»` on its fourth
- **THEN** it reads as one range from the first to the last of those characters, including the
  line breaks between, and it draws with every character between the two underlined

#### Scenario: The layout script's output is unchanged

- **WHEN** the layout script is given the input it accepted before the module existed
- **THEN** it prints the same block, byte for byte

#### Scenario: A block from an issue reads back into columns

- **WHEN** a drawn block is given to the layout script's `--read`
- **THEN** the columns it prints, laid out again, give the block back, apart from the padding a
  hand alignment chose

### Requirement: A case file states its setup, keys and columns

A case file SHALL be a preamble of `name: value` lines followed by `=== <header>` columns. The
names are `case` (a title), `outline` (`on`, the default, or `off`), `tabs` (`off`, the default,
or `on`, for "Indent using tabs"), `platform` (`desktop` or `mobile`; both when absent) and
`keys`. A `keys` line SHALL be phases separated by ` | `, each phase steps separated by spaces: a
chord of `⌘ ⌃ ⌥ ⇧` with `⇥ ⏎ ⌫ ⌦ ↑ ↓ ← → ⎋` or one character, a spelled key or chord (`Home`,
`mod-shift-enter`), or quoted text, each with an optional `×N`. A case file SHALL have a `before`
column, and one result column per phase, each header starting `expected` or `after`; a `clipboard`
column is required by a `⌘V` step and refused without one. A column named `actual`, and any
column with another header, is a reference that a run ignores. Anything else — an unknown name or
value, a step that is not a key, a missing `before`, a count of result columns that is not the
count of phases (one when there is no `keys` line) — is refused with its line number.

#### Scenario: A well-formed case file parses

- **WHEN** a file has a title, `tabs: on`, `keys: ⇥ | ⇧⇥` and columns `before`, `after ⇥` and
  `after ⇧⇥`
- **THEN** it parses to two phases, three drawn states, and the two settings

#### Scenario: A malformed case file names its line

- **WHEN** a file has `tabs: yes`, or a step `⇥⇥⇥`, or `⌘V` with no `clipboard` column, or two
  result columns for three phases
- **THEN** parsing is refused with a message naming the line, or the missing column

#### Scenario: A failure report runs again unchanged

- **WHEN** a case file also holds an `actual` column
- **THEN** the run ignores it and compares the `expected` column

### Requirement: Case files are checked without Obsidian

Every file under `e2e-tests/cases/` SHALL be parsed by the unit suite, which refuses one that does
not parse, whose directory is not the name of a capability under `openspec/specs/`, whose keys the
runner would not press, or whose `before` or `expected` column does not read back as itself after
being drawn.

#### Scenario: A case file under an unknown capability is refused

- **WHEN** a case file sits under a directory that names no capability
- **THEN** the unit suite fails and names the file

### Requirement: The runner executes case files in the real app on both platforms

One spec SHALL register a case per file under `e2e-tests/cases/`, or per path in the
`TO_CASE_FILES` environment variable when it is set, and run it in the real app under the desktop
configuration and under mobile emulation, skipping a case whose `platform` is the other one. A
case SHALL run in a note of its own with the case's two settings applied and restored afterwards.
It SHALL set the caret, selection or block selection the `before` column draws in one step and
read back the editor's state; when that state is not the drawn `before`, the case fails there. Each
phase SHALL press its keys, with ⌘V writing the `clipboard` column to the clipboard and pasting,
and read the state. A phase passes when the text equals the `expected` column's, and, when the
column draws a caret or selection, the main range equals it, and, when it draws `▒`, the
block-selected lines equal it. Running a file with `--record` SHALL never fail on a difference and
SHALL write the case file with its result columns filled from the app.

#### Scenario: A drawn case runs unchanged

- **WHEN** a case file draws `- a` and `- b┃`, keys `⇥`, and an `expected` column with `- b` under
  `- a` and the caret at its end
- **THEN** on desktop and under mobile emulation the case passes, and passes only if the text and
  the caret are both as drawn

#### Scenario: An unreachable before fails at before

- **WHEN** a case's `before` draws a caret where the editor does not let one rest
- **THEN** the case fails without pressing a key, drawing what the editor holds beside what was
  drawn

#### Scenario: A scratch case file runs from anywhere

- **WHEN** `TO_CASE_FILES` names a case file outside the repository
- **THEN** only that case runs, and the repository's case files do not

#### Scenario: Recording fills the result

- **WHEN** a case file with a `before` column and keys but no result column runs with `--record`
- **THEN** the case does not fail, and a case file with the result column as the app read it is
  written under `.obsidian-cache/cases/`

#### Scenario: A phase that presses ⌘V pastes

- **WHEN** a case has a `clipboard` column and a ⌘V step
- **THEN** the pasted document is the clipboard column's text, arrived by the editor's own paste

### Requirement: A failing case prints a drawing

A case that fails SHALL throw an error whose first line names the case, what differs (`text`,
`caret`, `block selection`, or `before`) and the platform, and whose remaining lines are the keys
line and setup and one drawing: `before`, and for the first phase that differs, `expected` and
`actual`, the caret and selection read from the editor's state. A phase whose `expected` column
draws no caret or selection SHALL be reported as not asserting one, and its `actual` column SHALL
still show the caret.

#### Scenario: A caret mismatch is drawn

- **WHEN** the text is as drawn and the caret is one character off
- **THEN** the first line says `caret`, and the drawing shows the caret in two places, one in each
  column

#### Scenario: Only the first differing phase is drawn

- **WHEN** the second of three phases differs
- **THEN** the drawing has `before`, and that phase's `expected` and `actual`, and no later phase

### Requirement: The editor's state draws through one helper

`e2e-tests/drawing.ts` SHALL read the editor's text, every range, whether the editor has focus and
the lines that carry the selected-node chrome in one page-side function of the Obsidian app that
takes no other input, and SHALL draw one or several such states as columns. A state with more than
one range SHALL draw the main range and say how many there were. Every failing e2e case SHALL print
the drawing of the editor's state beside its failure screenshot, without failing the case a second
time when the read cannot be made.

#### Scenario: Block-selected lines are what the editor paints

- **WHEN** the selection has grown to cover a node's whole line by a second ⌘A
- **THEN** the drawing marks that line `▒` and shows no caret

#### Scenario: A failing spec draws the editor

- **WHEN** any e2e case fails with a markdown view open
- **THEN** its output includes the drawing of that editor's text and caret

#### Scenario: A read that cannot be made does not hide the failure

- **WHEN** a case fails with no markdown view open
- **THEN** the case's own error is what is reported
