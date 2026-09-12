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
what this rule governs for that line — its own GUIDES are governed by a rule of their own,
stated below. What happens to every OTHER line is a separate rule, stated below as well.

The rendering SHALL be derived from the document text and the caret alone. It SHALL NOT
depend on which key produced the position, on any editor state remembering it, or on the
width of the surrounding gap. Enter's provisional position is blank-separated and therefore
renders as a new node; Shift+Enter's is adjacent to the node above and therefore renders as
that node's own continuation line. This is the same distinction
`outline-keyboard-grammar`'s "Provisional positions" requirement already requires the
document alone to carry.

**No other line's GEOMETRY changes because a position is open.** That is the invariant, and it
is what the rest of this rule serves. An open position SHALL NOT move any other line, add or
remove any other line's marker, or change any other line's depth. Its one effect beyond its own
row is the guide extension stated below, which moves nothing and adds only continuity: the rows
it covers are the blank rows between the position and the last content line above it, which are
exactly the rows an extended guide would otherwise have a hole in. Which facts satisfy that
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
- A position that BISECTED NOTHING contributes nothing to any other line, and there are two ways
  to be in that case. One is a position that would MATERIALIZE a node: the node it stands for
  does not exist yet, and SHALL NOT be rendered as though it did — including through any fact
  ABOUT another node that its existence would change, such as whether the node it would attach to
  has children. A childless heading with an Enter position below it renders as childless. The
  other is a position at a node's END, which joins that node but leaves none of its lines below
  it; there the two parses agree about every other line anyway, so rendering from either is the
  same rendering, and the rule takes the raw one for one answer rather than two.

An earlier version of this rule said "only the caret's own line is affected" and derived every
other line from the raw parse. That is correct for the second case and false for the first: the
raw parse is itself an artifact of the position, so honouring it renders the bisection. The
invariant is the same one; what changed is which parse satisfies it.

Marker rules apply unchanged rather than as a special case: the position renders a marker
only where a real line of the same shape would — a new-node position is a first line and is
marker-eligible, subject to the `markerVisibility` setting; a continuation position is not a
first line and renders no marker; a position whose materialized line would be a list item
renders no synthetic marker at all. A provisional position SHALL count as CONTENT for the guide
extent (`outline-decorations`' guide requirement). The guides its own row carries SHALL be
exactly those the node it stands for would carry once its content is really there, among the
guides the document already has: each belongs to a strict ancestor of that node which already has
children. Each of those guides SHALL reach the position's own row and SHALL render on each blank
row between it and the last content line above it, so the extension is one unbroken run, and no
row in that run SHALL render a guide the position's own row does not.

What decides the set is therefore the node the position stands for, not the node whose trailing
gap the position's line happens to be. The two differ wherever the position has LEFT a subtree:
the list whose parent is a paragraph, where Enter on the empty last item stands for a sibling of
that paragraph, or the blank line below a paragraph with children, where typing at the
paragraph's column continues the paragraph. A guide belonging to the subtree the position has
left SHALL NOT render on the position's row or on the rows between, although the gap it sits in
is inside that subtree. The document still bounds the set from the other side: a position adds no
depth, so a node that the position would give its first child SHALL NOT render a guide on the
position's account while it is open. A position still inside every subtree whose guide reaches
the last content line above it carries all of those guides, and one that is not past its
subtree's last content line extends nothing, because the guides already reach it. When the caret
leaves, the extension leaves with it and each guide ends at its subtree's last content line
again. Where a bisection has moved another line's guides, those come from the resolved outline
with that line's other facts.

An earlier version of this rule took WHICH guides extend from the document as it actually is,
keeping on the position's row every guide the gap it sits in inherited. That extended the guide
of a subtree the position had left, and the row lost that guide the moment a character was typed
there, contradicting the row-renders-as-it-will-be promise below.

This is a caret-derived layer: it renders only where the user currently is, and it SHALL
contribute no geometry of its own. The position's own row SHALL render at exactly the column
that row renders at once its content is really there, and a line the position displaced SHALL
regain exactly the geometry it had. That holds in a pure list like anywhere else — what a pure
list renders is whatever the one indentation grid renders for it, and this layer adds nothing
on top.

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
`docs/research/decoration-follow-ups.md`.
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

#### Scenario: The guide reaches a position opened past the end of a section
- **WHEN** the caret opens a provisional position on the blank line below the last paragraph of
  a nested section, so the position sits past that section's last content line
- **THEN** every guide that reaches the paragraph reaches the position's own row too, with no
  break on any blank row between them, and the position's marker is not left hanging beside a
  guide that stopped above it

#### Scenario: The extension leaves with the caret
- **WHEN** the caret moves off such a position
- **THEN** each guide ends at its subtree's last content line again, and no blank row below it
  renders a guide

#### Scenario: A position that has left a subtree does not carry its guide
- **WHEN** a list whose parent is a paragraph ends, and Enter on its empty last item leaves a
  position standing for a new paragraph beside that parent
- **THEN** the position's row renders the guides of that paragraph's own ancestors and not the
  paragraph's own guide, exactly the guides the row renders once a character is typed there

#### Scenario: A position still inside the subtree keeps its guide
- **WHEN** the same keys are pressed on a list whose parent is a heading, so the position stands
  for a node inside that heading's section
- **THEN** the heading's guide reaches the position's row

#### Scenario: A position that continues a node does not carry that node's own guide
- **WHEN** the caret sits on the blank line between a paragraph and its first child, at the
  column where typing continues the paragraph
- **THEN** the row renders no guide at the paragraph's own depth, as the paragraph's second line
  will not once typed

#### Scenario: The rows between narrow with the position
- **WHEN** a position that has left a subtree sits below blank rows that follow that subtree's
  last content line
- **THEN** none of those blank rows renders the left subtree's guide, and each renders the same
  guides as the position's own row

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
- **AND** the one exception is the typing's own doing rather than this layer's: where the
  position stands for the first child of a node that had none, that node now has a child, so its
  guide appears on the new line and on the blank rows between the two — the guide the position
  deliberately did not draw while it was open

#### Scenario: A materialized BLOCK line does not move the caret either
- **WHEN** a character is typed on a position whose materialized line is a block line, where
  the whole contribution is `padding-left` and no native list metric is involved
- **THEN** the caret is where it was before the character landed, to the pixel

#### Scenario: A pure list's geometry is unchanged
- **WHEN** the caret sits on a provisional position inside a list with no non-list ancestor
  anywhere
- **THEN** every line renders at exactly the column it renders at with the position closed, the
  position's own row included, and no synthetic marker is drawn

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
unchanged by the rendering); and, for the guide extension, `tests/decorate.test.ts` (a position
past a subtree's last content line, the blank rows between the two, and the same document
without the position as the negative control) plus `e2e/specs/51-guides-gradient.e2e.ts` (the
gradient present on the position's row and absent once the caret leaves); and, for WHICH guides
the extension carries, `tests/decorate.test.ts` (the paragraph-parent shape and its heading-parent
control, the continuation case, the blank rows between, and a differential property over the
generated corpus — the position's row and the blank rows above it carry what they carry once a
character is typed, the only allowed difference being a childless parent's depth, asserted by
mechanism) plus `e2e/specs/51-guides-gradient.e2e.ts` (the paragraph-parent shape driven through
real keys, its row's gradient layer count against the same row once typed).
