## Context

See proposal.md — Why. The diagnosis, the reported shape row by row and the corpus figures are in
`docs/research/32-provisional-position-guides.md`. The mechanism being narrowed is
`guides-end-with-content`'s D1 and D4 (`openspec/changes/archive/2026-08-27-guides-end-with-content/design.md`).

Today, `computeLineGuides(doc, provisionalLine)` builds per-line facts in one walk, and a
trailing-gap line takes the depths of the node the gap follows. Then `trimGapTails` runs from the
bottom, keeping on each gap line only the depths the next content line below it carries. The
provisional row counts as content in that pass and keeps its walk-assigned depths whole, which is
where the over-extension enters. The pass carries it upward onto the blank rows between.

`factsFor` (`src/plugin/decorations.ts`) has two branches for an open position. When the position
bisects a node, every fact comes from `provisional.doc`, the probe's parse, where the row is one of
a node's own lines. The corpus shows that branch already agrees with the typed row. Otherwise the
facts come from the view's own document, and the guides are recomputed from it with the position's
line handed over. Both branches work in the view's numbering since
`positions-re-base-with-the-zoom`: while zoomed, `materializeProvisional` materializes the
position against the zoom root's subtree, the same document the new-node branch computes guides
from, and the result is shifted back by `provisional.offset`.

## Goals / Non-Goals

**Goals:**

- The position's row and the blank rows above it carry what they will carry once the position is
  typed, less only the depth a childless parent would gain.
- Keep the extension's purpose: a position inside a subtree, past its last content line, still
  reaches that subtree's guides.
- Keep `guides-end-with-content`'s property that the position changes the trim and nothing else:
  no second document for the other lines, and no depth added to any line.

**Non-Goals:**

- Changing the trim for rows outside the blank run directly above the position.
- Touching the bisecting branch beyond dropping an argument that is a no-op there.
- Re-deriving which node the position stands for. The probe's parse already answers that, and
  `materializeProbe` stays the single gate that asks it.

## Decisions

### D1: The row keeps the intersection of what it inherits and what the typed row carries

Take the position row's depths, on both tracks, as the depths the walk gave it intersected with
the depths the typed row carries. The first term is the document's bound: guides the document
already has. The second is the node's bound: guides the node the position stands for would have.
The corpus in `docs/research/32` shows the result equals the typed row on every governed row,
except exactly the depth of a childless materialized parent. That depth is the case the
requirement keeps.

*Alternative considered:* the typed row's depths outright. Rejected, because it adds the
childless parent's depth. That is a node rendered as though its first child existed, which the
requirement forbids by name ("A childless heading with an Enter position below it renders as
childless"), and the existing unit test "adds no DEPTH" guards it.

*Alternative considered:* computing every line's guides from the probe's parse, as the bisecting
branch does. Rejected on `guides-end-with-content` D4's grounds, which still hold. In that parse
the node exists, so it changes rows the position must not touch: the gap below a childless parent
gains the parent's guide.

### D2: Hand over the materialized row's guide fact, not a line number and not a document

`computeLineGuides`' second parameter becomes the typed row's own guide fact: `lineNumber`,
`guideDepths` and `listGuideDepths`, the `LineGuideFact` fields the rule reads. In `trimGapTails`,
when the pass reaches that line and it is a gap line, the fact narrows to the intersection (D1).
The narrowed depths then become the "content below" the pass carries upward, so the blank run
above narrows through the carry that already exists, with no second loop. When the line is one of
a node's own lines, as it is in the bisecting branch, nothing changes.

A bare line number cannot say which guides the node would have, and the function takes a parsed
tree rather than text, so it cannot probe for itself. Changing the parameter's type, rather than
adding a second optional one beside the number, means a caller that still hands over only a line
stops compiling instead of quietly keeping the old rule. That is the same reasoning as
`guides-end-with-content` D2's, for the same reason.

### D3: `factsFor`'s new-node branch derives the fact from `provisional.doc`

`provisional.doc` is already the probe's parse, computed once per state by `computeProvisional`,
in the same scope-local numbering as the document the branch computes guides from. The branch
runs `computeLineGuides(provisional.doc)`, takes the row at `provisional.line - provisional.offset`,
and hands it over before the shift back by `provisional.offset`. The row fact and the guides it
narrows are then in one frame by construction. That is one extra walk per open position, cached
per `EditorState` by `overlayCache` like everything else in that branch.

The bisecting branch stops passing anything. There the row is one of a node's own lines, so the
argument was a no-op before this change, and it stays one: D2 narrows only a gap line. The corpus
measured that branch equal to the typed row at every position.

*Alternative considered:* adding the row's guides to `ProvisionalMaterialization` in
`materializeProvisional`. Rejected, because the trail and the bisection gate read that structure
too and have no use for them. Every consumer would pay for a walk only one of them needs.

### D4: The oracle is the typed document, asserted differentially over the generated corpus

The rule is "renders as it will once typed", so the test compares with the typed document
directly. For each generated document, and each blank line `materializeProbe` accepts with the
caret at the line's end and at column 0, it composes the open-position guides the way `factsFor`
does. The typed side is `computeLineGuides` over the probe's parse, with no position involved.
The property requires equality on the position's row and on the blank run directly above it.

The single allowed difference is asserted as a MECHANISM, not waved through. Every depth the
typed side has and the open side lacks must be the materialized node's parent's depth, and that
parent must have no children in the document. Any other difference fails. The test derives the
materialized row fact inline from the probe rather than calling a helper from the implementation,
so a broken consumer cannot make the property vacuous.

## Risks / Trade-offs

- **The row's guides change as the caret moves between two blank rows of one run, or between
  column 0 and the end of a whitespace-only line** → That is the contract: the node the position
  stands for differs, so its guides do, just as its indentation and marker already do.
- **On the gap before a node's first child, a caret at the node's column now drops that node's
  guide from the row** → That is what typing there produces: a second line of the node, which
  never carries the node's own guide. The row regains the guide when the caret leaves.
- **A row fact handed over in the wrong frame under a zoom** → The row fact and the guides it
  narrows are both computed before the shift back, from documents in the same scope-local
  numbering. The zoomed e2e case in task 3.1 is the rendered check.
- **An extra walk per open position** → Linear in the document, and cached per state. It runs
  only while a position is open.

## Migration Plan

None. This is rendering only: no document text, settings or persisted state. Reverting the
commit restores the previous rendering exactly.
