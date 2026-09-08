# outline-mode Delta

## ADDED Requirements

### Requirement: Per-tab outline state with a global default

Outline mode SHALL be a per-tab state. Every editor SHALL initialize its outline state from one
global setting — "open new tabs in outline mode", defaulting to ON — at the moment its editor
state is constructed, which is when a tab opens and when a tab switches to another note. The
state SHALL be a pure UI state: changing it SHALL never modify any note's content, metadata, or
modification time.

The setting SHALL be exposed in the plugin's settings tab as a toggle. Changing it SHALL affect
editor states constructed afterwards and SHALL NOT retoggle any already-open tab.

A tab's state SHALL NOT outlive the editor state it belongs to: closing the tab, and switching
the tab to another note, SHALL reset it to the setting's value. Switching a tab to reading view
and back SHALL NOT — the pane keeps its editor across a view-mode switch, so it comes back in
the state the user left it in. The state SHALL NOT be persisted anywhere — not per note, not
per tab — and two views showing the same file SHALL be able to hold different states,
independently of each other.

#### Scenario: A fresh install outlines every newly opened note

- **WHEN** the plugin is enabled with no stored settings and notes are opened in new tabs
- **THEN** each opens in outline mode without any toggle having been invoked

#### Scenario: The default survives a restart, a tab's manual state does not

- **WHEN** the setting is off, a tab is manually switched to outline mode, and Obsidian is
  restarted
- **THEN** notes opened afterwards are stock (the setting persisted), and the manually
  outlined tab reopens stock

#### Scenario: Changing the setting leaves open tabs alone

- **WHEN** the setting is turned off while tabs are open, outlined and stock
- **THEN** every open tab keeps its current state, and the next note opened in a new tab is
  stock

#### Scenario: A tab's manual state resets when the tab changes notes

- **WHEN** a tab is manually switched off outline mode, and then the tab switches to another
  note and back
- **THEN** the tab is in outline mode again — the setting's default — without any toggle
  having been invoked

#### Scenario: A tab's manual state survives a reading round-trip

- **WHEN** a tab is manually switched off outline mode, and then switches to reading view and
  back to editing
- **THEN** the tab is still off — a view-mode switch is not a reset

#### Scenario: Two tabs on one file differ

- **WHEN** the same note is open in two tabs and the user switches one of them off outline
  mode
- **THEN** the other tab still shows the outline, and both tabs keep their own states

#### Scenario: Renaming a note changes nothing about the mode

- **WHEN** a note is renamed while outlined in a tab
- **THEN** the tab stays outlined under the new path, and the plugin data store records no
  per-path mode entries

### Requirement: The toggle works from any view mode

The plugin SHALL provide a command (and the existing editor context-menu entry) that toggles
outline mode for the ACTIVE tab. The command SHALL be available wherever a markdown file is
the active view, in every view mode — Live Preview, source editor, and reading view — rather
than only where an editor exists. It SHALL NOT be offered when no markdown file is active.

In an editing mode, toggling SHALL flip the active editor's state and re-render it within the
command's own turn. In reading view, the toggle's ON direction is the reading-view entry
requirement below; its OFF direction SHALL do nothing, because nothing is outlined in reading
view.

Toggling SHALL leave every file's bytes and modification time unchanged.

#### Scenario: The palette offers the toggle in reading view

- **WHEN** the command palette is opened while the active view shows a note in reading view
- **THEN** the toggle command is offered, and invoking it enters outlined editing

#### Scenario: Toggling affects the active tab only

- **WHEN** the toggle switches the active tab off outline mode while other tabs are open on
  other notes
- **THEN** the other tabs' states are unchanged, and a note opened in a new tab afterwards
  follows the default

#### Scenario: Toggling leaves the file untouched

- **WHEN** outline mode is toggled on and off
- **THEN** the file's bytes and mtime are unchanged at every point

### Requirement: The mode's state is visible in the interface

The plugin SHALL show the ACTIVE tab's outline state in the interface at all times, through
the two public indicator surfaces:

- A status bar item (desktop), stating the active tab's state, that toggles that tab when
  activated.
- A ribbon icon (desktop and mobile), whose appearance reflects the active tab's state, that
  toggles that tab when activated.

Both indicators SHALL follow the active tab as it changes: switching tabs, and a tab switching
between notes, update what they state, and at every point what they state SHALL be the active
tab's own current state. The status bar item SHALL NOT be offered on mobile, where no status
bar exists; the ribbon icon SHALL carry the indication there. The transient toggle notice SHALL
remain on every toggle from every surface, as the immediate feedback on platforms or layouts
where neither indicator is visible. No indicator or control SHALL be injected into Obsidian's
own chrome — the view header mode switcher and
the core status-bar edit-mode button are core UI and SHALL be untouched.

#### Scenario: The indicators follow the active tab

- **WHEN** one tab is outlined and a second is stock, and the active tab switches between
  them
- **THEN** the status bar item and ribbon icon state the newly active tab's state each time

#### Scenario: The status bar states the mode and toggles the active tab

- **WHEN** outline mode is on in the active tab and the status bar item is activated on
  desktop
- **THEN** the item's stated state changes to off, that tab turns off, and a toggle notice
  appears

#### Scenario: The ribbon icon reflects the mode and toggles the active tab

- **WHEN** outline mode is off in the active tab and the ribbon icon is activated
- **THEN** the icon's appearance changes to its on-state, that tab turns on, and a toggle
  notice appears

#### Scenario: The indication exists on mobile

- **WHEN** the plugin runs on mobile and the active tab's mode is toggled
- **THEN** the ribbon icon reflects the new state and the toggle notice appears; no status
  bar item is created

#### Scenario: Core chrome is untouched

- **WHEN** outline mode toggles between on and off
- **THEN** the view header mode switcher and the core status-bar edit-mode button render and
  behave exactly as they do without the plugin

### Requirement: Toggling on from reading view enters editing

Reading view renders no outline, so a toggle that only recorded state would show nothing
exactly where it was used. When a toggle turns the mode ON while the active pane is a markdown
view in reading view, that pane SHALL switch to an editing mode showing the outline —
regardless of the global default, since the user asked for the outline explicitly. The editing
mode SHALL be the one the view was last in, or Live Preview when the view records none.

Entering this way SHALL leave the tab outlined once it is editing, whether it was off because
the global default is off or because the user had turned that tab off.

The OFF direction from reading view SHALL leave the pane in reading view, and panes other than
the active one SHALL NOT be switched by either direction.

#### Scenario: Toggling on from reading view shows the outline

- **WHEN** the active pane shows a note in reading view and the toggle is invoked
- **THEN** the pane switches to an editing mode showing the note's outline decorations

#### Scenario: Toggling on from reading view overrides the default

- **WHEN** the global default is off and the toggle is invoked from a pane in reading view
- **THEN** the pane enters editing outlined, not stock

#### Scenario: Toggling on from reading view overrides a manual off

- **WHEN** a tab is manually switched off outline mode, then switched to reading view, and the
  toggle is invoked
- **THEN** the pane enters editing outlined — the explicit request wins over the state the tab
  carried in

#### Scenario: The editing mode is the view's own

- **WHEN** a pane was last in the source editor, then switched to reading view, and the
  toggle turns the mode on from that pane
- **THEN** the pane enters the source editor, not Live Preview

#### Scenario: Toggling off from reading view does nothing

- **WHEN** outline mode is on by default, the active pane shows a note in reading view, and
  the toggle is invoked
- **THEN** the pane remains in reading view and no mode or view change occurs

#### Scenario: Other panes are not switched

- **WHEN** the toggle turns the mode on while a second pane shows a note in reading view
- **THEN** that second pane remains in reading view, and shows the outline when the user
  switches it to editing themselves

## MODIFIED Requirements

### Requirement: Mode gates structural commands

Structural editing commands and the keyboard grammar SHALL be active only in an editor view
whose outline state is on (command palette `checkCallback` semantics for the commands, per-view
gating for the grammar). An editor view whose outline state is off SHALL be completely
unaffected by the plugin's editing behavior: palette commands absent and every grammar key
binding declining, leaving stock editor behavior byte-for-byte.

#### Scenario: Commands inactive outside outline mode

- **WHEN** the command palette is opened for a note whose tab is not in outline mode
- **THEN** the structural commands are not offered

#### Scenario: Keyboard grammar inactive outside outline mode

- **WHEN** any grammar-bound key (Tab, Shift+Tab, Enter, Shift+Enter) is pressed in a note
  whose tab is not in outline mode
- **THEN** the editor behaves exactly as stock Obsidian

## REMOVED Requirements

### Requirement: Per-note outline mode toggle
**Reason**: The toggle is no longer per-note — the mode is a per-tab state with a global
default, and the requirement's name and body both assert the per-note shape ("toggles outline
mode for the active markdown note").

**Migration**: "The toggle works from any view mode" carries the command's guarantees (active
tab only, UI-only, in force within the command's own turn); "Per-tab outline state with a
global default" carries what it means to be on or off.

### Requirement: Mode persistence in plugin data
**Reason**: Its whole subject is the per-path store — "remembered per note in the plugin data
store (keyed by file path)", with rename migration and delete pruning. The per-tab model has
one persisted value (the default) and no per-path entries, so the requirement is replaced
rather than amended.

**Migration**: Persistence of the default — across restarts, and the absence of any per-path
or per-tab state — is stated in "Per-tab outline state with a global default"; the store's
drop of retired per-path data is pinned by `e2e-verification`'s scenarios.
