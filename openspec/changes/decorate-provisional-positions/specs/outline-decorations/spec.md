## ADDED Requirements

### Requirement: A provisional position renders as the node it would become

A PROVISIONAL POSITION (`outline-keyboard-grammar`) is a line the caret rests on that carries
no node content of its own — a blank or whitespace-only line the parse assigns to a node's
trailing gap. While the primary selection is a single empty cursor on such a line, and the
line belongs to a node's gap rather than to the document preamble, that line SHALL be
decorated exactly as the line the document's own parse would produce there if a character
were typed at the caret: the same indentation regime (block padding, atom/list margin), the
same depth or `supplementalDepth`, the same node kind, and the same marker treatment.

The rendering SHALL be derived from the document text and the caret alone. It SHALL NOT
depend on which key produced the position, on any editor state remembering it, or on the
width of the surrounding gap. Enter's provisional position is blank-separated and therefore
renders as a new node; Shift+Enter's is adjacent to the node above and therefore renders as
that node's own continuation line. This is the same distinction
`outline-keyboard-grammar`'s "Provisional positions" requirement already requires the
document alone to carry.

Only the caret's own line SHALL be affected. Every other line SHALL keep the facts of the
document as it actually is, so no neighbouring line's indentation, marker, or guide changes
while a provisional position is open.

Marker rules apply unchanged rather than as a special case: the position renders a marker
only where a real line of the same shape would — a new-node position is a first line and is
marker-eligible, subject to the `markerVisibility` setting; a continuation position is not a
first line and renders no marker; a position whose materialized line would be a list item
renders no synthetic marker at all. Guides on the line SHALL continue to render from the
document's own gap-line guide rule, unchanged.

This is a caret-derived layer, in the sense the pure-list invariant already carves out for
such layers: it renders only where the user currently is, and it SHALL leave every base-layer
contribution untouched. In a pure list a continuation position's `supplementalDepth` is 0, so
it contributes no geometry at all.

The layer SHALL NOT mutate document state: no transaction, no cursor movement, no history
entry. When the caret leaves the position, the decoration SHALL disappear with it, leaving no
residue in the document or in the rendering — the same "without a trace" property
`structural-history-integration`'s undo-on-abandon gives the position itself.

#### Scenario: Enter's position renders at the depth of the node it will become
- **WHEN** the caret sits on the provisional position an end-of-node Enter opened below a
  paragraph nested two levels deep
- **THEN** the caret renders at that paragraph's own content column, not at the document's
  left edge, and the line carries a paragraph marker in the reserved gutter

#### Scenario: Shift+Enter's position renders as the item's continuation line
- **WHEN** the caret sits on the whitespace-only line an end-of-node Shift+Enter opened on a
  list item nested under a heading
- **THEN** the line carries the item's own `supplementalDepth` contribution, so the caret
  renders inside the list block at the item's content column rather than at the list's parent
  column, and no synthetic marker is added

#### Scenario: Typing changes nothing about the line's position
- **WHEN** a character is typed on a provisional position
- **THEN** the line's rendered indentation, marker, and guides are identical to what they were
  the instant before, and the caret does not jump

#### Scenario: A pure list's geometry is unchanged
- **WHEN** the caret sits on a provisional position inside a list with no non-list ancestor
  anywhere
- **THEN** every line's rendered position, including the provisional one's, is identical to
  outline-mode-off, and no synthetic marker is drawn

#### Scenario: Neighbouring lines are unaffected
- **WHEN** a provisional position is open below a node that currently has no children
- **THEN** that node's own marker and indentation are exactly what they were before the
  keypress — nothing renders as though the child already existed

#### Scenario: The preamble is not decorated
- **WHEN** the caret rests on a blank line that belongs to the document preamble, or the
  document contains no node at all
- **THEN** no indentation, marker, or provisional treatment is applied, and the line renders
  exactly as stock Obsidian

#### Scenario: The caret-derived accent follows the position
- **WHEN** the position-indicator layer is enabled and the caret sits on a provisional
  position
- **THEN** the position is treated as the current node — its own marker is accented where a
  marker is drawn, and the accented ancestors are those the materialized node would have, not
  those of whichever node happens to own the gap

#### Scenario: Abandoning leaves no trace
- **WHEN** the caret moves away from a provisional position without typing there
- **THEN** the position is removed by the existing undo-on-abandon rule and the decoration
  disappears with it, leaving the document and its rendering exactly as they were before the
  keypress

#### Scenario: The layer dispatches nothing
- **WHEN** a provisional position is opened, rendered, and abandoned
- **THEN** the only transactions in the document's history are the keypress and its
  abandonment — the decoration layer contributes none, and the undo stack is unchanged by
  rendering

**Covered by**: `tests/decorate.test.ts` (the pure "what would this line become" fact: the
new-node case at depth, the continuation case in a list, the pure-list zero contribution, the
preamble and end-of-document edges, and that a non-blank line is never treated as
provisional); `e2e/specs/50-decorations.e2e.ts` (the rendered caret column on both positions,
measured against the column the same text occupies once typed);
`e2e/specs/52-block-markers-icons.e2e.ts` (the paragraph marker on Enter's position, its
absence on a continuation position, and the `markerVisibility` setting governing it);
`e2e/specs/53-decoration-contracts.e2e.ts` (buffer, cursor, and undo stack unchanged by the
rendering).
