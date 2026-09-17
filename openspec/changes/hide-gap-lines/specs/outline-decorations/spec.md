## ADDED Requirements

### Requirement: Blank separator rows are collapsible, and the caret's row never collapses
A setting SHALL govern whether the blank separator lines between nodes — every line the tree
model owns as a node's trailing gap — are drawn as rows at all. It SHALL default to drawing
them, which is the rendering that exists today.

With the setting on, every such row SHALL render at zero height, and the rows above and below it
SHALL become adjacent. The row SHALL remain a line of the document in every other respect: its
element SHALL still be present, in its own place in the editor's line order, covering its own
extent. Collapsing SHALL be a matter of what is painted and nothing else — no line's indentation,
column, marker or text SHALL move, no character SHALL be inserted or removed, and a note SHALL be
byte-identical whichever way the setting is set.

The collapse SHALL apply to a separator row whether or not it carries an indentation guide. A
top-level gap carries none, and is a row like any other.

**A row holding a lone caret SHALL NOT collapse.** Where the selection is a SINGLE EMPTY RANGE on a
blank line, that line is a PROVISIONAL POSITION (`content-space-caret`, `outline-keyboard-grammar`)
and renders as the node it would become; it is therefore not a separator row and SHALL be drawn at
full height with the separation around it collapsed, so the position reads as exactly one row. This
SHALL hold whether the plugin's own dispatch or a programmatic placement put the caret there.

The precondition is the whole guarantee, and is stated rather than implied. A selection that is not
a single empty range does NOT make its line a provisional position, so a blank line under a
NON-EMPTY selection's head, or under one of several ranges, collapses like any other separator. Both
are reachable: an escalated node cover ends on the trailing gap line it owns
(`escalate-include-owned-gap`), so every Shift-extended cover puts a selection head on a collapsed
row, and a programmatic multi-range dispatch is left alone by `content-space-caret`'s own
jurisdiction rule. Neither strands a visible caret — there is no caret drawn at a selection head
that is not a lone cursor — and a cover ending on the last content row is the better rendering. What
is NOT permitted is a lone cursor on a collapsed row.

A guide running through a collapsed row SHALL stay continuous. The existing requirement that guides
render through blank separator lines continues to hold as an EMISSION rule — the guide is still
drawn for that row — and this change qualifies what it means visually: on a collapsed row the guide
paints nothing, and continuity comes from the rows either side being adjacent. No break appears
where a row is removed.

A gap line is where a fold cover, a node cover's selection background and a zoomed view's trailing
hidden range each end, and the backlinks footer anchors at the document end past the last of them;
all four SHALL keep working unchanged with the setting on.

#### Scenario: Separator rows collapse and content rows do not move
- **WHEN** the setting is turned on over a note of headings, paragraphs and list items separated
  by blank lines
- **THEN** every blank separator row renders at zero height while every content row keeps the
  exact chrome and height it had, and the editor's content is shorter by the rows removed

#### Scenario: A top-level gap collapses too
- **WHEN** two top-level nodes are separated by a blank line, which carries no guide because
  neither node has an ancestor
- **THEN** that row collapses like any other, rather than staying open because it had no guide to
  draw

#### Scenario: A lone caret's own row stays visible
- **WHEN** a structural keypress leaves a single empty cursor on a blank line between two nodes
- **THEN** that row renders at full height as the node it would become, and the blank lines
  separating it from the nodes above and below it collapse

#### Scenario: A selection head on a gap line does not keep the row open
- **WHEN** a node cover extends onto the trailing gap line it owns, putting a non-empty selection's
  head on that line
- **THEN** the row collapses like any other separator, and the cover ends on the last content row

#### Scenario: A guide crosses a collapsed row unbroken
- **WHEN** an ancestor's guide runs through a blank separator line that the setting collapses
- **THEN** the guide is one unbroken run: the rows either side of the collapsed one are adjacent,
  so nothing is drawn between them and nothing is missing

#### Scenario: The footer and a fold survive the collapse
- **WHEN** the setting is on in a note that ends with a blank line, with the backlinks footer
  enabled and a node folded
- **THEN** the footer renders and the fold cover is intact, because no line break has been
  replaced
