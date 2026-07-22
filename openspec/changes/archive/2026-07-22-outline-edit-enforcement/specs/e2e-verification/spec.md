# e2e-verification Delta

*(Added by amendment 2026-07-21, real-vault manual pass — keeps the harness
requirement's split-scenario text consistent with the modified split semantics.)*

## MODIFIED Requirements

### Requirement: Keyboard grammar e2e verification

The harness SHALL verify the outline keyboard grammar with real key events:
Tab/Shift+Tab indent/outdent at the cursor node, Alt+Up/Down move nodes,
Enter splits per node kind, Shift+Enter continues an item as one node, atom
interiors behave stock, keys behave stock when mode is off, and a mode
toggle takes effect on the very next keypress. Each accepted grammar
operation MUST be one undo step; each rejected one MUST change nothing but
show its cue.

#### Scenario: Off-mode keys are stock

- **WHEN** Tab, Enter, Shift+Enter, and Alt+arrows are pressed in a list in
  a non-outline note
- **THEN** the buffer changes match stock Obsidian behavior (no grammar
  transforms, no notices)

#### Scenario: Toggle applies to the next keypress

- **WHEN** outline mode is toggled while the note is open and a grammar key
  is pressed immediately after
- **THEN** the keypress follows the new mode

#### Scenario: Tab family and moves

- **WHEN** Tab / Shift+Tab / Alt+Up / Alt+Down are pressed at a node
- **THEN** the node indents/outdents/moves per the grammar, the cursor lands
  at content start (for indents), and ordered runs renumber

#### Scenario: Enter split semantics per kind

- **WHEN** Enter is pressed mid-item (childless), mid-item (with children), at
  item end, at paragraph end, and on a heading
- **THEN** respectively: the childless item splits into siblings; the parent
  item's remainder becomes its new first child above the existing children; an
  empty `- ` sibling appears with the cursor after the marker; a blank line plus
  cursor appears and typed text becomes the sibling; an empty line appears
  below the heading and typed text becomes a child paragraph

#### Scenario: Shift+Enter keeps one node

- **WHEN** Shift+Enter is pressed inside an item and a structural op then
  targets that item
- **THEN** an aligned continuation line is inserted and the op treats the
  item plus continuation as a single node

#### Scenario: Atom interiors are stock

- **WHEN** Enter, Shift+Enter, and Tab are pressed inside a code fence in an
  outline note
- **THEN** stock editing behavior applies, while the same keys on the
  fence's first line perform whole-fence operations
