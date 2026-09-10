## MODIFIED Requirements

### Requirement: One grid, one unit, from one declaration

The grid SHALL be derived from a single unit value used by every layer that positions
anything: indentation, guides, markers, and any accent drawn on them. A layer SHALL NOT
compute a column from a second source.

That single value SHALL be published as a custom property, declared **once**, at a scope every
surface that draws the outline's chrome inherits from. A surface SHALL NOT declare its own, and
SHALL NOT fall back to a literal when reading it: a fallback is a second copy of the value, and
it is inert exactly until the declaration changes, at which point the layer holding it silently
keeps the old grid while every other layer moves.

Because the value is a property rather than a constant, overriding that one declaration SHALL
retarget the whole grid — every depth's column, every guide, every marker, every hanging
indent, and the native list geometry the plugin drives from the same value — on **every**
surface at once. This is a supported adjustment, not a side effect: a reader who wants a wider
or narrower outline SHALL be able to get one from a stylesheet alone, with no plugin setting
and without either surface knowing.

The unit SHALL additionally be selectable from a plugin setting, as a choice among named steps
rather than as a length the reader types. A setting SHALL NOT be spelled by redeclaring the unit:
it SHALL contribute its choice through a property of its own that the one declaration consumes,
so that the declaration stays single and a stylesheet override continues to win over both the
setting and the default. Where the reader has chosen nothing, the setting SHALL contribute
nothing at all.

The step the default resolves to MAY differ by device class, so that a device with less
horizontal room spends less of it on chrome. That difference SHALL move the DEFAULT only: the
unit itself SHALL still be declared once, at one scope, so that a stylesheet override wins on
every device class alike.

Every step the setting offers SHALL clear the floor the grid requires — a child's mark begins
right of its parent's text — on every device class the plugin runs on, measured rather than
assumed, since the marker gutter that sets that floor is itself derived from marks whose size
varies by platform. A value the setting cannot produce, including one left in stored data by an
older build or written by hand, SHALL fall back to the default rather than reach the grid.

No layer SHALL hold the unit's value in any other form. In particular a component that computes
a position outside CSS SHALL refer to the property rather than to a number equal to it, since
a number cannot follow an override.

The unit SHALL be expressed in a unit of length that does not resolve against the font size of
the line it is used on, so that a level's width is the same under a heading as under a
paragraph.

#### Scenario: A heading, a paragraph and a list item at one depth share a column

- **WHEN** a heading, a paragraph and a list item render at the same tree depth
- **THEN** all three render every level on the same columns, one unit apart

#### Scenario: Overriding the one declaration moves every column on both surfaces

- **WHEN** a stylesheet overrides the unit's custom property at the scope it is declared at
- **THEN** in the editor and in the backlinks footer alike, every depth's column, marker and
  text moves to the overridden step, and each level remains exactly one overridden unit from
  the last

#### Scenario: A stylesheet override wins over the setting

- **WHEN** the reader has chosen a step from the setting and a stylesheet also overrides the
  unit's declaration
- **THEN** every column on both surfaces follows the stylesheet, not the setting

#### Scenario: A chosen step moves every column on both surfaces

- **WHEN** the reader picks a different step from the setting
- **THEN** every depth's column, marker, text, hanging indent and guide moves to that step in
  the editor and in the footer, with the note untouched

#### Scenario: The default step differs by device class

- **WHEN** the setting is left at its default and the same note is rendered on a desktop and on
  a mobile device
- **THEN** the mobile rendering steps by the narrower default and the desktop rendering by the
  wider one, and a stylesheet override at the unit's own declaration still wins on both

#### Scenario: Every offered step clears the grid's floor

- **WHEN** the narrowest step the setting offers is in force, on each device class, on a note
  containing a task list
- **THEN** every child's mark still begins right of its parent's text

#### Scenario: An unknown stored step falls back to the default

- **WHEN** stored settings data names a step the plugin does not offer
- **THEN** the grid renders at the default step for that device class

#### Scenario: A level's width does not change with the line's font size

- **WHEN** a level renders under a heading and the same level renders under a paragraph
- **THEN** both step by the same distance, despite the heading's larger font

#### Scenario: The mark-to-text distance is unchanged by the unit

- **WHEN** the unit is widened
- **THEN** every mark stays on its own depth's column and every row's text begins the same
  distance after it as before, the gutter being derived from the marks it holds rather than
  from the unit

### Requirement: Indentation guides render every ancestor level, including list levels
Every line SHALL carry an indentation-guide decoration for each strict ancestor at a shallower
tree depth, whatever that ancestor's kind — a heading, paragraph or atom with descendants, and
a list item with descendants alike. Every line inside an ancestor's subtree renders that
ancestor's guide, on that ancestor's own depth column.

Which of those guides is DRAWN SHALL be governed by a visibility setting with five states:

- **every level** — the rendering above, and the default;
- **the levels the cursor is inside** — only guides belonging to a strict ancestor of the node
  holding the primary caret; every other guide is not drawn at all;
- **the current node's own guide** — only the guide the caret's own node owns, on the rows that
  guide covers. A node with no children owns none, and nothing is drawn;
- **the levels inside the current node** — that guide and every guide owned by a node inside the
  caret's own node, on the rows they cover; the dual of the state above it;
- **none** — the layer draws no guides.

The three caret-scoped states SHALL partition a row's guides where they meet: on a row inside the
caret's own node, every guide it carries belongs either to the route down to that node or to the
ladder inside it, and the node's own guide is the boundary between them.

A separate setting SHALL additionally drop the OUTERMOST guide while the document has exactly
one root node, on the grounds that a guide every line carries distinguishes nothing. A zoomed
view has one root by construction and SHALL be treated the same. Only that one level SHALL be
dropped, however deep a single chain continues below it.

Visibility SHALL be a matter of what is painted and nothing else: no line's indentation, column,
marker or text SHALL move when a guide stops or starts being drawn, whether because a setting
changed, the caret moved, or an edit made the document's root no longer single.

The plugin SHALL own this rendering rather than share it: in outline mode it SHALL suppress
Obsidian's own indent guide on every list line, whatever this layer itself draws there. A native
guide is positioned by native list nesting, and outline mode does not use those columns — a list
level renders at `depth × unit` like every other kind — so a native guide lands beside this grid
rather than on it, and showing one is showing a ladder that does not match the content. Drawing
no guides of our own is therefore not a reason to show Obsidian's; suppression SHALL NOT vary
with the visibility setting, line by line, or with the caret. Guides SHALL render continuously
through blank separator lines between sibling blocks, not just through node content lines.

A guide SHALL END at the last CONTENT line of the subtree it covers — the last line in that
subtree that belongs to some node's own lines — and SHALL NOT render on the blank separator
lines below that. A guide therefore never descends past the content it belongs to: not into the
gap before a sibling at a shallower level, and not into the blank line a file ends on. Where one
run of blanks closes several nested subtrees at once, every one of those guides ends on the same
row — the last content line above the run — since every row inside the run has the same content
below it. Guides end on DIFFERENT rows only where their subtrees' last content lines differ,
which takes content between them.

Ending a guide SHALL NOT introduce a break above it. A blank line with more of that ancestor's
own subtree still below it SHALL carry the guide exactly as it does today, so a guide is always
one unbroken run from its first row to its last, whatever blank lines fall inside it. A guide the
visibility setting does draw SHALL be the same unbroken run it would be with every level drawn.

Obsidian's own "Show indentation guides" setting SHALL remain the user's to set and SHALL NOT
be changed by the plugin; suppression SHALL be scoped to outline-mode list lines, leaving every
other context — other notes, reading view, the mode turned off — showing whatever that setting
asks for. Nor SHALL any of this layer's own geometry depend on it: that setting also governs
whether Obsidian quantises a list line's leading whitespace at all, and the rendered grid SHALL
be the same either way.

#### Scenario: A list's own nesting renders guides
- **WHEN** a list is nested several levels deep
- **THEN** each level renders a guide on its own depth column, matching the guides a
  heading or paragraph of the same depth would render, and no second line renders beside it

#### Scenario: Non-list ancestor's guide bridges through a list
- **WHEN** a list sits under a heading
- **THEN** every line of the list, including its own nested levels, renders the heading's
  guide as well as the list's own

#### Scenario: A pure list renders its own guides
- **WHEN** a document is a deeply nested list with no non-list ancestor
- **THEN** each of its levels renders this layer's own guide, on the same grid a mixed
  document uses

#### Scenario: Guides span blank lines between siblings
- **WHEN** a blank line separates two sibling blocks, or precedes a node's own first child
- **THEN** the guide renders through that blank line with no visible break

#### Scenario: A guide stops at the last content line of its subtree
- **WHEN** a section's last paragraph is followed by blank lines and then a heading at the
  section's own level, so the blanks are past everything that section contains
- **THEN** that section's guide renders on the paragraph's row and on none of the blank rows
  below it

#### Scenario: A guide does not run off the end of the document
- **WHEN** a note ends with a trailing blank line below the last node of a nested section
- **THEN** no guide renders on that final blank row

#### Scenario: Nested subtrees closing together end on the same row
- **WHEN** a run of blank lines closes two nested subsections at once, and the section
  containing them continues with more content below the run
- **THEN** both subsection guides end on the last content line above the run, and the
  containing section's guide renders on every row of the run — each row of a run carries the
  same guides as every other

#### Scenario: Guides at different depths end on different rows
- **WHEN** a subsection is followed by a later sibling inside the same section, so the section
  holds content the subsection's own subtree does not
- **THEN** the subsection's guide ends at its own last content line while the section's guide
  carries on past it, each ending on its own subtree's last content line

#### Scenario: A blank line inside a subtree keeps its guide
- **WHEN** a blank line separates two siblings that are both inside the same ancestor's subtree
- **THEN** that ancestor's guide renders on the blank row, unchanged — the tail rule removes
  nothing above the last content line

#### Scenario: Multiline continuation carries the same guide as the first line
- **WHEN** a node spans multiple physical lines
- **THEN** every continuation line renders the same active guide depths as the node's first
  line

#### Scenario: The cursor's levels only
- **WHEN** the visibility setting names the cursor's levels and the caret is inside one of two
  sibling sections that each own a guide
- **THEN** the guides of the caret's own strict ancestors render, on the rows they would
  normally cover, and the sibling section's guide renders nowhere

#### Scenario: The cursor's levels follow the caret
- **WHEN** the caret moves into the sibling section
- **THEN** that section's guides render and the previous section's stop, with no line's text,
  marker or indentation moving

#### Scenario: Guides off draws none, and still shows no native guide
- **WHEN** the visibility setting is `none`, with Obsidian's own indentation-guide setting on
- **THEN** no guide renders on any line in the editor, no line's geometry changes, and no native
  indent guide renders on a list line either

#### Scenario: The caret's own node's guide, alone
- **WHEN** the visibility setting names the current node's own guide and the caret is in a node
  with children
- **THEN** that node's own guide renders on the rows its subtree covers, and no other guide
  renders anywhere

#### Scenario: The levels inside the current node
- **WHEN** the visibility setting names the levels inside the current node
- **THEN** the caret's own node's guide and every guide owned within it render on the rows they
  cover, and the guides of its ancestors render nowhere

#### Scenario: A childless node owns no guide to draw
- **WHEN** either of those two states is in force and the caret is in a node with no children
- **THEN** no guide renders on any line

#### Scenario: The outermost guide is dropped under a single root
- **WHEN** the qualifier is enabled and every node in the note descends from one top-level
  heading
- **THEN** no guide renders on the outermost column, every deeper level renders its own, and no
  line's indentation changes

#### Scenario: A second root brings the outermost guide back
- **WHEN** a second top-level node is added to that note
- **THEN** the outermost guide renders again, with no other change to the rendering

#### Scenario: A zoomed view drops the zoom root's own guide
- **WHEN** the qualifier is enabled and a zoom scope is active
- **THEN** the zoom root's own guide is not drawn down the view, and the levels inside it render
  their guides as usual

## ADDED Requirements

### Requirement: Guide appearance is published and settable, and an accent never changes weight

The guide's own thickness and colour SHALL be published as custom properties in the same chrome
vocabulary as the unit, under the same rule: declared once, at a scope every surface inherits,
with no layer holding a second copy of either value in any other form — in particular no
component that builds a stripe outside CSS may spell the width as a number equal to it.

Of the two, only INTENSITY SHALL be settable, as a choice among named steps contributed through a
property the declaration consumes, so that a stylesheet override continues to win over both the
setting and the default. It SHALL be expressed against the theme's own faint-text colour, so that
a guide stays legible in a light and a dark theme alike and the hue remains the stylesheet's to
change. Thickness SHALL remain a declaration only: it answers the same question intensity does —
how much of the page a guide takes — and cannot answer it without thickening a line whose role is
to stay a background relationship.

The caret accent's width SHALL follow the guide's, so that accenting a guide is a change of
colour and not of weight, whatever thickness is in force. The guide overlay's own paint area
SHALL be extended by the widest stripe it can carry, so that the outermost column's guide is
never clipped in half by the box it is painted in, at any thickness.

Both surfaces that draw the outline's chrome SHALL take thickness and intensity from the same
declarations. Changing either SHALL take effect in every open pane and in the backlinks footer,
with no note edited and no line's geometry changed.

#### Scenario: Thickness applies to every guide on both surfaces

- **WHEN** a stylesheet thickens the guide's declaration
- **THEN** every guide in the editor and in the footer renders at that thickness, still centred
  on its own depth column, and no text or marker moves

#### Scenario: An accented guide keeps the guide's weight

- **WHEN** a guide is accented at any thickness
- **THEN** the accent renders at the same width and column as the guide it accents, so the
  column does not visibly thicken as the caret enters the subtree

#### Scenario: The outermost guide is not clipped at any thickness

- **WHEN** the thickest offered guide renders on the outermost column
- **THEN** its full width paints, not the half that falls inside the row's own box

#### Scenario: Intensity is relative to the theme

- **WHEN** the reader picks a stronger intensity and then switches between a light and a dark
  theme
- **THEN** the guides render at that strength against each theme's own faint-text colour, with
  no colour chosen by the plugin

#### Scenario: Appearance reaches every open pane at once

- **WHEN** the same note is open in two panes, one of them holding the backlinks footer, and the
  reader changes the unit or the intensity
- **THEN** both panes and the footer render the new appearance without the note being touched, as
  does a pop-out window holding a third
