## ADDED Requirements

### Requirement: While zoomed, the footer answers for the zoomed node

While a zoom scope is active (`outline-zoom`), the references the footer answers for SHALL be
chosen by one of three answers:

- **This node** — references whose subpath lands on an anchor belonging to the zoom root.
- **This node and below** — references whose subpath lands on an anchor belonging to the zoom root
  or to any node in its subtree.
- **Whole note** — every reference to the note, exactly as with no zoom active.

Where a subpath lands, and which node an anchor belongs to, are defined by "An anchor belongs to
the node where what it names begins". A reference that reports no subpath addresses the note as a
whole and SHALL be admitted by Whole note only. A reference's kind SHALL NOT decide its
admission: an Anchor, an Embed of a heading or block, and a Property whose link addresses a
heading or block SHALL be admitted alike when their subpath lands inside the answer. A subpath that
lands on nothing SHALL be admitted by Whole note only.

The answer SHALL default to This node and below. A reader's choice SHALL be kept per note, for as
long as the footer keeps that note's other view state, and SHALL apply to every zoom into that note
until it is changed.

An answer SHALL be available only when it could admit a reference at all: This node when an anchor
belongs to the zoom root, This node and below when an anchor belongs to the root or to a node below
it. Whole note is always available. When the chosen answer is unavailable for the current zoom, the
nearest wider available answer SHALL apply in its place, without changing the reader's choice, so
a later zoom where the chosen answer is available applies it again.

With no zoom active, no answer applies and the footer answers for the note.

#### Scenario: The default answer is the zoomed view

- **WHEN** a note is zoomed into a heading that has two list items carrying block ids beneath it,
  and other notes link to that heading, to each of those ids, to another heading of the note, and
  to the note as a whole
- **THEN** only the references to the zoomed heading and to the two ids are shown

#### Scenario: This node leaves out what is below it

- **WHEN** the same zoom is answered with This node
- **THEN** only the references to the zoomed heading are shown

#### Scenario: Whole note is the unzoomed answer

- **WHEN** the same zoom is answered with Whole note
- **THEN** the groups and counts are those the footer shows with no zoom active

#### Scenario: An embed and a property are admitted by what they address

- **WHEN** one source embeds `![[Note#^alarm-list]]` and another names `[[Note#^alarm-list]]` in a
  property, and the block with that id is inside the zoomed view
- **THEN** both references are shown under This node and below

#### Scenario: A view with nothing to link to answers for the note

- **WHEN** a note is zoomed into a list item that carries no block id, has no heading below it,
  and has no block id below it
- **THEN** Whole note applies and the footer shows every reference to the note

#### Scenario: A narrower choice falls back without being forgotten

- **WHEN** the reader chooses This node, then zooms into a node that carries no anchor while one
  of its children carries a block id, and then zooms into a node that carries one
- **THEN** This node and below applies during the first zoom, and This node applies again during
  the second

#### Scenario: The choice outlives a zoom

- **WHEN** the reader chooses Whole note while zoomed, zooms out, and zooms into another node of
  the same note
- **THEN** Whole note applies to the second zoom

#### Scenario: Clearing the zoom answers for the note

- **WHEN** a zoom answered with This node and below is cleared
- **THEN** the footer answers for the note

### Requirement: An anchor belongs to the node where what it names begins

Where a subpath lands SHALL be decided by the rules Obsidian's own links resolve by — letter case,
the punctuation a heading subpath drops, nested heading paths, the first of two identical headings
— applied to the headings and block ids of the note as the editor currently holds it, not as the
note was last saved.

An anchor SHALL belong to the node that owns the first line of what the anchor names, reading the
tree as `document-tree-mapping` builds it, attached block ids included:

- a heading, to that heading's node;
- a misplaced block id (`misplaced-block-ids`), to what Obsidian reads it as: an item reading to
  that item, a whole-list reading to the first item of that list, an id with a block directly
  under it to the paragraph it stands in, and to no node when the reading is that it names
  nothing else or is not an id;
- the last of a run of lone block ids, which neither attaches nor is misplaced, to the node it
  would belong to were the ids before it absent;
- any other block id, to the node holding it — ending one of its lines, as a line of it, or
  attached to it — except that an id held by anything other than a list item, inside a list item,
  belongs to the nearest list item holding it, because no id names a block inside a list item.

Whenever the note's saved text and the editor's text are the same, every heading and block id
Obsidian's metadata reports for the note SHALL belong to the node that owns the line where that
metadata says it begins.

#### Scenario: A heading subpath matches as Obsidian's links do

- **WHEN** sources link to `[[Note#current sprint]]` and to `[[Note#Top#Current sprint]]`, and the
  note is zoomed into `## Current sprint` under `# Top`
- **THEN** both references are admitted by This node

#### Scenario: A duplicate heading resolves to the first

- **WHEN** a note has two `## Duplicate` headings, a source links to `[[Note#Duplicate]]`, and the
  note is zoomed into the second of them
- **THEN** the reference is not admitted by This node or by This node and below

#### Scenario: An id under a table names the table

- **WHEN** a table is followed by a blank line and a line holding only `^t1`, a source links to
  `[[Note#^t1]]`, and the note is zoomed into the table
- **THEN** the reference is admitted by This node

#### Scenario: An id under a list names the whole list

- **WHEN** two list items are followed by a blank line and a line holding only `^l1` at the left
  margin, a source links to `[[Note#^l1]]`, and the note is zoomed into the second item
- **THEN** the reference is not admitted by This node or by This node and below
- **WHEN** the note is instead zoomed into the first item
- **THEN** the reference is admitted by This node

#### Scenario: An id inside a list item names the item

- **WHEN** `- a` holds the indented paragraph `inner prose ^x8`, a source links to
  `[[Note#^x8]]`, and the note is zoomed into `a`
- **THEN** the reference is admitted by This node
- **WHEN** the note is instead zoomed into the paragraph `inner prose ^x8`
- **THEN** the reference is not admitted by This node or by This node and below

#### Scenario: An edit counts before the note is saved

- **WHEN** a source already links to `[[Note#^later]]`, and the reader types ` ^later` at the end
  of a line of the zoomed node
- **THEN** the reference is admitted by This node without waiting for the note to be saved
- **WHEN** the reader deletes the id again
- **THEN** the reference is no longer admitted, again without waiting for a save

#### Scenario: The anchors agree with Obsidian's metadata once saved

- **WHEN** a note holding headings and block ids in every shape the footer's fixtures carry is
  saved and Obsidian's metadata for it has settled
- **THEN** each heading and block id in that metadata belongs to the node owning the line where the
  metadata says it begins

### Requirement: The zoom answer comes before every filter, and is not one

The zoom answer SHALL decide which references the footer answers for before any filter axis, the
search term, the sort or the caps are applied. The totals, the values each axis offers and their
counts, the groups admitted, and the overall cap's budget SHALL all describe the references the
answer admits.

The answer SHALL be decided without reading any source note's content, so that while no search
term is active a note the overall cap excludes is still never read.

The answer SHALL NOT be a filter selection. The filter affordance SHALL NOT report the footer as
filtered because an answer narrower than Whole note applies, and resetting the filters SHALL NOT
change the answer.

A filter selection SHALL survive a change of answer. A selected value that the answer in force
does not offer, because none of the references it admits carries that value, SHALL remain selected
and listed, and SHALL apply again once an answer admits references carrying it.

#### Scenario: Totals describe the answer

- **WHEN** a zoom answered with This node and below admits four references from four notes, out of
  twelve references from five notes to the whole note
- **THEN** the footer reports four references and four notes

#### Scenario: The axes offer what the answer holds

- **WHEN** a zoom is answered with This node and below
- **THEN** the kind axis does not offer Note, since no reference that answer admits addresses the
  note as a whole

#### Scenario: A narrowed answer does not read as a filter

- **WHEN** a zoom answered with This node and below is shown with no filter selected
- **THEN** the filter affordance does not indicate that filtering is in effect

#### Scenario: Reset leaves the answer alone

- **WHEN** filters are active under This node and below and reset is invoked
- **THEN** the filters clear and This node and below still applies

#### Scenario: A selection survives a zoom

- **WHEN** the reader selects a folder that only whole-note references come from, zooms into a
  node, and zooms out again
- **THEN** that folder is still selected while zoomed, and narrows the footer again once the zoom
  is cleared

#### Scenario: The cap still bounds the reads

- **WHEN** no search term is active under a zoom answer and the overall cap excludes a source note
  the answer admits
- **THEN** that note's content is not read
