## MODIFIED Requirements

### Requirement: Editing semantics are chrome-transparent
Gap lines and structural markers are encoding chrome: no user-facing editing
semantic SHALL depend on gap width, gap ownership, or marker internals. An edit
expressing a content-level intent SHALL be interpreted in content space — the space
of node contents and the boundaries between them — with the chrome maintained by the
system.

The former exception — an edit made with the cursor placed ON a gap line, operating on
the gap itself, stays native — is REMOVED as an in-mode escape hatch. Deliberate
whitespace authoring remains fully available by toggling outline mode off for the note,
which is already how this plugin offers raw character-level editing. This was the
resolution anticipated when the gap escape hatch was first written
(`docs/research/13`, "Gap-line cursor transparency": *the escape hatch stays the mode
toggle, not an in-outline-mode exception*).

The caret CAN rest on a gap line, in two ways, and an earlier version of this requirement
asserted that neither could occur — that `content-space-caret` made gap lines unreachable, so
no in-mode gap edit was left to exempt. That was never true of the split operation, and is
emphatically not true now that provisional positions are named:

- A PROVISIONAL POSITION, the blank line an accepted Enter or Shift+Enter leaves the caret on
  (`outline-keyboard-grammar`). Text typed there materializes the node or continuation line
  the position stands for, by the parse alone and with no rewrite — it is a place the user
  was sent to type. A DELETION gesture there is not a gap edit at all: the position stands
  for an empty node, so Backspace or Delete removes the whole place by cancelling the
  keypress that created it (`structural-history-integration`), rather than narrowing the
  surrounding gap by one line. That is the chrome-transparent reading — the user is deleting
  the empty node they can see, not authoring whitespace they cannot.
- A `programmatic` placement that `content-space-caret` deliberately leaves uncorrected: a
  workspace restore, a search-result jump, any unannotated transaction whose caret lands on a
  gap line. No keypress of ours put it there and none is on top of the history, so an edit
  made from it is left NATIVE and unrewritten — the pre-existing behavior, unchanged.

The two are told apart by whether a structural keypress of ours created the position, which
is the same guard the cleanup itself uses, not by anything about the gap.

No editing semantic reads gap WIDTH even so. The distinction between Enter's provisional
position and Shift+Enter's is carried by what SEPARATES the position from its neighbours,
which determines what the text parses as, not by how wide any gap happens to be: the parse
answers "new node" or "continuation line" without anything inspecting a blank-line count.

Off-mode notes are unaffected in every respect: gap lines are ordinary text there, and
no enforcement applies.

*(Amendment 2026-07-21, real-vault manual pass: the original single-separator merge
rule made every merge require first manually deleting the gap, one newline per
keystroke, with confusing intermediate states — gap ownership leaking into editing
semantics. This requirement pins the general principle; the merge requirement below
is its first application. Amendment 2026-07-25, `content-space-caret`: the
principle is extended from edits to caret placement. Amendment 2026-08-07,
`enter-and-shift-enter-grammar`: the claim that a caret can never rest on a gap line is
corrected — provisional positions are exactly that case, and the principle is restated in
the form that survives them.)*

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
- **AND** in outline mode the same gesture stays native when the caret reached that gap line
  through a `programmatic` placement `content-space-caret` leaves uncorrected — a workspace
  restore or a search-result jump — because no keypress of ours is behind it to cancel

#### Scenario: A deletion at a programmatic gap-line caret stays native
- **WHEN** a workspace restore or a search-result jump leaves the caret on a gap line and the
  user presses Backspace there
- **THEN** the gap narrows exactly as stock, nothing is cancelled and nothing is rewritten —
  the cancel path applies only to a position one of our own keypresses created

#### Scenario: Typing on a provisional position needs no verdict
- **WHEN** the user types on the blank line an Enter or a Shift+Enter left the caret on
- **THEN** the text becomes a new node or the node above's continuation line purely from
  how the position is separated from its neighbours — the verdict layer is not involved,
  and no rule inspects a blank-line count

#### Scenario: Marker internals never change editing semantics
- **WHEN** the user presses Backspace at a list item's content start, whatever the
  item's marker character or indentation width
- **THEN** the edit is recognized as a merge intent, never as a deletion of the
  marker's trailing space
