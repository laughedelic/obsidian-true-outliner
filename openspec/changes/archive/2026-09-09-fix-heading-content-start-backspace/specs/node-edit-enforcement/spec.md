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
(`docs/research/selection-follow-ups`, "Gap-line cursor transparency": *the escape hatch stays the mode
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
the form that survives them. Amendment 2026-09-08,
`fix-heading-content-start-backspace`: the principle was stated over all markers and
applied only to list markers, so Backspace at a heading's content start deleted the
marker's trailing space instead of being read as an intent. Marker KIND is a marker
internal too, and the scenario below now says so.)*

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
- **WHEN** the user presses Backspace at a node's content start, whatever marker
  precedes it — a bullet, an ordered number, an ATX heading's `#` run — and whatever
  its indentation width
- **THEN** the edit is recognized as a merge intent, never as a deletion of the
  marker's trailing space
- **AND** the node's KIND is a marker internal like the rest: a heading and a list item
  at their own content starts are recognized alike, and differ only in the verdict the
  recognized merge then receives

### Requirement: Content-adjacent deletions become merges or vetoes
A deletion expressing "join this node with its content-space neighbor" SHALL be
rewritten to the structural merge of the two nodes when the merge is expressible
under the per-kind algebra, and SHALL be vetoed with the rejection cue when it is
not. The recognized shapes, all cursor-derived and input-agnostic (any gesture
producing the same edit from the same cursor position is enforced identically):

- Backspace with the cursor at a node's first content character — deleting backward
  into chrome (the separator newline, a gap line's newline, or a marker's trailing
  space) — merges that node into its content-space predecessor (the node whose content
  ends nearest above; possibly its parent or a previous sibling's deepest descendant).
  The marker may be of ANY kind the encoding uses: a list bullet or number, or an ATX
  heading's `#` run. A TASK item has TWO such positions, and BOTH SHALL be recognized:
  after its list marker, where Home lands, and after its task marker, where the item's
  own text begins. A position INSIDE a marker SHALL NOT be — inside a task item's
  `[ ]`, or inside a heading's `#` run — those characters are the marker's own, and
  deleting one is ordinary editing that leaves the node's kind for the parse to decide.
- Delete with the cursor at a node's last content character — deleting forward into
  chrome — merges the node's content-space successor into it. When no successor
  exists, the edit passes natively (trailing whitespace editing, nothing structural
  below).
- A node with no content-space predecessor (the document's first node) vetoes its
  Backspace-merge with the cue rather than passing a chrome-corrupting deletion.

An accepted merge SHALL append the absorbed node's content directly to the end of
the surviving node's content (no continuation-line remnant standing in for the old
gap), consume the intervening gap entirely, re-parent the absorbed node's children
per the algebra, and form one undo step. The resulting cursor SHALL land at the
JOIN point — immediately after the surviving node's own original last line of
content, before the absorbed content now appended there — not at the merged node's
start, so that a follow-up keystroke continues naturally from where the user was
editing.

#### Scenario: Cursor lands at the join point, not the merged node's start
- **WHEN** a merge succeeds (any of the scenarios below)
- **THEN** the cursor sits exactly between the surviving node's original last
  character and the first character of the absorbed content — a follow-up
  keystroke inserts there, not at the merged node's first line

#### Scenario: Paragraph joins across a gap in one keystroke
- **WHEN** the cursor is at the first character of a paragraph separated from the
  previous paragraph by a blank line and the user presses Backspace
- **THEN** the two paragraphs merge into one node with the second's text appended
  directly after the first's, the gap gone, as a single structural edit

#### Scenario: List item merges into its parent paragraph
- **WHEN** the cursor is at the content start of the first list item under a
  paragraph (after the `- ` marker) and the user presses Backspace
- **THEN** the item's text is appended to the paragraph's text, the item's children
  re-parent under the merged node, and no marker fragment is left behind

#### Scenario: Structure-corrupting merge is vetoed
- **WHEN** the user presses Backspace at the first character of a heading (a merge
  that would absorb the heading and destroy its section's anchor)
- **THEN** the document is unchanged and the rejection cue is shown
- **AND** this holds at the heading's own content column, immediately after its `#`
  run and the space that follows — not only at the start of its line — so the heading
  keeps its marker, its section keeps its anchor, and its children keep their parent

#### Scenario: A heading with no predecessor vetoes rather than deleting its section
- **WHEN** the cursor sits at the content start of a heading that is the document's
  first node and the user presses Backspace
- **THEN** the document is unchanged and the rejection cue is shown — the keypress is
  never widened into a deletion of the heading, its section, or the document

#### Scenario: Editing a heading's own marker characters stays ordinary
- **WHEN** the cursor sits inside a heading's `#` run — between two `#` characters, or
  immediately after the first of several — and the user presses Backspace
- **THEN** the character is deleted natively, the heading's level changes as the parse
  reads it, and no merge is recognized and no veto is raised

#### Scenario: Backspace where a task item's text begins merges it
- **WHEN** the cursor sits immediately after `- [ ] ` on `- [ ] bar`, below `- [x] foo`, and
  Backspace is pressed
- **THEN** the two items become `- [x] foobar` in one undo step, with the cursor at the join
  point — not a character deletion leaving a broken `- [ ]bar` and two nodes

#### Scenario: Both of a task item's content-start positions behave alike
- **WHEN** Backspace is pressed at either the position after `- ` or the position after
  `- [ ] ` on the same task item
- **THEN** both are recognized as the same merge intent and produce the same result
