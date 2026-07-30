## MODIFIED Requirements

### Requirement: Four structural commands
In outline mode the plugin SHALL provide four commands — indent node, outdent node, move
node up, move node down. Indent and outdent SHALL ship with no default hotkey. Move node
up and move node down SHALL ship with the default hotkey Mod+Shift+ArrowUp and
Mod+Shift+ArrowDown respectively — a deliberate, documented departure from the
"avoid default hotkeys" guideline (a recommendation, not a submission requirement),
taken because the alternative previously shipped was a hardcoded CM6 keymap entry that
claimed the same gesture while being invisible in Settings > Hotkeys and impossible to
rebind or remove. A user-assigned hotkey always overrides the default. Each command
SHALL resolve the target node as the mapping-core node whose line span contains the
cursor line, and apply the corresponding mapping-core operation.

#### Scenario: Indent at cursor
- **WHEN** the cursor is on any line of a node with a previous sibling and the indent
  command runs
- **THEN** the document text changes exactly as the mapping-core `indent` op prescribes
  for that node
