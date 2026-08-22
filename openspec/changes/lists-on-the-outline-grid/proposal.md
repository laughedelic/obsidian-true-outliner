## Why

Outline mode renders headings, paragraphs and atoms on one grid — a depth column every
`--to-decor-unit`, a marker centred on that column, a guide descending from it — and then
hands lists back to Obsidian. The result is two layouts in one document: a list level steps
`2.25em` where every other level steps `1.5rem`, a list's guides sit on native columns that
our own grid never touches, and a list ancestor gets no caret trail at all because there is no
column of ours to draw it on.

The experiment series left it that way deliberately, and two later probes concluded that
native list columns could only be FOLLOWED, by per-item pixel measurement — a second rendering
mechanism alongside the measurement-free gradient the whole layer rests on
([docs/research/14](../../../docs/research/14-experiment-position-indicators.md), finding 3).
That conclusion was right about the mechanism it examined and wrong about the problem.
Obsidian computes list columns from public CSS variables, so they can be SET rather than
followed. [docs/research/16](../../../docs/research/16-native-list-decoration.md) measures the
whole surface against a running Obsidian 1.13.4 and confirms it: one variable puts every tab-
or four-space-indented list level on our own unit, with Obsidian's own hanging indent
re-deriving itself, and a second puts its guides on our columns. No measurement, no second
mechanism.

A demo build of exactly that was reviewed by hand and accepted. This change makes it the
behaviour.

## What Changes

- **List levels step by the outline unit.** `--to-decor-unit` is pushed into Obsidian's own
  `--list-indent` on outline-mode list lines, so a list level and a heading level are the same
  distance. **BREAKING** for the rendering contract: a pure list no longer renders
  byte-identical to outline-mode-off.
- **Our own guides draw every list level.** The native list guide is switched off on those
  lines and `computeLineGuides`' list-item exclusion is lifted, so a list level's guide is the
  same gradient, the same colour and the same column as a heading's.
- **The caret trail reaches into lists.** With list levels on the grid,
  `computePositionTrail`'s two `isListItem` exclusions are removed and the position indicator
  accents list levels like any other — closing the omission
  `hierarchy-position-indicators` currently states as a requirement.
- **A list marker sits on its own depth column**, with the item's text at the marker gutter,
  so a guide descends out of its bullet the way it descends out of a block marker.
- **We write the hanging indent instead of reading Obsidian's.** Measured: the marker gutter
  makes every soft-wrapped list row land 16px left of its own item's text, because
  `coordsAtPos` — and therefore Obsidian's own measurement — reports the end of the marker's
  TEXT rather than the end of its padded box. Writing the pair from
  `(depth − supplementalDepth) × unit + gutter` is exact, and being a `calc()` it also removes
  the stale-cache defect where a live change to `--list-indent` left the old wrap column in
  place.
- **The bullet gets the weight of a marker**: `--list-bullet-size` `0.38em`, measured against
  the block icons' ink; the colour token is unchanged so lists and blocks retune together.
- **Markers and guides share one column definition.** Measured: every marker's centre sits at
  exactly `depth × unit` while the guide paints its 1px as `[column, column + 1]`, so every
  marker — bullets and block icons alike — is half a pixel left of the line it belongs to. A
  list bullet also uses a different vertical anchor from a block icon (the text rect's centre
  against roughly 5px above it). Both are resolved here, from one shared definition rather
  than per-consumer.
- **No new settings.** The demo build's two experimental dropdowns are removed; this is one
  behaviour, not an option.

Deliberately NOT in scope, and recorded as residuals rather than fixed: files indented with
two or three spaces (Obsidian quantises only a tab or exactly four spaces, so their levels are
misaligned with the plugin disabled too, and our guides make that more visible rather than
less); the dependency of space-indented files on Obsidian's own "Show indentation guides"
setting, which controls whether the spans that carry list layout exist at all; and making the
indent unit a user-facing setting, which belongs with the wider layer-configurability item.

## Capabilities

### New Capabilities

None. This changes how existing layers render, not what the plugin can do.

### Modified Capabilities

- `outline-decorations`: the pure-list byte-identical requirement is replaced by a one-grid
  requirement; indentation, guides and markers gain list-item cases; the hanging indent
  becomes ours to state.
- `hierarchy-position-indicators`: "Trail rendering through list nesting uses native list
  chrome or is omitted" is replaced — list levels now have a column of ours and render the
  trail like any other level.

## Impact

- `src/plugin/decorate.ts` — `LineGuideFact` carries the list-item ancestor depths;
  `computePositionTrail` stops excluding list ancestors. Pure functions, unit-tested.
- `src/plugin/decorations.ts` — list lines emit their own depth and the classes the new CSS
  hangs off; the guide background includes list levels.
- `src/plugin/mode-registry.ts`, `src/plugin/main.ts` — the two experimental settings and
  their persisted fields are removed.
- `styles.css` — the list rules: the unit, the guide handover, the marker column, the hanging
  indent, the bullet weight, and the shared column definition markers and guides both read.
- `tests/decorate.test.ts` — three trail tests assert the omission being closed and are
  rewritten to assert the new behaviour; new coverage for the list-ancestor guide depths.
- `e2e/specs/50–55` — the decoration suites gain list-grid cases; the fixture corpus grows a
  list-geometry fixture. `test-vault/Notes/List decoration demo.md` stays as a real-vault
  fixture.
- No change to the document model, the parse, any structural operation, or anything written to
  disk. The layer stays a pure rendering projection.
