## ADDED Requirements

### Requirement: A wait for the caret, used where a real click's selection lands late

The harness SHALL let a spec wait for the editor's caret to reach a document position, and a wait
that gives up SHALL reject once its limit has passed, with an error naming the position it waited
for and the last position it read. The two gap-click cases, `65-content-space-caret` D1 and
`66-content-space-caret-manual-pass` D8, SHALL read the caret after their real click through that
wait, because under mobile emulation the click's selection update lands about as late as the
WebDriver call that sent the click returns, and a single read races it.

#### Scenario: A gap click's caret is awaited

- **WHEN** a note `Alpha one.` / gap / `Bravo two.` is open in outline mode with the caret at its
  start, and a spec clicks the gap line and waits for the caret
- **THEN** the caret is at the end of `Alpha one.` once the wait returns, whether the selection
  update landed before or after the click's WebDriver call returned

#### Scenario: A caret that never arrives fails with where it was

- **WHEN** a spec waits, with a limit of 300 ms, for a position the caret never reaches
- **THEN** the wait rejects after that limit, and its message names the position and the last
  caret position read

#### Scenario: A caret already there resolves

- **WHEN** a spec waits, with a limit of 300 ms, for the position the caret is at
- **THEN** the wait resolves
