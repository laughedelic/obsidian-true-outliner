## MODIFIED Requirements

### Requirement: One indentation grid for every kind

In outline mode, the distance between one tree level and the next SHALL be the same for every
kind, including list items. A list level SHALL step by the outline unit rather than by
Obsidian's own list-indent value, so that a node's rendered column is a function of its tree
depth alone and never of the kind that encodes it.

This SUPERSEDES the previous guarantee that a pure list renders byte-identical to
outline-mode-off. Byte-identity with stock Obsidian is now stated of outline mode OFF only:
with the mode off, every list — pure or not — SHALL render exactly as stock Obsidian renders
it, with no contribution from any decoration layer.

The grid SHALL be derived from a single unit value used by every layer that positions
anything: indentation, guides, markers, and any accent drawn on them. A layer SHALL NOT
compute a column from a second source.

The grid SHALL hold whatever a list's SOURCE indentation is made of. Obsidian resolves a tab or
exactly four spaces into one indent unit and renders the remainder at its literal width, so a
file indented in twos or threes walks right by a fraction of a level at a time; and with its
own "Show indentation guides" setting off it resolves nothing at all, not even four spaces.
Neither SHALL reach the rendered column: the plugin SHALL state a list line's indentation width
from the item's own depth rather than accept whatever the leading whitespace measured, so a
two-space file, a three-space file and a tab file render the same grid, with that setting on or
off.

A line written UNDER A LIST ITEM and not itself a list item takes the same guarantee by the other
half of the same rule. Its own source indentation is written to the item's content column, which
the depth contribution states a second time, so that whitespace SHALL contribute no width to the
rendered line. A paragraph, fence, table, quote or callout written as a child of a list item SHALL
therefore begin on its own depth's column, and SHALL begin on the same column whether the file
indented it with a tab or with any number of spaces.

A run that states a depth rather than restating one SHALL be left standing. A line under a heading
or at the top level takes its depth from its ancestor, so its leading whitespace is ordinary
content — at the top level it is also the only thing distinguishing an indented code block from a
paragraph — and SHALL render at the width of its own characters. Obsidian resolves such a run into
boxes of four columns each and states their width from its own list-indent value, which is wider
than the spaces inside them; that width SHALL NOT reach the rendered line, so every position in a
standing run renders at its own character's advance and a tab renders to its own tab stop. What
this costs against stock rendering — a narrower run, and a text column that moves left with it —
is accepted: the characters are what the run states, and they state it at their own size.

What a line carries BEYOND its node's own indentation is not structure either and SHALL be left
standing, as the characters it is: a line indented deeper than the node it belongs to — code
inside an indented fence, a paragraph's own continuation line — SHALL keep the surplus, so its
indentation relative to its own block survives, and SHALL render it at whatever those characters
measure in that line's own font. The plugin SHALL state no width for it, which is what keeps a
fence's own space advance and a tab correct without an exception for either.

A node that renders a BOX of its own puts that box on its depth's column and its content inside:
a fenced code block SHALL keep the internal padding Obsidian gives an unindented fence, which it
withholds from one written inside a list.

Obsidian draws the native caret, so every position a caret can reach SHALL remain drawable. A
node's own indentation is not one of them: it renders nothing, so the caret SHALL treat it as
chrome — motion and placement floored at it, exactly as they are at a list marker, and one step
across it rather than one press per character standing at the same column. A line whose content is
only that indentation SHALL still give the caret its own column to stand on, having no text to
stand against. What a line carries past its node's own indentation SHALL keep stock motion and
stock deletion, one character at a time. Where a caret lands otherwise is `content-space-caret`'s
to state.

What this does NOT change is the parse: which levels exist is Markdown's business and is
already decided by the time this layer runs.

#### Scenario: A list level and a heading level are the same distance

- **WHEN** a document contains a heading three tree levels deep and a list item three tree
  levels deep, in a file indented with tabs
- **THEN** both render at the same column, and each level of the list is one unit from the
  last — the same unit that separates the heading levels

#### Scenario: Ordered lists and task lists take the same grid

- **WHEN** a nested ordered list and a nested task list are open in outline mode
- **THEN** each of their levels steps by the same unit as a bullet list's

#### Scenario: A space-indented file takes the same grid as a tab-indented one

- **WHEN** the same list structure is written with tabs, with two spaces per level, and with
  three spaces per level
- **THEN** all three render every level on the same columns, one unit apart, with each item's
  marker on its own level's column

#### Scenario: The grid does not depend on Obsidian's indentation-guide setting

- **WHEN** a nested list is open in outline mode and Obsidian's own "Show indentation guides"
  setting is turned off
- **THEN** every level renders on exactly the columns it rendered on with the setting on

#### Scenario: A non-list child of a list item stands in one column

- **WHEN** a paragraph, a fenced code block, a table and a block quote are each written
  blank-separated under a list item, so each parses as its child
- **THEN** every one of them begins on that child depth's column — the same column a list item
  at that depth would begin on — with no second column between the item's and its own

#### Scenario: A tab-indented child and a space-indented child agree

- **WHEN** the same child of the same list item is written once indented with a tab and once
  with spaces
- **THEN** both begin on the same column

#### Scenario: A line indented deeper than its node keeps the surplus

- **WHEN** a block written under a list item holds a line indented further than the block's own
  first line — code inside a fence, or a paragraph's continuation line
- **THEN** the block begins on its own depth's column, and that line renders indented relative to
  the rest of the block by the width of its own surplus characters

#### Scenario: An indented fence keeps a fence's internal padding

- **WHEN** a fenced code block is written under a list item
- **THEN** its code sits the same distance inside its own box as the code of a fence written at
  the top level

#### Scenario: The caret stays drawable on a collapsed line

- **WHEN** the caret is placed at the start of a line whose run is collapsed, inside that run, or
  on the line Shift+Enter opens inside a list item
- **THEN** nothing between the caret's position and its line clips, so the native caret renders

#### Scenario: A child of a heading keeps its own leading whitespace

- **WHEN** a paragraph written with leading spaces sits under a heading, or at the top level
- **THEN** its whitespace stays in the rendering, and the line's text begins exactly that many
  character advances into the line

#### Scenario: A standing run of four columns or more steps one character at a time

- **WHEN** the caret walks the leading whitespace of a top-level line indented four columns or
  more
- **THEN** each press moves it by one space's own advance, with no position rendering at a box
  edge, and a click inside the run lands on the character it is over

#### Scenario: A tab-indented top-level line and a four-space one agree

- **WHEN** the same top-level line is written once indented with a tab and once with four spaces
- **THEN** both render their text on the same column

#### Scenario: Outline mode off is stock

- **WHEN** outline mode is turned off on a note containing a nested list
- **THEN** every list line renders exactly as stock Obsidian renders it — the same columns,
  the same bullet, the same guides — with no decoration contribution of any kind

#### Scenario: A note open without outline mode is unaffected by one that has it

- **WHEN** one note with outline mode on and one without are open at the same time
- **THEN** the note without it renders its lists exactly as stock Obsidian does

**Covered by**: `e2e/specs/56-list-grid.e2e.ts`; `e2e/specs/56-source-indent.e2e.ts` ("starts
every kind written under an item on the item's child column", "gives an indented fence the
internal padding an unindented one has", "keeps a fence's interior indentation at the width of its
own spaces", "starts a widget-rendered callout child on the same column", "keeps a line indented
deeper than its node, at the width of its own spaces", "leaves a child of a heading alone, whose
depth its whitespace never stated", "holds with Obsidian's own indentation guides turned off",
"puts a tab-indented child on the same column as a space-indented one", "draws nothing at all for
the run itself", "walks a line's surplus one character at a time", "crosses the node's own
indentation in one press, and draws the caret at both ends", "leaves deletion to stock, in the
surplus and in the run alike", "draws the caret on a line Shift+Enter opens, which is indentation
alone", "leaves the item's own indentation to the list rules", "touches nothing with outline mode
off"); `tests/decorate.test.ts` ("decorate: source indentation (indentCh)"); `e2e/specs/56-source-indent.e2e.ts` ("renders a
standing run at the width of its own characters", "walks a standing run one character at a time",
"puts a tab-indented top-level line on the same column as a four-space one").
