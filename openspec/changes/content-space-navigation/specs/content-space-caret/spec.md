## ADDED Requirements

### Requirement: Only content positions are caret-addressable in outline mode
In outline mode, the set of document positions the caret may occupy SHALL be the union of
every node's own content spans. A blank gap line SHALL NOT be an addressable position. A
list item's marker prefix — its leading indentation, marker character, and the single space
after it, together the span `contentColumnCh` already identifies as non-content — SHALL NOT
be addressable, on the item's first line or as alignment whitespace on a continuation line.
A heading's `#` prefix and an atom's own lines ARE content and remain fully addressable. This
property SHALL hold regardless of the gesture that produced the position, and SHALL be
verified as a property over generated documents, not only for the enumerated key bindings.

#### Scenario: No gesture reaches a gap line
- **WHEN** any arrow key, Home, End, mouse click, or selection collapse would place the
  caret on a blank gap line
- **THEN** the caret occupies a content position instead

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
- **THEN** motion behaves exactly as stock, since the outline-mode gate resolves against the
  host editor's file only

### Requirement: Vertical motion crosses gaps in one press and preserves the goal column
`ArrowUp` and `ArrowDown` SHALL move the caret to the corresponding position in the nearest
node above or below whose content lies in that direction, passing over any intervening gap
lines without stopping on them. The goal column tracked across consecutive vertical presses
SHALL be CodeMirror's own, carried through the skipped chrome rather than recomputed from an
intermediate position, so a sequence of presses over nodes of differing lengths stays
visually aligned. At the first or last node, vertical motion toward the document edge SHALL
place the caret at that node's content start or content end respectively, and a further press
SHALL do nothing.

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

### Requirement: Home and End escalate from the row to the node
`Home` SHALL move the caret to the current visual row's own content boundary on its first
press and to the node's content start on its second; `End` SHALL do the same toward the row's
end and then the node's content end. For a list item's first line the row's content boundary
is the content-start column; for a continuation line it is that line's alignment column.
Where the two rungs denote the same position — a single-line node not subject to wrapping —
they SHALL collapse into one step, so a further press changes nothing.

#### Scenario: Home reaches content start, never the marker
- **WHEN** the caret is mid-text in a single-line list item and the user presses Home twice
- **THEN** the caret rests at the item's content-start column both times, never inside the
  marker prefix

#### Scenario: Home escalates in a multiline node
- **WHEN** the caret is mid-text on the second line of a two-line list item and the user
  presses Home twice
- **THEN** the first press lands at that continuation line's alignment column and the second
  at the item's own content start on its first line

#### Scenario: End escalates in a multiline node
- **WHEN** the caret is mid-text on the first line of a two-line paragraph and the user
  presses End twice
- **THEN** the first press lands at that line's end and the second at the node's content end
  on its last line

### Requirement: Non-motion placements resolve through gap ownership
A caret position produced by anything other than a motion command — a mouse click, a
selection collapse, a drag release — that falls outside the addressable set SHALL be resolved
to a content position using the parse model's existing ownership: a position on a gap line
resolves to the content end of the node that owns that gap, which is the node above it; a
position in a list item's marker prefix resolves to that line's content-start column. No
pixel-proximity or nearest-position heuristic SHALL be used.

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
