# content-space-caret Specification

## Purpose

Defines which document positions the caret may occupy in outline mode, and how it gets
there. Gap lines and list-item marker prefixes are encoding chrome, not content, so they
are not addressable: motion keys skip them, and a placement that would land on one
resolves through OWNERSHIP — a gap belongs to the node above it, a marker to the line it
prefixes — rather than by nearest-position proximity.

Two mechanisms carry this, deliberately kept apart. **Motion** computes its target
directly from the parsed tree, so a keypress moves the caret to a legal position rather
than to an illegal one that is corrected afterwards. **Placement resolution** is the
backstop in the transaction filter, catching cursors from every other source — clicks,
selection collapses, and Obsidian's own unannotated dispatches — so the invariant holds
for gestures this capability never binds. Neither applies outside outline mode, where
caret behavior stays byte-for-byte native.

The scope is caret PLACEMENT, not editing. Where a caret may rest is this capability's
concern; what an edit at that position means belongs to `node-edit-enforcement`, and how
a non-empty selection expands belongs to `node-selection-enforcement`.

## Requirements
### Requirement: Only content positions are caret-addressable in outline mode
In outline mode, within the plugin's jurisdiction, the set of document positions the caret
may occupy SHALL be the union of every node's own content spans, TOGETHER WITH the entire
document preamble. A blank gap line SHALL NOT be an addressable position. A list item's
marker prefix — its leading indentation, marker character, and any whitespace after it, the
span `contentBoundaryCh` identifies as non-content — SHALL NOT be
addressable, on the item's first line or as alignment whitespace on a continuation line. A
heading's `#` prefix and an atom's own lines ARE content and remain fully addressable.

**Jurisdiction.** This property SHALL hold for positions produced by user gestures in
outline mode. Transactions classified `plugin-own` or `composition` SHALL pass through
untouched per `node-selection-enforcement`.

Transactions classified `programmatic` SHALL pass through untouched too, with ONE narrow
exception: an unannotated (`userEvent`-less), change-free transaction whose resulting range
is EMPTY and falls inside a list item's marker prefix SHALL have that cursor clamped to the
line's content start. Gap-line placements from such transactions are NOT corrected, and
non-empty ranges are never touched.

The exception exists because a marker clamp is not new — it predates this capability as
`node-edit-enforcement`'s `clampCursorToContent` and always applied to any cursor from any
source — while gap-line resolution IS new and is deliberately scoped to user gestures. It is
also load-bearing: Obsidian's own checkbox-widget mount dispatches an unannotated selection
change that puts the caret back on the marker, and without this the invariant has a hole
wherever any foreign unannotated cursor move lands.

Outside that exception, a caret placed by a `programmatic` transaction may rest on a
non-addressable position until the next user gesture moves it. The preamble — frontmatter
and any other content before the first node, where `nodeAtLine` resolves to nothing — is
outside the plugin's jurisdiction entirely: motion, placement, and extension there SHALL be
byte-for-byte stock.

The property SHALL be verified over generated documents, not only for the enumerated key
bindings.

#### Scenario: No user gesture reaches a gap line
- **WHEN** any arrow key, Home, End, mouse click, or selection collapse would place the
  caret on a blank gap line
- **THEN** the caret occupies a content position instead

#### Scenario: The preamble stays stock
- **WHEN** the caret is in a note's frontmatter, or on a blank line between the frontmatter
  and the first node, and the user presses any motion key
- **THEN** the caret behaves exactly as it does with the plugin disabled — no position in
  the preamble is made unreachable, and none is redirected

#### Scenario: A programmatic GAP-LINE placement is not corrected
- **WHEN** a transaction with no `userEvent` places the caret on a gap line, for example a
  workspace restore or a search-result jump
- **THEN** the caret lands exactly where the transaction placed it, and the next user motion
  moves it into content space

#### Scenario: A programmatic MARKER placement is clamped
- **WHEN** a transaction with no `userEvent` and no changes places an empty range inside a
  list item's marker prefix — for example Obsidian's own checkbox-widget mount, which
  dispatches the caret back to column 0
- **THEN** that cursor is clamped to the line's content start, the one exception to the
  programmatic pass-through, so no caret can come to rest inside chrome

#### Scenario: A heading's marker stays addressable
- **WHEN** the caret is inside a heading's text and the user presses Home
- **THEN** the caret lands at column 0, before the `#` characters, which are ordinary
  editable text

#### Scenario: An atom's interior lines are addressable
- **WHEN** the caret moves through the body lines of a fenced code block
- **THEN** every line and column of the atom's own content is reachable, as ordinary line
  motion

#### Scenario: Off-mode is untouched
- **WHEN** the same gestures are used in a note without outline mode
- **THEN** every position stock Obsidian allows remains reachable, byte-for-byte

### Requirement: Motion commands compute their target directly
Caret motion in outline mode SHALL be implemented as key handlers in the same
high-precedence, per-keypress outline-mode-gated keymap that carries the structural grammar,
each computing its target position from the parsed tree and dispatching it. Motion SHALL NOT
be implemented by correcting positions after a command has produced them. Outside outline
mode every motion binding SHALL decline the key, so motion is byte-for-byte stock.

#### Scenario: Every bound motion key produces an addressable position
- **WHEN** any motion key bound by this capability is pressed anywhere in an outline-mode
  document
- **THEN** the resulting caret position is addressable per the rule above, with no
  post-hoc correction transaction

#### Scenario: Nested editors are unaffected
- **WHEN** the caret is inside a table cell's own nested editor
- **THEN** motion behaves exactly as stock, and both enforcement layers decline
- **AND** the reason is a DOM-ancestry check, not file resolution: `editorInfoField` resolves a
  nested cell to the same outline-mode host file, so resolving the file is what would ENABLE
  these handlers there. Only the cell's position in the DOM distinguishes it. The keymap tests
  that ancestry directly; the transaction filter, which has no view, reads a state flag
  published by a view plugin that can.

### Requirement: Vertical motion crosses gaps in one press and preserves the goal column
`ArrowUp` and `ArrowDown` SHALL move the caret to the corresponding position in the nearest
node above or below whose content lies in that direction. Where the resulting position is
not addressable, the correction SHALL depend on the reason, and the two cases are distinct:

- When the landing LINE carries no content at all — a blank gap line — motion SHALL CONTINUE
  in the same direction to the next line that does.
- When the landing line carries content but the landing COLUMN is chrome — a list item's
  marker prefix, or a continuation line's alignment whitespace — motion SHALL CLAMP within
  that line to its content column, and SHALL NOT skip the node.

The goal column tracked across consecutive vertical presses SHALL be CodeMirror's own,
carried through the correction rather than recomputed from the corrected position, so a
sequence of presses over nodes of differing lengths stays visually aligned. At the first or
last node, vertical motion toward the document edge SHALL place the caret at that node's
content start or content end respectively, and a further press SHALL do nothing — except
where a preamble lies above the first node, which motion enters as ordinary stock behavior.

#### Scenario: One press crosses a blank line
- **WHEN** the caret sits mid-text in a paragraph followed by a blank line and another
  paragraph, and the user presses ArrowDown
- **THEN** the caret lands in the following paragraph at the same column, not on the blank
  line

#### Scenario: The goal column survives a short node
- **WHEN** the caret is at column 7 of a paragraph, and the user presses ArrowDown twice
  over an intervening two-character node
- **THEN** the caret lands at column 7 of the third node, having clamped to the short node's
  end only while passing through it

#### Scenario: Vertical motion onto a marker line clamps, it does not skip
- **WHEN** the caret moves vertically onto a list item whose marker prefix occupies the
  goal column
- **THEN** the caret lands at that item's content-start column — the item is not passed over

#### Scenario: Downward motion at the last node
- **WHEN** the caret is mid-text in the document's last node and the user presses ArrowDown
- **THEN** the caret lands at that node's content end, and a further press changes nothing

### Requirement: Horizontal motion crosses at content boundaries
`ArrowLeft` at a node's content start SHALL move the caret to the previous node's content
end; `ArrowRight` at a node's content end SHALL move it to the next node's content start.
Neither SHALL place the caret in a marker prefix or on a gap line. At the document's first
node `ArrowLeft`, and at its last node `ArrowRight`, SHALL do nothing, silently and without
a rejection cue — a document boundary needs no explanation, unlike a structural rejection.

#### Scenario: Left escapes a list item backwards
- **WHEN** the caret is at a list item's content start, after the `- ` marker, and the user
  presses ArrowLeft
- **THEN** the caret lands at the previous node's content end, never inside the marker

#### Scenario: Right skips the next item's marker
- **WHEN** the caret is at the end of a list item's text and the user presses ArrowRight
- **THEN** the caret lands at the next item's content start, past its marker

#### Scenario: Left at a paragraph start crosses the gap above
- **WHEN** the caret is at the first character of a paragraph separated from the previous
  node by a blank line, and the user presses ArrowLeft
- **THEN** the caret lands at the previous node's content end, not on the blank line

#### Scenario: Document start is a silent boundary
- **WHEN** the caret is at the content start of the document's first node and the user
  presses ArrowLeft
- **THEN** nothing changes and no rejection cue appears

### Requirement: Home and End move within the caret's own line, in one step
`Home` SHALL move the caret to the content start of the raw line it is already on, and `End` to
that same line's end. A further press SHALL change nothing. Neither key SHALL cross a line
break, and neither SHALL depend on where the text is soft-wrapped: the target is computed from
the parsed line, not from rendered geometry.

For a list item's first line the content start is the content-start column, after the marker;
for a continuation line it is that line's alignment column. `End` needs no such correction —
chrome is always a line PREFIX, never a suffix.

This supersedes two earlier escalating designs (visual row → node, and before that visual row →
raw line → node), both retired after real-vault use; see `docs/research/04` Q26. Escalation made
one keypress mean different things depending on state the user cannot see — where the previous
press left the caret, and where the renderer chose to wrap — which is the class of guessing this
change exists to remove. Reaching a block's own start or end is a separate motion, not a second
meaning for Home.

#### Scenario: Home reaches content start, never the marker
- **WHEN** the caret is mid-text in a list item and the user presses Home twice
- **THEN** the caret rests at the item's content-start column both times, never inside the
  marker prefix

#### Scenario: Home does not cross a hard line break
- **WHEN** the caret is mid-text on the second raw line of a two-line node and the user presses
  Home repeatedly
- **THEN** the first press lands at that line's own content start and every further press
  changes nothing — the caret never moves to the node's first line

#### Scenario: Home ignores soft wrapping
- **WHEN** the caret is on a later visual row of a raw line long enough to soft-wrap, and the
  user presses Home
- **THEN** the caret lands at that raw line's own content start in a single press, not at the
  start of the visual row it was on

#### Scenario: End stays on the caret's own line
- **WHEN** the caret is mid-text on the first raw line of a two-line node and the user presses
  End repeatedly
- **THEN** the first press lands at that line's end and every further press changes nothing

### Requirement: Non-motion placements resolve through gap ownership
A caret position produced by anything other than a motion command — a mouse click, a
selection collapse, a drag release — that falls outside the addressable set SHALL be resolved
to a content position using the parse model's existing ownership: a position on a gap line
resolves to the content end of the node that owns that gap, which is the node above it; a
position in a list item's marker prefix resolves to that line's content-start column. No
pixel-proximity or nearest-position heuristic SHALL be used.

FULL resolution — both the gap half and the marker half — SHALL apply to transactions
classified `selection-only` in an outline-mode editor, the same jurisdiction
`clampCursorToContent` occupied and which this mechanism replaces.

Transactions classified `plugin-own` or `composition` SHALL pass through with their
positions untouched, keeping every plugin-own dispatch byte-exact. Transactions classified
`programmatic` SHALL likewise pass through, EXCEPT that an unannotated, change-free one
carrying an EMPTY range inside a list item's marker prefix SHALL have the MARKER half alone
applied to it — never the gap half. See the jurisdiction note on the addressable-position
requirement above for why the two halves differ here.

This preserves `transaction-classification`'s "Programmatic and remote transactions pass
through untouched" guarantee for everything that carries content or a selection, and
narrows it only for a bare cursor sitting inside chrome.

#### Scenario: Clicking a blank line lands on the node above
- **WHEN** the user clicks on a blank line between two nodes
- **THEN** the caret lands at the content end of the node above it, which owns that gap

#### Scenario: Clicking a marker lands on content
- **WHEN** the user clicks within a list item's marker or its leading indentation
- **THEN** the caret lands at that item's content-start column

#### Scenario: Collapsing a selection lands on content
- **WHEN** a selection covering a node and its trailing gap is collapsed toward its end by a
  native gesture such as Escape or ArrowRight
- **THEN** the caret lands at the covered node's content end rather than on its gap line

#### Scenario: A plugin-own dispatch is not resolved
- **WHEN** a transaction classified `plugin-own` — one of this plugin's own dispatches,
  whatever its purpose — sets a caret position
- **THEN** that position is applied byte-exactly, so plugin dispatches remain predictable
  operands for history, decorations, and any later mechanism built on them

