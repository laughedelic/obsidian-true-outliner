## Purpose

Defines outline mode's cursor-derived decoration: an accent on the node the caret sits in and
an accented trail along that node's ancestor chain, so the reader can see where they are in the
tree without scrolling or counting indentation. Purely decorative and independently
configurable; it never changes the document, the caret, or the layout the base decoration
layers establish.

## ADDED Requirements

### Requirement: Position indicators are scoped to outline mode and are read-only

The position-indicator layer SHALL render only when the editor's file has outline mode enabled,
resolved through the same mode source the rest of the decoration layer uses, and SHALL NOT
render in the reading/preview view. It SHALL be a pure rendering projection: it SHALL NOT
dispatch any document-changing transaction, move the caret or selection, or create undo history
entries, however often it recomputes.

#### Scenario: No indicators off-mode

- **WHEN** a note without outline mode enabled is open with the caret inside a nested node
- **THEN** no current-node accent and no ancestor trail render; the DOM matches stock Obsidian
  live preview

#### Scenario: Moving the caret mutates nothing

- **WHEN** the caret is moved repeatedly through a document in outline mode with indicators
  enabled
- **THEN** the document text, the undo stack, and the resulting caret position are exactly what
  the caret movements themselves produced, with no additional transaction interposed

**Covered by**: `e2e/specs/54-position-indicators.e2e.ts` ("renders no accent at all with outline mode off", "mutates nothing as the caret moves through the tree").

### Requirement: The current node is the node containing the primary caret

The current node SHALL be the node containing the **head** of the **primary** selection range.
A selection with multiple ranges SHALL produce indicators for the primary range only. While
escalated block-selection chrome is active — i.e. every non-empty range is a whole-subtree cover
— position indicators SHALL be suppressed entirely, so the two treatments never compete for the
same pixels. A non-empty selection that is not such a cover SHALL still produce indicators, from
its head.

#### Scenario: Indicators follow the head, not the anchor

- **WHEN** the user extends a plain character selection upward from a deep node into a shallower
  one, so head and anchor sit in different nodes
- **THEN** the indicators describe the node under the head

#### Scenario: Multiple cursors produce one trail

- **WHEN** the document has several cursors in different subtrees
- **THEN** exactly one current node is accented and exactly one ancestor trail renders, both for
  the primary range

#### Scenario: Block-selection chrome suppresses indicators

- **WHEN** the selection is an escalated whole-subtree cover, rendering block-selection chrome
- **THEN** no current-node accent and no ancestor trail render for as long as that cover stands,
  and both return once the selection collapses

**Covered by**: `tests/decorate.test.ts` (`computePositionTrail` → "current node" suite); `e2e/specs/54-position-indicators.e2e.ts` ("draws one trail for multiple cursors, from the primary range", "is suppressed while a whole-subtree cover is selected, and returns after").

### Requirement: The current node's marker renders an accent when enabled

When the current-marker setting is enabled, the current node's own marker SHALL render in an
accent treatment distinct from every other node's: the synthetic block marker for a
marker-eligible kind, and the native bullet/number for a list item. The accent SHALL appear on
the current node's first line only — never on its continuation lines, never on its trailing gap
lines, and never on any other node. Because Live Preview may render a list item's marker either
as its bullet element or as revealed raw text depending on where the caret is, the accent SHALL
apply to whichever form is currently mounted. When the setting is disabled, no marker SHALL
render any accent.

#### Scenario: A heading's marker is accented when the caret is in it

- **WHEN** the caret is placed in a heading and the current-marker setting is on
- **THEN** that heading's block marker renders the accent treatment, and no other node's marker
  does

#### Scenario: A list item's native bullet is accented in both mounted forms

- **WHEN** the caret is placed on a list item, and then on a different list item in the same list
- **THEN** each list item in turn renders its own native marker accented while it is current —
  whether Live Preview is currently showing that marker as a bullet element or as revealed raw
  text — and the previously-current one returns to its normal appearance

#### Scenario: Multi-line node accents only its first line

- **WHEN** the caret sits on a continuation line of a node that spans several physical lines
- **THEN** the accent renders on the node's first line, and no accent renders on any
  continuation or gap line

**Covered by**: `e2e/specs/54-position-indicators.e2e.ts` ("accents the marker of the heading the caret is in, and no other", "accents a list item's NATIVE bullet, which the caret does not swap for raw text", "accents only the node’s FIRST line, never a continuation or gap line", "turns off independently of the trail"); the native-bullet finding itself is `docs/research/14`’s finding 1.

### Requirement: The ancestor trail has exactly three mutually exclusive states

The ancestor-trail setting SHALL have exactly three states — `off`, `guides`, and `thread` — of
which at most one rendering is ever active. `off` SHALL render no trail at all. The two active
styles SHALL NOT be combinable, so no document ever shows both a full-extent ancestor accent and
a threaded one on the same level.

#### Scenario: Off renders no trail

- **WHEN** the ancestor-trail setting is `off` and the caret is inside a deeply nested node
- **THEN** every guide renders in its normal, unaccented appearance, and no thread segments or
  elbows render anywhere

#### Scenario: Switching styles replaces rather than adds

- **WHEN** the setting is changed from `guides` to `thread`
- **THEN** the full-extent ancestor accents are gone and the threaded rendering is present; no
  level shows both

**Covered by**: `tests/decorate.test.ts` ("is reported even when the trail style is 'off', which draws nothing"); `e2e/specs/54-position-indicators.e2e.ts` ("with both off, renders exactly what the base layers render", "does not accent an ancestor’s full extent the way guides does").

### Requirement: The `guides` style accents exactly the current node's strict ancestors

In the `guides` style, a guide SHALL render the accent treatment on a line when, and only when,
the guide belongs to a **strict ancestor of the current node**. Guides belonging to any other
node SHALL render unchanged on that same line, so a line carrying several guides can show some
accented and some not. Accenting SHALL NOT change a guide's column, width, or continuity — only
its appearance.

#### Scenario: Only the ancestor's guide is accented among siblings

- **WHEN** the caret is inside one of two sibling sections that each own a guide, and the style is
  `guides`
- **THEN** the guide of the section containing the caret is accented along its extent, and the
  sibling section's guide is not

#### Scenario: Nested ancestors are all accented

- **WHEN** the caret is in a node three non-list levels deep and the style is `guides`
- **THEN** the guides of all three strict ancestors are accented on the lines that carry them

#### Scenario: Accenting does not move a guide

- **WHEN** a guide is accented
- **THEN** it renders at the same column, with the same continuity through blank gap lines, as it
  did unaccented

**Covered by**: `tests/decorate.test.ts` ("'guides' style" suite); `e2e/specs/54-position-indicators.e2e.ts` ("accents an ancestor's guide but leaves a sibling subtree's alone", "accents the ancestor guide on gap lines too, with no break", "emits no accent for a top-level node — there is no ancestor").

### Requirement: The `thread` style renders one continuous path from the outline root to the current node

In the `thread` style, the accented rendering SHALL read as a single connected path: at each
strict ancestor level, an accented segment SHALL run from that ancestor's own marker down to the
point where the next level begins, and SHALL connect to that next level by a visible horizontal
link, ending at the current node's own marker. The accented segment at a level SHALL NOT extend
past the point where the next level begins, and SHALL NOT continue below the current node into
its own subtree. Levels that are not on the current node's ancestor chain SHALL render no thread
segment.

#### Scenario: The thread connects root to caret without gaps

- **WHEN** the caret is placed in a node several levels deep and the style is `thread`
- **THEN** a connected accented path is present from the outermost ancestor's marker down to the
  current node's marker, with a horizontal link at each level change and no visible break between
  segments

#### Scenario: The thread stops at the current node

- **WHEN** the current node has children of its own
- **THEN** no thread segment renders below the current node's own line

#### Scenario: A sibling subtree carries no thread

- **WHEN** an ancestor of the current node has another child subtree that does not contain the
  caret
- **THEN** no thread segment renders anywhere inside that sibling subtree

**Covered by**: `tests/decorate.test.ts` ("'thread' style" suite); `e2e/specs/54-position-indicators.e2e.ts` ("runs a connected path from the root to the caret, and stops there", "keeps the base guide continuous through a half-accented row").

### Requirement: Trail rendering through list nesting uses native list metrics or is omitted

Where the current node's ancestor chain runs through list nesting, any trail rendering at those
levels SHALL be positioned on Obsidian's own native list columns and bullets, never on a column
this plugin computes for non-list nodes. If the native chrome needed to do that is unavailable in
the running environment, those levels SHALL render no trail segment at all; a misaligned segment
SHALL NOT be rendered in its place. The trail through non-list levels SHALL render regardless.

#### Scenario: A trail through a list aligns with native nesting

- **WHEN** the caret is inside a list nested several levels deep under a heading, with a trail
  style active
- **THEN** the segments at the list's levels sit on the same columns as Obsidian's own list
  nesting, and the segment at the heading's level sits on the heading's own guide column

#### Scenario: Unavailable native chrome degrades to omission

- **WHEN** the native list chrome the list-level segments rely on is not present
- **THEN** the list levels render no segment, the non-list levels of the trail still render, and
  nothing renders at an incorrect column

**Covered by**: `tests/decorate.test.ts` ("list levels (native columns this layer cannot address)" suite); `e2e/specs/54-position-indicators.e2e.ts` ("threads to a list item without drawing at a native list column"). The omission branch is what ships today — rationale and the measurements a later pass needs: `docs/research/14`.

### Requirement: Position indicators never change layout geometry

Enabling, disabling, or switching any position-indicator setting SHALL NOT change any line's
indentation, marker gutter, marker size or position, guide column, or text position. Only colors
and other purely visual attributes SHALL differ between settings.

#### Scenario: Toggling indicators never reflows text

- **WHEN** the current-marker setting or the ancestor-trail setting is changed to any other value
- **THEN** every line's rendered indentation and text position, and every marker's size and
  position, are identical to what they were before the change

#### Scenario: Turning everything off restores the base rendering

- **WHEN** the current-marker setting is off and the ancestor-trail setting is `off`
- **THEN** the note renders exactly as the base decoration layers alone render it

**Covered by**: `e2e/specs/54-position-indicators.e2e.ts` ("changes no geometry across every setting combination" — measures every line's position, padding, margin, gutter, and marker rect across all six combinations — and "with both off, renders exactly what the base layers render").

### Requirement: Indicators track the caret and settings changes live

The layer SHALL recompute on selection changes, not only on document changes, so the indicators
follow the caret as it moves with no reload and no document edit required. A change to either
setting SHALL take effect on the next render without reloading the plugin or the note, including
for widget-replaced atom kinds whose decoration output would otherwise be unchanged across the
setting change.

#### Scenario: Indicators follow the caret

- **WHEN** the caret is moved from one subtree to another with only arrow keys
- **THEN** the previous node's and ancestors' accents are gone and the new node's and its
  ancestors' accents are present, with no reload

#### Scenario: Settings changes apply without a rebuild

- **WHEN** either setting is changed while a note containing only widget-replaced atom kinds is
  open in outline mode
- **THEN** the next render reflects the new setting

**Covered by**: `e2e/specs/54-position-indicators.e2e.ts` ("follows the caret with no reload and no edit", "applies a settings change live on a note of only widget-replaced atoms" — the byte-identical-output case `forceRedraw` exists for).

### Requirement: Indicator appearance is restylable without plugin settings

The accent color and the trail's line weight SHALL be driven by CSS custom properties that
default to the active Obsidian theme's own variables, so a theme or user snippet can restyle
them without any plugin change and without any additional setting.

#### Scenario: A snippet retunes the accent

- **WHEN** a user snippet overrides the accent custom property
- **THEN** the current-node accent and the trail render in the overridden color, with unchanged
  geometry

#### Scenario: Accent adapts to the theme

- **WHEN** the active theme is switched between a light and a dark variant
- **THEN** the accent resolves from that theme's own variables in each case, with no plugin
  setting change

**Covered by**: `e2e/specs/54-position-indicators.e2e.ts` ("lets a snippet retune the accent with no geometry change", "resolves the accent from the active theme, in light and in dark").

### Requirement: Nested per-cell editors receive no position indicators

An actively-edited table cell renders in Live Preview as its own nested editor whose outline-mode
gate resolves to the same file as the real note. That nested editor SHALL receive no current-node
accent and no trail, regardless of what its own text would otherwise parse as.

#### Scenario: Editing a table cell shows no indicators inside the cell

- **WHEN** a table cell in an outline-mode note is actively being edited
- **THEN** the cell's own nested editor renders no accented marker and no trail, while the outer
  note's own decorations stay active

**Covered by**: `e2e/specs/54-position-indicators.e2e.ts` ("renders no indicators inside a nested per-cell table editor").
