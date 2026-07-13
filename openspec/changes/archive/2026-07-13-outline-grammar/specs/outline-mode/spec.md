## MODIFIED Requirements

### Requirement: Mode gates structural commands
Structural editing commands SHALL be available only when the active note has outline mode
enabled (command palette `checkCallback` semantics), and the keyboard grammar SHALL
activate only for files with outline mode enabled. Notes without outline mode SHALL be
completely unaffected by the plugin's editing behavior: palette commands absent and every
grammar key binding declining, leaving stock editor behavior byte-for-byte.

#### Scenario: Commands inactive outside outline mode
- **WHEN** the command palette is opened for a note without outline mode
- **THEN** the structural commands are not offered for that note

#### Scenario: Keyboard grammar inactive outside outline mode
- **WHEN** any grammar-bound key (Tab, Shift+Tab, Enter, Shift+Enter, Alt+Arrows) is
  pressed in a note without outline mode
- **THEN** the editor behaves exactly as stock Obsidian
