## MODIFIED Requirements

### Requirement: The footer survives an active zoom scope

While a zoom scope is active (`outline-zoom`), the footer SHALL continue to render, after the
zoomed content. The scope hides the document around the zoom root, and the footer SHALL NOT be
hidden with it.

While zoomed, the footer SHALL answer for the zoom answer in force (`backlink-filtering`, "While
zoomed, the footer answers for the zoomed node"): its groups, counts and totals SHALL be those of
the references that answer admits. Clearing the zoom SHALL return the footer to answering for the
note, with the filter selections, sort and view state it had, and without rebuilding its index.

A note with no references SHALL render the same dormant footer zoomed as unzoomed: there is nothing
for an answer to narrow.

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
- **THEN** the footer renders below the zoomed content, with the references the zoom answer in
  force admits

#### Scenario: Zooming does not change what the footer reports

- **WHEN** Whole note is the answer in force, and the reader zooms in, notes the footer's groups and
  counts, and zooms out
- **THEN** the groups and counts are the same throughout, and the same as unzoomed

#### Scenario: Zooming out restores the note's answer

- **WHEN** the reader notes the unzoomed footer's groups and counts, zooms into a node whose answer
  admits fewer references, and zooms out
- **THEN** the groups and counts are the unzoomed ones again

#### Scenario: A dormant footer stays dormant

- **WHEN** a note with no references is zoomed into a node
- **THEN** the footer behaves exactly as it does unzoomed

## ADDED Requirements

### Requirement: While zoomed, the header names what the footer answers for

While a zoom scope is active and the note has references, the header SHALL name the answer in
force: "Backlinks to" followed by a control reading "this node", "this branch" or "the whole note".
The control SHALL name the answer, not the zoom root: the zoom trail already names the root, and
its text can be longer than the header holds.

Each answer SHALL have one glyph — for This node a crosshair on a point, for This branch a list
tree, for Whole note a page — and SHALL carry it, at one size, wherever the answer is offered or
shown: in the control, in its menu and in the narrow form below. The control's words SHALL be set
in the header's regular weight.

The control SHALL open a menu of the three answers, without a caption of its own: the words before
the control already say what the menu chooses. Each entry SHALL carry its answer's glyph, its name
and how many references it would show; the entry in force SHALL read as chosen; an unavailable
entry SHALL read as unavailable and SHALL say why. Choosing an entry SHALL apply it and close the
menu.

Where the footer is narrower than its header's words — the width at which the header already
shortens its title — the control and its menu SHALL give way to three segments, one per answer,
each carrying its answer's glyph and reference count. The segment of the answer in force SHALL
read as chosen in the accent colour; an unavailable answer's segment SHALL read as unavailable and
SHALL say why when pointed at; pressing an available segment SHALL apply its answer. Which form is
shown SHALL follow the footer's own width, not the platform.

The totals beside the control SHALL be the totals of the answer in force. Beside the segments the
header SHALL show no totals: each segment's count already says how many references its answer
holds. The header SHALL remain a single row, carrying the filter affordance and the sort selector
as it does unzoomed.

The menu SHALL be one of the footer's popovers: opening it SHALL close any other, and it SHALL
close on a press outside the footer like the rest.

The control SHALL be a real button, reachable and operable from the keyboard, whose accessible name
states the answer in force and whose `aria-expanded` tracks the menu. The menu's entries SHALL be a
group of radio items, of which exactly one is checked. The segments SHALL be a radio group of their
own, one checked, each named by its answer and its count.

With no zoom active, the header SHALL be as it is without this requirement.

#### Scenario: The header says what it counts

- **WHEN** a note is zoomed into `## Current sprint` under the default answer
- **THEN** the header reads "Backlinks to" and "this branch" with the list-tree glyph, and its
  totals are that answer's

#### Scenario: The menu offers all three with their counts

- **WHEN** the control is activated
- **THEN** a menu with no caption lists This node, This branch and Whole note, each with its glyph
  and its reference count, and the one in force reads as chosen

#### Scenario: Choosing an answer applies it

- **WHEN** Whole note is chosen from the menu
- **THEN** the menu closes, the control reads "the whole note", and the footer shows every
  reference to the note

#### Scenario: An unavailable answer says why

- **WHEN** the note is zoomed into a node that carries no anchor and has none below it, and the
  control is activated
- **THEN** This node and This branch read as unavailable, each saying that nothing there carries a
  heading or a block id, and Whole note reads as chosen

#### Scenario: A narrow footer offers the answers as segments

- **WHEN** the footer is narrower than its header's words
- **THEN** the header shows three segments with their glyphs and counts in place of the control,
  the one in force in the accent colour, no totals beside them, and the header is still one row
- **WHEN** the This node segment is pressed
- **THEN** This node applies and its segment reads as chosen

#### Scenario: The same glyphs in every form

- **WHEN** the reader compares the control, its menu and the segments under each answer
- **THEN** each answer carries the same glyph, at the same size, in all three

#### Scenario: Opening the menu closes another popover

- **WHEN** the sort menu is open and the scope control is activated
- **THEN** the sort menu closes and the scope menu opens

#### Scenario: The control is operable from the keyboard

- **WHEN** the reader tabs to the control, presses Enter, moves to Whole note and presses Enter
- **THEN** Whole note applies, and the control's `aria-expanded` reported the menu open and then
  closed

#### Scenario: The segments are operable from the keyboard

- **WHEN** the footer is narrow, the reader tabs to the segments and moves to Whole note with the
  arrow keys
- **THEN** Whole note applies, and exactly one segment is checked throughout

#### Scenario: The unzoomed header is unchanged

- **WHEN** no zoom is active
- **THEN** the header carries no scope control and reads as it did before this requirement

### Requirement: An answer with nothing in it says so and offers the note

When the zoom answer in force admits no reference and the note has references, the footer SHALL
render its header with a count of zero, a single quiet line stating that nothing links to this part
of the note, and one action that switches the answer to Whole note and states how many references
that answer will show.

It SHALL NOT render the dormant footer, which states that the note itself has no references.

#### Scenario: A view nothing links to is not a note nothing links to

- **WHEN** a note with twelve references is zoomed into a node that carries a block id nobody links
  to
- **THEN** the header reports zero references, one line says that nothing links to this part of
  the note, and an action offers the twelve references to the whole note

#### Scenario: The action widens to the note

- **WHEN** that action is used
- **THEN** Whole note applies and the footer shows the twelve references
