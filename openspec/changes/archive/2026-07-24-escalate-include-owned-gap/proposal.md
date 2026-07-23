## Why

Node-selection escalation's subtree cover currently ends at a node's own last
content character, excluding the node's owned trailing gap from the computed
cover entirely. The gap only ends up selected when the user's drag literally
lands an end on a gap line, retained by the expand-only invariant — and even
then only up to wherever the drag stopped, not the gap's full extent. That
makes "select this node as a block" a two-step gesture (drag past the text,
then further onto the blank line) instead of the one-motion block selection
users expect, and produces a partial-gap selection when a loose gap spans
more than one blank line and the drag stops on the first one. Gap ownership
is already all-or-nothing in the parse model (a trailing gap belongs wholly
to the preceding node); the escalation math should treat it the same way —
found during the `selection-visual-treatment` real-vault review
(docs/research/13, "Escalation math re-examination candidate") and
deliberately deferred there as its own dedicated change.

## What Changes

- Redefine the subtree cover's end position (`subtreeContentEnd` in
  `src/escalate.ts`, used by both `subtreeCoverOf` for single-node escalation
  and `siblingRunCover` for cross-node escalation) to include the covered
  node's own trailing gap in full, not just its content lines. Any selection
  that escalates to a node's subtree — via the gap-line trigger (same node,
  an end on the gap) or via crossing into a different node's content —
  now includes that node's entire owned gap in the resulting cover, in one
  motion, with no separate drag onto the blank line required.
- Within-node content-only selections (both ends on content lines, no
  boundary crossed, no gap line touched) are unaffected: they still pass
  through untouched — this change only affects the cover computed once
  escalation is already triggered, not whether it triggers.
- The expand-only invariant (escalation never shrinks a range) is unchanged
  in its own right, but with gap-inclusive covers it has less work to do:
  most gap-retention cases it previously handled are now covered directly by
  the cover itself.
- `coveredSubtreeRoots` (the read-only query the escalated-selection
  decoration chrome uses) picks up the same gap-inclusive cover automatically
  — no decoration code changes, but block-level selection chrome now extends
  visually over a covered node's owned gap lines too.

## Capabilities

### Modified Capabilities
- `node-selection-enforcement`: the subtree cover computed for both the
  gap-line single-node trigger and cross-node sibling-run escalation now
  includes the covered node's (or, for a multi-node run, the last covered
  node's) full owned trailing gap, not just its content lines.

## Impact

- `src/escalate.ts`: `subtreeContentEnd` (renamed to reflect its new
  gap-inclusive meaning), `subtreeCoverOf`, `siblingRunCover` — the shared
  cover geometry used by `escalateRange`, `escalateRanges`, and
  `coveredSubtreeRoots`.
- `tests/escalate.test.ts`: scenarios and property tests that assert cover
  end positions or partial-gap retention need updating to the new
  gap-inclusive expectations.
- `e2e/specs/61-selection-enforcement.e2e.ts`: gap-line trigger scenarios'
  expected selection extents.
- `openspec/specs/node-selection-enforcement/spec.md`: the gap-line-trigger
  and multi-node-escalation requirements' described extents.
- No transaction-filter, decoration, or Phase C (edit-enforcement) code
  changes — this is confined to the pure escalation-math module; consumers
  (`src/plugin/transaction-filter.ts`, `src/plugin/decorations.ts`) already
  treat the cover as opaque geometry.
