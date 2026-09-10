## MODIFIED Requirements

### Requirement: Depth is measured from the zoom root while zoomed
While zoomed, the indentation contribution and the indentation guides of every visible line SHALL
be computed from the line's depth RELATIVE TO THE ZOOM ROOT: the zoom root renders at depth 0, its
children at depth 1, and so on. Guides for levels above the zoom root SHALL NOT be rendered.

This SHALL hold for every render the view produces, including the transient ones a caret
occasions. A PROVISIONAL POSITION (`outline-decorations`) inside the zoomed subtree SHALL NOT
change any visible line's depth or guide columns, whether it stands for a new node or bisects
one; while it is open the view SHALL render exactly as it does with the caret elsewhere, plus the
position's own row.

One exception SHALL hold and SHALL be visible rather than hidden: a list item's own native
indentation is Obsidian's rendering, driven by raw markdown nesting, and is never modified by
this plugin. A zoom root that is a list item therefore keeps that native indentation, and only
this plugin's own contribution is re-based.

#### Scenario: A deep heading renders at the left margin
- **WHEN** the user zooms into a third-level heading nested under two ancestors
- **THEN** the heading renders with no indentation contribution from this plugin and its children
  render one level in

#### Scenario: Guides above the root are gone
- **WHEN** the user zooms into a node several levels deep
- **THEN** no guide column is drawn for the ancestor levels that are no longer visible

#### Scenario: Re-basing is reversed on zoom out
- **WHEN** the user zooms in and then clears the zoom
- **THEN** every line's indentation and guides are identical to what they were before the zoom

#### Scenario: A position below a node moves nothing
- **WHEN** the view is zoomed to a node with hidden ancestors and the user opens a provisional
  position at the end of a node inside it
- **THEN** every other visible line keeps the indentation and guide columns it had before the
  keypress, and no guide column appears for a hidden ancestor

#### Scenario: A position interior to a node moves nothing
- **WHEN** the view is zoomed to a node with hidden ancestors and the user opens a provisional
  position interior to a multi-line node inside it
- **THEN** the visible subtree keeps its re-based depths, rather than shifting one level right
  per hidden ancestor

#### Scenario: The view is unchanged when the caret leaves
- **WHEN** the caret moves off a provisional position inside a zoomed subtree without typing
- **THEN** every visible line renders exactly as it did before the position was opened
