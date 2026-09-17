## MODIFIED Requirements

### Requirement: Guides coexist with native blockquote chrome and table scrolling
The guide mechanism SHALL NOT remove or replace Obsidian's native blockquote left-bar
rendering, and SHALL NOT disable a wide table's own horizontal scroll behavior.

A table SHALL scroll on an axis only when its own content exceeds the space available on that
axis. A table that fits its line SHALL NOT scroll on either axis, and SHALL render in the same
box stock Obsidian gives it. The vertical axis SHALL NEVER scroll: a table's rows are all shown.

A table's own content SHALL NOT render in the column its node's marker occupies, at any scroll
position.

Obsidian's own table-edit chrome — the add-row and add-column buttons and the row and column
drag handles — SHALL keep the size and the position relative to the table that stock Obsidian
gives it, at any table width and at any scroll position. On a table that fits its line, all four
SHALL remain reachable. The row drag handle, which sits on the side the previous requirement
reserves for the marker, MAY be clipped.

#### Scenario: Blockquote native bar and guide render together
- **WHEN** a blockquote line also carries an active guide
- **THEN** both Obsidian's native colored left bar and the guide line render, neither
  replacing the other

#### Scenario: Wide table keeps its own scrollbar with a guide active
- **WHEN** a table wide enough to need horizontal scroll also carries an active guide
- **THEN** the table's own scrollbar remains functional (not the whole document becoming
  scrollable), and the guide still renders

#### Scenario: A table that fits its line does not scroll
- **WHEN** a table narrower than its line carries any of the outline chrome that reaches outside a
  widget's own box — a guide, a marker, or block-selection chrome
- **THEN** neither axis scrolls, no scrollbar is shown, and the widget occupies the same box it
  does with outline mode off

#### Scenario: A wide table scrolls sideways only
- **WHEN** a table wider than its line carries any of that chrome
- **THEN** the horizontal axis scrolls the table's own content and the vertical axis does not
  scroll at all, with every row shown

#### Scenario: A selected table with no guide and no marker behaves the same
- **WHEN** a table is covered by a block selection while marker visibility excludes it and guides
  are off, so block-selection chrome alone reaches outside the widget's box
- **THEN** it scrolls exactly as the two scenarios above require

#### Scenario: Native table-edit chrome stays put
- **WHEN** a table in outline mode is compared against the same table with outline mode off
- **THEN** the add-row button, the add-column button and both drag handles have the same size and
  the same offset from the table in both

#### Scenario: A fitting table's chrome is reachable
- **WHEN** a table narrower than its line carries outline chrome
- **THEN** the add-row button, the add-column button and the column drag handle are inside the
  table's own scrollport rather than clipped or scrolled away from

#### Scenario: A wide table's add buttons follow the table, not the pane
- **WHEN** a table wider than its line is scrolled to either end
- **THEN** the add-column button sits at the table's own trailing edge and the add-row button spans
  the table's own width, at every scroll position and whatever the pane's width

#### Scenario: A scrolled wide table does not render under its own marker
- **WHEN** a table wider than its line is scrolled to its far edge
- **THEN** no part of the table renders in the column its marker occupies

**Covered by**: `e2e/specs/51-guides-gradient.e2e.ts` ("blockquote: native colored bar
(::before) and our guide (::after) coexist, neither clobbers the other", "wide-table
fixture: guide renders AND the table keeps its own real horizontal scroll (not the whole
document)", "a table that fits its line scrolls on neither axis, and its native edit chrome keeps
its stock geometry", "widget-replaced atoms: callout/hr/html/table all get the guide after
overriding Obsidian's native contain:paint", "no !important/specificity fight resurrected:
position and background resolve as set, unbeaten by Obsidian's own CSS").
