## Why

While the view is zoomed, a provisional position — the blank line the caret rests on after an
end-of-node Enter or a Shift+Enter — is rendered from a parse of the WHOLE note rather than of
the zoom root's subtree. Every depth that parse carries is counted from the note's own root, so
the moment the caret lands on such a line the zoomed view jumps one level right per hidden
ancestor and grows guide columns for ancestors it is not showing, then snaps back when the caret
leaves. The breadth is measured in docs/research/12 ("A provisional position inside a zoomed
subtree renders the view at the source document's depth"): it is not the trail-only gap that
entry was first written as.

This contradicts two requirements that already hold everywhere else — `outline-zoom`'s "Depth is
measured from the zoom root while zoomed" and `outline-decorations`' "Indentation guides re-base
with the zoom scope" — so it is a defect against the specs as they stand, not a new capability.

## What Changes

- The provisional position's materialization is derived from the zoom scope's subtree document
  at a root-relative line, rather than from the whole buffer, whenever a scope is active. Its
  results are shifted back to source line numbers by the root's start line, the same translation
  `baseFacts` and `zoomAwarePositionTrail` already apply.
- The position's own indentation and marker fact re-bases with the zoom, so its row renders at
  exactly the column a real line there would.
- The guides recomputed while a position is open re-base with the zoom, in both the
  new-node case and the bisecting case, so no visible row gains a column for a hidden ancestor.
- In the bisecting case, where every line's facts come from the resolved outline, that outline is
  the scoped one, so the whole visible subtree keeps its re-based depths.
- The position trail (marker and guide accents) re-bases with the zoom, closing the gap
  `computeTrail` documents in place today.
- Nothing changes when no zoom scope is active: the same probe, against the same buffer, at the
  same line.

## Non-goals

- The nested-list-item half of zoom re-basing. A zoom root that is itself a nested list item
  keeps Obsidian's own within-list indentation; that is a separate deferred item in
  docs/research/12 ("A zoomed list-item root keeps its within-list indentation") and this change
  neither closes nor worsens it.
- What a provisional position MEANS to the grammar. The structural keys and
  `provisional-cleanup`'s record act on the buffer, where whole-document derivation is correct;
  only the render is re-based.
- The other provisional-position gaps parked in docs/research/12 (a structural key leaving the
  blank line behind, node-granular selection halving a bisected node, a caret parked on a
  user-authored blank line).
- Zoom enforcement, caret confinement, and the breadcrumb trail, none of which read these
  derivations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `outline-decorations`: the provisional-position requirement gains the scope-relative
  derivation — the position's own facts, and the guides recomputed while it is open, are stated
  as re-basing with an active zoom scope.
- `outline-zoom`: "Depth is measured from the zoom root while zoomed" is stated to hold while a
  provisional position is open, in both the new-node and the bisecting case.
- `hierarchy-position-indicators`: the trail is stated to accent the zoomed columns while a
  provisional position is open, matching what it already does for an ordinary caret.

## Impact

- `src/plugin/decorations.ts`: `computeProvisional`/`provisionalAt` resolve the scope and carry
  its offset; `factsFor` and `computeTrail` shift by that offset instead of assuming zero.
- `src/plugin/decorate.ts`: possibly one shared shift helper, alongside the `shiftTrail` that
  already exists there. No change to `decorate`, `computeLineGuides`, or `materializeProbe`
  themselves — each already accepts a detached tree, guaranteed by `tree-projection`.
- Tests: unit coverage for the scoped derivation, an e2e case in the zoom spec for the rendered
  result.
- No settings, no persisted state, no document mutation; the whole change is inside a
  caret-derived render path.
