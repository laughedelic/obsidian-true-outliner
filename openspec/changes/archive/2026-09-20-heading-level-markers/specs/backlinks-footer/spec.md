## MODIFIED Requirements

### Requirement: A reference renders in its lineage, with the outline's own notation

Within a group, each reference SHALL render as the referencing node preceded by the lineage
that leads to it, where lineage is the collapsed ancestor chain defined by `tree-projection`.
Two references sharing ancestors SHALL share the lineage that leads to their common branch
point rather than each repeating it.

Node kind notation — the marker drawn beside a node — SHALL be identical between a lineage
element and a referencing node: the same glyph for the same kind and, for a heading, the same
level, at the same size and in the same colour. It SHALL also be the glyph the editor draws for
that kind and level, in the heading marker style the reader has chosen
(`outline-decorations`, "A heading's marker can name its level, in a chosen style"). Emphasis
SHALL be carried by text treatment alone, with lineage rendered dimmer than the referencing node
it leads to.

Every element of a collapsed chain SHALL carry its own kind's marker: the first element's is the
row's own marker, and each subsequent element's is drawn immediately before that element's text.
No mark SHALL be drawn between two elements — they are separated by space alone.

#### Scenario: Shared ancestors are not repeated

- **WHEN** two references in one note sit under the same heading
- **THEN** that heading renders once, with both references below it

#### Scenario: An unbranching chain renders as one lineage line

- **WHEN** a reference sits four levels deep with no other reference in that note
- **THEN** its four ancestors render as a single lineage line rather than four rows

#### Scenario: Markers do not encode emphasis

- **WHEN** a lineage element and a referencing node are of the same kind, and if headings, of
  the same level
- **THEN** their markers are drawn identically, and only the text differs in colour

#### Scenario: A heading's level reaches the footer

- **WHEN** a reference sits under an H2 ancestor, beside a referencing H3 node
- **THEN** the ancestor's mark names level 2 and the node's names level 3, each identical to the
  mark the editor draws for that level in the chosen style

#### Scenario: Every ancestor on a collapsed line is named

- **WHEN** a lineage row carries three ancestors of two different kinds
- **THEN** each is preceded by its own kind's marker — the first in the row's marker position,
  the other two inline — and no separator glyph is drawn between them

**Covered by**: `e2e/specs/75-footer-behaviour.e2e.ts` ("collapses an unbranching chain to one
lineage row above its reference", "renders a shared ancestor once, with both references below
it") and `e2e/specs/74-footer-chrome-pass.e2e.ts` ("names every ancestor on a lineage row, the
first in the gutter", "draws every footer mark at one size, on its column", "says a row’s kind
once, in its marker", "draws every row through the editor’s own class-and-property contract").
