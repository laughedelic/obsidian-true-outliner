# Spec Delta

## MODIFIED Requirements

### Requirement: Block markers identify node kind, gated by a visibility setting
Every marker-eligible node's true first line SHALL render a synthetic marker distinct per
node kind. List items SHALL NEVER receive a synthetic marker — their native bullet or number
already signals the node, and the plugin styles and positions that native marker rather than
adding one of its own. A marker SHALL appear only on a node's own first line, never on
continuation lines or blank gap lines. Which kinds actually render a marker SHALL be
governed by the `markerVisibility` setting (`'all'`, `'with-children'`, or
`'headings-and-paragraphs'`); the space reserved for a marker SHALL remain constant
regardless of this setting, so toggling it changes only whether the icon is drawn, never
text position. `markerVisibility` SHALL NOT hide a list item's native marker at any value.

A list item's native marker SHALL be given a visual weight comparable to a synthetic marker's,
and SHALL take its colour from the same token the synthetic markers use, so a snippet retunes
both together.

A paragraph holding a misplaced block id (`misplaced-block-ids`) is the one exception to the
per-kind marker: its marker SHALL be drawn as a warning glyph in the warning colour, in the same
slot and at the same size, and SHALL be drawn at every `markerVisibility` value. The glyph is the
misplaced id's, not a new node kind, so the marker still names the node's kind.

#### Scenario: Every eligible kind gets a distinct marker under 'all'
- **WHEN** `markerVisibility` is `'all'` and a document contains a heading, paragraph, code
  fence, table, callout, quote, HTML block, and horizontal rule
- **THEN** each renders its own kind-specific marker on its first line, and none render on
  any continuation or gap line

#### Scenario: List items are unchanged
- **WHEN** a list item is rendered in outline mode, at any `markerVisibility` setting
- **THEN** `markerVisibility` changes nothing about it: no synthetic marker is ever added,
  and its native bullet or number is never hidden

#### Scenario: A native bullet carries a marker's weight
- **WHEN** a list item and a paragraph are visible in the same document
- **THEN** the bullet reads at a comparable visual weight to the paragraph's marker, and both
  resolve their colour from the same token

#### Scenario: 'with-children' hides leaf markers, including atoms
- **WHEN** `markerVisibility` is `'with-children'`
- **THEN** only nodes with at least one child render a marker; every atom (leaf by
  construction) renders none, regardless of kind

#### Scenario: 'headings-and-paragraphs' keys off kind, not instance state
- **WHEN** `markerVisibility` is `'headings-and-paragraphs'`
- **THEN** every heading and paragraph renders a marker whether or not it currently has
  children, and no atom kind ever renders one

#### Scenario: Hiding a marker never reflows text
- **WHEN** `markerVisibility` changes such that a previously-visible marker is hidden
- **THEN** the line's indentation (padding-left/margin-left) is unchanged; only the marker
  icon's presence changes

#### Scenario: Marker setting changes take effect without a rebuild
- **WHEN** `markerVisibility` is changed while a note is open in outline mode
- **THEN** the next render reflects the new setting, including for widget-replaced atoms
  whose decoration output would otherwise be byte-identical across the change

#### Scenario: A misplaced id's paragraph draws the warning glyph
- **WHEN** a paragraph holding a misplaced `^foo` renders in outline mode, under any
  `markerVisibility`
- **THEN** its marker is the warning glyph in the paragraph marker's slot, and the line's text
  starts where it would under the paragraph's own marker
