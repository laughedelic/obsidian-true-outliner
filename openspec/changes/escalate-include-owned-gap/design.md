## Context

`src/escalate.ts` implements the pure selection-escalation math from
design.md D4 (and its D4 amendments) of the archived
`outline-selection-enforcement` change. Three functions share one piece of
geometry:

- `subtreeContentEnd(node, startLine)` — walks to the node's (or its deepest
  last descendant's) own last content line, explicitly **excluding** that
  descendant's `trailingGap`. Used by `subtreeCoverOf` (single-node cover)
  and `siblingRunCover` (cross-node run cover) to compute `cover.end`.
- `expandToCover(range, cover)` — the expand-only union: never pulls an end
  back inside the cover, so an end the user already dragged past the cover
  (onto a gap line, or the document's final line) is retained.
- `coveredSubtreeRoots(doc, range)` — the read-only counterpart used by the
  escalated-selection decoration chrome: does the current range exactly
  match a subtree's (or sibling run's) cover?

Today, a node's owned trailing gap enters the selection only through
`expandToCover`'s retention — and only up to wherever the user's drag
actually stopped, not the gap's full extent. `docs/research/13`'s
"Escalation math re-examination candidate" traces the resulting shape: a
same-node drag from mid-A to mid-B (a different node) escalates to A's
content, the gap between them (which is A's own trailing gap, already inside
the sibling-run cover), and B's own content — but not B's trailing gap, even
though B is now fully "in" the selection. A second drag, further down onto
B's blank line, is required to pick up B's gap too. Since gap ownership is
already binary in the parse model (a trailing gap belongs wholly to the
preceding node, never split), this is treated as a re-examination candidate
rather than a bug in isolation: the cover math currently draws a finer
distinction ("did the drag *reach* the gap") than the ownership model it's
built on actually has.

## Goals / Non-Goals

**Goals:**
- Once a node is escalated into a selection as a subtree — via the same-node
  gap-line trigger or via a cross-node sibling-run cover — its owned
  trailing gap is part of the computed cover unconditionally, not
  conditionally on where the drag stopped.
- Preserve every other D4/D4-amendment guarantee unchanged: within-node
  content-only selections still pass through untouched (this change only
  reshapes the cover used once escalation is already triggered — it does
  not change *whether* a range escalates); expand-only still holds;
  orientation, multi-range uniformity, and preamble jurisdiction are
  untouched.
- Keep `coveredSubtreeRoots` and `subtreeCoverOf`/`siblingRunCover` sharing
  one definition of "cover", so decorations, escalation, and any future
  consumer never disagree on where a subtree's selection boundary sits.

**Non-Goals:**
- Changing *when* escalation triggers (the gap-line trigger condition, the
  same-node-content-only pass-through, the node-boundary-crossing
  condition). Only the extent of the resulting cover changes.
- Gap-line cursor placement/navigation (docs/research/13's "Gap-line cursor
  transparency" thread) — cursors are empty ranges and this module already
  never touches them; unrelated to cover geometry.
- Any Phase C (`node-edit-enforcement`) edit-rewriting semantics — this
  module has no document-edit responsibility, only selection-range math.
- Decoration rendering code changes — `coveredSubtreeRoots` callers in
  `src/plugin/decorations.ts` already iterate whatever line range the query
  returns; they need no changes to pick up gap-inclusive covers.

## Decisions

### D1. Redefine the cover's end to include the covered node's own trailing gap

`subtreeContentEnd`'s leaf case currently returns the last line of
`node.lines` (`ch` at that line's length). Change it to walk one step
further when `node.trailingGap` is non-empty: return the last line of
`node.trailingGap` instead (`ch: 0`, since gap lines are always blank). The
non-leaf recursive case is unaffected — it already descends to the deepest
last-descendant leaf and defers to the leaf case for the actual end
position, so extending the leaf case propagates through subtree and
sibling-run covers automatically.

Rename the function to `subtreeCoverEnd` to match its new meaning: it no
longer marks the node's own *content* end, it marks the node's full *cover*
end (content + owned gap). Update its doc comment and the module-level
comments in `subtreeCoverOf`/`siblingRunCover` that currently describe
"trailing gap lines excluded from the visual selection but owned for Phase C
semantics" — that phrase itself needs to change, since the visual selection
no longer excludes the gap.

**Alternative considered**: keep `subtreeContentEnd` as-is (content-only) and
instead make `expandToCover` snap a retained gap-line end forward to the
gap's own full extent, so partial-gap retention becomes whole-gap retention
without touching the base cover. Rejected: this still wouldn't solve the
cross-node case from the research doc (mid-A to mid-B never touches B's gap
at all, so there is no end to snap) — it only patches the same-node
gap-trigger path. The re-examination candidate's actual question ("should
*reaching* a node's content be enough to pull in its gap") is about the
cover itself, not about snapping an already-present end.

### D2. Single-node pass-through condition is untouched

The same-node branch in `escalateRange` still checks
`range.anchor.line < firstGapLine && range.head.line < firstGapLine` before
returning the range unmodified — this decision does not touch that
condition. A within-node double-click or drag that never reaches a gap line
still passes through natively, exactly as `node-selection-enforcement`'s
"Within-node content selections and cursors are untouched" requirement
demands. D1 only changes what `subtreeCoverOf(doc, anchorNode)` returns
*once* that branch has already decided to escalate.

### D3. Expand-only keeps its role for the remaining outside-cover cases

With D1, most of what `expandToCover` used to retain (a dragged-into-gap
end) is now already inside the cover directly, so the union is frequently a
no-op on that end. `expandToCover` itself is unchanged — it still matters
for: an anchor placed before the sibling run's first subtree's start (should
not happen structurally, but the union stays defensive), and a same-node
gap-trigger drag that continues *past* the node's own gap onto or into the
next sibling's territory (which resolves to a different `headNode` and takes
the cross-node branch instead, not this one — the point is that `nodeAtLine`
resolution, not `expandToCover`, is what would catch that case; expand-only
is simply not load-bearing for it either way).

## Risks / Trade-offs

- **[Risk]** Loose gaps spanning multiple blank lines: a drag that
  previously stopped on the *first* blank line of a multi-line gap only
  included that one line (a partial-gap selection); after this change it
  includes the gap's full extent in one step. This is an intentional
  behavior change (the proposal's stated goal), not a regression, but it is
  a visible selection-extent change for any loose-list note.
  → **Mitigation**: covered explicitly by a new property/example test
  (multi-blank-line trailing gap, drag stopping on the first blank line,
  asserting the full gap is included) and by an e2e scenario update.
- **[Risk]** `tests/escalate.test.ts` has existing scenarios and property
  tests asserting cover-end positions and partial-gap retention under the
  old, content-only definition; those assertions need updating in lockstep
  with the rename, or they will fail for the right reason (behavior
  changed) but look like a regression in review.
  → **Mitigation**: tasks.md enumerates the specific test blocks (gap-line
  trigger, expand-only, coveredSubtreeRoots) that need their expected
  positions/comments updated, not just a blanket "fix failing tests" step.
- **[Risk]** `openspec/specs/node-selection-enforcement/spec.md`'s existing
  requirement text and scenarios ("A selection reaching a node's trailing
  gap escalates to that node", "Escalation never shrinks the selection")
  describe the pre-D1 shape closely enough that a reader could conflate "the
  gap is retained because the user dragged there" with "the gap is included
  because the node was covered" — the delta spec must be explicit that the
  cover itself is now gap-inclusive, not just retained.
  → **Mitigation**: the delta spec (this change) revises the relevant
  requirement's body text and adds a scenario for the single-drag,
  no-second-motion case and the multi-blank-line case.
- **[Trade-off]** This narrows the daylight between "the visual selection"
  and "gap ownership" that the original D4 deliberately kept separate
  ("trailing gap lines excluded from the visual selection but owned for
  Phase C semantics"). That separation was a starting simplification, not a
  permanent invariant — the research doc's framing (gap ownership is already
  binary; the cover math should match it) is the basis for closing the gap
  now rather than carrying two slightly different notions of "this node's
  extent" forward into Phase C and the selection-UX track.

## Migration Plan

Pure function change in a leaf module with no persisted state, no schema,
and no cross-version data to migrate. Roll out as a normal PR: update
`src/escalate.ts`, update `tests/escalate.test.ts` and the relevant e2e
scenarios, sync the `node-selection-enforcement` delta spec into
`openspec/specs/`, done. No feature flag — this is corrective math, not a
new opt-in behavior, consistent with how D4's own amendments landed.

## Open Questions

None outstanding — the research doc's question ("should reaching a node's
content be enough to pull in its gap") is answered by this design (yes, via
the cover redefinition); the remaining docs/research/13 threads it
cross-references (gap-line cursor transparency, collapsing gap lines) are
explicitly out of scope per Non-Goals and remain filed there.
