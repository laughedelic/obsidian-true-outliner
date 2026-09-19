## ADDED Requirements

### Requirement: A heading's marker names its level, in a chosen style
A heading's marker SHALL name the heading's level, 1 to 6, as well as its kind. It SHALL be
drawn as a heading glyph and a level digit, and every level SHALL draw a different mark, so no
two of the six levels are confusable.

Two settings SHALL choose the style, independently of each other:

- The **glyph**: the letter `H`, or `#` (markdown's own heading syntax).
- The **level digit's position**: *beside* the glyph, standing as tall as it, or as a
  *subscript*, smaller, below and to the right of it.

The four combinations SHALL each draw at weights fixed by the style itself; no setting SHALL
adjust a style's weights. The defaults SHALL be `H`, with the digit *beside* it.

The level SHALL change the ink inside the marker's box and nothing else. At every level and in
every style, the box SHALL be the one every other marker on that surface is drawn in, as
`Markers are fixed-size and coexist with native and guide chrome` already requires. The ink SHALL
stay inside that box. No heading mark SHALL become the widest mark the marker gutter is derived
from (`The marker gutter is derived from the marks it must hold`), so neither the gutter nor any
line's text moves when a style or a level changes.

The digits SHALL be drawn shapes, not type. A heading's mark SHALL NOT depend on the reader's
interface font or theme font, and SHALL be identical, point for point, in every theme.

Every surface that draws a node's kind mark SHALL draw the same level mark for the same heading
level and style. Those surfaces are the editor's marker, the backlinks footer's marker and
inline lineage segments, and the zoom trail's segments.

The mark SHALL follow the document. When a heading's level changes, the next render SHALL draw
the new level's mark, even though the node's kind and column are unchanged.

#### Scenario: Six levels, six marks
- **WHEN** a note holds one heading at each level from H1 to H6, in outline mode
- **THEN** each heading's marker is drawn differently from the other five, and each names its
  own level

#### Scenario: The mark follows a level change
- **WHEN** the reader turns `## Title` into `### Title` by typing a third `#`
- **THEN** the heading's marker names level 3 on the next render, not level 2

#### Scenario: The box is the same at every level and in every style
- **WHEN** H1 and H6 headings and a paragraph are rendered under each of the four styles
- **THEN** every marker's rendered width and height are identical to the paragraph's, and each
  heading mark's ink lies inside its box

#### Scenario: The two settings choose glyph and position independently
- **WHEN** the glyph setting is changed from `H` to `#` with the digit's position left as
  *subscript*
- **THEN** every heading's marker is drawn with `#`, its digit still a subscript

#### Scenario: A fresh install draws `H` with the digit beside it
- **WHEN** the plugin loads with no saved value for either setting
- **THEN** heading markers draw `H`, with the level digit beside it at the same height

#### Scenario: The gutter does not move
- **WHEN** the style changes between any two of the four styles
- **THEN** no line's text moves, and the widest mark the gutter is derived from is unchanged

#### Scenario: A style change reaches every surface without a rebuild
- **WHEN** either setting is changed while a note is open in outline mode, with its backlinks
  footer showing a heading ancestor and a zoom trail naming one
- **THEN** the editor's heading markers, the footer's heading marks and the trail's heading
  segment all draw the new style on the next render

#### Scenario: A heading's mark is the same in every theme
- **WHEN** the same heading marker is drawn under two themes with different interface fonts
- **THEN** its drawn geometry is identical in both

### Requirement: A marker states the kind it draws
Every marker this layer draws for a node SHALL carry that node's kind as a `data-kind` attribute,
on plain lines as well as widget-replaced atoms. A heading's marker SHALL also carry its level as
a `data-level` attribute. The attributes SHALL always agree with what the marker draws. They SHALL
NOT change how anything renders, and this layer's own styles SHALL NOT depend on them.

#### Scenario: A plain-line marker names its kind
- **WHEN** a paragraph and a code fence render markers in outline mode
- **THEN** their markers carry `data-kind="paragraph"` and `data-kind="code"` respectively

#### Scenario: A heading's marker names its level
- **WHEN** an H3 heading renders its marker
- **THEN** the marker carries `data-kind="heading"` and `data-level="3"`, and draws the level-3
  mark
