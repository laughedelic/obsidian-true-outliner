## Purpose

Defines the search palette: a transient box, opened by a command, that searches the outline of
every note or of the current one, shows each hit under its ancestor chain in the outline's own
notation, and lands the reader on the hit they choose. It exists because a matching line
without its path is ambiguous in an outline, and because "take me there" wants a surface that
disappears once it has.

## ADDED Requirements

### Requirement: The palette opens from anywhere, by a command

A command SHALL open the palette. It SHALL be available whatever view is active and whether or
not the active tab is in outline mode; the palette is a navigation surface, not a structural
command, and the mode gate on structural commands SHALL NOT apply to it. The plugin SHALL NOT
bind a default hotkey to it.

Opening the palette SHALL place the caret in its query field. Dismissing it SHALL return focus
to where it was.

#### Scenario: Available outside outline mode

- **WHEN** the active tab is not in outline mode and the command palette is opened
- **THEN** the search command is offered, and invoking it opens the palette

#### Scenario: Available from a non-markdown view

- **WHEN** a non-markdown view is active and the command is invoked
- **THEN** the palette opens, scoped to the vault

#### Scenario: Focus lands in the query field

- **WHEN** the palette opens
- **THEN** typing edits the query without any further click or key

### Requirement: Results are the outline's structured view

Results SHALL be grouped by note. Each group SHALL carry the note's name, its folder, and the
number of hits in it. Within a group each hit SHALL render as a row in the outline's own
notation — its kind's marker, its depth — beneath the squashed lineage rows that lead to it, the
same squashing the backlinks footer applies. Hits in one note SHALL share their common ancestors
rather than each repeating them.

A group SHALL show only hits and their lineage: no children of a hit, and no fold controls.
Every occurrence of the query in a rendered row SHALL be marked.

Groups SHALL be ordered by the note's modification time, most recent first. Hits within a group
SHALL appear in document order.

#### Scenario: A hit renders under its lineage

- **WHEN** the query matches a list item three levels under a heading
- **THEN** the item's row is preceded by a lineage row naming the heading and the intervening
  ancestors, and is indented to its depth

#### Scenario: Two hits in one note share ancestors

- **WHEN** the query matches two nodes under the same heading
- **THEN** the heading appears once in the group, above both hits

#### Scenario: A hit's children are not shown

- **WHEN** the query matches a node that has children which do not match
- **THEN** the children are not rendered and no fold control is offered

#### Scenario: The match is marked

- **WHEN** a row is rendered for a hit
- **THEN** the matched text in it is visibly marked

#### Scenario: Recency orders the groups

- **WHEN** hits are found in several notes
- **THEN** the most recently modified note's group is first

### Requirement: Two scopes, switched in place

The palette SHALL search every markdown note in the vault by default. A key and a visible
control SHALL toggle the scope to the note the palette was opened from, and back. The active
scope SHALL be shown in the input row whenever it is the narrowed one. Switching scope SHALL
re-run the current query; the query text SHALL be kept.

When the palette is opened with no note active, the narrowed scope SHALL NOT be offered.

#### Scenario: Narrowing to the current note

- **WHEN** the palette was opened from a note and the scope key is pressed
- **THEN** only hits in that note are shown, the input row names the note, and the query is
  unchanged

#### Scenario: Widening again

- **WHEN** the scope is narrowed and the scope key is pressed again
- **THEN** hits from every note are shown and the input row no longer names a note

#### Scenario: No note to narrow to

- **WHEN** the palette was opened from a non-markdown view and the scope key is pressed
- **THEN** the scope stays the vault

### Requirement: The keyboard moves between hits, and focus stays in the query

Exactly one hit SHALL be active whenever any hit is shown; the first hit becomes active when
results change. The arrow keys SHALL move the active hit to the previous or next hit in display
order, across group boundaries. A modified arrow SHALL move to the first hit of the previous or
next group. Moving SHALL scroll the active hit into view.

Focus SHALL remain in the query field throughout; hovering a hit with the pointer SHALL make it
active; typing SHALL edit the query.

#### Scenario: Arrows cross groups

- **WHEN** the last hit of a group is active and the next-hit key is pressed
- **THEN** the first hit of the following group becomes active

#### Scenario: Group jump

- **WHEN** a hit in the middle of a group is active and the next-group key is pressed
- **THEN** the first hit of the following group becomes active

#### Scenario: The active hit is kept in view

- **WHEN** the active hit moves to one that is scrolled out of the results area
- **THEN** the results area scrolls so that hit is visible

#### Scenario: Focus never leaves the field

- **WHEN** hits have been navigated with the keyboard and a character is typed
- **THEN** the character is appended to the query

### Requirement: Selecting a hit lands on it

Confirming the active hit — or activating a hit with the pointer — SHALL open its note with the
caret at the start of the hit's node, scrolled into view, and close the palette. When that tab is
in outline mode the view SHALL be zoomed so that the hit is within the zoomed scope: to the hit
itself when it has children, and to its parent when it does not, so the zoomed view is never a
single line. Outside outline mode the note SHALL open unzoomed at the node.

A shift-modified confirmation SHALL open the note unzoomed at the node. A confirmation carrying
the platform's new-tab modifier SHALL open the note in a new tab, zoomed by the same rule.

#### Scenario: Enter zooms to a hit with children

- **WHEN** a hit with children is active in a note whose tab is in outline mode and the hit is
  confirmed
- **THEN** the note opens zoomed to the hit, with the caret on the hit's first line

#### Scenario: Enter on a leaf zooms to its parent

- **WHEN** a childless hit is active and confirmed, in outline mode
- **THEN** the note opens zoomed to the hit's parent, with the caret on the hit's first line

#### Scenario: No zoom outside outline mode

- **WHEN** the hit's tab is not in outline mode and the hit is confirmed
- **THEN** the note opens with the caret on the hit's first line and nothing hidden

#### Scenario: Shift opens the whole note

- **WHEN** a hit is confirmed with shift held
- **THEN** the note opens unzoomed with the caret on the hit's first line

#### Scenario: The new-tab modifier opens a new tab

- **WHEN** a hit is confirmed with the platform's new-tab modifier
- **THEN** the note opens in a new tab and the previous tab is unchanged

#### Scenario: The palette closes on selection

- **WHEN** a hit is confirmed
- **THEN** the palette is no longer shown

### Requirement: Results paint progressively and are bounded

Groups SHALL appear as each note's tree resolves, without waiting for every note. A change to the
query or the scope SHALL discard results an earlier query had not yet painted, so no result of a
superseded query is ever shown.

The number of groups shown SHALL be capped. When the cap is reached, the palette SHALL state how
many further notes hold hits and are not shown. The count SHALL be true for the whole scope.

#### Scenario: A superseded query paints nothing

- **WHEN** a query is typed and replaced before its results have finished painting
- **THEN** only the replacement's results are shown

#### Scenario: The cap is stated

- **WHEN** more notes hold hits than the cap admits
- **THEN** the first groups up to the cap are shown, followed by a statement of how many notes
  are not

### Requirement: Empty states say what they mean

With an empty query the palette SHALL show no results and SHALL show its key hints. With a query
that matches nothing in the active scope the palette SHALL say so.

#### Scenario: Nothing typed

- **WHEN** the palette is open with an empty query
- **THEN** no group is shown and the key hints are

#### Scenario: Nothing found

- **WHEN** the query matches no node in the active scope
- **THEN** the palette states that there are no matches

### Requirement: The palette is usable by assistive technology and on a phone

The query field SHALL be exposed as a combobox controlling a listbox of hits, with the active
hit announced as the active descendant and each hit an option. On a phone the palette SHALL fill
the screen, hits SHALL be activated by tap, and the key hints SHALL be omitted.

#### Scenario: Roles are present

- **WHEN** the palette shows results
- **THEN** the field carries the combobox role naming the active hit, and each hit carries the
  option role

#### Scenario: Tap opens on a phone

- **WHEN** the palette is open on a phone and a hit is tapped
- **THEN** the hit's note opens as a confirmed hit would
