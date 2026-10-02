# Spec Delta

## ADDED Requirements

### Requirement: A mark on a line states a folded node or the zoom root

A column of the notation SHALL be able to state which nodes are folded and which node is the zoom
root, by a mark that opens the first line of the node: `►` for a folded node, `●` for the zoom
root. A line's marks SHALL come in the order `●►▒`, each at most once, and the text of the line
follows them; a mark anywhere else is text, as `▒` is. A column SHALL hold at most one `●`. A line
that opens with `●` and `►`, since a zoom opens its root, a second `●` in a column, and marks out of
order are refused with the line they are on. The marks SHALL state the whole fold and zoom state of
the column: a column with no `►` states no fold and a column with no `●` states no zoom. The
document a column draws is unchanged by the marks, and a zoomed column draws every line of it,
hidden lines included.

Reading a column SHALL return the 0-based lines that carry `►` and the line that carries `●`
beside the text and the selection, and drawing a state SHALL draw them, so reading what was drawn
returns them. The side-by-side form SHALL draw them after the edge glyph, and reading a drawn block
in either form SHALL return them.

Wherever this capability compares a state with a drawn column — a case's phases, the `actual`
column of a `known-failing` case, and the unit check that refuses a marker waiting on nothing — the
folded nodes and the zoom root are compared with the text, none where the column marks none; a
recorded `actual` draws every mark the app held.

#### Scenario: A drawn state reads back as itself

- **WHEN** a text with two folded nodes, one of them nested in the other, a zoom root and a caret
  is drawn, and the column is read
- **THEN** the same text, caret, folded lines and zoom line come back, and a line that is both
  folded and block-selected comes back with `►` before `▒`

#### Scenario: A malformed mark names its line

- **WHEN** a column holds two `●`, or a line that opens `●►`, or a line that opens `▒►`
- **THEN** the column is refused with the line it is on, and a case file holding it is refused
  with that line's number in the file

#### Scenario: No mark states none

- **WHEN** a result column draws a text and a caret and no mark
- **THEN** it states no fold and no zoom, and a run holds the editor to that

**Covered by**: `tests/notation.test.ts`

## MODIFIED Requirements

### Requirement: The runner executes case files in the real app on both platforms

One spec SHALL register a case per file under `e2e-tests/cases/`, or per path in the
`TO_CASE_FILES` environment variable when it is set, and run it in the real app under the desktop
configuration and under mobile emulation, skipping a case whose `platform` is the other one. A
case SHALL run in a note of its own with the case's two settings applied and restored afterwards.
It SHALL clear the folds and the zoom of that note, zoom to the node the `before` column marks `●`,
fold the nodes it marks `►` from the last line to the first, set the caret, selection or block
selection the column draws in one step, and read back the editor's state; when that state is not
the drawn `before`, text, selection, block-selected lines, folded nodes and zoom root included, the
case fails there. Each
phase SHALL press its keys, with ⌘V writing the `clipboard` column to the clipboard and pasting,
and read the state. A phase passes when the text equals the `expected` column's, when the folded nodes
and the zoom root equal the ones it marks, none where it marks none, and, when the column draws a
caret or selection, the main range equals it, and, when it draws `▒`, the block-selected lines equal
it. Running a file with `--record` SHALL never fail on a difference and
SHALL write the case file with its result columns filled from the app, marks included; for a file with
`known-failing` it SHALL keep the marker and the `expected` columns and write the state the app
gave at the first phase that differs from them as the `actual` column, drawing a caret, selection
or `▒` only where that phase's `expected` draws one and every fold and zoom mark the app held, and
it SHALL say when no phase differs.

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
  written under `.obsidian-cache/cases/` and printed

#### Scenario: Recording a known-failing case fills its actual

- **WHEN** a case file with `known-failing`, an `expected` column and no `actual` column runs with
  `--record`
- **THEN** the case does not fail, and the file written under `.obsidian-cache/cases/` keeps the
  marker and the `expected` column and has the state the app gave as its `actual` column

#### Scenario: A recorded actual draws only what expected draws

- **WHEN** a case file with `known-failing` whose `expected` draws no caret runs with `--record`
- **THEN** the `actual` column written draws no caret

#### Scenario: A phase that presses ⌘V pastes

- **WHEN** a case has a `clipboard` column and a ⌘V step
- **THEN** the pasted document is the clipboard column's text, arrived by the editor's own paste

#### Scenario: A zoom start is arranged and held

- **WHEN** a case's `before` marks `2. p` with `●`, draws the caret in its child, and presses ⌘⇧↓
- **THEN** the note is zoomed on `2. p` before the caret is set, the case is held to that zoom, and
  the `expected` column's `●` is compared with the zoom root after the move

#### Scenario: Folds are arranged from the last line to the first

- **WHEN** a `before` marks a node and a node nested in it with `►`
- **THEN** both are folded when the case starts, the inner one first, and the case is held to both

#### Scenario: A state the editor cannot hold fails at before

- **WHEN** a `before` marks `►` on a node with no children, or marks `●` on the zoom root and `►` on a
  node outside its subtree
- **THEN** the case fails at `before` without pressing a key, drawing the folds and zoom the
  editor holds beside the ones drawn

#### Scenario: A result without a mark asserts none

- **WHEN** a case folds a node with `⌘⌥↑` and its `expected` column draws the text and the caret
  and no `►`
- **THEN** the case fails on `folds`, and passes when the column marks the folded node

#### Scenario: A zoom that survives is asserted

- **WHEN** a refused edit leaves the zoom in place and the `expected` column marks the root `●`
- **THEN** the case passes, and it fails on `zoom` if the edit cleared the zoom

**Covered by**: `e2e-tests/specs/98-drawn-cases.e2e.ts` (the shipped case files under `e2e-tests/cases/`), `tests/case-report.test.ts`

### Requirement: A failing case prints a drawing

A case that fails SHALL throw an error whose first line names the case, what differs (`text`,
`caret`, `selection`, `block selection`, `folds`, `zoom`, or `before`) and the platform, and whose
remaining lines are the keys line and setup and one drawing: `before`, and for the first phase that
differs, `expected` and `actual`, the caret and selection read from the editor's state and the
marks read from its folds and zoom. A phase whose `expected` column draws no caret or selection
SHALL be reported as not asserting one, and its `actual` column SHALL still show the caret.

#### Scenario: A caret mismatch is drawn

- **WHEN** the text is as drawn and the caret is one character off
- **THEN** the first line says `caret`, and the drawing shows the caret in two places, one in each
  column

#### Scenario: Only the first differing phase is drawn

- **WHEN** the second of three phases differs
- **THEN** the drawing has `before`, and that phase's `expected` and `actual`, and no later phase

#### Scenario: A fold that opened is drawn

- **WHEN** a phase leaves a node unfolded that its `expected` column marks `►`
- **THEN** the first line says `folds`, and the drawing shows `►` in `expected` and none in `actual`

#### Scenario: A zoom that moved is drawn

- **WHEN** a phase leaves the zoom on another node than the one its `expected` column marks `●`
- **THEN** the first line says `zoom`, and the two columns mark different lines

**Covered by**: `tests/case-report.test.ts`

### Requirement: The editor's state draws through one helper

`e2e-tests/drawing.ts` SHALL read the editor's text, every range, whether the editor has focus, the
lines that carry the selected-node chrome, the first line of each folded node and the zoom root's
line in one page-side function of the Obsidian app that takes no other input, and SHALL draw one or
several such states as columns. The folded nodes and the zoom root SHALL come from the plugin's own
state, each fold named by the first line of the node whose range it is; a fold that no node claims
SHALL be drawn on the line its range starts at and reported in a note. A state with more than one
range SHALL draw the main range and say how many there were. Every failing e2e case SHALL print the
drawing of the editor's state beside its failure screenshot, without failing the case a second
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

#### Scenario: A fold is drawn on its node's first line

- **WHEN** a paragraph of two source lines is folded
- **THEN** the drawing marks `►` on the paragraph's first line, though the fold's range starts on
  its second

#### Scenario: A zoom is drawn on its root

- **WHEN** the editor is zoomed on a list item that is not the first node
- **THEN** the drawing marks `●` on that item's line and draws every line of the document

**Covered by**: `e2e-tests/specs/98-drawn-cases.e2e.ts` ("the editor drawn as it is read")
