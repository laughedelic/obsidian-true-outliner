# e2e-verification Delta

## MODIFIED Requirements

### Requirement: Outline mode e2e verification

The harness SHALL verify outline-mode lifecycle end-to-end: toggling by command id shows a
notice and leaves file bytes and mtime unchanged, from every view mode; the toggle acts on the
active tab only; the global default survives an app restart while a tab's manual state does
not; a fresh install starts with the default on; no per-path mode state is stored; structural
commands are gated per tab; the indicator surfaces state and toggle the active tab's mode and
follow tab switches; and toggling on from reading view enters editing, over an off default and
over a manual off alike.

#### Scenario: Toggle leaves file untouched

- **WHEN** the toggle command runs on an open note and the buffer is saved
- **THEN** a notice appears and the note's on-disk bytes and mtime equal their pre-toggle
  values

#### Scenario: Toggle is offered in reading view

- **WHEN** the toggle command's availability is checked while the active view is in reading
  view
- **THEN** the command reports available, and invoking it enters outlined editing

#### Scenario: Toggle acts on the active tab only

- **WHEN** the toggle runs in one tab while a second tab is open on another note, and a third
  note is opened in a new tab afterwards
- **THEN** the second tab's state is unchanged and the third follows the global default

#### Scenario: Mode persists across restart

- **WHEN** the default is switched off, one tab is manually switched on, and Obsidian is
  restarted preserving state
- **THEN** notes opened afterwards are stock (the setting persisted, no mode marker ever in
  note content), and the manually outlined tab reopens stock

#### Scenario: A tab's manual state resets with its editor state

- **WHEN** a tab is manually switched off outline mode, and then switches to another note and
  back, and separately round-trips through reading view
- **THEN** the note switch leaves it outlined again — the default, with no toggle invoked —
  and the reading round-trip leaves it off, the state the tab was left in

#### Scenario: Fresh install is on by default

- **WHEN** the plugin loads with no stored plugin data and a note is opened
- **THEN** the note is in outline mode without any toggle having been invoked

#### Scenario: Rename and delete leave the store with nothing to follow or prune

- **WHEN** notes are opened, renamed, and deleted with the default on, and the plugin data
  store is read after each
- **THEN** it records the default value and no per-path entries — a rename changes nothing
  about any tab's mode, a deletion prunes nothing because there is nothing to prune; a store
  written by a previous version loses its per-path entries on the next save

#### Scenario: Commands gated to outline notes

- **WHEN** command availability is checked on a stock tab, and again on an outlined tab —
  including the same note open once in each state
- **THEN** the four structural commands report unavailable for the stock tab and available for
  the outlined one

#### Scenario: Indicators state and toggle the active tab's mode

- **WHEN** the status bar item and the ribbon icon are read and activated, on desktop and
  under mobile emulation, with two tabs in different states
- **THEN** each states the active tab's mode before activation, toggles that tab on
  activation, and both restate the mode when the active tab switches; on mobile no status bar
  item exists

#### Scenario: Toggling on from reading view enters editing

- **WHEN** the active pane is in reading view and the toggle is invoked — with the default on,
  separately with it off, and separately from a tab the user had manually switched off
- **THEN** the pane enters the editing mode it was last in (Live Preview when it records
  none) showing the outline decorations in all three cases
