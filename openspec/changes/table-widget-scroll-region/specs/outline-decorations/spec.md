## MODIFIED Requirements

### Requirement: Guides coexist with native blockquote chrome and table scrolling
The guide mechanism SHALL NOT remove or replace Obsidian's native blockquote left-bar
rendering, and SHALL NOT disable a wide table's own horizontal scroll behavior.

A table SHALL scroll on an axis only when its own content exceeds the space available on that
axis. A table that fits its line SHALL NOT scroll on either axis, and SHALL render in the same
box stock Obsidian gives it. The vertical axis SHALL NEVER scroll: a table's rows are all shown.

Obsidian's own table-edit chrome — the add-row and add-column buttons and the row and column
drag handles — SHALL keep the size and the position relative to the table that stock Obsidian
gives it, and SHALL remain reachable, in outline mode as outside it.

#### Scenario: Blockquote native bar and guide render together
- **WHEN** a blockquote line also carries an active guide
- **THEN** both Obsidian's native colored left bar and the guide line render, neither
  replacing the other

#### Scenario: Wide table keeps its own scrollbar with a guide active
- **WHEN** a table wide enough to need horizontal scroll also carries an active guide
- **THEN** the table's own scrollbar remains functional (not the whole document becoming
  scrollable), and the guide still renders

#### Scenario: A table that fits its line does not scroll
- **WHEN** a table narrower than its line carries an active guide or marker
- **THEN** neither axis scrolls, no scrollbar is shown, and the widget occupies the same box it
  does with outline mode off

#### Scenario: A wide table scrolls sideways only
- **WHEN** a table wider than its line carries an active guide or marker
- **THEN** the horizontal axis scrolls the table's own content and the vertical axis does not
  scroll at all, with every row shown

#### Scenario: Native table-edit chrome stays put and stays reachable
- **WHEN** a table in outline mode is compared against the same table with outline mode off
- **THEN** the add-row button, the add-column button and both drag handles have the same size and
  the same offset from the table in both, and none of them is clipped away by the table's own
  scrolling

**Covered by**: `e2e/specs/51-guides-gradient.e2e.ts` ("blockquote: native colored bar
(::before) and our guide (::after) coexist, neither clobbers the other", "wide-table
fixture: guide renders AND the table keeps its own real horizontal scroll (not the whole
document)", "a table that fits its line scrolls on neither axis, and its native edit chrome keeps
its stock geometry", "widget-replaced atoms: callout/hr/html/table all get the guide after
overriding Obsidian's native contain:paint", "no !important/specificity fight resurrected:
position and background resolve as set, unbeaten by Obsidian's own CSS").
