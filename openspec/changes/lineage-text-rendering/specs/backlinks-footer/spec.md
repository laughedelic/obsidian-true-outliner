## MODIFIED Requirements

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

## ADDED Requirements

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
- **Hover**, which SHALL strengthen the underline without moving the colour. A link drawn
  dimmer than the words beside it is an affordance hiding from the pointer.

A tag SHALL render as a word carrying a step more ink than the row around it, filling on hover,
rather than as a chip — a pill is a second object in a line that is one. That step SHALL be
taken from the ROW's own colour rather than from a fixed value, because the footer's lineage and
zoom's trail are dimmed to different degrees and a value chosen for one leaves the tag
unreadable on the other.

Embedded media SHALL NOT render in a lineage row at all. A chain is one line, and there is no
size at which an image belongs in it; the segment SHALL keep the embed's alt text, which is what
the node says, rather than dropping it and risking a blank segment.

Where a link inside a segment and the segment itself both claim a pointer event, the link SHALL
win where the pointer is on it and the segment SHALL win everywhere else.

#### Scenario: A link in a lineage row takes no accent colour

- **WHEN** an ancestor's text carries an external link and a wikilink
- **THEN** both render as links in the lineage row's own colour, underlined, and neither is
  drawn in the theme's link colour

#### Scenario: The two destinations differ before the click

- **WHEN** the pointer rests on an external link inside a lineage segment, and then on the
  segment's own text
- **THEN** the cursor differs between the two

#### Scenario: A tag reads against its row

- **WHEN** an ancestor's text carries a tag
- **THEN** the tag is drawn with more ink than the segment's own text on both the footer's
  lineage and zoom's trail, despite the two rows being dimmed differently

#### Scenario: An image embed does not render in a chain

- **WHEN** an ancestor's text carries an image embed
- **THEN** the segment shows the embed's alt text, no image element is produced, and the row is
  one line of text tall

#### Scenario: A link inside a segment wins its own click

- **WHEN** the user clicks a link inside a lineage segment
- **THEN** that link is followed, and the segment's own action does not also fire
- **WHEN** the user clicks the segment's text beside it
- **THEN** the segment's own action fires
