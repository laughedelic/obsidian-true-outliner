## ADDED Requirements

### Requirement: Block selection is a derived interaction mode
An outline-mode editor SHALL be in BLOCK-SELECTION MODE exactly when its current selection has at
least one non-empty range and every non-empty range is an exact cover — the same all-or-nothing
test that already drives the block chrome and the native-highlight suppression.

The mode SHALL be DERIVED from the current selection on every evaluation. No flag SHALL be
stored, and no command, gesture, or keystroke SHALL enter or leave the mode other than by
changing the selection. The mode's observable properties — Live Preview rendered rather than
raw, the content DOM blurred, native character-level highlight suppressed, block chrome shown —
SHALL all follow from it, so they cannot disagree with one another or with what is selected.

A gesture whose selection is a cover BEFORE and AFTER it — keyboard extension from one cover to
the next — SHALL NOT leave and re-enter the mode, and SHALL therefore produce no focus change, no
Live Preview re-render, and no interval in which character-level selection is visible. This is a
requirement about the mode not being exited, not about the transition being fast or unobtrusive.

The blur direction MAY be deferred to a later task; blurring synchronously within the update
that changed the selection races CodeMirror's own DOM-selection synchronization and has been
observed leaving the browser's selection at a stale position, so a deferral is permitted and the
policy constrains only WHICH state focus settles in. The policy SHALL apply only to the editor
that is the host application's own active editor, so two simultaneously blurred panes do not
both act on one keypress.

Keyboard input SHALL remain available in the blurred state. A key press observed while blurred
SHALL first be offered to the editor's own installed keymap; only a key that no command handles
SHALL focus the editor immediately, because such a key is inserted by the browser's own
subsequent input handling against whatever is focused at that time. A key that a command DOES
handle SHALL NOT cause a focus change on its own — the selection it produces decides focus
through the policy above.

#### Scenario: Keyboard extension between two covers stays in the mode
- **WHEN** the selection is a block cover, the editor is therefore blurred, and the user presses
  a selection-extension key that yields another block cover
- **THEN** the editor remains blurred throughout, Live Preview stays in its rendered form, and
  no character-level selection appears beneath the block chrome at any point

#### Scenario: A gesture leaving block selection restores focus
- **WHEN** the selection is a block cover and the user performs a gesture whose result is not a
  cover — collapsing to a caret, or selecting part of one node's content
- **THEN** the editor is focused again, and ordinary text editing works with no extra keypress
  needed to restore focus

#### Scenario: Typing into a block selection still lands
- **WHEN** the selection is a block cover, the editor is blurred, and the user types an ordinary
  character that no command handles
- **THEN** the editor is focused and the character replaces the block selection, exactly as it
  would have with the editor already focused

#### Scenario: A bound command runs without a focus round-trip
- **WHEN** the selection is a block cover, the editor is blurred, and the user presses a key
  bound to a plugin command
- **THEN** the command runs against the block selection and the editor's focus state is decided
  only by the selection the command produced, not by the fact that a key was pressed

#### Scenario: Mouse drag settles into block selection unchanged
- **WHEN** the user drag-selects across node boundaries so the selection escalates to a cover
- **THEN** the editor ends blurred with the block chrome shown, the same as before this
  requirement — the drag path's observable behavior is unchanged
