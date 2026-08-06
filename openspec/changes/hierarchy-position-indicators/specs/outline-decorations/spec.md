## MODIFIED Requirements

### Requirement: A pure list renders byte-identical to outline-mode-off
A document consisting entirely of list items with no non-list-item ancestor (no heading or
paragraph above any node in the list) SHALL render with zero contribution from the base
decoration layers: no added indentation, no guide, no marker. Every list item's
`supplementalDepth` SHALL be 0, and no ancestor exists to own a guide.

This invariant governs the base layers — indentation, guides, and markers — and holds
unconditionally for them. It does NOT extend to decoration layers derived from the current
selection or caret rather than from the document (escalated-selection chrome, and the
position-indicator layer defined by `hierarchy-position-indicators`), which by their nature
render only in response to where the user currently is and MAY accent Obsidian's own native list
chrome inside a pure list. Those layers SHALL still leave every base-layer contribution at zero,
so a pure list's geometry is unchanged whatever they render.

#### Scenario: Pure list nesting shows no decoration
- **WHEN** a document is a deeply nested list with no heading or paragraph ancestor anywhere
  in it
- **THEN** every list item's rendered position, guide state, and marker state are identical
  to outline-mode-off

#### Scenario: A caret-derived accent in a pure list changes no geometry
- **WHEN** a pure-list document is open in outline mode with the caret inside it and the
  position-indicator settings at any value
- **THEN** every list item's rendered position is identical to outline-mode-off, and the base
  layers still contribute no indentation, no guide, and no marker

**Covered by**: `tests/decorate.test.ts` ("is 0 for a list with no non-list-item ancestors
(byte-identical invariant)"), `e2e/specs/51-guides-gradient.e2e.ts` ("a pure list nesting
fixture (no non-list ancestor) draws no guides at all").
