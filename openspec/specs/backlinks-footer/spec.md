# backlinks-footer Specification

## Purpose
Defines the in-document backlinks surface: a read-only section below a note's own content that
shows every reference to it in the tree of the note it came from — the lineage that leads to
the referencing node, the node itself, and what hangs off it. It is the outward-facing use of
the plugin's block tree, and it is strictly a rendering: it never changes the note it sits under
or the notes it displays.

## Requirements

### Requirement: The footer is scoped to outline mode and to the editing view

The footer SHALL render only when the open file has outline mode enabled, resolved through the
same mode source the rest of the plugin uses, and only in the editing view. In the
reading/preview view, or with outline mode off, the document SHALL render exactly as it does
without this feature.

#### Scenario: No footer off-mode

- **WHEN** a note without outline mode enabled is open
- **THEN** no backlinks footer renders and the document ends exactly as stock Obsidian renders it

#### Scenario: Toggle applies without reload

- **WHEN** outline mode is toggled on for the open note
- **THEN** the footer appears without reopening the file

**Covered by**: `e2e/specs/75-footer-behaviour.e2e.ts` ("renders in outline mode, and not
off-mode or in reading view", "leaves a note with no outline mode alone entirely") and
`e2e/specs/70-footer-enforcement.e2e.ts` ("mounts exactly one widget in outline mode, and none
off-mode"). The reading-view half needed the question restating: Obsidian keeps the source
view's DOM alive but hidden, so what is asserted is that the reading renderer produces none of
its own and that nothing of it is on screen.

### Requirement: The footer is read-only and never mutates the document

The footer SHALL be a pure rendering projection. It SHALL NOT dispatch any document-changing
transaction against the note it sits under, SHALL NOT write to any note it displays, SHALL NOT
create undo history entries, and SHALL NOT alter the note's on-disk bytes, however often it
recomputes or however the user interacts with it.

The note's own content SHALL occupy the same document positions with the footer present as
without it, so that a caret position, a selection, or a structural operation behaves identically
either way.

Filtering, searching, sorting, changing a cap, requesting further results, and toggling the
suppression of Obsidian's own in-document backlinks SHALL all preserve these guarantees: they
change what the footer renders and nothing else.

#### Scenario: Rendering mutates nothing

- **WHEN** a note with many references is opened, scrolled, and closed in outline mode
- **THEN** the file's bytes are unchanged and the undo stack contains no entry attributable to
  the footer

#### Scenario: Document positions are unaffected

- **WHEN** the same note is opened with the footer present and with the feature disabled
- **THEN** every document position, the end-of-document position, and the result of selecting
  the whole document are identical in both cases

#### Scenario: Interacting with the footer leaves the note alone

- **WHEN** the user expands, collapses, and clicks within the footer
- **THEN** the note's text and undo stack are unchanged

#### Scenario: Filtering and sorting are inert

- **WHEN** the reader applies filters, types a search term, changes the sort order, and requests
  further results
- **THEN** the note's text, positions, caret, selection and undo stack are unchanged throughout

**Covered by**: `e2e/specs/70-footer-enforcement.e2e.ts` ("leaves the document byte-identical
after mounting and unmounting", "does not change caret placement, selection escalation, or
structural ops", "does not move the caret when the footer is clicked", "changes nothing in the
document under filtering, search, sort, caps or load more") and
`e2e/specs/75-footer-behaviour.e2e.ts` ("leaves the note's bytes and undo stack untouched while
being read" — the undo half asserted after a real edit, so there is something on the stack to
lose).

### Requirement: The footer is chrome after the content, not a rendering of the line it follows

The footer SHALL be rendered AFTER the line it is anchored to, without splitting it. A block widget
that sorts INSIDE its line leaves the line's empty remainder rendered below the widget, and that
remainder is a real line: it takes the caret, so the space under the footer became a place a click
could put the cursor on a position past the content the footer sits after.

The footer SHALL NOT take the chrome of the line it is anchored to. It is mounted after the content
rather than being a rendering of that line, so an ancestor guide belonging to that line SHALL NOT be
drawn through the footer, and the footer's own left edge SHALL NOT follow that line's depth.

#### Scenario: Nothing is rendered below the footer

- **WHEN** a note with the footer enabled is open
- **THEN** the footer is the last thing in the content, with no line after it

#### Scenario: The footer takes no guide from its neighbour

- **WHEN** the last line above the footer is a nested list item, so it carries an ancestor guide
- **THEN** no guide is drawn through the footer

**Covered by**: `e2e/specs/73-footer-render.e2e.ts` ("is the last thing in the content, with no
line of its own below it", "takes no chrome from the line it is anchored to").

### Requirement: The footer carries a single header control row

The footer's header SHALL present, on one row: the reference and note totals, an affordance
revealing the filter controls, and the sort selector. The filter controls SHALL occupy a second
row that appears only when revealed.

Controls whose behaviour is fixed by design rather than chosen by the reader — how lineage is
collapsed, and how deeply descendants are shown — SHALL NOT be presented as controls.

#### Scenario: One row until filtering is asked for

- **WHEN** the footer renders with the filter controls hidden
- **THEN** the header occupies a single row carrying the totals, the filter affordance and the
  sort selector

#### Scenario: Revealing filters adds a row

- **WHEN** the filter affordance is activated
- **THEN** a second row appears carrying the filter controls, and the header row is otherwise
  unchanged

**Covered by**: `e2e/specs/77-footer-controls.e2e.ts` ("keeps the header to one row until the
filter affordance is used", "reveals a row carrying the search field and one facet per axis").

### Requirement: References are grouped by source note

The footer SHALL group references by the note they come from, one group per source note, each
labelled with that note's name, its containing folder, and the number of references it
contributes. A group SHALL be collapsible, and collapsing it SHALL hide its references while
leaving its label and count visible.

The footer SHALL state the total number of references and the number of contributing notes.
Those totals SHALL describe the complete result set for the note under the currently active
filters, whether or not every reference in that set is rendered — the presentation of an
incomplete body is governed by `backlink-filtering`.

Group order SHALL follow the reader's selected sort order, and which groups appear SHALL follow
the active filters, both as defined by `backlink-filtering`. References within a group SHALL
appear in their source note's document order regardless of either.

#### Scenario: One group per source note

- **WHEN** a target is referenced twice from one note and once from another
- **THEN** two groups render, the first reporting two references and the second one

#### Scenario: A group collapses

- **WHEN** a group is collapsed
- **THEN** its references are hidden and its name and count remain visible

#### Scenario: Reported totals survive truncation

- **WHEN** the rendered body is bounded by a cap
- **THEN** the stated reference and note totals still describe the whole filtered result set

**Covered by**: `e2e/specs/73-footer-render.e2e.ts` ("renders groups and rows for a referenced
note"), `e2e/specs/72-backlink-index.e2e.ts` ("reports totals that match the per-source
counts"), `e2e/specs/75-footer-behaviour.e2e.ts` ("drops a source’s group when that source
stops referencing"), `e2e/specs/77-footer-controls.e2e.ts` ("opens the sort control and
reorders by it") and `e2e/specs/78-footer-caps.e2e.ts` ("reports the true totals whatever the
cap admits").

### Requirement: A reference renders in its lineage, with the outline's own notation

Within a group, each reference SHALL render as the referencing node preceded by the lineage
that leads to it, where lineage is the collapsed ancestor chain defined by `tree-projection`.
Two references sharing ancestors SHALL share the lineage that leads to their common branch
point rather than each repeating it.

Node kind notation — the marker drawn beside a node — SHALL be identical between a lineage
element and a referencing node: same glyph for the same kind, same size, same colour. Emphasis
SHALL be carried by text treatment alone, with lineage rendered dimmer than the referencing node
it leads to.

Every element of a collapsed chain SHALL carry its own kind's marker: the first element's is the
row's own marker, and each subsequent element's is drawn immediately before that element's text.
No mark SHALL be drawn between two elements — they are separated by space alone.

#### Scenario: Shared ancestors are not repeated

- **WHEN** two references in one note sit under the same heading
- **THEN** that heading renders once, with both references below it

#### Scenario: An unbranching chain renders as one lineage line

- **WHEN** a reference sits four levels deep with no other reference in that note
- **THEN** its four ancestors render as a single lineage line rather than four rows

#### Scenario: Markers do not encode emphasis

- **WHEN** a lineage element and a referencing node are of the same kind
- **THEN** their markers are drawn identically, and only the text differs in colour

#### Scenario: Every ancestor on a collapsed line is named

- **WHEN** a lineage row carries three ancestors of two different kinds
- **THEN** each is preceded by its own kind's marker — the first in the row's marker position,
  the other two inline — and no separator glyph is drawn between them

**Covered by**: `e2e/specs/75-footer-behaviour.e2e.ts` ("collapses an unbranching chain to one
lineage row above its reference", "renders a shared ancestor once, with both references below
it") and `e2e/specs/74-footer-chrome-pass.e2e.ts` ("names every ancestor on a lineage row, the
first in the gutter", "draws every footer mark at one size, on its column", "says a row’s kind
once, in its marker", "draws every row through the editor’s own class-and-property contract").

### Requirement: A row renders node text, not a node document

A row's content SHALL be inline content only: links, emphasis, code spans, tags and math — what
lives inside a line. A row SHALL NOT contain block-level elements. A node's block syntax SHALL be
removed before its content is rendered, so no heading, list, blockquote, table, callout or code
block is produced.

This rule SHALL govern EVERY row that quotes node text, a lineage row's segments included. A
lineage segment and a node row naming the same node SHALL produce the same elements for the same
syntax; neither SHALL show markdown source where the other renders it. How those elements are
DRAWN may differ between the two, and does — see the lineage treatment below.

Embedded media SHALL NOT set a reference row's height. A row is a line in an index of mentions,
and an image rendered at its natural size is the reproduction this requirement exists to
prevent.

Kind SHALL be expressed once, by the row's marker. A row SHALL NOT additionally carry the
typography of its kind: no heading sizes, no callout box, no quote bar, no table frame.

Two properties SHALL move from content into the marker, because they are state rather than
presentation: a task's checkbox SHALL replace its bullet, and an ordered item's number SHALL
replace its bullet, both drawn on the same column every other marker uses.

A multi-line node SHALL render according to whether its lines are continuations or records.
Paragraph, heading, quote and callout lines SHALL join into one flowing row. Code and table lines
SHALL NOT join: a code row SHALL show the line the reference sits on, and a table row SHALL show
only the cell the reference sits in.

#### Scenario: No block elements reach a row

- **WHEN** a source note references the target from a heading, a quote, a callout, a table and a
  fenced code block
- **THEN** no row in the footer contains a heading, blockquote, list, table or code-block element

#### Scenario: A lineage row and its reference row produce the same elements

- **WHEN** a reference's ancestors carry emphasis, a code span, an external link and a wikilink,
  and the referencing node carries the same
- **THEN** the lineage row and the reference row beneath it produce the same elements for that
  syntax, and neither shows its source characters

#### Scenario: An embedded image does not set a row's height

- **WHEN** a row's node contains an image embed
- **THEN** the row's height is that of a line of text, not that of the image

#### Scenario: Kind is said once

- **WHEN** a reference sits in a level-one heading
- **THEN** the row carries the heading marker, and its text is rendered at the same size as a
  paragraph row's

#### Scenario: A task's checkbox is its marker

- **WHEN** a reference sits in a checked task item
- **THEN** the row's marker is a checked checkbox, drawn where a bullet would be, and no checkbox
  appears inside the row's text

#### Scenario: An ordered item's number is its marker

- **WHEN** a reference sits in the tenth item of an ordered list
- **THEN** the row's marker is `10.`, aligned on the same column a bullet would occupy, and the
  row's text begins where every other row's text begins

#### Scenario: A callout shows its title without its type token

- **WHEN** a reference sits in the title of a `[!note]` callout
- **THEN** the row shows the callout's title, the `[!note]` token does not appear, and the row
  carries the callout marker

#### Scenario: A table shows the cell the reference is in

- **WHEN** a reference sits in a cell of a table's third row
- **THEN** the row shows that cell and nothing else of the table — not its header, not its
  sibling cells, not the rows the reference is not on

#### Scenario: Prose lines join, record lines do not

- **WHEN** a reference sits in a paragraph hard-wrapped across three lines
- **THEN** the row shows all three lines joined into one
- **WHEN** a reference sits in one line of a fenced code block
- **THEN** the row shows only that line

**Covered by**: `e2e/specs/74-footer-chrome-pass.e2e.ts` ("never puts a block-level element in
a row", "gives every kind the treatment its own rule promises", "gives every single-line row
the same height", "makes every row a whole number of text lines tall", "matches the committed
structural baseline for every fixture") and `tests/footer-model.test.ts` for the per-kind
content table itself.

### Requirement: A reference shows one level of children, deeper subtrees folded

The children of a referencing node SHALL render. A child that has children of its own SHALL
render collapsed, with the same fold affordance the outline uses in the editor, positioned
beside its marker. Expanding it SHALL reveal its own children under the same rule.

#### Scenario: Immediate children are shown

- **WHEN** a referencing node has three children, none of which has children
- **THEN** all three render

#### Scenario: A grandchild-bearing child is folded

- **WHEN** a referencing node has a child that itself has two children
- **THEN** that child renders with a fold affordance and its own children are hidden until it is
  expanded

**Covered by**: `tests/footer-model.test.ts` ("shows a reference's own children, and folds a
child that has its own", "keeps a reference’s children in source order, referenced or not",
"drops the fold count once a row is expanded", "renders a reference nested inside another
reference exactly once") and `e2e/specs/75-footer-behaviour.e2e.ts` ("reveals hidden descendants
when a row’s fold is used" — reported in review, where expansion was keyed on a synthetic fact's
line number and so marked nothing).

### Requirement: A property reference renders without lineage

A reference of kind Property SHALL render as a single row carrying the property name and the
link, without lineage and without tree indentation, because it has no position in the block
tree. It SHALL be visually distinguishable from a reference that does have a position.

#### Scenario: A frontmatter reference claims no place in the tree

- **WHEN** a source note references the target from a frontmatter property
- **THEN** the reference renders as one row showing the property name, with no lineage and no
  indentation

**Covered by**: `tests/footer-model.test.ts` ("renders a frontmatter reference as a property
row with no lineage") and `e2e/specs/74-footer-chrome-pass.e2e.ts` (the property row in the
per-kind matrix and the structural baseline).

### Requirement: An embed reference is distinguishable from a link

A reference of kind Embed SHALL render in its lineage like any positioned reference, and SHALL
additionally carry an indication that it is an embed, so a transclusion is not read as a
mention.

#### Scenario: An embed is marked

- **WHEN** a source note embeds the target
- **THEN** the reference renders in tree context and is marked as an embed

**Covered by**: `e2e/specs/72-backlink-index.e2e.ts` ("distinguishes an embed from a link, and
a property from both") for the classification, and `e2e/specs/75-footer-behaviour.e2e.ts`
("marks an embed reference as one, and leaves a plain reference unmarked") for the rendering.
The second was written by this audit: the classification was covered and nothing asserted that
it reached the row, so a tag applied to every row or to none would have passed.

### Requirement: A long group is truncated, and says so

A group whose rows exceed a height threshold SHALL be truncated with a visible fade and a control
that reveals the rest and puts it back. Truncation SHALL be visual only: every reference SHALL
remain present, in source order, so the group's own count and the footer's totals continue to
describe the whole set rather than the visible part.

The threshold SHALL be expressed so that a setting can drive it without the rendering knowing
about settings. Choosing its default is `backlinks-controls`' work, informed by S5.

#### Scenario: A long group is truncated rather than dropped

- **WHEN** a source note contributes more rows than the threshold allows
- **THEN** the group is clipped with a fade and offers a control to reveal the rest
- **AND** its count still reports every reference, not the visible ones

#### Scenario: A short group is untouched

- **WHEN** a source note's rows fit within the threshold
- **THEN** the group shows no fade and offers no control

**Covered by**: `e2e/specs/75-footer-behaviour.e2e.ts` ("offers a cap control on a group too
long to fit, and honours it" — the control appears only on a body that overflows, using it
reveals what was hidden, and it survives being used, which is what the `truncatable` set exists
for). Written by this audit, which found this requirement with no test at all. It runs on
`Reference target`, not the hub: the hub fixture is broad rather than deep, so every one of its
groups fits and the control correctly never appears there.

**Manual**: the FADE. It is a gradient over a card's bottom edge, and nothing available to this
harness distinguishes it from its absence; read on screen in both bundled themes during the 9.5
real-vault pass.

### Requirement: The footer paints known information first and fills in context as it resolves

The footer SHALL render the reference total, the contributing notes and their per-note counts as
soon as they are known, without waiting for any source note to be read. Each group SHALL fill in
its references and lineage when that source note has been read and placed, independently of
other groups.

A group whose context has not yet resolved SHALL indicate that it is still resolving, and SHALL
NOT display placeholder content standing in for structure that is not yet known.

#### Scenario: Counts appear before context

- **WHEN** a note with several referencing notes is opened
- **THEN** the total, the note names and their counts are visible before any reference's lineage
  is

#### Scenario: Groups resolve independently

- **WHEN** one source note is slow to read
- **THEN** the other groups render their references without waiting for it

#### Scenario: No fabricated structure while loading

- **WHEN** a group has not yet resolved
- **THEN** it shows that it is resolving and shows no rows standing in for references

**Covered by**: `e2e/specs/75-footer-behaviour.e2e.ts` ("paints counts before context, and
never fabricates rows while resolving") and `e2e/specs/76-footer-cost.e2e.ts` ("measures first
paint — mount to header on screen"). Note S5's correction to D11: at the measured cost the
header and the bodies arrive in the same frame, so what this requirement buys is the guarantee
that a count is never shown without the rows behind it — a correctness property, not a speed
one.

### Requirement: Clicking a reference opens its source at that node

Clicking a referencing node SHALL open its source note and reveal the referenced node.
Clicking a lineage element SHALL open its source note and reveal that ancestor. Navigation
SHALL follow Obsidian's own conventions for opening a link, including the modifiers that open
in a new pane.

#### Scenario: A reference navigates to its source

- **WHEN** a referencing node is clicked
- **THEN** its source note opens with that node revealed

#### Scenario: A lineage element navigates to that ancestor

- **WHEN** an element of a lineage line is clicked
- **THEN** the source note opens with that ancestor revealed

**Covered by**: `e2e/specs/75-footer-behaviour.e2e.ts` ("opens a reference at its own node, not
at the top of its note", "opens a lineage segment at THAT ancestor, not at the chain’s first",
"opens a new pane on Mod-click, leaving the current one alone", "follows a link inside a
mention to the link’s own target"). Asserted on `Backlinks/Deep chain.md`, the one fixture
where "opened the note", "opened at the reference" and "opened at this ancestor" are three
different lines.

### Requirement: A note with no references shows a dormant footer

A note with no references SHALL render a single quiet line stating that there are none, in the
position the populated header would occupy, rather than rendering nothing at all.

#### Scenario: An unreferenced note still ends predictably

- **WHEN** a note that nothing links to is open in outline mode
- **THEN** one line reports that there are no linked references, and no groups render

**Covered by**: `e2e/specs/73-footer-render.e2e.ts` ("shows one header line, counted, for a
note nothing links to") and `e2e/specs/75-footer-behaviour.e2e.ts` ("shows no footer chrome for
a note nothing links to, beyond its own header").

### Requirement: The footer survives an active zoom scope

While a zoom scope is active (`outline-zoom`), the footer SHALL continue to render, after the
zoomed content. The scope hides the document around the zoom root, and the footer SHALL NOT be
hidden with it.

The footer SHALL keep answering for the NOTE while zoomed — the same references, the same
grouping, the same counts it shows unzoomed. Narrowing it to the zoomed node is deliberately not
specified here; it belongs with the footer's filter model, and until that exists the footer's
answer SHALL NOT silently change because a zoom is active.

Clearing the zoom SHALL leave the footer exactly as it was, having neither rebuilt its index nor
changed what it reports.

The footer's own requirement that it be chrome AFTER the content rather than a rendering of the
line it follows SHALL hold while zoomed, against the moved anchor. It is stated on the footer
because both of its defects are visible without any zoom at all; a zoom is only where the second
one shows every time, since the last VISIBLE line of a zoomed list subtree is nested by
construction, and where the first one is the whole of the empty space below a short document
rather than a line at the end of a long one.

#### Scenario: Nothing is rendered below the footer while zoomed

- **WHEN** a note with references is zoomed into a node
- **THEN** the footer is the last thing in the content, with no line after it

#### Scenario: The footer is still there while zoomed

- **WHEN** a note with references is zoomed into a node
- **THEN** the footer renders below the zoomed content, with the same references it shows unzoomed

#### Scenario: Zooming does not change what the footer reports

- **WHEN** the user zooms in, notes the footer's groups and counts, and zooms out
- **THEN** the groups and counts are the same throughout

#### Scenario: A dormant footer stays dormant

- **WHEN** a note with no references is zoomed into a node
- **THEN** the footer behaves exactly as it does unzoomed

### Requirement: A lineage segment names its node the way a row of that kind does

A lineage segment's content SHALL be derived by the same per-kind rule a node row's content is:
a callout ancestor's title without its `[!type]` token, a table ancestor's cell, a fenced-code
ancestor's own line, and every other kind's first line with its block syntax removed. A segment
SHALL NOT be derived by a second, weaker rule.

A node with more of its own lines than the segment shows SHALL be marked as shortened, by the
same rule wherever a chain element is quoted — so a segment and a crumb naming the same node
carry the same mark or neither does.

A segment whose content would be empty SHALL fall back to a label naming its kind, so no segment
is ever blank and unclickable. That fallback is a name for the node rather than a quotation from
it, and SHALL NOT take the shortened mark.

#### Scenario: A callout ancestor's segment drops its callout token

- **WHEN** a reference sits under a callout ancestor
- **THEN** that ancestor's lineage segment reads the callout's title, without `[!type]`, and its
  kind is carried by the segment's own marker

#### Scenario: A segment and a crumb name the same node identically

- **WHEN** the same node appears both as a footer lineage segment and as a zoom trail crumb
- **THEN** the two carry the same text and the same shortened mark

### Requirement: A lineage row renders live, and spends no colour on it

A lineage row's content SHALL render as inline markdown, with its links and tags remaining
separately activatable — an ancestor's links are part of what that ancestor says, and a chain
that removes them misquotes it.

That content SHALL take NO colour accent. A lineage row is context, drawn dimmer than the
reference it leads to, and a theme-accented link inside it is the loudest thing on the line —
which inverts the emphasis the row's own colour establishes.

The affordance SHALL be carried by three channels that spend no colour:

- **An underline present at rest**, drawn in the row's own colour. A link revealed only under
  the pointer is one the reader must go looking for.
- **The cursor.** An external link SHALL take the cursor the platform uses for leaving the
  current context, and an internal one the same cursor the surrounding segment takes, so the two
  destinations are distinguishable BEFORE the click rather than after it.
- **Hover**, which SHALL shift the colour toward the text colour and SHALL NOT add or change an
  underline. A segment's own hover SHALL do the same, and SHALL be the row's only hover signal:
  on this row an underline means "link" and nothing else, so a segment wearing one under the
  pointer makes the ancestor read as a link and hides the boundary of any link inside it.

A tag SHALL render as a word carrying a step more ink than the row around it, filling on hover,
rather than as a chip — a pill is a second object in a line that is one. That step SHALL be
taken from the ROW's own colour rather than from a fixed value, because the footer's lineage and
zoom's trail are dimmed to different degrees and a value chosen for one leaves the tag
unreadable on the other.

A highlight SHALL be drawn with a visible background in every row, and SHALL take its row's own
text colour. Left to the browser a `<mark>` is black on an opaque yellow, which on a dark theme
is the only black text in the footer; and a background derived solely from a theme token
disappears entirely where that token is undefined. Neither outcome is a highlight.

Highlighted text SHALL remain legible against its own highlight, in every row. This is a
contrast requirement, not an opacity one: a chain's faint ink over the default highlight
composites to almost exactly its own luminance — measured at 1.01:1, where text is not dim but
absent — while the opacity involved looks unremarkable.

Where a row's own text colour cannot meet that against its highlight, the row SHALL soften the
highlight and lift the text TOGETHER. Neither alone suffices: any tint raises the ground toward
faint ink, and lifting the ink to full strength alone makes a highlighted run in a chain as loud
as the mention it leads to.

The highlight's own colour SHALL NOT be derived from a theme token. Such a token is variously
undefined, fully transparent, opaque and light, or translucent — measured across four themes,
all four — and a rule built on it renders as a browser default, as nothing at all, or as
illegible depending on which theme is loaded.

Emphasis inside a lineage row SHALL carry weight and not colour, whatever a theme gives it
elsewhere. A theme that accents `<strong>` otherwise puts the loudest mark on the page inside
the row that exists to be quiet.

Every mark in a row — the gutter marker and the icons inline in a chain — SHALL be vertically
centred on the same midline as the text beside it, and that midline SHALL be the font's CAP
height rather than its x-height. A mark centred on the x-height midline dips below the baseline
of adjacent text: measured, a footer gutter marker sat 0.15em under it while the icons inline in
the same row sat at 0.06em, which is one row drawn to two midlines. The editor's own markers
keep the x-height rule, and that difference is the requirement rather than a drift — a marker
there hangs in its own gutter with no text on its line to be read against.

Every GLYPH mark in a row — the gutter marker and the kind icons inline in a chain — SHALL be
drawn at one size, whatever that row's text size is. A glyph mark is notation, and a chain that
shrinks its text SHALL NOT shrink those with it: the gutter marker's size feeds the marker
column's own placement, so a per-row size moves the column every row shares.

A mark that is a NUMBER — an ordered item's ordinal, in the gutter or inline in a chain — is
text rather than a glyph, and SHALL take its row's own text size. Sized to match the glyph marks
it would be drawn larger than the words beside it in a chain, which is the opposite of reading
as one line.

No other element inside a row SHALL be drawn larger than that row's own text. Where a size comes from
a theme token it SHALL be capped against the row's scale, because a token is not guaranteed to
be relative and an absolute one breaks the row it lands in.

A lineage row's content SHALL be drawn at less than the size of the reference it leads to, and
everything inside it — code spans, tags — SHALL be sized relative to the CHAIN rather than to
the row, so no element inside a chain is larger than its counterpart in a reference row.

Embedded media SHALL NOT render in a lineage row at all. A chain is one line, and there is no
size at which an image belongs in it; the segment SHALL keep the embed's alt text, which is what
the node says, rather than dropping it and risking a blank segment.

Where a link inside a segment and the segment itself both claim an event, the link SHALL win
where the event originates inside it and the segment SHALL win everywhere else. This SHALL hold
for keyboard activation as well as for the pointer, since a rendered link is focusable and its
own `Enter` reaches the segment around it. The rule SHALL be enforced by the shared rendering
primitive rather than by either surface's own handler, so that both surfaces get it from one
implementation.

#### Scenario: A link in a lineage row takes no accent colour

- **WHEN** an ancestor's text carries an external link and a wikilink
- **THEN** both render as links in the lineage row's own colour, underlined, and neither is
  drawn in the theme's link colour

#### Scenario: The two destinations differ before the click

- **WHEN** the pointer rests on an external link inside a lineage segment, and then on the
  segment's own text
- **THEN** the cursor differs between the two

#### Scenario: Hover never underlines a segment

- **WHEN** the pointer rests on a lineage segment, and then on a link inside one
- **THEN** the segment's own hover changes only its colour, and the only underline anywhere on
  the row is the link's own

#### Scenario: A highlight reads as one, in both rows

- **WHEN** an ancestor and the reference beneath it both carry a highlight
- **THEN** both are drawn with a visible background, neither takes the browser's default black
  text, and the text in each is legible against its own highlight in a light theme and a dark
  one alike

#### Scenario: A chain is smaller than the reference it leads to

- **WHEN** a lineage row and its reference row both carry a tag
- **THEN** the chain's text is smaller than the reference's, the chain's tag is smaller than the
  reference's tag rather than larger, and neither tag is larger than the row holding it

#### Scenario: A row's marks share one midline and one size

- **WHEN** a lineage row draws its gutter marker and the icons inline beside its text
- **THEN** all of them are centred on the same midline as that text, and the glyph marks are the
  same size as one another and as those on every other row in the footer

#### Scenario: A theme's emphasis colour does not reach a chain

- **WHEN** the active theme draws bold text in an accent colour
- **THEN** a bold ancestor in a lineage row is still drawn in that row's own text colour

#### Scenario: A tag reads against its row

- **WHEN** an ancestor's text carries a tag
- **THEN** the tag is drawn with more ink than the segment's own text on both the footer's
  lineage and zoom's trail, despite the two rows being dimmed differently

#### Scenario: An image embed does not render in a chain

- **WHEN** an ancestor's text carries an image embed
- **THEN** the segment shows the embed's alt text, no image element is produced, and the row is
  one line of text tall

#### Scenario: A link inside a segment wins its own activation

- **WHEN** the user clicks a link inside a lineage segment
- **THEN** that link is followed, and the segment's own action does not also fire
- **WHEN** the user clicks the segment's text beside it
- **THEN** the segment's own action fires
- **WHEN** the user focuses a link inside a segment and presses Enter
- **THEN** that link is followed, and the segment's own action does not also fire
