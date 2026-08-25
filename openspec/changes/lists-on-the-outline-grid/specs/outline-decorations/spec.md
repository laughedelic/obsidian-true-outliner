## ADDED Requirements

### Requirement: One indentation grid for every kind

In outline mode, the distance between one tree level and the next SHALL be the same for every
kind, including list items. A list level SHALL step by the outline unit rather than by
Obsidian's own list-indent value, so that a node's rendered column is a function of its tree
depth alone and never of the kind that encodes it.

This SUPERSEDES the previous guarantee that a pure list renders byte-identical to
outline-mode-off. Byte-identity with stock Obsidian is now stated of outline mode OFF only:
with the mode off, every list — pure or not — SHALL render exactly as stock Obsidian renders
it, with no contribution from any decoration layer.

The grid SHALL be derived from a single unit value used by every layer that positions
anything: indentation, guides, markers, and any accent drawn on them. A layer SHALL NOT
compute a column from a second source.

The grid SHALL hold whatever a list's SOURCE indentation is made of. Obsidian resolves a tab or
exactly four spaces into one indent unit and renders the remainder at its literal width, so a
file indented in twos or threes walks right by a fraction of a level at a time; and with its
own "Show indentation guides" setting off it resolves nothing at all, not even four spaces.
Neither SHALL reach the rendered column: the plugin SHALL state a list line's indentation width
from the item's own depth rather than accept whatever the leading whitespace measured, so a
two-space file, a three-space file and a tab file render the same grid, with that setting on or
off.

What this does NOT change is the parse: which levels exist is Markdown's business and is
already decided by the time this layer runs.

#### Scenario: A list level and a heading level are the same distance

- **WHEN** a document contains a heading three tree levels deep and a list item three tree
  levels deep, in a file indented with tabs
- **THEN** both render at the same column, and each level of the list is one unit from the
  last — the same unit that separates the heading levels

#### Scenario: Ordered lists and task lists take the same grid

- **WHEN** a nested ordered list and a nested task list are open in outline mode
- **THEN** each of their levels steps by the same unit as a bullet list's

#### Scenario: A space-indented file takes the same grid as a tab-indented one

- **WHEN** the same list structure is written with tabs, with two spaces per level, and with
  three spaces per level
- **THEN** all three render every level on the same columns, one unit apart, with each item's
  marker on its own level's column

#### Scenario: The grid does not depend on Obsidian's indentation-guide setting

- **WHEN** a nested list is open in outline mode and Obsidian's own "Show indentation guides"
  setting is turned off
- **THEN** every level renders on exactly the columns it rendered on with the setting on

#### Scenario: Outline mode off is stock

- **WHEN** outline mode is turned off on a note containing a nested list
- **THEN** every list line renders exactly as stock Obsidian renders it — the same columns,
  the same bullet, the same guides — with no decoration contribution of any kind

#### Scenario: A note open without outline mode is unaffected by one that has it

- **WHEN** one note with outline mode on and one without are open at the same time
- **THEN** the note without it renders its lists exactly as stock Obsidian does

### Requirement: Indentation is additive, and every kind takes the same grid
Every node's lines SHALL carry an indentation contribution equal to `depth × unit`,
computed from the node's distance from the document root in the parsed tree — not from raw
markdown indentation or heading level. Which CSS property carries that contribution SHALL be
determined by the line's RENDERED FORM, not by its node's kind: a line rendered as plain
text with no visible box of its own takes it as `padding-left`; a line that renders a
visible box of its own — an atom, or any line Obsidian replaces with an opaque widget —
takes it as `margin-left`, since padding does not move a visible box's own edges.

A LIST ITEM takes its contribution in two parts, which together put it on that same grid:
`supplementalDepth × unit` as `margin-left`, where `supplementalDepth` is the count of
non-list-item ancestors above the nearest list root, plus the item's own depth WITHIN its
list, which Obsidian's own list rendering supplies once the outline unit is the unit it
renders a list level at. The plugin SHALL retarget that native rendering by supplying the
unit, and SHALL state the item's own hanging indent; it SHALL NOT reposition a list item by
overriding native rendering line by line.

Nodes at the same tree depth SHALL receive the same indentation contribution regardless of
whether their depth is encoded via heading level, list indentation, or paragraph adjacency,
AND regardless of whether the line is currently rendered as plain text or as an opaque widget.

#### Scenario: Heading and list depth align
- **WHEN** a `### Heading` two tree-levels deep (nested under an `#` and a `##` ancestor)
  and a twice-indented list item are both visible in the same document
- **THEN** both render the same indentation contribution

#### Scenario: A list shifts as a whole under a non-list ancestor, and steps by the unit within itself
- **WHEN** a list sits under a heading
- **THEN** the list's start position shifts right by the heading's own depth contribution,
  and each of its own nesting levels is one unit from the last — the same unit the heading
  levels use

#### Scenario: Multiline continuation lines match their node's first line
- **WHEN** a paragraph or list item spans multiple physical lines (via a hard line break)
- **THEN** every continuation line carries the same indentation contribution as the node's
  first line

#### Scenario: A widget-rendered line aligns with its same-depth plain siblings
- **WHEN** a line whose node is NOT an atom (e.g. a paragraph consisting of a note embed,
  `![[Another note]]`) is rendered by Obsidian as an opaque replacement element, and a plain
  paragraph sits at the same tree depth in the same document
- **THEN** both start at the same column — the widget-rendered line's indentation
  contribution is its node's, exactly as though it had rendered as plain text

### Requirement: A list item's hanging indent is stated, not measured

A list item's soft-wrapped rows SHALL align with the start of that item's own content. The
plugin SHALL state that alignment from the values it already knows — the item's tree depth,
its list root's depth, the unit, and the marker gutter — rather than relying on a measurement
of the rendered marker.

This is required because a measurement of the marker's own extent reports where its TEXT ends
rather than where the item's content begins, and because a measurement is cached against the
rendering that produced it and does not follow a later change to the grid.

#### Scenario: A wrapped nested item aligns under its own text

- **WHEN** a list item several levels deep is long enough to soft-wrap
- **THEN** its wrapped rows start at the same column as its own first row's text, not at the
  marker column and not at the line start

#### Scenario: Turning outline mode on corrects wrapping immediately

- **WHEN** outline mode is turned on for a note already open, containing a soft-wrapping
  nested list item
- **THEN** that item's wrapped rows align with its content on the same render, with no note
  switch, reload, or edit required

### Requirement: Markers and guides share one column definition

Every layer that positions something at a depth's column — the guide gradient, a marker's own
offset, and any accent drawn on either — SHALL derive that column from ONE definition, so no
two of them can be changed independently.

Every marker that stands for a node SHALL have its visible centre on that column, so the
visible centre of a guide line and the visible centre of the marker on it coincide. That is
every synthetic block marker, an unordered list item's native bullet, and a task item's
checkbox — a checkbox is the same kind of mark as a bullet and takes the column the same way,
whatever its own width. Its width and hit area SHALL NOT be changed to achieve that.

An ordered item's number is positioned by the same rule with one qualification, because its
mark IS its glyphs and their width is the font's and the number's: it SHALL be shifted onto the
column by a fixed amount rather than by half its own width. That amount SHALL be half a block
marker's own width, so an ordered number and a block marker at the same depth begin on the same
left edge — the comparison a reader makes when a numbered list sits above or below a paragraph.
Every number in a list SHALL therefore share one left edge; a number wider than the gutter
leans right into the space its own text already reserves; and none SHALL overlap its own item's
text.

Shifting each number by half its OWN width is explicitly rejected: it centres every number but
reaches so far left that no fold chevron can fit beside it without crossing the parent level's
guide (measured, `100. ` reaches 19px left of its column against a parent guide 24px away).

A marker's VERTICAL placement is NOT unified across kinds, and that is a decision rather than
an omission. Each kind SHALL use the anchor that reads correctly at every font size it can
appear at: a list bullet SHALL take the optical centre of its own text row, and a synthetic
block marker SHALL take the text baseline. A single numeric anchor SHALL NOT be imposed on
both. `vertical-align: middle` resolves against the PARENT's x-height, so on a heading it
drops a block marker below the heading's own glyphs (measured: an H1's icon moved from 8.45px
above its text-rect centre to 2.96px below it) — a 13.6px outline glyph in the text flow and a
6px dot in a flex box do not read as aligned at one offset. Whether the resulting difference on
a body row reads as wrong is recorded as a follow-up, not decided here.

#### Scenario: A bullet sits on its own guide, not beside it

- **WHEN** an unordered list item has children, so a guide descends from it through its subtree
- **THEN** the bullet's visible centre and the guide's visible centre are the same column

#### Scenario: A block marker and a bullet agree on the column

- **WHEN** a paragraph and an unordered list item at the same tree depth are visible in one
  document
- **THEN** their markers render on the same column, and their text starts at the same column
  one marker gutter further right

#### Scenario: A wide ordered marker starts on the column and pushes its own text

- **WHEN** an ordered list contains both single- and double-digit items
- **THEN** every marker starts at its own depth column, and the wider one pushes its own text
  right rather than overlapping it or crossing the column

#### Scenario: An ordered list's numbers share the left edge a block marker starts on

- **WHEN** an ordered list contains single- and multi-digit items, with a paragraph at the same
  depth
- **THEN** every number begins at the same left edge, and that edge is the one the paragraph's
  own marker begins at; and no number overlaps its own item's text

#### Scenario: A list item's continuation line sits under its own text

- **WHEN** a list item spans more than one document line — a bullet, an ordered item and a task
  item each with a continuation
- **THEN** each continuation's text begins on the same column as its own item's text, one
  marker gutter right of the depth column, and its own soft-wrapped rows land there too

#### Scenario: A task item's text starts on the same column as a bullet item's

- **WHEN** a list contains a task item, a plain item and an ordered item at one depth
- **THEN** all three items' text begins on the same column, one marker gutter right of the
  depth column — the space Obsidian leaves between a checkbox and its text SHALL NOT push a
  task item's text further out than its neighbours'

#### Scenario: A fold chevron sits where a block's chevron sits

- **WHEN** a list item has children, so Obsidian renders its fold chevron, and a foldable block
  is visible in the same document
- **THEN** the chevron sits the same distance from its own marker as the block's chevron sits
  from its own, clear of that marker and clear of the parent level's guide column

#### Scenario: A checkbox and a bullet in one list share a column

- **WHEN** a list contains both task items and plain items
- **THEN** every marker's visible centre is on the same column, so no item's mark sits nearer
  its own text than its neighbours' do

## MODIFIED Requirements

### Requirement: Indentation guides render every ancestor level, including list levels
Every line SHALL carry an indentation-guide decoration for each strict ancestor at a shallower
tree depth, whatever that ancestor's kind — a heading, paragraph or atom with descendants, and
a list item with descendants alike. Every line inside an ancestor's subtree renders that
ancestor's guide, on that ancestor's own depth column.

The plugin SHALL own this rendering rather than share it: wherever it draws a guide for a list
level it SHALL suppress Obsidian's own indent guide for that level, so exactly one line renders
per level. Guides SHALL render continuously through blank separator lines between sibling
blocks, not just through node content lines.

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

#### Scenario: Multiline continuation carries the same guide as the first line
- **WHEN** a node spans multiple physical lines
- **THEN** every continuation line renders the same active guide depths as the node's first
  line

### Requirement: Block markers identify node kind, gated by a visibility setting
Every marker-eligible node's true first line SHALL render a synthetic marker distinct per
node kind. List items SHALL NEVER receive a synthetic marker — their native bullet or number
already signals the node, and the plugin styles and positions that native marker rather than
adding one of its own. A marker SHALL appear only on a node's own first line, never on
continuation lines or blank gap lines. Which kinds actually render a marker SHALL be
governed by the `markerVisibility` setting (`'all'`, `'with-children'`, or
`'headings-and-paragraphs'`); the space reserved for a marker SHALL remain constant
regardless of this setting, so toggling it changes only whether the icon is drawn, never
text position. `markerVisibility` SHALL NOT hide a list item's native marker at any value.

A list item's native marker SHALL be given a visual weight comparable to a synthetic marker's,
and SHALL take its colour from the same token the synthetic markers use, so a snippet retunes
both together.

#### Scenario: Every eligible kind gets a distinct marker under 'all'
- **WHEN** `markerVisibility` is `'all'` and a document contains a heading, paragraph, code
  fence, table, callout, quote, HTML block, and horizontal rule
- **THEN** each renders its own kind-specific marker on its first line, and none render on
  any continuation or gap line

#### Scenario: List items are unchanged
- **WHEN** a list item is rendered in outline mode, at any `markerVisibility` setting
- **THEN** `markerVisibility` changes nothing about it: no synthetic marker is ever added,
  and its native bullet or number is never hidden

#### Scenario: A native bullet carries a marker's weight
- **WHEN** a list item and a paragraph are visible in the same document
- **THEN** the bullet reads at a comparable visual weight to the paragraph's marker, and both
  resolve their colour from the same token

#### Scenario: 'with-children' hides leaf markers, including atoms
- **WHEN** `markerVisibility` is `'with-children'`
- **THEN** only nodes with at least one child render a marker; every atom (leaf by
  construction) renders none, regardless of kind

#### Scenario: 'headings-and-paragraphs' keys off kind, not instance state
- **WHEN** `markerVisibility` is `'headings-and-paragraphs'`
- **THEN** every heading and paragraph renders a marker whether or not it currently has
  children, and no atom kind ever renders one

#### Scenario: Hiding a marker never reflows text
- **WHEN** `markerVisibility` changes such that a previously-visible marker is hidden
- **THEN** the line's indentation (padding-left/margin-left) is unchanged; only the marker
  icon's presence changes

#### Scenario: Marker setting changes take effect without a rebuild
- **WHEN** `markerVisibility` is changed while a note is open in outline mode
- **THEN** the next render reflects the new setting, including for widget-replaced atoms
  whose decoration output would otherwise be byte-identical across the change

## REMOVED Requirements

### Requirement: A pure list renders byte-identical to outline-mode-off

**Reason**: This invariant was chosen when the decoration layer deliberately deferred all list
geometry to Obsidian, and it is exactly what prevented lists from joining the outline grid: it
required a list level to keep Obsidian's own indent step, its own guide columns, and its own
untouched bullet, which is the two-layouts-in-one-document problem this change exists to
remove.

**Migration**: Replaced by "One indentation grid for every kind", which keeps the part of the
guarantee that protects users — outline mode OFF renders exactly as stock Obsidian, for pure
lists and every other document — and drops the part that constrained outline mode ON. Nothing
on disk changes either way; this was a rendering guarantee only.

### Requirement: Additive-only indentation, native list rendering untouched

**Reason**: The requirement's own name states the constraint this change reverses — it
required that a list item's native `text-indent`/`padding-left` hang pair never be modified
and that list rendering be left entirely to Obsidian, which is what kept list levels off the
outline grid and their guides on columns no other kind uses.

**Migration**: Replaced by "Indentation is additive, and every kind takes the same grid",
which keeps every scenario and every rule about non-list kinds verbatim and states how a list
item reaches the same grid: the unit is supplied to Obsidian's own list rendering and the
hanging indent is stated rather than measured. Additive-only still describes the non-list
kinds exactly as before.
