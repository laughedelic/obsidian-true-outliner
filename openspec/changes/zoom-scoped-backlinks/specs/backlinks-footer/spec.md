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
force where its title stands: the zoom root, the zoom root and what is below it, or the note. That
name SHALL be a control opening a menu of the three answers. Each entry SHALL state how many
references it would show; the entry in force SHALL read as chosen; an unavailable entry SHALL read
as unavailable and SHALL say why. Choosing an entry SHALL apply it and close the menu.

The control SHALL name the zoom root by the text a lineage segment naming the same node carries,
and SHALL mark which answer is in force by a glyph as well as in words, so that a narrow footer
which sheds the words still says which answer it shows.

The totals beside the control SHALL be the totals of the answer in force. The header SHALL remain
a single row, carrying the filter affordance and the sort selector as it does unzoomed.

The menu SHALL be one of the footer's popovers: opening it SHALL close any other, and it SHALL
close on a press outside the footer like the rest.

The control SHALL be a real button, reachable and operable from the keyboard, whose accessible name
states the answer in force and whose `aria-expanded` tracks the menu. The entries SHALL be a group
of radio items, of which exactly one is checked.

With no zoom active, the header SHALL be as it is without this requirement.

#### Scenario: The header says what it counts

- **WHEN** a note is zoomed into `## Current sprint` under the default answer
- **THEN** the header names `Current sprint` and that what is below it is included, and its totals
  are that answer's

#### Scenario: The menu offers all three with their counts

- **WHEN** the control is activated
- **THEN** a menu lists This node, This node and below, and Whole note, each with its reference
  count, and the one in force reads as chosen

#### Scenario: Choosing an answer applies it

- **WHEN** Whole note is chosen from the menu
- **THEN** the menu closes, the header names the note, and the footer shows every reference to the
  note

#### Scenario: An unavailable answer says why

- **WHEN** the note is zoomed into a node that carries no anchor and has none below it, and the
  control is activated
- **THEN** This node and This node and below read as unavailable, each saying that nothing there
  carries a heading or a block id, and Whole note reads as chosen

#### Scenario: A narrow footer keeps the answer's mark

- **WHEN** the footer is narrower than its header's words
- **THEN** the control still carries the glyph of the answer in force and the zoom root's name, and
  the header is still one row

#### Scenario: Opening the menu closes another popover

- **WHEN** the sort menu is open and the scope control is activated
- **THEN** the sort menu closes and the scope menu opens

#### Scenario: The control is operable from the keyboard

- **WHEN** the reader tabs to the control, presses Enter, moves to Whole note and presses Enter
- **THEN** Whole note applies, and the control's `aria-expanded` reported the menu open and then
  closed

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
