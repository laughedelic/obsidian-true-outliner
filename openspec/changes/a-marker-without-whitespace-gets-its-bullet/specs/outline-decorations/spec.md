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

Where Live Preview draws NO marker glyph for a line our tree reads as a bullet item — a marker
with no whitespace after it, which the mode's own list rule declines — the plugin SHALL supply
the bullet in the element and class Obsidian uses for its own, over the marker's single
character. A supplied bullet is NOT a synthetic marker: it is outside `markerVisibility`'s
jurisdiction, reserves no gutter of its own, and renders identically to the native bullet it
stands in for. An ordered marker SHALL be left alone, its digits being ordinary text on the line
whether or not a token was emitted.

*(Amendment 2026-09-17, `a-marker-without-whitespace-gets-its-bullet`: every clause above assumed
the native element exists for any list item, and on this one shape it does not. Measured in
`docs/research/marker-without-trailing-space`: the mode's `listRE` requires whitespace after a
marker, so a marker at end of line gets no list token and no `.list-bullet`, while our parser and
Obsidian's own reading mode both read an empty item.)*

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

#### Scenario: A marker with no whitespace after it still shows a bullet
- **WHEN** a line holding nothing but a bullet marker sits between two ordinary items in outline
  mode, and Obsidian's own rendering leaves that marker bare
- **THEN** the line shows a bullet on the column its siblings' bullets sit on, and typing one
  space after the marker hands the line back to Obsidian's own bullet without the line ever
  carrying two

**Covered by**: `e2e/specs/58-supplied-bullet.e2e.ts` ("is left bare by Obsidian itself, which is
the shape being covered", "gets one from us in outline mode, on the column its siblings sit on",
"gives way the moment the marker earns Obsidian's own"); `tests/decorate.test.ts` ("clears
hasNativeMarker on a marker Live Preview draws no glyph for").
