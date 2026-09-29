## Why

The ambient monitors (#288) shipped report-only because their false positives were not yet
understood. Three rounds of corrections left nine rules reporting in the CI sweeps; four of them
read stock Obsidian behaviour as a defect, and one case raises a refusal it never waits for
([#315](https://github.com/laughedelic/obsidian-true-outliner/issues/315)). While they report noise,
no rule can be promoted to a failure (#316), and the invariant sweeps over real notes (#294) would
drown in it, since real notes hold the quotes, tables and folds these rules misread. Each item was
re-measured in the running app before this proposal; the figures are in
[`docs/research/ambient-e2e-monitors`](../../../docs/research/ambient-e2e-monitors.md), "Precision
corrections (#315)". The umbrella is #297.

## What Changes

- **Grid, quotes.** A quote's marker is its first row's first ink and its text hangs after the
  marker, in stock Obsidian with outline mode off as well. The rule reads the marker as the line's
  anchor on `column + gutter`, and the wrapped rows for their hang against the first row of text.
- **Height map, tables.** A table's source line stays in the document under its widget as an
  element with no text, and has no position. The round trip skips a line that draws nothing.
- **Caret, folds.** Beside a widget, `coordsAtPos` measures the widget's edge by default and the
  caret is painted on the text before it. The caret agrees when it matches the position on either
  side of its head.
- **Layout shift, set-up.** A shift is judged against the edits made before its frame, not against
  every edit of the case, and a change that leaves the text as it was is not an edit. A case that
  turns outline mode on and sets its buffer in the body no longer has that set-up read as its own
  shift.
- **`62-outline-edit-enforcement`, the vetoed edit.** The case waits for the refusal it raises.
- **A row in `01-ambient-monitors` for each rule correction**, reading the stock case clean and
  failing when the correction is removed.
- **The full sweep on the pushed checkpoint**, desktop and mobile, and the note records which rules
  now read clean over the whole suite and which still report, with the reason. That list is the
  input to #316 and #294.

## Non-goals

- **Failing a case on any rule.** Report-only stays. Promotion is #316, and starts from the list
  this change writes.
- **The readings that were reported and not reproduced**: `caret-off-coords` in `77` and
  `caret-covered` in `75` on mobile, `heightmap-wrong-line` in `10`, `59` and `90`, and
  `shift-sideways` in `57`. The driver runs the desktop app, so the mobile readings are not
  re-measured, and the others did not reproduce in a steady state. They stay in the report.
- **The plugin defects the monitors found**: #312, #313 and #314.
- **Moving set-up in other specs into `beforeEach`.** The rule reads set-up in the body correctly
  now; a spec keeps whichever shape it has.
- **Any change under `src/` or `styles/`.**

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `e2e-verification`: "The rendered editor is read around every case, and the reading is reported" narrows
  three of its readings (the grid on a quote, the height map on a line under a widget, the caret
  beside a widget) and says which edits a layout shift is judged against. Its statements as written
  contradict the corrected behaviour: the grid reading says each row of a line begins on the
  column, which a quote's text does not; the height map says every rendered line round-trips.

## Impact

- `e2e-tests/monitors.ts`: four page-side readings.
- `e2e-tests/specs/01-ambient-monitors.e2e.ts`: five rows and their controls.
- `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts`: one wait.
- `docs/research/ambient-e2e-monitors.md`: the measurements, and the sweep's list of clean and
  reporting rules.
- No plugin behaviour change, and no version bump: a `chore` that touches neither `src/` nor
  `styles/` ships nothing (`scripts/check-landed.ts`).
