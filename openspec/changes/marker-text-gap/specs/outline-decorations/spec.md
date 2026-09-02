## ADDED Requirements

### Requirement: The marker gutter is derived from the marks it must hold

The marker gutter — the room reserved between a depth's column and the start of that depth's
text — SHALL be derived from the marks that have to fit inside it, rather than chosen
independently of them.

The derivation SHALL be: **the greatest distance any qualifying mark's ink reaches right of the
column, plus one stated visual gap.** A mark qualifies when this layer positions it on the
column and its width does not depend on its own content — the synthetic block marker, an
unordered list item's bullet, a task item's checkbox, and a **single-digit** ordered number.

The stated gap SHALL be one value, applied to the widest qualifying mark. What therefore varies
between kinds is the room left beside a mark narrower than that one, and never the column its
text begins on: one gutter and marks of differing widths cannot deliver both a constant gap and
a shared column, and the shared column is the one this layer is for.

A qualifying mark whose size the READER'S ENVIRONMENT sets SHALL enter the derivation as that
live value rather than as a number recorded from one environment. A checkbox is such a mark: it
is drawn at the theme's own size, which the host resolves differently per platform, so a
constant taken from one platform is wrong on another — and wrong in this layer's characteristic
way, the mark rendering perfectly while its own text leaves the shared column.

A qualifying mark whose ink the reader's FONT draws — a single-digit ordered number — CANNOT be
a term in the derivation, its width being unknown before layout. Such a mark is guaranteed the
FLOOR below rather than the stated gap, and the guarantee that matters for it is the shared
column, not the distance. Where a font makes such a mark wider than the derivation allowed for,
it spends part of the stated gap, and only once it would cross the floor does it leave the
column — which the requirement's own scenario catches.

The stated gap SHALL NOT be smaller than the advance of one space in the reader's font. This is
a floor the existing mechanism sets rather than a preference: every mark whose row is written
with a single space after it is sized as "the gutter, less one space", with that space
completing the run, so a gap below a space's own advance drives the sizing negative and the
mark overflows into the column its text was to begin on.

Where the native rendering of a mark states its own distance between that mark and its text,
that distance SHALL be neutralised rather than left to compete with the derived gap. A native
value left in place is inert only while the derived gutter happens to exceed it, and the kind
carrying it then leaves the shared column at whatever gutter stops exceeding it — a failure
visible as a few pixels of drift, with nothing in the rendering to attribute it to.

An ordered number of two or more digits SHALL NOT participate in the derivation. Such a number
is permitted to exceed the gutter and lean right into the space its own text reserves, as the
column requirement already provides; its row's text therefore begins further right than its
siblings', and that SHALL be accepted rather than corrected. Widening the gutter so that the
widest possible number fits is explicitly rejected: it would loosen every ordinary row to spare
an occasional one, which is the opposite of what the gutter is being derived for.

The measurements the derivation rests on SHALL be taken in ONE pass, across the bundled themes
AND the supported platforms, against the rules currently in force. A value recorded by an earlier investigation SHALL NOT be
combined with one taken here — the marks are positioned by rules that have changed since, so
figures from different passes do not describe the same rendering and cannot be compared.

Every surface that draws the outline's chrome SHALL take its gutter from this derivation applied
to the marks that surface actually draws. A surface drawing a subset of the marks, or drawing
them at a different size, MAY therefore arrive at a different gutter; where two surfaces do,
every expression that positions a mark relative to the column SHALL read the gutter from the
shared custom property rather than restating its value, so that the mark's visible centre stays
on the column on both.

#### Scenario: Text sits at least one stated gap from every ordinary mark

- **WHEN** a paragraph, a bulleted item, a task and a single-digit ordered item render at the
  same depth
- **THEN** all four texts begin on the same column, and no mark's ink comes closer to its own
  text than the stated gap — the widest of the four sitting exactly that distance from it

#### Scenario: A wide ordered number pushes only its own text

- **WHEN** a list contains both `1.` and `10.` items
- **THEN** both numbers share one left edge, the two-digit number's own text begins further
  right than the single-digit number's, and neither number overlaps its own text

#### Scenario: Tightening the gutter does not move the grid

- **WHEN** the derived gutter is smaller than the previous value
- **THEN** every depth's column is where it was, each level remains one unit from the next, and
  only the distance between a mark and its own text changes

#### Scenario: A platform that sizes a mark differently keeps its text on the column

- **WHEN** the same outline renders where the host resolves a qualifying mark's own size to a
  larger value than the environment the derivation was measured in
- **THEN** the gutter grows with that mark, and every kind's text still begins on one column

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
