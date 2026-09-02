# outline-decorations Specification

## Purpose
Defines outline mode's visual layer: additive-only indentation derived from the parsed
tree, indentation guides that fill only the gaps Obsidian's native list guides don't
cover, and per-kind block markers — all strictly read-only rendering, scoped to
outline-mode notes in Live Preview, and byte-identical to stock Obsidian everywhere else.
Architecture and rationale: the outline-decorations change's design.md (see
`docs/research/07`–`12` for the experiment series it distills).
## Requirements
### Requirement: Decorations are scoped to outline mode
The decoration layer SHALL be registered as CodeMirror extensions via
`registerEditorExtension` and SHALL render indentation, guides, and markers only when the
editor's file has outline mode enabled (resolved through the same mode source the keyboard
grammar uses). Outside outline mode, or in the reading/preview view, the document SHALL
render exactly as stock Obsidian, with no additive indentation, guides, markers, or other
decorations present.

This scoping governs the CodeMirror decoration layer — the extensions that decorate the open
document's own lines. It does NOT govern the per-node decoration FACTS those extensions
consume: the fact derivation is a pure function of a parsed tree, is shared with surfaces
outside the CodeMirror line DOM (see `backlinks-footer`), and SHALL remain independent of which
surface is asking. In particular the fact derivation SHALL NOT consult the editor, the open
file, or the current mode.

The derivation SHALL be faithful to the tree it is given. Facts describing what a node IS —
its kind, whether it is an atom, whether it is a list item, whether it carries a native marker
— are properties of the node and SHALL be identical whether the tree came from the open
document or from elsewhere. Facts describing a node's place in the tree — its depth, its
supplemental depth, and whether it has children — SHALL describe the tree actually passed in.
A node whose children were pruned away therefore reports no children, which is correct: the
surface must draw what it was given, not what the node looked like somewhere else.

#### Scenario: No chrome off-mode
- **WHEN** a note without outline mode enabled is open in the editor
- **THEN** no indentation, guides, or markers are rendered; the DOM matches stock Obsidian
  live preview

#### Scenario: Toggle applies immediately
- **WHEN** outline mode is toggled on for the open note
- **THEN** decorations appear on the next editor render, with no reload required

#### Scenario: Node-identity facts are independent of the surface asking
- **WHEN** decoration facts are derived for a set of nodes as part of the open document, and
  derived again for the same nodes as part of a tree belonging to another note
- **THEN** the two derivations agree on kind, atom classification, list-item classification and
  native-marker status for every one of those nodes

#### Scenario: Position facts describe the tree that was passed in
- **WHEN** facts are derived for a node whose children have been pruned from the tree
- **THEN** the node reports having no children, and its depth is measured within the tree it was
  given rather than inherited from the tree it came from

**Covered by**: `e2e/specs/51-guides-gradient.e2e.ts` ("draws no guides with outline mode
off"), `e2e/specs/52-block-markers-icons.e2e.ts` ("draws no markers with outline mode off").

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

### Requirement: Indentation and markers compose with Obsidian's native base margin
Obsidian's "readable line width" feature applies a native, uniform base margin to every
line, independent of outline mode. The decoration layer's own `margin-left`/`padding-left`
contributions SHALL be added to that native base, never replace it.

#### Scenario: Margin-shifted lines don't invert under a nonzero native base
- **WHEN** the active theme or viewport gives every line a nonzero native base margin (e.g.
  a community theme with a narrower reading column)
- **THEN** a depth-1 list item under a depth-0 heading still renders to the right of the
  heading, not to its left

**Covered by**: `e2e/specs/51-guides-gradient.e2e.ts` ("margin-based lines compose with
Obsidian's own native base margin instead of replacing it (readable-line-width / community
themes)").

### Requirement: Indentation guides render every ancestor level, including list levels
Every line SHALL carry an indentation-guide decoration for each strict ancestor at a shallower
tree depth, whatever that ancestor's kind — a heading, paragraph or atom with descendants, and
a list item with descendants alike. Every line inside an ancestor's subtree renders that
ancestor's guide, on that ancestor's own depth column.

The plugin SHALL own this rendering rather than share it: wherever it draws a guide for a list
level it SHALL suppress Obsidian's own indent guide for that level, so exactly one line renders
per level. Guides SHALL render continuously through blank separator lines between sibling
blocks, not just through node content lines.

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
one unbroken run from its first row to its last, whatever blank lines fall inside it.

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

### Requirement: Guides coexist with native blockquote chrome and table scrolling
The guide mechanism SHALL NOT remove or replace Obsidian's native blockquote left-bar
rendering, and SHALL NOT disable a wide table's own horizontal scroll behavior.

#### Scenario: Blockquote native bar and guide render together
- **WHEN** a blockquote line also carries an active guide
- **THEN** both Obsidian's native colored left bar and the guide line render, neither
  replacing the other

#### Scenario: Wide table keeps its own scrollbar with a guide active
- **WHEN** a table wide enough to need horizontal scroll also carries an active guide
- **THEN** the table's own scrollbar remains functional (not the whole document becoming
  scrollable), and the guide still renders

**Covered by**: `e2e/specs/51-guides-gradient.e2e.ts` ("blockquote: native colored bar
(::before) and our guide (::after) coexist, neither clobbers the other", "wide-table
fixture: guide renders AND the table keeps its own real horizontal scroll (not the whole
document)", "widget-replaced atoms: callout/hr/html/table all get the guide after
overriding Obsidian's native contain:paint", "no !important/specificity fight resurrected:
position and background resolve as set, unbeaten by Obsidian's own CSS").

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

### Requirement: Markers are fixed-size and coexist with native and guide chrome
A marker's size SHALL be a fixed length (never `em`, which would resolve against the
surrounding line's own font-size), identical across every kind and heading level. A marker
SHALL NOT remove, replace, or visibly collide with Obsidian's native blockquote bar, the
CSS containment/specificity rules widget atoms carry, or Obsidian's native fold chevron on a
heading.

#### Scenario: Marker size is font-size-independent
- **WHEN** a marker renders on a heading line and on a paragraph line
- **THEN** its rendered width and height are identical despite the heading's larger font

#### Scenario: Blockquote native bar and marker coexist
- **WHEN** a blockquote line also carries a marker
- **THEN** both Obsidian's native colored bar and the marker render, neither clobbering the
  other

#### Scenario: A depth-0 widget atom's marker is not clipped
- **WHEN** a table with no ancestor (tree depth 0) renders a marker
- **THEN** the marker is fully visible, not clipped by Obsidian's native `contain: paint`
  containment

#### Scenario: Fold chevron stays clear of the marker and any active guide
- **WHEN** a heading has a foldable child, so Obsidian renders its native fold chevron
- **THEN** the chevron does not overlap the heading's own marker or an ancestor's guide
  line passing through the same row

**Covered by**: `e2e/specs/52-block-markers-icons.e2e.ts` ("blockquote: native colored bar
and the marker widget coexist (DOM widget, not a pseudo-element — no clobber by
construction)", "marker size is fixed (rem), NOT font-size-dependent — identical
width/height on a heading vs. a paragraph line", "no !important/specificity or
contain:paint regression: a depth-0 table (no ancestor guide) still shows its marker
unclipped", "code fence and blockquote markers align horizontally with a same-depth
paragraph's (native padding/text-indent compensation)", "heading marker vertical offset
from the line's own center is small and doesn't grow with heading level (H1 vs H3)",
"native fold chevron glyph sits between the marker and an ancestor's guide line, clear of
both").

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

A node's fold chevron, where Obsidian renders one, SHALL be centred on that node's own mark —
horizontally at the same distance from it whatever the node's kind, and vertically on the mark's
own centre. The chevron's placement SHALL follow the mark rather than the line, since the mark
is what the reader relates it to.

The vertical half of that rule does NOT extend to an ordered item, and the exception is stated
rather than left to the implementation. Every other kind's mark is an element whose box can be
measured — a synthetic icon, a bullet, a checkbox — while an ordered item's mark IS its glyphs,
and no box holds them: the marker span's box is the whole text row, whose centre the chevron
already shares, and the digits rest on the baseline about 1.7px below it. Reading ink out of a
text run needs font metrics no rect exposes, so an ordered item's chevron SHALL keep the row's
own centre, about 1.7px off its digits' — a recorded residual, not a target this layer claims to
have hit.

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

#### Scenario: A fold chevron is centred on the mark it belongs to

- **WHEN** foldable nodes of several kinds are visible in one document — headings at more than
  one level, a paragraph, a bullet item, a task item
- **THEN** each chevron's painted glyph and its own node's mark share a vertical centre,
  whatever font size that row is rendered at

#### Scenario: A fold chevron sits where a block's chevron sits

- **WHEN** a list item has children, so Obsidian renders its fold chevron, and a foldable block
  is visible in the same document
- **THEN** the chevron sits the same distance from its own marker as the block's chevron sits
  from its own, clear of that marker and clear of the parent level's guide column

#### Scenario: A checkbox and a bullet in one list share a column

- **WHEN** a list contains both task items and plain items
- **THEN** every marker's visible centre is on the same column, so no item's mark sits nearer
  its own text than its neighbours' do

### Requirement: A list item's caret renders on the item's own text column

Where a caret sits at a list item's content start, it SHALL render on that item's own text
column — the column its first character occupies — and this SHALL hold when the item is
EMPTY, so that the caret does not move when the first character is typed. It SHALL hold for
an unordered item and for an ordered item, at every nesting depth, and independently of the
font the theme uses.

The rule is stated against the item's own text column rather than against a fixed offset,
because that column is what a reader compares the caret to. Where a marker is wider than the
gutter the text column is the marker's own right edge, and the caret follows it there — the
same wide-marker exception this capability already states for the text column itself.

This is a rendering requirement about where the caret is PAINTED, and carries no claim about
which document positions a caret may occupy; `content-space-caret` owns that and is unchanged
by it.

Nothing else this capability positions SHALL move to achieve it, with ONE stated exception. A
marker's own column, an item's text column, the stated hanging indent and the column a
soft-wrapped row lands on SHALL be identical before and after, for every list kind and at
every depth — including a marker followed by MORE than one space, or by a tab, both of which
are ordinary markdown. Where the caret cannot be brought to such an item's text column without
moving that column, the column wins and the caret is left where it was.

The exception: an ordered item whose marker is WIDER than the gutter SHALL begin its text
where its own number ends, rather than one half-marker-icon further right. The number is
shifted onto its column by a transform, which moves ink and not layout, so that item's text
previously began at a point neither the number nor the grid names — the untransformed box's
edge. This SHALL close that gap. An ordered item whose marker fits the gutter is unaffected,
its text column being the gutter either way.

#### Scenario: An empty bullet item's caret is where its first character will be

- **WHEN** an empty `- ` item is the caret's own line, at the top level and again nested two
  levels deep
- **THEN** at each depth the caret renders on that item's own text column, one marker gutter
  right of its depth column, and not against the bullet

#### Scenario: Typing the first character does not move the caret

- **WHEN** a character is typed into an empty list item
- **THEN** the character renders where the caret already was, and the caret advances by that
  character's own width rather than jumping to a new column

#### Scenario: An empty ordered item's caret takes the same column as a bullet's

- **WHEN** an empty `2. ` item and an empty `- ` item sit at the same depth
- **THEN** both carets render on the same column, which is that depth's own text column

#### Scenario: A marker with extra whitespace keeps its own column
- **WHEN** a list contains `- one`, `-  two` and `-\tthree`
- **THEN** the two-space item's text begins on the same column as the one-space item's, and
  the tab-separated item begins where its own tab stop puts it — none of them moved to make
  room for the caret

#### Scenario: An item with content is unchanged

- **WHEN** the caret is at the content start of a list item that has text
- **THEN** it renders on the same column as that text's first character, exactly as it did
  before this requirement existed

#### Scenario: The grid this requirement rides on does not move

- **WHEN** a document containing bullet, ordered and task items at several depths, with
  soft-wrapped and hard-continued items among them, is rendered
- **THEN** every marker's column, every item's text column, every stated hanging indent and
  every wrapped row's column is what it was before this requirement existed — save the one
  stated exception below

#### Scenario: A wide ordered marker's text follows its own number

- **WHEN** a list contains a `9. ` item and a `10. ` item at the same depth
- **THEN** both numbers still begin on the same left edge, the `10. ` item's text still begins
  further right than the `9. ` item's, and it begins where its own number ends rather than a
  half-marker-icon beyond it

### Requirement: Nested per-cell editors receive no decorations
Obsidian renders an actively-edited table cell in Live Preview as its own independent CM6
editor instance mounted inside the outer table widget's DOM. This nested editor's own
"document" (the cell's raw text) SHALL receive no indentation, no guide, and no marker,
even though its outline-mode gate resolves to the same file as the real top-level note.

#### Scenario: Editing a table cell does not decorate the cell's own text
- **WHEN** a table cell in an outline-mode note is actively being edited
- **THEN** the cell's own nested editor renders with no added padding/margin and no marker,
  regardless of what the cell's raw text would otherwise parse as

**Covered by**: `e2e/specs/53-decoration-contracts.e2e.ts` ("a nested per-cell table
editor carries no decoration state at all (isNestedEditor gate)" — opens a cell for
editing and asserts, via computed styles, zero padding/margin/marker on the nested
editor's own line while the outer note's decorations stay active). The requirement was
originally surfaced indirectly by a flaky marker-visibility test traced to this exact
leak — see
[docs/research/10-experiment-5-block-markers.md](../../../docs/research/10-experiment-5-block-markers.md#follow-up-round-4-a-genuine-architectural-bug-found-via-a-flaky-test--decorations-leaking-into-obsidians-own-nested-per-cell-editors).

### Requirement: Decorations never mutate document state
The decoration layer SHALL be a pure rendering projection: it SHALL NOT dispatch any
document-changing transaction, move the cursor/selection, or create undo history entries,
regardless of how often it recomputes.

The same guarantee SHALL extend to every other consumer of the decoration facts, including
surfaces that render trees parsed from notes other than the open one: deriving or rendering
facts for another note's tree SHALL NOT modify that note, SHALL NOT insert its content into the
open document, and SHALL NOT alter the open document's positions, caret, selection, or undo
stack.

#### Scenario: Rendering produces no transaction
- **WHEN** the decoration layer recomputes after a document change
- **THEN** no new transaction is dispatched beyond the one that triggered the recompute,
  and the document text, cursor position, and undo stack are exactly as they were left by
  that triggering change

#### Scenario: Rendering another note's tree is inert
- **WHEN** decoration facts are derived and rendered for a tree parsed from a different note
- **THEN** neither that note nor the open document is modified, and the open document's
  positions, caret, selection, and undo stack are unchanged

**Covered by**: `e2e/specs/53-decoration-contracts.e2e.ts` ("a decoration recompute
mutates nothing: buffer, cursor, and undo stack all unchanged" — after a known real edit,
a double mode toggle leaves buffer and cursor byte-identical, and a single undo reverts
that edit, proving no change-bearing transaction was interposed); `tests/decorate.test.ts`
("produces no facts for an empty document or preamble-only document" — the pure
computation has no side effects to begin with).

### Requirement: Widget-replaced lines receive indentation, markers, and guides via direct DOM patching
Obsidian replaces some lines in Live Preview with opaque elements on which a CM6
`Decoration.line` has no effect. Which lines those are SHALL NOT be assumed to correspond to
any set of node kinds, NOR SHALL they be identified by enumerating the CSS classes those
elements happen to carry: tables, callouts, raw HTML blocks, and horizontal rules are always
widget-replaced, but a line of ANY kind can be — a paragraph consisting of a note embed
(`![[Another note]]`) is one, and an embed can also occupy one line of a multi-line node or
a list item's line. A line-level replacement SHALL be recognized structurally, by standing
in for a whole editor line, so that a widget-rendered kind the layer has never seen is
handled correctly by construction.

Every line that Obsidian replaces with an opaque widget SHALL receive its indentation
contribution, its marker, its ancestors' guides, and its selection chrome via direct DOM
patching (inline styles and an injected marker child element) applied after each render,
computed from THAT LINE's own decoration facts — its depth, kind, first-line status, and
list-item status — exactly as the corresponding plain `.cm-line` would have received them.
The marker SHALL therefore follow the line's node kind: a widget-replaced paragraph line
renders the paragraph marker, a widget-replaced list-item line renders none (its native
bullet/number is untouched), and a widget-replaced continuation line renders none.

Native padding the widget itself contributes SHALL be read live (never hardcoded) and
subtracted so the widget's visible content aligns with same-depth content of other kinds,
clamped so a depth-0 line's contribution never goes negative.

A line MAY be rendered by two elements at once: with the cursor on it, Obsidian can reveal
the raw source as its own `.cm-line` while KEEPING the rendered element. Both SHALL carry
the line's indentation, so the two stay aligned, but the line SHALL render exactly ONE
marker — the declarative one on the source line, with the widget suppressing its own
whenever a declarative marker exists for that line and has a `.cm-line` to render on.

A widget nested INSIDE a rendered `.cm-line` (for example an inline image embed among a
paragraph's text) SHALL NOT be patched: its host line is a real `.cm-line` that already
received its decoration declaratively, and patching the nested element too would shift it a
second time. Only a widget standing in for a whole editor line SHALL be patched. Cleanup —
removing a previously applied patch — SHALL be confined to widgets that genuinely carry no
line-level decoration state, and SHALL NOT be reached merely because a widget-replaced
line's node is not an atom.

#### Scenario: Widget atoms indent like plain atoms
- **WHEN** a table, callout, HTML block, or horizontal rule sits at a non-zero tree depth
- **THEN** its rendered position matches a same-depth code block or callout, not offset by
  its own native internal padding

#### Scenario: A widget-replaced non-atom line is decorated, not skipped
- **WHEN** a paragraph consisting of a note embed sits at a non-zero tree depth and renders
  as an opaque replacement element
- **THEN** it carries the paragraph's own indentation contribution, its paragraph marker,
  and every guide its ancestors own — not a flush-left undecorated block

#### Scenario: A widget-replaced continuation line takes its node's indentation and no marker
- **WHEN** a note embed occupies one line of a multi-line paragraph, so that line is
  widget-replaced while the node's first line is not
- **THEN** it carries the same indentation contribution as the node's first line, and no
  marker of its own

#### Scenario: A list-item line keeps native list rendering whatever it contains
- **WHEN** a list item's line contains a note embed (e.g. `- ![[Another note]]`)
- **THEN** it receives its `supplementalDepth` contribution and no synthetic marker, exactly
  as a list item containing only text does

#### Scenario: A doubly rendered line shows one marker, not two
- **WHEN** the cursor is on a note-embed paragraph line, so Obsidian renders both the raw
  source as a `.cm-line` and the embed block for that same line
- **THEN** exactly one marker renders for the line, and both elements start at the same
  column

#### Scenario: A widget nested inside a rendered line is left alone
- **WHEN** a paragraph line contains an inline embed among other text, so the line renders
  as a real `.cm-line` with a widget element nested inside it
- **THEN** the line's own indentation and marker render once, from the line's declarative
  decoration, and the nested widget receives no patch of its own — no doubled shift

**Covered by**: `e2e/specs/50-decorations.e2e.ts` ("widget-replaced atoms (table, callout,
hr, html) get margin-left too"), `e2e/specs/52-block-markers-icons.e2e.ts`
("widget-replaced atom kinds (table/callout/html/hr) each get exactly one marker child"),
plus `e2e/specs/54-widget-rendered-lines.e2e.ts`, which covers each placement an embed can
occupy (whole-paragraph line, one line of a multi-line node, list-item line, inline among
text) with the cursor parked away from them, and separately covers the cursor-on state for
the whole-paragraph case — where Obsidian renders the source line and the embed block at
once, and only one of the two may carry a marker.

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
extent (`outline-decorations`' guide requirement): every guide that reaches the last content
line above the position SHALL reach the position's own row as well, and SHALL render on each
blank row in between, so the extension is one unbroken run. WHICH guides those are still comes
from the document as it actually is — a position adds no depth to a line and removes none, and a
position that is not past its subtree's last content line extends nothing, because the guides
already reach it. When the caret leaves, the extension leaves with it and each guide ends at its
subtree's last content line again. Where a bisection has moved another line's guides, those come
from the resolved outline with that line's other facts.

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
`docs/research/12-decoration-follow-ups.md`.
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
gradient present on the position's row and absent once the caret leaves).

