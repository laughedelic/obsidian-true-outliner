## ADDED Requirements

### Requirement: Per-note outline mode toggle
The plugin SHALL provide a command (and editor menu entry) that toggles outline mode for
the active markdown note. The mode SHALL be a pure editor-UI state: toggling it SHALL
never modify the note's content, metadata, or modification time.

#### Scenario: Toggling leaves the file untouched
- **WHEN** outline mode is toggled on and off for a note
- **THEN** the file's bytes and mtime are unchanged at every point

### Requirement: Mode persistence in plugin data
Outline mode state SHALL be remembered per note in the plugin data store (keyed by file
path), surviving app restarts. It SHALL never be written into the note (no frontmatter,
no markers). Renamed files SHALL keep their mode; deleted files SHALL be pruned from the
store.

#### Scenario: Mode survives restart
- **WHEN** outline mode is enabled for a note and Obsidian is restarted
- **THEN** the note reopens with outline mode enabled, and the note's content contains no
  trace of the mode

#### Scenario: Rename migrates state
- **WHEN** a note with outline mode enabled is renamed within Obsidian
- **THEN** the mode remains enabled under the new path

### Requirement: Mode gates structural commands
Structural editing commands SHALL be available only when the active note has outline mode
enabled (command palette `checkCallback` semantics). Notes without outline mode SHALL be
completely unaffected by the plugin's editing behavior.

#### Scenario: Commands inactive outside outline mode
- **WHEN** the command palette is opened for a note without outline mode
- **THEN** the structural commands are not offered for that note
