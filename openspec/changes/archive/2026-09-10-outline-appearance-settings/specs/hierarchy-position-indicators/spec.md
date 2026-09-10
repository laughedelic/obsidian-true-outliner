## MODIFIED Requirements

### Requirement: Guides and markers are two independent three-state settings

The layer SHALL be configured by exactly two settings, each with three states, and each SHALL
take effect independently of the other:

- a GUIDE setting — `off`, `full`, or `lineage` — governing which parts of the current node's
  ancestor guides are accented;
- a MARKER setting — `off`, `current`, or `lineage` — governing which markers are accented.

Within each setting the states SHALL be mutually exclusive, so no level ever shows two guide
renderings at once. Across the two settings every combination SHALL be valid and render exactly
what its two values say, including the combinations where one axis is `off`.

Both settings SHALL operate on the guides the base layer actually draws. Where
`outline-decorations`' guide-visibility setting does not draw a guide, no accent SHALL render at
that depth — an accent is a treatment OF a guide, which that capability already binds by column —
so a guide setting of `full` or `lineage` accents whatever subset is drawn, and draws nothing on
its own. MARKER accents SHALL be unaffected by guide visibility: a marker is a real element on
its own column, and with every guide hidden the accented markers remain the only indication of
the caret's lineage, which is the rendering a deep list already relies on.

The caret information these settings need SHALL be available to the base layer's own
cursor-scoped visibility whatever these two settings say. In particular, setting both to `off`,
or holding a selection that suppresses the accent trail, SHALL NOT stop the base layer from
drawing the guides the cursor is inside.

#### Scenario: Both off renders no accent at all

- **WHEN** both settings are `off` and the caret is inside a deeply nested node
- **THEN** every guide and every marker renders in its normal, unaccented appearance

#### Scenario: Either axis changes without disturbing the other

- **WHEN** the guide setting is changed while the marker setting stays put
- **THEN** the guide rendering changes as that value says and the accented markers are exactly
  the ones the marker setting still names — and the same holds with the roles reversed

#### Scenario: Markers alone, with no guides accented

- **WHEN** the guide setting is `off` and the marker setting is `lineage`
- **THEN** the current node's marker and every ancestor's marker render accented, and no guide
  anywhere renders an accent

#### Scenario: No accent survives a guide that is not drawn

- **WHEN** the guide-visibility setting draws no guides and the guide accent setting is `full`
- **THEN** no accent renders on any line, and the markers the marker setting names are accented
  exactly as they were

#### Scenario: Marker accents survive with guides hidden

- **WHEN** the guide-visibility setting draws no guides and the marker setting is `lineage`
- **THEN** the current node's marker and every ancestor's marker render accented, which is the
  only indication of lineage on the page

#### Scenario: Cursor-scoped guides survive the accent suppressions

- **WHEN** the base layer draws only the levels the cursor is inside, and both accent settings
  are `off` — or a selection covers whole nodes, which suppresses the accent trail
- **THEN** the guides of the caret's own ancestors still render, unaccented
