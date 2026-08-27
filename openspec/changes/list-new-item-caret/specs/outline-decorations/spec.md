## ADDED Requirements

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

Nothing else this capability positions SHALL move to achieve it, with ONE stated exception. A
marker's own column, an item's text column, the stated hanging indent and the column a
soft-wrapped row lands on SHALL be identical before and after, for every list kind and at
every depth.

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
