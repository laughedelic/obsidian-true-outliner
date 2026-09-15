## Purpose

Defines filtering the open note's outline in place: a query the reader types collapses the
view to the nodes that match it and the ancestors that lead to them, live, editable, and
reversible. It exists because an outline is navigated by structure, and a find that can only
highlight lines leaves the reader scrolling past everything that did not match.

## ADDED Requirements

### Requirement: A filter panel opens in outline mode and filters live

A command SHALL open a filter panel fixed above the editor's content, above the note's title and
properties block, with a query field that takes focus. The
command SHALL be available only in an editor view whose tab is in outline mode, and SHALL
decline inside a nested per-cell editor by the same gate the other editor extensions use.

Typing in the field SHALL apply the query to the note as it is typed. A query of fewer than two
characters SHALL filter nothing; this is this surface's threshold for when hiding begins and not
a rule of the grammar, which the other search surfaces answer at one character.

The panel SHALL show how many nodes the query matched. It SHALL offer a close control, Escape in
the query field SHALL close it, and the command SHALL close it when it is already open. Closing
the panel SHALL clear the query and restore the whole note. The panel SHALL be per editor view
and SHALL NOT persist across tabs or sessions.

#### Scenario: The command is absent outside outline mode

- **WHEN** the active tab is not in outline mode and the command palette is opened
- **THEN** the filter command is not offered

#### Scenario: Typing filters as it goes

- **WHEN** the panel is open and a query of two or more characters is typed
- **THEN** the note is filtered to that query without any further key

#### Scenario: Closing restores everything

- **WHEN** the panel is closed while a query is active
- **THEN** every line of the note renders again and no mark remains

#### Scenario: Escape in the field closes the panel

- **WHEN** Escape is pressed while the query field has focus
- **THEN** the panel closes and the note renders whole

#### Scenario: The panel counts what matched

- **WHEN** a query matches three nodes
- **THEN** the panel states that three nodes matched

### Requirement: Matches and their paths stay; everything else is hidden

While a query is active, a node SHALL be visible when its own text matches the query or when it
is an ancestor of a node that does. Every other node SHALL be hidden: its lines SHALL occupy no
vertical space and SHALL NOT receive the caret. A visible node SHALL render its own lines and
its chrome — marker, depth, guides — exactly as it does unfiltered. A match's children SHALL be
hidden unless they match themselves.

The note's title and its properties block SHALL keep rendering while the filter alone is active:
the document preamble is not a node, and a filter re-reads a note rather than re-rooting it. A
zoom still hides both, as `outline-zoom` requires, and a filter inside a zoom does not bring them
back. The backlinks footer SHALL keep rendering after the content, as it does under a zoom.
Hidden content SHALL remain in the document unchanged.

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

- **WHEN** a note with frontmatter and references is filtered and not zoomed
- **THEN** its title and properties block render, and the footer renders after the content

#### Scenario: A zoom still hides the title and properties

- **WHEN** a note with frontmatter is zoomed and then filtered
- **THEN** neither the title nor the properties block renders, as it does zoomed and unfiltered

### Requirement: The match set is fixed when the query runs

The set of MATCHES SHALL be decided when the query is applied and SHALL NOT change as the
document is edited. Editing a visible node so that it no longer contains the query SHALL keep it
visible; inserting the query's text into a hidden node SHALL NOT reveal it; a node created by
editing a visible node — splitting it, adding a sibling or a child from it — SHALL be visible.

The PATH to each match SHALL NOT be fixed: the ancestors that stay visible are those the document
has at the time it is rendered, so moving a match under a different parent SHALL make that parent
visible and SHALL let the parent it left become hidden again.

The set SHALL be re-decided from the document as it then is when the query changes, and when the
zoom scope changes, since the scope decides which matches count.

#### Scenario: Editing a match away keeps it

- **WHEN** the query's text is deleted from a visible match
- **THEN** the node stays visible until the query is changed

#### Scenario: A new sibling of a visible node is visible

- **WHEN** Enter at the end of a visible node creates a new node
- **THEN** the new node is visible and takes the caret

#### Scenario: Re-running the query re-decides

- **WHEN** a match was edited away and the query is then changed and changed back
- **THEN** that node is no longer visible

#### Scenario: A moved match brings its new ancestors

- **WHEN** a visible match is indented under a sibling that does not match
- **THEN** that sibling becomes visible as part of the match's path

#### Scenario: Zooming out re-decides

- **WHEN** a match was edited away inside a zoom scope and the view is then zoomed out
- **THEN** that node is no longer visible, and the matches in the wider scope are

### Requirement: The caret never lands on hidden content

Any gesture or operation whose result would place the caret on a hidden line SHALL place it on
the nearest visible line instead, in the direction of the movement.

Structural operations SHALL otherwise act on the document as they do unfiltered: a node moved
past a hidden sibling moves past it, and a visible node carries its whole subtree, hidden
children included.

#### Scenario: Arrow past hidden lines

- **WHEN** the caret is on the last line of a visible node and the next visible node is several
  hidden nodes below
- **THEN** a down arrow lands the caret on the next visible node's first line

#### Scenario: Moving a node carries its hidden children

- **WHEN** a visible node with hidden children is moved down
- **THEN** the node and its whole subtree move, and the hidden children stay hidden

### Requirement: A selection never spans hidden content

A gesture that would extend a selection past the last visible line of the run it started in SHALL
leave the selection unchanged and SHALL state why, in the same way a refused structural operation
does. Progressive Select All SHALL escalate within that run and stop there. Clearing the query is
the way to select across what the filter hid.

The refusal SHALL be stated once per gesture: holding the key down SHALL NOT repeat it.

#### Scenario: Extending a selection stops at the gap

- **WHEN** the caret is on the last visible line before hidden content and the selection is
  extended downward
- **THEN** the selection stops at that line, the hidden content is not covered, and a message
  says the selection cannot reach past the filter

#### Scenario: Select All stays inside the visible run

- **WHEN** Select All is escalated repeatedly inside a visible node with hidden siblings
- **THEN** it escalates no further than the visible run the caret is in

#### Scenario: Copying a selection beside hidden content takes only what is selected

- **WHEN** a selection covering two adjacent visible nodes is copied
- **THEN** the clipboard holds those two nodes and nothing that the filter hid

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

### Requirement: A query that matches nothing keeps the last view, and says so

When a query of two or more characters matches nothing in the scope, the view SHALL NOT change:
it SHALL keep showing the matches and paths of the last query that did match, and its marks SHALL
stay those of that query. A filter that rearranged the note on every mistyped character would
cost the reader their place for a keystroke.

The panel SHALL state that the query matches nothing, and the query field itself SHALL show that
it no longer matches, so the view is never silently answering a query the field no longer holds.

Where there is nothing to keep — the query is below the threshold, or none has matched since the
panel opened — the note SHALL render whole.

#### Scenario: A typo keeps the view still

- **WHEN** a character is added to a matching query so that it matches nothing
- **THEN** the same nodes stay visible with the same marks, and the panel states that the query
  matches nothing

#### Scenario: The field shows the miss

- **WHEN** the query matches nothing
- **THEN** the query field renders as not matching, distinctly from a query that does

#### Scenario: Removing the typo returns the matches

- **WHEN** the character that took the query past its last match is removed
- **THEN** the view is that query's matches again, and nothing moved while the typo stood

#### Scenario: Nothing has matched yet

- **WHEN** the first query typed into a freshly opened panel matches nothing
- **THEN** the note renders whole
