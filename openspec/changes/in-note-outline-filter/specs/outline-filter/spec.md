## Purpose

Defines filtering the open note's outline in place: a query the reader types collapses the
view to the nodes that match it and the ancestors that lead to them, live, editable, and
reversible. It exists because an outline is navigated by structure, and a find that can only
highlight lines leaves the reader scrolling past everything that did not match.

## ADDED Requirements

### Requirement: A filter panel opens in outline mode and filters live

A command SHALL open a filter panel over the editor, with a query field that takes focus. The
command SHALL be available only in an editor view whose tab is in outline mode, and SHALL
decline inside a nested per-cell editor by the same gate the other editor extensions use.

Typing in the field SHALL apply the query to the note as it is typed. A query of fewer than two
characters SHALL filter nothing. Closing the panel SHALL clear the query and restore the whole
note. The panel SHALL be per editor view and SHALL NOT persist across tabs or sessions.

#### Scenario: The command is absent outside outline mode

- **WHEN** the active tab is not in outline mode and the command palette is opened
- **THEN** the filter command is not offered

#### Scenario: Typing filters as it goes

- **WHEN** the panel is open and a query of two or more characters is typed
- **THEN** the note is filtered to that query without any further key

#### Scenario: Closing restores everything

- **WHEN** the panel is closed while a query is active
- **THEN** every line of the note renders again and no mark remains

### Requirement: Matches and their paths stay; everything else is hidden

While a query is active, a node SHALL be visible when its own text matches the query or when it
is an ancestor of a node that does. Every other node SHALL be hidden: its lines SHALL occupy no
vertical space and SHALL NOT receive the caret. A visible node SHALL render its own lines and
its chrome — marker, depth, guides — exactly as it does unfiltered. A match's children SHALL be
hidden unless they match themselves.

The note's title and properties SHALL stay visible. The backlinks footer SHALL keep rendering
after the content, as it does under a zoom. Hidden content SHALL remain in the document
unchanged.

Every occurrence of the query in a visible node SHALL be marked.

#### Scenario: A deep match keeps its path

- **WHEN** the query matches a list item three levels under a heading and nothing else
- **THEN** the heading, the intervening ancestors and the item are visible, and no sibling of any
  of them is

#### Scenario: A match's children are hidden

- **WHEN** the query matches a node whose children do not match
- **THEN** the node is visible and its children are not

#### Scenario: Hidden lines take no space and no caret

- **WHEN** content is hidden by the filter and the caret is moved down past a visible node
- **THEN** the caret lands on the next visible line, and the hidden lines occupy no space between

#### Scenario: The match is marked

- **WHEN** a node is visible because it matches
- **THEN** the matched text in it is marked

#### Scenario: Title, properties and footer stay

- **WHEN** a note with frontmatter and references is filtered
- **THEN** its title and properties block render, and the footer renders after the content

### Requirement: The visible set is fixed when the query runs

The set of visible nodes SHALL be decided when the query is applied and SHALL NOT change as the
document is edited. Editing a visible node so that it no longer contains the query SHALL keep it
visible; inserting the query's text into a hidden node SHALL NOT reveal it; a node created by
editing a visible node — splitting it, adding a sibling from it — SHALL be visible. Changing the
query SHALL re-decide the set from the document as it then is.

#### Scenario: Editing a match away keeps it

- **WHEN** the query's text is deleted from a visible match
- **THEN** the node stays visible until the query is changed

#### Scenario: A new sibling of a visible node is visible

- **WHEN** Enter at the end of a visible node creates a new node
- **THEN** the new node is visible and takes the caret

#### Scenario: Re-running the query re-decides

- **WHEN** a match was edited away and the query is then changed and changed back
- **THEN** that node is no longer visible

### Requirement: The caret never lands on hidden content

Any gesture or operation whose result would place the caret, or a selection end, on a hidden
line SHALL place it on the nearest visible line instead, in the direction of the movement.
Structural operations SHALL otherwise act on the document as they do unfiltered; hidden content
moves with its parent as part of the parent's subtree.

#### Scenario: Arrow past hidden lines

- **WHEN** the caret is on the last line of a visible node and the next visible node is several
  hidden nodes below
- **THEN** a down arrow lands the caret on the next visible node's first line

#### Scenario: Moving a node carries its hidden children

- **WHEN** a visible node with hidden children is moved down
- **THEN** the node and its whole subtree move, and the hidden children stay hidden

### Requirement: The filter composes with zoom

Inside a zoom scope, the query SHALL apply to the scope only, and the trail SHALL stay. Zooming
into a visible node while a query is active SHALL keep the query, applied to the new scope.
Zooming out SHALL keep it likewise. Clearing the query SHALL leave the zoom as it was.

#### Scenario: A filter inside a zoom searches the scope

- **WHEN** the view is zoomed into a node and a query matches nodes both inside and outside the
  scope
- **THEN** only the matches inside the scope are visible, and the trail is unchanged

#### Scenario: Zooming while filtered keeps the filter

- **WHEN** a query is active and the reader zooms into a visible match
- **THEN** the new scope shows only what matches the query within it

#### Scenario: Clearing the filter keeps the zoom

- **WHEN** the view is zoomed and filtered and the query is cleared
- **THEN** the zoom scope renders whole, still zoomed

### Requirement: No matches is said, not shown as nothing

When a query of two or more characters matches nothing in the scope, the panel SHALL say so and
the note SHALL render whole rather than empty.

#### Scenario: Nothing matches

- **WHEN** the query matches no node
- **THEN** the panel states that there are no matches and every line of the note is visible
