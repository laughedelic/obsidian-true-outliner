## ADDED Requirements

### Requirement: Block selection is a derived interaction mode
An outline-mode editor SHALL be in BLOCK-SELECTION MODE exactly when its current selection has at
least one non-empty range and every non-empty range is an exact cover — the same all-or-nothing
test that already drives the block chrome and the native-highlight suppression.

The mode SHALL be DERIVED from the current selection on every evaluation. No flag SHALL
determine whether the editor is in the mode, and no command, gesture, or keystroke SHALL enter or
leave it other than by changing the selection. The mode's observable properties — Live Preview
rendered rather than raw, the content DOM blurred, native character-level highlight suppressed,
block chrome shown — SHALL all follow from it, so they cannot disagree with one another or with
what is selected.

Focus SHALL follow the mode's TRANSITIONS, not its negation: entering the mode SHALL blur the
editor, leaving it SHALL restore focus, and a selection that is merely outside the mode SHALL
NOT cause focus to be asserted. Restoring focus SHALL go through the editor library's own focus
entry point, which re-applies the editor state's selection to the DOM, rather than focusing the
content element directly, which permits the browser's existing DOM selection to be read back
into state.

Both asymmetries exist because a focus change can carry a stale selection in either direction. A
direct DOM focus lets the browser's selection win over a correction the editor has already
resolved — observed as a click on a list marker landing between the marker and its space instead
of at content start. Asserting focus on every non-cover selection reaches the same click path at
all, which is why the restore is scoped to the transition.

A gesture whose selection is a cover BEFORE and AFTER it — keyboard extension from one cover to
the next — SHALL NOT leave and re-enter the mode, and SHALL therefore produce no focus change, no
Live Preview re-render, and no interval in which character-level selection is visible. This is a
requirement about the mode not being exited, not about the transition being fast or unobtrusive.

ENTERING the mode SHALL likewise render no intermediate frame. Any marker the editor library
itself recomputes — an attribute it derives from its own model and rewrites wholesale, such as
the editor element's class list — SHALL be declared through that library's own mechanism for
contributing to it, never written imperatively alongside it. Otherwise the library's rewrite,
triggered by the very focus change entering the mode causes, drops the marker until the next
update restores it.

While the editor is in block-selection mode, NO selection highlight other than the block chrome
SHALL be visible, for any number of ranges. Suppressing the platform's own text-selection
highlight is not sufficient on its own: a selection of several ranges cannot be represented by
the single native selection, so the editor library draws the remaining ranges itself, and those
SHALL be suppressed as well.

#### Scenario: A multi-range block selection shows only block chrome
- **WHEN** three separate cursors are each extended into a cover, so the selection has three
  covered ranges
- **THEN** every range renders block chrome and none renders any additional selection
  background, whether drawn by the platform or by the editor library

#### Scenario: Entering the mode renders no frame without the chrome
- **WHEN** a caret in an outline-mode note is extended into its first cover, which enters
  block-selection mode and blurs the editor
- **THEN** the mode's marker is present continuously from that moment, with no intervening
  update in which it is absent

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

#### Scenario: Clicking in an ordinary document does not disturb caret placement
- **WHEN** the editor is NOT in block-selection mode and the user clicks on a list item's marker
- **THEN** the caret lands where caret placement resolves it — the item's content start — and
  the focus policy does not act at all, since no mode transition occurred

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
