## MODIFIED Requirements

### Requirement: The `full` guide state accents exactly the current node's strict ancestors

In the guide setting's `full` state, a guide SHALL render the accent treatment on a line when, and only when,
the guide belongs to a **strict ancestor of the current node**. Guides belonging to any other
node SHALL render unchanged on that same line, so a line carrying several guides can show some
accented and some not. Accenting SHALL NOT change a guide's column, width, or continuity — only
its appearance.

An accent SHALL cover only rows where the guide it accents actually renders. A guide ends at the
last content line of its subtree (`outline-decorations`), so a `full` accent SHALL end on that
same row and SHALL NOT render on the blank rows below it — the same reason it already renders
nothing on an ancestor's own rows. Where a provisional position extends a guide to the caret's
own row, the accent SHALL extend with it, so the two layers always end together.

#### Scenario: Only the ancestor's guide is accented among siblings

- **WHEN** the caret is inside one of two sibling sections that each own a guide, and the guide
  setting is `full`
- **THEN** the guide of the section containing the caret is accented along its extent, and the
  sibling section's guide is not

#### Scenario: Nested ancestors are all accented

- **WHEN** the caret is in a node three non-list levels deep and the guide setting is `full`
- **THEN** the guides of all three strict ancestors are accented on the lines that carry them

#### Scenario: An accent ends where its guide ends
- **WHEN** the caret is inside a section whose last paragraph is followed by blank lines, and
  the guide setting is `full`
- **THEN** the accent renders on the paragraph's row and on no blank row below it — there is no
  accented stub past the end of the guide

#### Scenario: Accenting does not move a guide

- **WHEN** a guide is accented
- **THEN** it renders at the same column, with the same continuity through blank gap lines, as it
  did unaccented

**Covered by**: `tests/decorate.test.ts` ("'guides' style" suite); `e2e/specs/55-position-indicators.e2e.ts` ("accents an ancestor's guide but leaves a sibling subtree's alone", "accents the ancestor guide on gap lines too, with no break", "emits no accent for a top-level node — there is no ancestor").
