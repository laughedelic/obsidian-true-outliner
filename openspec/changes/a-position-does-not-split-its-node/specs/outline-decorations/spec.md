## MODIFIED Requirements

### Requirement: A provisional position renders as the node it would become

A PROVISIONAL POSITION (`outline-keyboard-grammar`) is a line the caret rests on that carries
no node content of its own — a blank or whitespace-only line the parse assigns to a node's
trailing gap. While the primary selection is a single empty cursor on such a line, and the
line belongs to a node's gap rather than to the document preamble, that line SHALL take its
INDENTATION AND MARKER facts from the line the document's own parse would produce there if a
character were typed at the caret: the same indentation regime (block padding, atom/list
margin), the same depth or `supplementalDepth`, the same node kind, and the same marker
treatment. Those facts, and the position-indicator treatment covered below, are the whole of
what this rule governs for that line — its own GUIDES are not among them, and continue to come
from the document as it actually is. What happens to every OTHER line is a separate rule, stated
below.

The rendering SHALL be derived from the document text and the caret alone. It SHALL NOT
depend on which key produced the position, on any editor state remembering it, or on the
width of the surrounding gap. Enter's provisional position is blank-separated and therefore
renders as a new node; Shift+Enter's is adjacent to the node above and therefore renders as
that node's own continuation line. This is the same distinction
`outline-keyboard-grammar`'s "Provisional positions" requirement already requires the
document alone to carry.

**No line renders differently because a position is open.** That is the invariant, and it is
what the rest of this rule serves. An open position SHALL NOT move any other line, add or
remove any other line's marker, or change any other line's depth. Which facts satisfy that
depends on what the position did to the parse, and there are exactly two cases:

- A position that BISECTS a node — one opened interior to a multi-line node, where the blank
  line falls between lines that were the node's own — makes the raw parse of the buffer wrong,
  and not only about the lines below it. Those re-parse as a separate node, one level deeper and
  marker-eligible where the bisected node is a list item; the lines ABOVE can lose a child the
  lower half takes with them; a line BEYOND the node can be swallowed by the artifact; and a
  guide can appear or vanish on any of them. Every line SHALL render from the outline the
  position stands for (`outline-keyboard-grammar`), in which none of that has happened, so each
  keeps the indentation, marker treatment, depth, and guides it had before the keypress. The
  scope is the whole document deliberately: the differences are the position's own doing, the
  resolved outline is right about all of them at once, and enumerating them was measured wrong
  twice.
- A position that would MATERIALIZE a node contributes nothing to any other line. The node it
  stands for does not exist yet, and SHALL NOT be rendered as though it did — including
  through any fact ABOUT another node that its existence would change, such as whether the
  node it would attach to has children. A childless heading with an Enter position below it
  renders as childless.

An earlier version of this rule said "only the caret's own line is affected" and derived every
other line from the raw parse. That is correct for the second case and false for the first: the
raw parse is itself an artifact of the position, so honouring it renders the bisection. The
invariant is the same one; what changed is which parse satisfies it.

Marker rules apply unchanged rather than as a special case: the position renders a marker
only where a real line of the same shape would — a new-node position is a first line and is
marker-eligible, subject to the `markerVisibility` setting; a continuation position is not a
first line and renders no marker; a position whose materialized line would be a list item
renders no synthetic marker at all. Guides on the POSITION'S OWN line SHALL continue to render
from the document's own gap-line guide rule, unchanged; where a bisection has moved another
line's guides, those come from the resolved outline with that line's other facts.

This is a caret-derived layer, in the sense the pure-list invariant already carves out for
such layers: it renders only where the user currently is, and it SHALL leave every base-layer
contribution untouched. In a pure list a continuation position's `supplementalDepth` is 0, so
it contributes no geometry at all, and a line the position displaced regains exactly the
geometry it had, which in a pure list is none of ours.

The layer SHALL NOT mutate document state: no transaction, no cursor movement, no history
entry. When the caret leaves the position, the decoration SHALL disappear with it, leaving no
residue in the document or in the rendering — the same "without a trace" property
`structural-history-integration`'s undo-on-abandon gives the position itself.

**Bounded to this layer's own contribution.** What is required above is the indentation,
marker, and guide the line renders with. Where the caret sits WITHIN that line is Obsidian's
own text metric, and is not claimed here. On a list continuation position spanning more than
one nesting level, stock Obsidian measures a caret at the end of an indent run by that run's
text rather than by the width of the span containing it, so the caret still shifts as the
first character lands — byte-identical with this plugin disabled, measured and recorded in
[docs/research/12-decoration-follow-ups.md](../../../../../docs/research/12-decoration-follow-ups.md).
Closing it would mean overriding the width of DOM this layer does not own, which is a change
of its own.

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

#### Scenario: A bisected node keeps a child the artifact would have taken
- **WHEN** a provisional position is open interior to a paragraph that a list item attaches to,
  so the raw parse hands that item to the half below the position
- **THEN** the paragraph still renders as a node with children — under a marker-visibility
  setting that hides leaf markers, its marker does not disappear

#### Scenario: A line the artifact swallowed is unaffected
- **WHEN** a bisection turns a list item's tail into a paragraph that absorbs the line after the
  item, so that line stops being a node of its own in the raw parse
- **THEN** that line renders exactly as it did before the keypress, at its own depth and with its
  own marker

#### Scenario: A guide does not blink out on an untouched line
- **WHEN** a bisection changes which node a following list attaches to, so an ancestor's guide
  would stop reaching it
- **THEN** the guide renders on that line exactly as it did before the keypress

#### Scenario: A bisected node's lines below the position do not move
- **WHEN** the caret sits on a position opened at the end of the first line of a two-line list
  item
- **THEN** the item's second line renders exactly as it did before the keypress — the same
  column, the list indentation regime, and no marker — rather than as a paragraph child one
  level deeper with a paragraph marker

#### Scenario: The same holds for a bisected paragraph
- **WHEN** the caret sits on a position opened at the end of the first line of a two-line
  paragraph
- **THEN** the paragraph's second line renders with no marker, as the continuation line it was,
  rather than gaining a first line's marker

#### Scenario: Typing changes nothing this layer contributes
- **WHEN** a character is typed on a provisional position
- **THEN** the line's rendered indentation, marker, and guides are identical to what they were
  the instant before — nothing this layer contributes changes as the line stops being
  provisional
- **AND** no OTHER line's indentation, marker, or guides change either, including the lines of
  a node the position had bisected

#### Scenario: A materialized BLOCK line does not move the caret either
- **WHEN** a character is typed on a position whose materialized line is a block line, where
  the whole contribution is `padding-left` and no native list metric is involved
- **THEN** the caret is where it was before the character landed, to the pixel

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
provisional, and that the probe lands at the CARET's column rather than the line's end; plus
the bisected-node fact: every line of the outline the position stands for, and the childless
node whose `hasChildren` the materialized node must not change, as a negative control);
`e2e/specs/50-decorations.e2e.ts` (Enter's position measured as a caret column against the
column the same text occupies once typed, since its contribution is `padding-left` alone;
Shift+Enter's measured as the line's own box and `margin-left`, which is the whole of what
this layer contributes there — see the bound above for why the caret is not asserted on that
one; and a bisected item's second line measured against its own pre-keypress column);
`e2e/specs/52-block-markers-icons.e2e.ts` (the paragraph marker on Enter's position, its
absence on a continuation position, the `markerVisibility` setting governing it, the
childless-heading neighbour that must not gain one, and the absent marker on a bisected node's
displaced line); `e2e/specs/53-decoration-contracts.e2e.ts` (buffer, cursor, and undo stack
unchanged by the rendering).
