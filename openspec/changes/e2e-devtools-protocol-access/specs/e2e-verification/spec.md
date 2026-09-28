## ADDED Requirements

### Requirement: DevTools-protocol access from a spec

The harness SHALL let a spec reach the DevTools protocol of the page its WebDriver session is
driving, on the desktop run and on the mobile-emulation run, without installing a dependency. A
spec SHALL be able to send a command and read its result, subscribe to an event, and release the
connection when its case ends. The connection SHALL reach the page WebDriver is driving and no
other, and SHALL be resolved each time it is opened, so that a reload of Obsidian never leaves a
spec connected to an endpoint that no longer exists. A command that cannot complete SHALL fail
with an error naming the command, and SHALL NOT wait out the case's budget. The harness's
WebDriver commands SHALL keep working while a connection is open and after it closes.

#### Scenario: An evaluation reads the page WebDriver drives

- **WHEN** a spec evaluates the viewport's width and height over the protocol, and reads the same
  two values through WebDriver
- **THEN** the two readings are equal, on the desktop run and under mobile emulation

#### Scenario: A key sent over the protocol reaches the editor

- **WHEN** a note `- a` / `- b` is open with the caret at the end of the second item, and a spec
  sends the key `x` over the protocol
- **THEN** the buffer WebDriver reads is `- a` / `- bx`

#### Scenario: A screenshot is the size of the viewport

- **WHEN** a spec takes a screenshot over the protocol
- **THEN** the image's width and height are the viewport's times its device pixel ratio, so a
  mobile-emulation run's image is phone-sized

#### Scenario: A subscribed event reaches the spec

- **WHEN** a spec subscribes to console output and a script run through WebDriver logs a message
- **THEN** the subscriber receives that message

#### Scenario: A new connection follows an Obsidian reload

- **WHEN** Obsidian is reloaded through the harness and a spec then opens a connection and
  evaluates the viewport
- **THEN** the evaluation succeeds and reads the same values WebDriver reads

#### Scenario: A command on a released connection fails by name

- **WHEN** a spec sends a command on a connection it has already released
- **THEN** the command is rejected with an error that names it, and the WebDriver session is
  unaffected

#### Scenario: A command that outlasts its limit fails by name

- **WHEN** a spec sends a command that takes longer than the limit it gave that command, and a
  later command is sent on the same connection
- **THEN** the first is rejected with an error that names it, the late reply is ignored, and the
  later command completes
