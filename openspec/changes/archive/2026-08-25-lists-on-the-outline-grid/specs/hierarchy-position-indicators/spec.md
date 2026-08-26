## MODIFIED Requirements

### Requirement: Trail rendering through list nesting uses the same columns as every other level

Where the current node's ancestor chain runs through list nesting, the trail SHALL render at
those levels exactly as it renders at any other: a segment on that ancestor's own depth
column, drawn by the same mechanism, in the same weight and colour as a segment at a heading's
level. A list ancestor SHALL NOT be skipped, and no level of the chain SHALL be left without a
segment on the grounds of its kind.

This SUPERSEDES the previous omission, which required list levels to be positioned on
Obsidian's own native list columns or else render nothing. That omission existed because list
levels had no column this plugin could address; `outline-decorations` now puts every list
level on the same grid as every other kind, so the column exists and the trail uses it.

A list ancestor's own MARKER continues to be accented like any other ancestor's, whether or not
a segment is drawn at its level.

#### Scenario: A trail through a list draws at every level

- **WHEN** the caret is inside a list nested several levels deep under a heading, with a trail
  style active
- **THEN** a segment renders at each list level's own column as well as at the heading's, all
  on the same grid and in the same weight

#### Scenario: A pure list shows its levels through segments and bullets together

- **WHEN** the caret is inside a deeply nested pure list — no non-list ancestor anywhere — and
  both settings are at a state that renders
- **THEN** each ancestor level renders its segment, and each ancestor list item renders its
  native bullet accented

#### Scenario: The lineage route runs unbroken into a list

- **WHEN** the caret is on a list item several levels inside a list that itself sits under two
  headings, and the guide setting is `lineage`
- **THEN** the accented route steps in one level per ancestor from the outline root to the
  caret, with no level of the chain missing and no gap where the headings hand over to the
  list

### Requirement: Position indicators never change layout geometry

Enabling, disabling, or switching any position-indicator setting SHALL NOT change any line's
indentation, marker gutter, marker size or position, guide column, or text position. Only colors
and other purely visual attributes SHALL differ between settings. This SHALL hold for list items
exactly as for every other kind: a list item's own indentation, bullet position and text
position SHALL be identical at every setting value.

#### Scenario: Toggling indicators never reflows text

- **WHEN** either setting is changed to any other one of its values
- **THEN** every line's rendered indentation and text position, and every marker's size and
  position, are identical to what they were before the change

#### Scenario: Turning everything off restores the base rendering

- **WHEN** both settings are `off`
- **THEN** the note renders exactly as the base decoration layers alone render it

#### Scenario: A list's geometry is constant across every setting

- **WHEN** the caret is inside a nested list and the settings are cycled through every
  combination
- **THEN** every list line's indentation, bullet column and text column are unchanged
  throughout
