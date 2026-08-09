## MODIFIED Requirements

### Requirement: Only content positions are caret-addressable in outline mode
In outline mode, within the plugin's jurisdiction, the set of document positions the caret
may occupy SHALL be the union of every node's own content spans, TOGETHER WITH the entire
document preamble, TOGETHER WITH any PROVISIONAL POSITION a structural keypress has just
created. A blank gap line SHALL NOT otherwise be an addressable position. A list item's
marker prefix — its leading indentation, marker character, and any whitespace after it, the
span `contentBoundaryCh` identifies as non-content — SHALL NOT be
addressable, on the item's first line or as alignment whitespace on a continuation line. A
heading's `#` prefix and an atom's own lines ARE content and remain fully addressable.

**Provisional positions.** `outline-keyboard-grammar` defines a provisional position: the
blank line an accepted Enter or Shift+Enter leaves the caret on, holding the place where a
node or a continuation line materializes when text is typed. It is a gap line, and the caret
resting there is deliberate. The exception is narrow in exactly the way the rest of this
requirement is: it covers the transaction that CREATES the position, which is `plugin-own`
and already passes through untouched, and it does not make gap lines reachable by anything
else. A later gesture that moves the caret onto that same line resolves it like any other
gap line, and moving the caret away from it — or deleting it — triggers
`structural-history-integration`'s undo-on-abandon rather than leaving a caret behind.

This is stated rather than left implicit because the split operation has parked the caret on
a gap line since it shipped, which the previous wording — "a blank gap line SHALL NOT be an
addressable position" — read as forbidding. The behavior was never wrong; the requirement
was silent about the one case that needs it.

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

#### Scenario: A structural keypress may leave the caret on its own provisional position
- **WHEN** Enter at the end of a paragraph, or Shift+Enter at the end of a list item, places
  the caret on the blank line it just created
- **THEN** the caret rests there and is not resolved into content space, because that
  position is where the user is about to type

#### Scenario: A provisional position is not reachable a second time
- **WHEN** the caret has moved away from a provisional line and an arrow key or click would
  put it back on that same blank line
- **THEN** it resolves like any other gap line — the exception does not persist with the line

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
