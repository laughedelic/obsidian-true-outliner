## ADDED Requirements

### Requirement: A list marker's surplus whitespace is marked

In outline mode, the whitespace a list marker carries beyond the one character it needs
SHALL be marked on the line: the run past the first space after `-`, `1.` or a task
marker's `]`, on the item's first line. The mark SHALL keep the run's width, so a
whitespace-only run stays visible, and SHALL carry a title naming what the run is and that
a press on it, or Backspace at the start of the text, removes it.

The mark SHALL sit between the marker gutter and the item's text: the marker and its own
space take the gutter exactly as on a one-space line, the mark begins where a one-space
item's text begins, and the item's text begins where the mark ends. A highlight inside the
gutter's own slack, between a bullet and text that had not moved, marked a column the caret
cannot reach; the text moving right by the run's width is the point, since that is where
the item's content column is.

A press on the mark SHALL delete the run and leave the caret at the item's content start,
as one undo step, on a mouse and on a touch screen alike; the press SHALL NOT also place a
caret from its own coordinates.

Live Preview draws the run as blank whatever its width, while the run sets the item's
content column, so a child indented short of it is a sibling to Obsidian and its deeper
descendants after a blank line an indented code block
(`docs/research/list-marker-content-column`). The mark puts the cause on the line that has
it. It is a decoration like every other here: scoped to outline mode, never mutating the
document, and absent from a nested per-cell editor.

#### Scenario: Every marker shape with a surplus is marked, and a one-space marker is not

- **WHEN** a note holds `- a`, `-  b`, `1.  c`, `- [ ]  d` and `-   e` with outline mode on
- **THEN** the first line carries no mark, each of the other four carries exactly one, each
  mark has a non-zero width, and the mark on `-   e` is wider than the mark on `-  b`

#### Scenario: The mark is an outline-mode decoration

- **WHEN** outline mode is off for the note
- **THEN** no line carries the mark, and turning the mode on renders it without any
  document change

#### Scenario: The mark follows the gutter and the text follows the mark

- **WHEN** `- a`, `-  b` and `-    e` are rendered with outline mode on
- **THEN** each mark's left edge is where `a`'s text begins, and each marked item's text
  begins at its mark's right edge

#### Scenario: A press on the mark removes the run

- **WHEN** the mark on `-    e` is pressed
- **THEN** the line reads `- e`, the caret sits at its content start, no mark remains, and
  one undo restores the line

#### Scenario: Removing the surplus removes the mark

- **WHEN** Backspace at `-  b`'s content start deletes the surplus space
- **THEN** the line reads `- b` and carries no mark

## MODIFIED Requirements

### Requirement: A list item's caret renders on the item's own text column

Where a caret sits at a list item's content start, it SHALL render on that item's own text
column — the column its first character occupies — and this SHALL hold when the item is
EMPTY, so that the caret does not move when the first character is typed. It SHALL hold for
an unordered item and for an ordered item, at every nesting depth, and independently of the
font the theme uses.

The rule is stated against the item's own text column rather than against a fixed offset,
because that column is what a reader compares the caret to. Where a marker is wider than the
gutter the text column is the marker's own right edge, and the caret follows it there — the
same wide-marker exception this capability already states for the text column itself.

This is a rendering requirement about where the caret is PAINTED, and carries no claim about
which document positions a caret may occupy; `content-space-caret` owns that and is unchanged
by it.

Nothing else this capability positions SHALL move to achieve it, with TWO stated exceptions. A
marker's own column, an item's text column, the stated hanging indent and the column a
soft-wrapped row lands on SHALL be identical before and after, for every list kind and at
every depth — including a marker followed by a tab, which is ordinary markdown. Where the
caret cannot be brought to such an item's text column without moving that column, the column
wins and the caret is left where it was.

A marker followed by MORE than one space is the second exception, since the surplus is now
marked (the surplus-whitespace requirement of this capability): the marker and its first space
take the gutter as on every other line, the marked surplus follows the gutter, and the item's
text begins after it — one marked space right of a one-space sibling's text, where the item's
content column actually is. The caret at that item's content start then renders on that text,
where before it stopped short of it.

The exception: an ordered item whose marker is WIDER than the gutter SHALL begin its text
where its own number ends, rather than one half-marker-icon further right. The number is
shifted onto its column by a transform, which moves ink and not layout, so that item's text
previously began at a point neither the number nor the grid names — the untransformed box's
edge. This SHALL close that gap. An ordered item whose marker fits the gutter is unaffected,
its text column being the gutter either way.

#### Scenario: An empty bullet item's caret is where its first character will be

- **WHEN** an empty `- ` item is the caret's own line, at the top level and again nested two
  levels deep
- **THEN** at each depth the caret renders on that item's own text column, one marker gutter
  right of its depth column, and not against the bullet

#### Scenario: Typing the first character does not move the caret

- **WHEN** a character is typed into an empty list item
- **THEN** the character renders where the caret already was, and the caret advances by that
  character's own width rather than jumping to a new column

#### Scenario: An empty ordered item's caret takes the same column as a bullet's

- **WHEN** an empty `2. ` item and an empty `- ` item sit at the same depth
- **THEN** both carets render on the same column, which is that depth's own text column

#### Scenario: A marker with extra whitespace keeps its own column

- **WHEN** a list contains `- one`, `-  two` and `-\tthree`
- **THEN** the two-space item's text begins one marked space right of the one-space item's
  text — its own content column, now visible — and the tab-separated item begins where its
  own tab stop puts it, not moved to make room for the caret

#### Scenario: An item with content is unchanged

- **WHEN** the caret is at the content start of a list item that has text
- **THEN** it renders on the same column as that text's first character, exactly as it did
  before this requirement existed

#### Scenario: The grid this requirement rides on does not move

- **WHEN** a document containing bullet, ordered and task items at several depths, with
  soft-wrapped and hard-continued items among them, is rendered
- **THEN** every marker's column, every item's text column, every stated hanging indent and
  every wrapped row's column is what it was before this requirement existed — save the one
  stated exception below

#### Scenario: A wide ordered marker's text follows its own number

- **WHEN** a list contains a `9. ` item and a `10. ` item at the same depth
- **THEN** both numbers still begin on the same left edge, the `10. ` item's text still begins
  further right than the `9. ` item's, and it begins where its own number ends rather than a
  half-marker-icon beyond it
