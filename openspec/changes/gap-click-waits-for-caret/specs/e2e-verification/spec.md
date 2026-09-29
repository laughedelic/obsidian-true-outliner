## ADDED Requirements

### Requirement: A caret placed by a real click is read once it has landed

The harness SHALL let a spec wait for the editor's caret to reach a document position, and a wait
that gives up SHALL fail with an error naming the position it waited for and the last position it
read. A spec that asserts the caret after a real pointer click SHALL read it through that wait, not
once and immediately, because under mobile emulation the click's selection update lands as late as
the WebDriver call that sent the click returns.

#### Scenario: A gap click's caret is awaited

- **WHEN** a note `Alpha one.` / gap / `Bravo two.` is open in outline mode with the caret at its
  start, and a spec clicks the gap line under mobile emulation
- **THEN** the caret is at the end of `Alpha one.` once the wait returns, whether the selection
  update landed before or after the click's WebDriver call returned

#### Scenario: A caret that never arrives fails with where it was

- **WHEN** a spec waits for a position the caret never reaches
- **THEN** the wait rejects within the harness's timeout budget, and its message names the
  position and the last caret position read
