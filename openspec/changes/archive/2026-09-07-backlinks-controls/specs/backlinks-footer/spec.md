## MODIFIED Requirements

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

## ADDED Requirements

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
