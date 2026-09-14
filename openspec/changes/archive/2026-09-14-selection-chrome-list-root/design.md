## Context

The chrome's left edge is one CSS variable per covered line, `rootTarget − ownShift`, both
halves emitted by `selectedLineRootTargets` and `computeSelectionDecorations`. The measurement
of what the list-item branch of `rootTarget` emits, and why it was written that way, is in
[docs/research/selection-chrome-list-root.md](../../../docs/research/selection-chrome-list-root.md).

## Goals / Non-Goals

**Goals:**

- A list-item root at any depth anchors one level out from its own column.
- The e2e suite can tell a list-item root's edge from the view edge.

**Non-Goals:**

- Any change to how a line's own shift is computed, or to the guide layer.

## Decisions

**Drop the branch rather than correct it.** The branch could be rewritten to read the
item's own depth instead of its list root's, but that reproduces the uniform formula with a
second spelling. `(depth − 1) × unit` already describes every kind on the grid, and the
per-line `ownShift` subtraction — which does know a list line's box is shifted by its list
root's depth — is where the list-specific arithmetic belongs and already lives.

**Assert relationships in e2e, not pixels.** The new cases compare a nested root's edge to
the content origin and to the edges of roots one level in and one level out, and assert the
step between depths is uniform. No unit width is spelled.

## Risks / Trade-offs

- **A list under a heading has a nonzero list-root depth, so the per-line subtraction and the
  root target both move** → measured on exactly that fixture: the two cancel to the parent's
  guide column. The e2e fixture is top-level for the uniform-step assertion; the heading
  case is in the research note.
