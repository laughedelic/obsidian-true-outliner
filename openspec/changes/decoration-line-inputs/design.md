## Context

Two consumers render the same per-line chrome from the same inputs, each assembling them itself.
Today a render of `computeDecorations` calls `factsFor`, `visibilityContext`, `positionTrail`,
reads `guideHoverField`, walks `foldedChrome`, and then per line calls `drawnGuideDepths`,
`litGuideOn`, `guideBackground` and `markerClasses`; `MarginCompensation.apply` calls the first
three, and per widget line calls `drawnGuideDepths`, `litGuideOn` and `guideBackground` and
toggles the two accent classes by hand. The measurement of what that costs, and why a file
boundary would not help, is in docs/research/hot-file-seams ("The decoration pipeline: two
consumers, one set of inputs"); the lesson it applies is the one docs/research/decoration-lessons
keeps arriving at — when two things must move together, make it impossible to change one without
the other.

The three expensive inputs are already cached per state (`factsFor`, `positionTrail`,
`caretScope`), so the consumers do not pay twice for them today; what they pay for is the
threading. The builder is about the shape of the code, not its cost.

## Goals / Non-Goals

**Goals:**

- One place computes what a line renders, and one record carries it to whichever consumer draws
  the line — `Decoration.line` for a plain line, a DOM patch for a widget line.
- A new per-line input is added to the builder and to the consumer that draws it, and to nothing
  else.
- The rendered output is the same: same classes, same custom properties, same widgets, on the
  e2e corpus and on the real vault.

**Non-Goals:**

- Anything listed under Non-goals in proposal.md. In particular the widget path's own inputs —
  the margin base, the content right edge, the selection targets, the chevron measurements — are
  not per-line render inputs and do not move.
- A cache beyond the record itself. The pieces are cached where they are; the record is cached
  the way the trail is.

## Decisions

### D1. The record is per line and complete for what both consumers draw

`LineRender` carries, for one document line: its fact (or none, for a guide-only gap line), the
guide depths it draws, the guide background already rendered to a string (or `undefined` when
there is nothing to draw), the accent classes for its marker, whether it is a folded node's
marker line, whether it is a folded node's last own line, and the hidden-descendant count that
belongs after its text (or zero). Every one of those is something both consumers ask for today,
in the same words or in two spellings of the same decision.

What is NOT in the record is what only one consumer needs: the CSS class list and style that
`lineChrome` produces for a plain `.cm-line` (the widget path has a different box and computes
its own), and everything the widget path measures live.

### D2. One builder, cached like the trail

`renderInputs(state, modes)` builds the facts, the visibility context, the trail, the hover and
the folded chrome once, and returns an object that answers `line(n)` with the record for that
line. It is cached on the state the way `positionTrail` is, keyed on the settings it read, so the
two consumers of one render — the field's recompute and the view plugin's `docViewUpdate` — build
it once. A settings change that changes an input already reaches this layer through
`forceRedraw`, which flips the mode field and produces a new state.

The builder walks `computeLineGuides`'s output, which is what `computeDecorations` walks today
and is a strict superset of the facts by line, so the record exists for every line either
consumer can ask about; a widget line's lookup by document line number replaces the two
`guidesByLine`/`factsByLine` lookups it does now.

### D3. The consumers keep their loops and lose their assembly

`computeDecorations` iterates the records in line order, emits `gapLineDecoration` for a record
with no fact and `lineDecoration` for one with, and the fold-count widget where the record says
so. `lineDecoration` takes the record and the line text, and `gapLineDecoration` the record, in
place of the six positional arguments each takes today. `MarginCompensation.apply` looks a
widget line's record up and applies it — the guide background, the accent classes, the folded
treatment — where it derives them now.

The accent classes on a widget line come from `markerClasses`, the same function the plain path
uses; `isMarkerEligible` already excludes list items from the widget path, so the native-bullet
variants it can return never apply there and the classes toggled are the same two as today. They
are toggled, not added, for the reason the current code gives.

### D4. The per-line helpers become the builder's

`drawnGuideDepths`, `litGuideOn`, `guideBackground` and `markerClasses` are called from the
builder and nowhere else. They keep their names and their signatures; what changes is that a
consumer no longer calls them, which is the mechanism by which a feature adding an input has one
site to edit.

### D5. Byte-identical output is the acceptance test, not a design goal to argue about

The change is verified by comparing what the DOM holds before and after, on the e2e corpus, for
every line: class list, `--to-guides`, `--to-own-shift`, `data-*` attributes, and the widgets
present. `53-decoration-contracts` and `54-widget-rendered-lines` assert most of this already;
the plan adds one case for the accent classes on a widget line across the `markerHighlight`
states, which today have no assertion, and runs the four groups whose rendering passes through
here.

## Risks / Trade-offs

- **A widget line's record is built even when no widget line exists** → it is built from data
  the plain path builds anyway; the per-line work is the same string rendering the plain path did
  for that line, once. If a profile shows otherwise, the record can render its background lazily
  — a change inside the builder, invisible to both consumers.
- **The record grows into a bag** → its fields are the union of what the two consumers draw, and
  the non-goals name what stays out. A field one consumer alone reads is the signal to stop and
  ask whether it belongs.
- **Refactoring the code the lessons note warns about most** → no measurement changes, no
  ordering changes; the same values reach the same DOM. The e2e groups that found the last three
  regressions in this code (`51`, `54`, `56`) are in the net.
