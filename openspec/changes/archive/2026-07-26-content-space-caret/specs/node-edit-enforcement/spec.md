## MODIFIED Requirements

### Requirement: Editing semantics are chrome-transparent
Gap lines and structural markers are encoding chrome: no user-facing editing
semantic SHALL depend on gap width, gap ownership, or marker internals. An edit
expressing a content-level intent SHALL be interpreted in content space — the space
of node contents and the boundaries between them — with the chrome maintained by the
system.

The former exception — an edit made with the cursor placed ON a gap line, operating on
the gap itself, stays native — is REMOVED as an in-mode escape hatch, because
`content-space-caret` makes gap lines unreachable by the caret in outline mode: the
precondition can no longer occur. Deliberate whitespace authoring remains fully
available by toggling outline mode off for the note, which is already how this plugin
offers raw character-level editing. This was the resolution anticipated when the gap
escape hatch was first written (`docs/research/13`, "Gap-line cursor transparency": *the
escape hatch stays the mode toggle, not an in-outline-mode exception*).

Off-mode notes are unaffected in every respect: gap lines are ordinary text there, and
no enforcement applies.

*(Amendment 2026-07-21, real-vault manual pass: the original single-separator merge
rule made every merge require first manually deleting the gap, one newline per
keystroke, with confusing intermediate states — gap ownership leaking into editing
semantics. This requirement pins the general principle; the merge requirement below
is its first application. Amendment 2026-07-25, `content-space-navigation`: the
principle is extended from edits to caret placement, which removes the gap-line
exception's precondition.)*

#### Scenario: Gap width never changes merge behavior
- **WHEN** the user presses Backspace at a node's first content character, with zero,
  one, or three blank lines separating it from the previous node
- **THEN** the outcome is identical in all three cases — the merge (or its veto)
  behaves as if the gap did not exist, and an accepted merge consumes the gap whole

#### Scenario: Editing the gap itself stays native
- **WHEN** the user places the cursor on a blank gap line and presses Backspace or
  Delete to shrink the gap, with outline mode OFF for that note
- **THEN** the edit applies exactly as stock — deliberate whitespace authoring is
  never rewritten
- **AND** in outline mode this precondition cannot occur at all: the caret cannot rest
  on a gap line, so there is no in-mode gap edit left to exempt. Toggling outline mode
  off is the escape hatch for deliberate whitespace authoring, which is how this plugin
  already offers raw character-level editing.

#### Scenario: Marker internals never change editing semantics
- **WHEN** the user presses Backspace at a list item's content start, whatever the
  item's marker character or indentation width
- **THEN** the edit is recognized as a merge intent, never as a deletion of the
  marker's trailing space
