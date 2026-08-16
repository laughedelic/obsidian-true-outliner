/**
 * Keyboard selection extension (node-selection-extension, design.md D1-D2,
 * D6, D8): `Shift+ArrowDown`/`Shift+ArrowUp` step one node along an ordered
 * sequence of covers rather than moving a character cursor and letting the
 * transaction filter correct whatever crossing results.
 *
 * Pure module — no CodeMirror imports; src/plugin/keymap.ts is the CM6
 * adapter (offsets, multi-range iteration, the outline-mode gate). Built on
 * escalate.ts's `forestCoverOf`/`coveredForestOf`/`subtreeCoverOf`; this file
 * adds no cover math of its own, and is the fifth consumer of that one
 * computation (`selection-as-subtree-set` D4, and the two silently-stale
 * duplicate incidents in docs/research/04 Q18/Q19).
 *
 * Stateless: the next selection is a function of the current one and the
 * document. No press count, no stored head node, no extension origin. What
 * makes that possible is that a cover identifies its own anchor — see
 * `anchorRootOf` for the rule and for the case where it re-seats.
 *
 * ## The sequence, and why the step is computed directly
 *
 * For an anchor node and a direction the reachable selections form an
 * ordered, strictly growing sequence of covers: the anchor's own whole
 * subtree first, then each successive node in content order in that
 * direction, with steps that would not change the cover omitted (D2).
 *
 * That sequence is never materialized. Every node interior to the current
 * cover reproduces that same cover — which is precisely what D2 omits — so
 * the next distinct element is reached by taking the first node OUTSIDE the
 * cover on the growing side, i.e. `nodeAtLine(cover.end.line + 1)` going
 * down and `nodeAtLine(cover.start.line - 1)` going up. Covers tile the
 * document by whole lines, so those lines are exactly the neighbouring
 * nodes' own. Building the list instead would be O(n) covers each costing
 * O(n) to compute, per keystroke, and would put a second implementation of
 * the sequence beside this one. Tests recover the sequence by iterating
 * `extendSelection`, so there is only ever one.
 *
 * ## What this module does NOT decide (D11)
 *
 * Whether a press is about the outline AT ALL. A press that merely moves
 * within one node's own text — the interior of a wrapped paragraph, a code
 * fence, a table — is ordinary text selection and never reaches here; the CM6
 * adapter declines it first. That question cannot be answered in this module
 * because it depends on VISUAL lines: a single source line that soft-wraps
 * spans several rows on screen, and `Shift+ArrowDown` moves by row. Only the
 * view knows where the rows are (`EditorView.moveVertically`). A first
 * implementation tried to answer it here from source lines alone and got the
 * common case backwards — a long wrapped paragraph is ONE source line, so it
 * looked like a single-line node and was block-selected on the first press.
 *
 * ## Relationship to the Mod-A ladder (D10)
 *
 * None, deliberately, beyond the shared geometry underneath. Both features
 * read only the current selection, so a selection reached by any route
 * behaves identically to the same selection reached by another; neither
 * consults how it was produced. `select-all-ladder.ts` is not imported here
 * and must not be.
 */

import type { OutlineDoc, OutlineNode } from './model';
import { ownSpan } from './model';
import { nodeAtLine } from './locate';
import {
  coveredForestOf,
  subtreeCoverOf,
  forestCoverOf,
  type Cover,
  type ForestCover,
} from './escalate';
import { isBackward, isEmptyRange, type LineRange } from './line-pos';

/** Which way a press extends. Not CodeMirror's `Direction` (that one is
 * bidi text direction) — this is document order. */
export type ExtendDirection = 'up' | 'down';

/** Orient a cover as a range growing in `direction`: the head is the end
 * the next press would move, so growing down puts it at the bottom and
 * growing up puts it at the top. */
function orient(cover: Cover, direction: ExtendDirection): LineRange {
  return direction === 'down'
    ? { anchor: cover.start, head: cover.end }
    : { anchor: cover.end, head: cover.start };
}

/**
 * The anchor node of a normalized cover (design.md D8) — read off the
 * cover's own roots, never stored.
 *
 * With two or more roots it is the root on the FIXED side: the first for a
 * forward (grown-downward) cover, the last for a backward one. With exactly
 * one root, that root IS the anchor and the cover is the base of its
 * sequence.
 *
 * The single-root case is what an upward ancestor swallow produces, and the
 * rule's consequence is that the swallow RE-SEATS the anchor onto the
 * swallowed ancestor. Extending up out of a node that is not its parent's
 * last child yields the parent's whole subtree, because downward closure
 * admits no smaller cover containing both; the original child is then on
 * neither edge of the cover and is genuinely unrecoverable. An earlier draft
 * of D3 claimed the end edge still identified it — measured false, and the
 * asymmetry is inherent to preorder (see escalate.ts's `forestCoverOf`), not
 * a defect a different formulation could remove.
 */
function anchorRootOf(forest: ForestCover, backward: boolean): OutlineNode {
  const { roots } = forest;
  if (roots.length === 1) return roots[0]!.node;
  return backward ? roots[roots.length - 1]!.node : roots[0]!.node;
}

/**
 * The cover this press starts from, and whether reaching it was itself the
 * step (design.md D6).
 *
 * A press can receive a range that is not a cover at all, through two
 * ordinary gestures rather than only through corruption: a selection
 * restored by undo/redo, which history maps forward with `filter: false` so
 * the escalation filter provably never sees it; and the Mod-A ladder's first
 * rung, which is a node's OWN CONTENT (for a list item, starting after its
 * marker) and is not a cover. A bare cursor is the third, trivial case.
 *
 * Normalization is `subtreeCoverOf` of the node the range's anchor resolves
 * to — NOT `escalateRange`/`escalateRanges`. Those deliberately return a
 * within-node content range untouched, which is right for them (a partial
 * selection inside one node must stay partial) and useless here: measured on
 * the ladder's rung 1, both leave it a non-cover.
 *
 * When normalization changes the selection it IS the press's step, and the
 * sequence does not additionally advance — a press moves one position, and
 * for an input that was not on the sequence, arriving on it is that move.
 * This is what makes `Mod-A` once then `⇧↓` identical to `⇧↓` from a bare
 * caret in the same node (D10).
 */
function normalize(
  doc: OutlineDoc,
  range: LineRange,
): { forest: ForestCover; normalized: boolean } | null {
  if (!isEmptyRange(range)) {
    const forest = coveredForestOf(doc, range);
    if (forest) return { forest, normalized: false };
  }

  // Not a cover (or a cursor): fall back to the anchor's own node. For a
  // cursor `anchor` and `head` coincide, so this reads the caret's line.
  const node = nodeAtLine(doc, range.anchor.line);
  if (!node) return null; // preamble, or past the final gap — no jurisdiction
  const forest = coveredForestOf(doc, orient(subtreeCoverOf(doc, node), 'down'));
  if (!forest) return null; // defensive: a subtree cover is always a cover
  return { forest, normalized: true };
}

/** The first node OUTSIDE `cover` on `direction`'s side, or `undefined` at
 * the document's edge or the preamble boundary. Covers span whole lines, so
 * the neighbouring line is the neighbouring node's own. */
function neighbourNode(
  doc: OutlineDoc,
  cover: Cover,
  direction: ExtendDirection,
): OutlineNode | undefined {
  const line = direction === 'down' ? cover.end.line + 1 : cover.start.line - 1;
  return line < 0 ? undefined : nodeAtLine(doc, line);
}

/**
 * The candidate one step INWARD from the current cover — the node that
 * generates the previous distinct element of the sequence.
 *
 * A cover is `forestCoverOf(anchor, candidate)` for the candidate on its far
 * side, and the sequence walks candidates outward one preorder step at a
 * time. Shrinking therefore steps the CANDIDATE back and recomputes, rather
 * than editing the roots list.
 *
 * Editing the roots list is what the first implementation did, and it is
 * wrong in the upward direction: growing up can ABSORB the previous leading
 * roots into the newly added ancestor. Measured on
 * `# A / a1. / # B / b1. / b2.` — the cover `[a1., # B]` grows up to
 * `[# A, # B]`, since `a1.` lives inside `# A`'s subtree, and dropping the
 * new first root then removed `a1.` as well, landing two steps back on a
 * cover the walk had passed through. Recomputing from the candidate cannot
 * drift this way: it asks the same question growth asked, one step earlier.
 *
 * Going down, the inward candidate is the preorder PREDECESSOR of the last
 * root — the node owning the line just above it. Going up it is the preorder
 * SUCCESSOR of the first root — the node owning the line just past that
 * root's own footprint, which is its first child when it has one.
 */
function inwardCandidate(
  doc: OutlineDoc,
  forest: ForestCover,
  backward: boolean,
): OutlineNode | undefined {
  const { roots } = forest;
  if (backward) {
    const first = roots[0]!;
    return nodeAtLine(doc, first.cover.start.line + ownSpan(first.node));
  }
  const last = roots[roots.length - 1]!;
  const line = last.cover.start.line - 1;
  return line < 0 ? undefined : nodeAtLine(doc, line);
}

/**
 * The selection one press produces, or `null` when the press has nowhere to
 * go — the sequence is exhausted in that direction, or the range has no
 * node jurisdiction at all (the preamble). The caller declines the key on
 * `null`, leaving the selection untouched.
 *
 * Never returns a range equal to its input while a further element exists:
 * every branch either normalizes onto the sequence, grows to a strictly
 * larger cover, or shrinks to a strictly smaller one. That is what keeps a
 * press from being a visible no-op — the failure today's native-extend-then-
 * escalate path exhibits as an outright fixpoint (design.md Context).
 */
export function extendSelection(
  doc: OutlineDoc,
  range: LineRange,
  direction: ExtendDirection,
): LineRange | null {
  const start = normalize(doc, range);
  if (!start) return null;

  // Arriving on the sequence is this press's step (D6).
  if (start.normalized) return orient(start.forest.cover, direction);

  const { forest } = start;
  const backward = isBackward(range);
  const anchorNode = anchorRootOf(forest, backward);

  // A single-root cover is the base of its sequence — it IS the anchor's own
  // subtree, since `anchorRootOf` returns that root — so there is nothing
  // smaller to return to and BOTH directions grow from it (D8). This is the
  // state an upward ancestor swallow lands in, and why `⇧↓` out of it grows
  // to the parent's next sibling rather than shrinking back to a child the
  // cover no longer identifies.
  const atBase = forest.roots.length === 1;
  const growing = atBase || (direction === 'down' ? !backward : backward);

  const candidate = growing
    ? neighbourNode(doc, forest.cover, direction)
    : inwardCandidate(doc, forest, backward);
  if (!candidate) return null; // sequence exhausted in that direction

  // Both directions recompute the same way, from the anchor and a candidate;
  // only which candidate differs. A shrink keeps the current orientation —
  // it does not change which way the selection is growing.
  const cover = forestCoverOf(doc, anchorNode, candidate).cover;
  return orient(cover, growing ? direction : backward ? 'up' : 'down');
}

/**
 * Multi-range entry point (design.md D4/D7): each range steps along its own
 * anchor's sequence independently, exactly as `nextRungs` does for the Mod-A
 * ladder — there is no uniform/forced-common-step rule here, unlike
 * `escalateRanges`. Returns one entry per input range, `null` where the walk
 * produced nothing — which covers TWO different situations that this module
 * cannot tell apart and does not try to: the range has no node jurisdiction at
 * all (the preamble), or it is in jurisdiction and its sequence is exhausted.
 *
 * Distinguishing them is the CM6 adapter's job, and it matters: the first was
 * never ours and must fall through to stock extension, while the second must
 * leave the selection UNCHANGED — declining there lets stock extension move a
 * backward cover's head inward and shrink it.
 */
export function extendSelections(
  doc: OutlineDoc,
  ranges: readonly LineRange[],
  direction: ExtendDirection,
): readonly (LineRange | null)[] {
  return ranges.map((range) => extendSelection(doc, range, direction));
}
