## Why

The decoration layer renders one set of per-line chrome through two consumers: `computeDecorations`
builds a CM6 line decoration for every plain line, and `MarginCompensation` patches the DOM of
every widget-rendered line that a `Decoration.line` cannot reach
(docs/research/decoration-lessons, "CodeMirror 6"). Each consumer assembles the same inputs for a
render on its own — the facts, the guide visibility, the position trail, the hovered guide, the
folded chrome — and combines them per line in its own words. A feature that adds an input
therefore threads it through both, and two features doing so at once collide in both.

docs/research/hot-file-seams measured that collision: of the thirteen same-code conflicts
concurrently open PRs met in `decorations.ts`, nine were in these two consumers and the per-line
helpers they share — the appearance settings threading `visibilityContext` into both through
lines the per-tab mode had just changed, folding threading its hover and `lit` into both on top
of that. It is the largest single class of conflict the note found, and the one a file split does
not touch: separating the consumers into files would make each of those edits a two-file edit
without making it a different edit.

## What Changes

- One builder assembles a render's per-line inputs once, and both consumers read the record it
  produces for a line rather than recomputing it. A new input is added in one place, and a
  consumer that does not render it is unchanged.
- The marker accent classes a widget line carries come from the same function the plain lines
  use, instead of a second spelling of the same decision.
- Nothing rendered changes: every class, custom property, widget and DOM patch is produced from
  the same values as today. The build's output for the e2e corpus is the same DOM.

## Non-goals

- Moving any part of `decorations.ts` into another file. The note measured why a split of this
  file spreads edits rather than separating them (25 of its 28 commits span the modules a split
  would create); the change is a refactor in place.
- Changing what the widget path renders that the plain path does not — the margin arithmetic, the
  selection targets, the live measurements — or the other way round. Those inputs are one
  consumer's own and stay where they are.
- The footer's rendering. It shares the class-and-property contract (`chrome-line.ts`), not this
  layer's per-line assembly.
- Performance. The facts, the trail and the caret scope are already cached per state; the
  builder composes them and adds no cache of its own beyond the one that keeps the record per
  state and settings.
- Anything the position indicators, folding or zoom mean. Their inputs move through the builder;
  their rules do not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The requirements in `outline-decorations`, `hierarchy-position-indicators` and
`better-folding-ux` state what is rendered, and it is rendered the same; `skip_specs` is set.

## Impact

- `src/plugin/decorations.ts`: a `renderInputs(state, modes)` builder and a per-line record
  beside the existing cached builders; `computeDecorations`, `lineDecoration`,
  `gapLineDecoration` and `MarginCompensation.apply` read the record. The per-line helpers they
  call today (`drawnGuideDepths`, `litGuideOn`, `guideBackground`, `markerClasses`) become the
  builder's, called once per line.
- Tests: the decorations, position-indicators, folding and zoom e2e groups are the net;
  `54-widget-rendered-lines` already asserts that a widget line and a plain line at one depth
  carry the same chrome, which is the property the change makes structural. One new e2e case
  pins that a widget line's accent classes and a plain line's come out the same under every
  `markerHighlight` state.
- No settings, no persisted state, no CSS, no document mutation.
