## ADDED Requirements

### Requirement: The marker gutter is derived from the marks it must hold

The marker gutter — the room reserved between a depth's column and the start of that depth's
text — SHALL be derived from the marks that have to fit inside it, rather than chosen
independently of them.

The derivation SHALL be: **the greatest distance any qualifying mark's ink reaches right of the
column, plus one stated visual gap.** A mark qualifies when this layer positions it on the
column and its width does not depend on its own content — the synthetic block marker, an
unordered list item's bullet, a task item's checkbox, and a **single-digit** ordered number.
The stated gap SHALL be one value for every kind, so that what varies between kinds is the
width of the mark and never the space after it.

An ordered number of two or more digits SHALL NOT participate in the derivation. Such a number
is permitted to exceed the gutter and lean right into the space its own text reserves, as the
column requirement already provides; its row's text therefore begins further right than its
siblings', and that SHALL be accepted rather than corrected. Widening the gutter so that the
widest possible number fits is explicitly rejected: it would loosen every ordinary row to spare
an occasional one, which is the opposite of what the gutter is being derived for.

The measurements the derivation rests on SHALL be taken in ONE pass, across the bundled themes,
against the rules currently in force. A value recorded by an earlier investigation SHALL NOT be
combined with one taken here — the marks are positioned by rules that have changed since, so
figures from different passes do not describe the same rendering and cannot be compared.

Every surface that draws the outline's chrome SHALL take its gutter from this derivation applied
to the marks that surface actually draws. A surface drawing a subset of the marks, or drawing
them at a different size, MAY therefore arrive at a different gutter; where two surfaces do,
every expression that positions a mark relative to the column SHALL read the gutter from the
shared custom property rather than restating its value, so that the mark's visible centre stays
on the column on both.

#### Scenario: Text sits one stated gap from every ordinary mark

- **WHEN** a paragraph, a bulleted item, a task and a single-digit ordered item render at the
  same depth
- **THEN** each one's text begins the same stated gap after the right edge of its own mark's
  ink, and all four texts begin on the same column

#### Scenario: A wide ordered number pushes only its own text

- **WHEN** a list contains both `1.` and `10.` items
- **THEN** both numbers share one left edge, the two-digit number's own text begins further
  right than the single-digit number's, and neither number overlaps its own text

#### Scenario: Tightening the gutter does not move the grid

- **WHEN** the derived gutter is smaller than the previous value
- **THEN** every depth's column is where it was, each level remains one unit from the next, and
  only the distance between a mark and its own text changes

#### Scenario: A surface with smaller marks keeps its marks on the column

- **WHEN** a surface renders the outline's chrome with marks smaller than the editor's and
  derives a smaller gutter from them
- **THEN** every mark's visible centre still coincides with its own depth's column

## MODIFIED Requirements

### Requirement: Markers are fixed-size and coexist with native and guide chrome
A marker's size SHALL NOT vary with the kind, heading level, or font size of the line it sits
on: every marker a surface draws SHALL render at one size. A surface MAY choose what that size
is, including expressing it relative to its own text, provided the size is the same for every
line that surface renders — the invariant is that a heading's marker is no larger than a
paragraph's, not that any particular unit is used to say so.

A marker SHALL NOT remove, replace, or visibly collide with Obsidian's native blockquote bar,
the CSS containment/specificity rules widget atoms carry, or Obsidian's native fold chevron on
a heading.

#### Scenario: Marker size is font-size-independent
- **WHEN** a marker renders on a heading line and on a paragraph line
- **THEN** its rendered width and height are identical despite the heading's larger font

#### Scenario: Blockquote native bar and marker coexist
- **WHEN** a blockquote line also carries a marker
- **THEN** both Obsidian's native colored bar and the marker render, neither clobbering the
  other

#### Scenario: A depth-0 widget atom's marker is not clipped
- **WHEN** a table with no ancestor (tree depth 0) renders a marker
- **THEN** the marker is fully visible, not clipped by Obsidian's native `contain: paint`
  containment

#### Scenario: Fold chevron stays clear of the marker and any active guide
- **WHEN** a heading has a foldable child, so Obsidian renders its native fold chevron
- **THEN** the chevron does not overlap the heading's own marker or an ancestor's guide
  line passing through the same row
