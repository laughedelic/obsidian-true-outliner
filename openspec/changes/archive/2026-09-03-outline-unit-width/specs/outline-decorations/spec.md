## MODIFIED Requirements

### Requirement: One grid, one unit, from one declaration

The grid SHALL be derived from a single unit value used by every layer that positions
anything: indentation, guides, markers, and any accent drawn on them. A layer SHALL NOT
compute a column from a second source.

That single value SHALL be published as a custom property, declared **once**, at a scope every
surface that draws the outline's chrome inherits from. A surface SHALL NOT declare its own, and
SHALL NOT fall back to a literal when reading it: a fallback is a second copy of the value, and
it is inert exactly until the declaration changes, at which point the layer holding it silently
keeps the old grid while every other layer moves.

Because the value is a property rather than a constant, overriding that one declaration SHALL
retarget the whole grid — every depth's column, every guide, every marker, every hanging
indent, and the native list geometry the plugin drives from the same value — on **every**
surface at once. This is a supported adjustment, not a side effect: a reader who wants a wider
or narrower outline SHALL be able to get one from a stylesheet alone, with no plugin setting
and without either surface knowing.

No layer SHALL hold the unit's value in any other form. In particular a component that computes
a position outside CSS SHALL refer to the property rather than to a number equal to it, since
a number cannot follow an override.

The unit SHALL be expressed in a unit of length that does not resolve against the font size of
the line it is used on, so that a level's width is the same under a heading as under a
paragraph.

#### Scenario: A heading, a paragraph and a list item at one depth share a column

- **WHEN** a heading, a paragraph and a list item render at the same tree depth
- **THEN** all three render every level on the same columns, one unit apart

#### Scenario: Overriding the one declaration moves every column on both surfaces

- **WHEN** a stylesheet overrides the unit's custom property at the scope it is declared at
- **THEN** in the editor and in the backlinks footer alike, every depth's column, marker and
  text moves to the overridden step, and each level remains exactly one overridden unit from
  the last

#### Scenario: A level's width does not change with the line's font size

- **WHEN** a level renders under a heading and the same level renders under a paragraph
- **THEN** both step by the same distance, despite the heading's larger font

#### Scenario: The mark-to-text distance is unchanged by the unit

- **WHEN** the unit is widened
- **THEN** every mark stays on its own depth's column and every row's text begins the same
  distance after it as before, the gutter being derived from the marks it holds rather than
  from the unit
