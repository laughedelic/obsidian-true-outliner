## Purpose

Defines how a reader narrows, orders and bounds a note's backlinks: which references are shown
when a filter is active, what order groups appear in, how many are rendered before the reader is
asked, and what the reported totals mean when the body is incomplete. It exists because a hub
note's full reference set is both unreadable and expensive, and a reader needs to be able to ask
for less without being lied to about how much there is.

## ADDED Requirements

### Requirement: Filters are focus-on, not filter-out

Filter selections SHALL be additive inclusions over an unfiltered default. With no selection
made on an axis, that axis SHALL admit everything. Selecting one or more values on an axis
SHALL restrict results to those values. Deselecting the last value on an axis SHALL restore that
axis to admitting everything.

Axes SHALL combine conjunctively: a group is shown when it is admitted by every axis.

#### Scenario: No selection means no filter

- **WHEN** no filter value is selected on any axis
- **THEN** every reference the index reports for the note is eligible for display

#### Scenario: Selecting narrows rather than excludes

- **WHEN** exactly one source-folder value is selected
- **THEN** only references from notes in that folder are shown

#### Scenario: Deselecting the last value restores everything

- **WHEN** the only selected value on an axis is deselected
- **THEN** that axis again admits everything

#### Scenario: Axes combine conjunctively

- **WHEN** a source folder and a reference kind are both selected
- **THEN** only references that are in that folder AND of that kind are shown

### Requirement: Two filter axes, distinguishable from each other

Filtering SHALL be offered on two axes: the SOURCE of a reference (the folder of the note it
comes from) and the KIND of a reference (Note, Anchor, Embed, Property, as defined by
`backlink-index`).

Each axis SHALL present the values actually present in the current note's references, with the
count of contributing notes for each. The two axes SHALL be visually distinguishable from one
another so a reader can tell which dimension a control belongs to without reading its label.

#### Scenario: Only present values are offered

- **WHEN** a note's references come from two folders and are all of kind Note
- **THEN** two source values are offered, and the kind axis offers only Note

#### Scenario: The axes are told apart without reading labels

- **WHEN** both axes are shown together
- **THEN** their controls differ in form, not only in wording

### Requirement: Filters are dismissible and resettable

The filter controls SHALL be hidden by default behind a single affordance, so an unfiltered
footer carries no filter chrome. That affordance SHALL indicate whether any filter is currently
active.

A reset SHALL be offered whenever any filter or search term is active, and SHALL clear every
axis and the search term together, returning the footer to its unfiltered state.

#### Scenario: No filter chrome until asked for

- **WHEN** the footer is rendered with no filter active
- **THEN** the filter controls are not shown, and the affordance that reveals them is

#### Scenario: Active filtering is signalled while hidden

- **WHEN** a filter is active and the filter controls are hidden
- **THEN** the affordance indicates that filtering is in effect

#### Scenario: Reset clears every axis at once

- **WHEN** a source filter, a kind filter and a search term are all active and reset is invoked
- **THEN** all three clear and every reference is again eligible

### Requirement: Sort order is selectable, with recency as the default

Groups SHALL be ordered by a reader-selectable order, defaulting to most recently modified
first. The available orders SHALL include most recently modified, least recently modified,
source note name, and number of references contributed.

References within a group SHALL always appear in their source note's document order,
independently of the group order.

#### Scenario: Recency is the default

- **WHEN** the footer is rendered without a sort having been chosen
- **THEN** groups appear with the most recently modified source note first

#### Scenario: Order within a group is document order

- **WHEN** a group contains three references and any group order is selected
- **THEN** those three appear in the order they occur in the source note

### Requirement: Volume is capped, with the caps under the reader's control

The footer SHALL bound how much it renders by two caps: a maximum number of references shown
across the whole footer, and a maximum number shown per source note. Both SHALL be
configurable, and both SHALL have defaults.

Caps SHALL be applied after filtering, so narrowing the results makes more of the narrowed set
visible rather than leaving it hidden behind a cap consumed by excluded references.

The reader SHALL be able to request the next tranche of results without losing what is already
rendered.

#### Scenario: The per-note cap bounds a single group

- **WHEN** one source note contributes more references than the per-note cap
- **THEN** that group renders no more than the cap, and reports that it has more

#### Scenario: The overall cap bounds the footer

- **WHEN** the sum of references across groups exceeds the overall cap
- **THEN** rendering stops at the cap, and the footer reports how much is not shown

#### Scenario: Filtering frees cap budget

- **WHEN** a filter excludes most references and the remainder is below the cap
- **THEN** the whole remainder renders

#### Scenario: Requesting more is additive

- **WHEN** the reader requests the next tranche
- **THEN** further results render below what was already shown, and nothing already rendered is
  removed or reordered

### Requirement: Reported totals are always true, even when the body is capped

The footer's reported reference and note totals SHALL describe the complete filtered result
set, not the rendered subset. When rendering is incomplete, the footer SHALL state how many
references from how many notes are not shown.

#### Scenario: The header total ignores the cap

- **WHEN** a note has far more references than the overall cap
- **THEN** the header reports the true total, not the number rendered

#### Scenario: The shortfall is stated explicitly

- **WHEN** rendering stops at a cap
- **THEN** the footer states the number of references and the number of notes it is not showing

#### Scenario: Totals follow the filter

- **WHEN** a filter is active
- **THEN** the reported totals describe the filtered set, not the unfiltered one

### Requirement: An incomplete list says so spatially, not only numerically

Where results are omitted, the footer SHALL indicate the omission in the tree's own vocabulary
at the position the omitted results would occupy — within a group for references it is not
showing from that note, and after the last group for notes it is not showing at all — in
addition to stating the shortfall in words.

The end of an incomplete list SHALL be visually distinguishable from the end of a complete one,
so a reader scrolling past can tell that the list continues.

#### Scenario: Omission is marked in place

- **WHEN** a group is showing fewer references than the note contributes
- **THEN** an indication of the omitted references appears within that group at the depth they
  would have occupied

#### Scenario: A truncated list does not look finished

- **WHEN** rendering stops at a cap
- **THEN** the end of the rendered list is presented differently from the end of a list that is
  complete

#### Scenario: A complete list is not marked

- **WHEN** every reference in the filtered set is rendered
- **THEN** no omission indication appears anywhere in the footer
