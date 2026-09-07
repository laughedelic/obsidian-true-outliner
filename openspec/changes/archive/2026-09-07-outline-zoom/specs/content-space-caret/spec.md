## ADDED Requirements

### Requirement: Caret motion is confined to an active zoom scope
While a zoom scope is active (`outline-zoom`), every motion this capability specifies SHALL be
bounded by the visible range: a motion whose computed target lies outside the zoom root's whole
subtree SHALL leave the caret where it is, rather than moving to the scope's boundary or into
hidden content.

The bound SHALL apply to every motion equally — vertical, horizontal, and the document-extent
motions — so that no gesture places the caret on a line that is not rendered.

Inside the scope, every rule of this capability SHALL hold unchanged: gap lines and marker
prefixes stay unaddressable, gaps are still crossed in one press, the goal column is still
preserved, and Home/End still act within the caret's own line.

The zoom root's own trailing gap is inside the visible range and SHALL be treated exactly as any
other gap: not addressable, resolved through ownership to the node that precedes it.

#### Scenario: Down arrow on the last visible line does not move
- **WHEN** the caret is on the last content line inside the zoom scope and the user presses the
  down arrow
- **THEN** the caret does not move, and no hidden line receives it

#### Scenario: Up arrow on the zoom root's own line does not move
- **WHEN** the caret is on the zoom root's own first line and the user presses the up arrow
- **THEN** the caret does not move

#### Scenario: Horizontal motion stops at the scope's start
- **WHEN** the caret is at the first addressable position inside the scope and the user presses
  the left arrow
- **THEN** the caret does not move into hidden content

#### Scenario: Motion inside the scope is unchanged
- **WHEN** the caret moves between nodes strictly inside the zoom scope, including across gap
  lines
- **THEN** every motion behaves exactly as it does with no zoom active
