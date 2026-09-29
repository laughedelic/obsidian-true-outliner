# Spec Delta

## MODIFIED Requirements

### Requirement: A case file states its setup, keys and columns

A case file SHALL be a preamble of `name: value` lines followed by `=== <header>` columns. The
names are `case` (a title), `outline` (`on`, the default, or `off`), `tabs` (`off`, the default,
or `on`, for "Indent using tabs"), `platform` (`desktop` or `mobile`; both when absent),
`known-failing` (`#` and an issue number: the case waits on that issue's fix) and `keys`. A `keys`
line SHALL be phases separated by ` | `, each phase steps separated by spaces: a chord of
`⌘ ⌃ ⌥ ⇧` with `⇥ ⏎ ⌫ ⌦ ↑ ↓ ← → ⎋` or one character, a spelled key or chord (`Home`,
`mod-shift-enter`), or quoted text, each with an optional `×N`. A case file SHALL have a `before`
column, and one result column per phase, each header starting `expected` or `after`; a `clipboard`
column is required by a `⌘V` step and refused without one. A column whose header is `actual`, or
`actual` and a space and more text, and any column with another header, is a reference that a run
ignores, except in a file with `known-failing`: there the file SHALL hold exactly one `actual`
column, which is the case's recorded result, and a file without one is refused unless it is run
with `--record`. A file with `known-failing` SHALL hold its result columns even when it is run with
`--record`. Anything else — an unknown name or value, a `known-failing` value that is not `#` and
digits, a step that is not a key, a missing `before`, a count of result columns that is not the
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

- **WHEN** a case file with no `known-failing` also holds an `actual` column
- **THEN** the run ignores it and compares the `expected` column

#### Scenario: A known-failing case file parses

- **WHEN** a file has `known-failing: #228`, `keys: ⏎`, and columns `before`, `expected ⏎` and
  `actual ⏎`
- **THEN** it parses with the issue 228 and the `actual` column read as a drawn state, and that
  column is not among its references

#### Scenario: A malformed marker names its line

- **WHEN** a file has `known-failing: 228`, `known-failing: #228 desktop`, or the name twice
- **THEN** parsing is refused with a message naming the line

#### Scenario: A marked file without its recorded result is refused

- **WHEN** a file has `known-failing: #228` and no `actual` column, or two of them
- **THEN** parsing is refused, and a file with none is accepted when parsed for `--record` and has
  its result columns

**Covered by**: `tests/notation.test.ts`

### Requirement: Case files are checked without Obsidian

Every file under `e2e-tests/cases/` SHALL be parsed by the unit suite, which refuses one that does
not parse, whose directory is not the name of a capability under `openspec/specs/`, whose keys the
runner would not press, or whose `before` or `expected` column, or `actual` column in a file with
`known-failing`, does not read back as itself after being drawn. It SHALL also refuse a file with
`known-failing` whose `actual` column matches every one of its `expected` columns by the comparison
a case uses (the text, and the caret, selection or block selection only where that `expected` draws
one), since the marker would wait on a difference that is not there.

#### Scenario: A case file under an unknown capability is refused

- **WHEN** a case file sits under a directory that names no capability
- **THEN** the unit suite fails and names the file

#### Scenario: A marker that waits on nothing is refused

- **WHEN** a case file with `known-failing` holds an `actual` column identical to its `expected`, or
  differing from it only by a caret its `expected` does not draw
- **THEN** the unit suite fails and names the file

#### Scenario: An actual that stands for one phase is accepted

- **WHEN** a two-phase file with `known-failing` holds an `actual` that matches the first phase's
  `expected` and differs from the second's
- **THEN** the unit suite accepts it

**Covered by**: `tests/case-files.test.ts`

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
SHALL write the case file with its result columns filled from the app; for a file with
`known-failing` it SHALL keep the marker and the `expected` columns and write the state the app
gave at the first phase that differs from them as the `actual` column, drawing a caret, selection
or `▒` only where that phase's `expected` draws one, and it SHALL say when no phase differs.

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

**Covered by**: `e2e-tests/specs/98-drawn-cases.e2e.ts` (the shipped case files under `e2e-tests/cases/`), `tests/case-report.test.ts`

## ADDED Requirements

### Requirement: A known-failing case passes while the app gives its recorded result

A case with `known-failing` SHALL run as any case does, on every platform it runs on, and be
judged on the states its phases read, pressing no key after the first phase whose state differs
from its `expected` column. When every phase's state matches its `expected` column, by the
comparison a case uses, the case SHALL fail, its first line being
`case <name> no longer differs (<platform>): remove known-failing: #<issue>`. Otherwise the first
phase whose state differs from its `expected` is the one judged: when its state matches the `actual`
column by the same comparison — the text, and the caret or selection when `actual` draws one, and
the block-selected lines when it draws `▒` — the case SHALL pass; when it does not, the case SHALL
fail, its first line being
`case <name> differs from its recorded actual (<platform>): known-failing #<issue>`, and its drawing
showing `before`, that phase's `expected`, `actual (recorded)` and `actual (now)`, and, as for any
failure, saying so when that `expected` draws no caret or selection. These two first
lines replace the rule of "A failing case prints a drawing" that a first line names what differs; its
other rules, and every other failure, are unchanged. A `before` the editor does not hold, an error
while pressing keys, and a file that does not parse SHALL fail as they do for any case. A marker
SHALL apply on every platform the case runs on.

#### Scenario: A case that still fails as recorded passes

- **WHEN** a case with `known-failing: #228` draws the numbering of a list after the edited one in
  `actual`, and the app gives that on desktop and under mobile emulation
- **THEN** the case passes on both, and only because the text and the drawn caret are both the
  recorded ones

#### Scenario: A case that no longer fails is red

- **WHEN** the app's state after every phase matches `expected`
- **THEN** the case fails, and its first line names the issue and asks for the marker's removal

#### Scenario: A different result is not the recorded bug

- **WHEN** the first differing phase's state matches neither `expected` nor `actual`, as when a key
  means something else on the platform running it
- **THEN** the case fails, drawing `before`, `expected`, the recorded `actual` and the state now

#### Scenario: The phase judged is the first that differs

- **WHEN** a case has two phases, the first matching its `expected` and the second differing from it
  the way `actual` draws
- **THEN** `actual` is compared with the second phase's state and the case passes

#### Scenario: Later phases are not pressed

- **WHEN** a case has two phases and the first differs from its `expected` the way `actual` draws
- **THEN** the case passes without the second phase's keys pressed, and the drawing of a failure of
  its kind would show no second phase

#### Scenario: A marker does not hide a failure before the result

- **WHEN** a case with `known-failing` has a `before` the editor cannot hold
- **THEN** the case fails at `before`, as it does without the marker

**Covered by**: `tests/case-report.test.ts`, `e2e-tests/specs/98-drawn-cases.e2e.ts`

### Requirement: A known-failing case that still fails is reported

A case that passes because it still differs SHALL report itself three ways, none of which fails the
run. It SHALL print, in the run's output, the first line
`known-failing #<issue>: case <name> still differs in <what differs> (<platform>)`, then the case's keys and setup and the drawing of `before`, `expected` and `actual`.
It SHALL be recorded, and the launcher SHALL list every recorded case, with its issue, platform and
what differs, as `knownFailing` in the run's failure summary and print one line per entry after the
failures, the list being empty and nothing printed when there is none. And the step summary of a CI
job that ran the case SHALL list each entry with a link to its issue, and hold nothing when the
list is empty or the summary file is absent. A recorded case SHALL NOT appear among the summary's
failures.

#### Scenario: A still-failing case is in the summary

- **WHEN** a run holds two known-failing cases that still differ and one ordinary case that fails
- **THEN** the summary's `failures` holds the ordinary case only, and its `knownFailing` holds the
  two, each with the issue, the platform and the parts that differ

#### Scenario: A run with none prints nothing extra

- **WHEN** a run holds no known-failing case, or every one of them is red
- **THEN** the summary's `knownFailing` is empty, the launcher prints no known-failing line, and the
  step summary is empty

#### Scenario: Each platform reports its own

- **WHEN** the desktop and the mobile job of the `drawn-cases` group both run a still-failing case
- **THEN** each job's step summary lists it under its own platform

#### Scenario: A record cut short is skipped

- **WHEN** a worker was stopped in the middle of writing a record
- **THEN** the launcher collects the complete records and skips the partial line

**Covered by**: `tests/known-failing.test.ts`, `e2e-tests/specs/98-drawn-cases.e2e.ts`
