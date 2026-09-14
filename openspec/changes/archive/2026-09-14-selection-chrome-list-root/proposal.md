## Why

A block selection rooted at a nested list item draws its chrome from the view's left edge,
across every ancestor guide, where `escalated-selection-decoration` promises an edge one level
out from the root's own column — its parent's guide. The root target's list-item branch anchors
every item to the top of its list rather than to its own depth, a premise
`lists-on-the-outline-grid` retired. Measured in
[docs/research/selection-chrome-list-root.md](../../../docs/research/selection-chrome-list-root.md).

## What Changes

- The chrome's root column is `(depth − 1) × unit` for every node kind, list items included.
  A nested bullet's selection now starts at its parent's guide; a top-level bullet's still
  reaches one unit past the origin, like a top-level heading's.
- The requirement's sentence giving a list-item root "no additive column of its own" is
  removed, and a scenario for a nested list-item root is added.
- E2e cover for a list-item root at each depth and for a pure-list mixed-depth cover, which
  the suite had deliberately left out under the retired premise.

No breaking changes: every non-list root, and every descendant line, keeps its exact edge.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `escalated-selection-decoration`: "Chrome anchors one level beyond the covered root's own
  column" drops its list-item exception and names the nested list-item case.

## Impact

- `src/plugin/decorations.ts` — the root target in `selectedLineRootTargets`, and its comments.
- `e2e/specs/63-selection-visual-treatment.e2e.ts`, `e2e/helpers.ts`.
- `docs/research/selection-chrome-list-root.md`.

## Non-goals

- **The descendant side of the formula.** Each covered line still subtracts its own box
  shift; that half was right and is untouched.
- **The top-level one-unit overflow.** A depth-0 root of any kind reaches one unit past the
  origin by design; this change makes list items follow that rule rather than reopening it.
- **The guide layer.** It already draws a list item's parent guide at `depth × unit`; the
  chrome now agrees with it.
