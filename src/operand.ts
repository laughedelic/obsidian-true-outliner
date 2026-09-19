/**
 * What a structural operation ACTS ON, resolved from a selection
 * (`selection-structural-ops`).
 *
 * Its own module rather than a corner of `enforce.ts` because both structural
 * entry points need it — the keyboard grammar and the command palette — and
 * `enforce.ts` is the edit-rewriting layer, which neither of them goes through.
 * A second resolution living beside `planKey` is the failure this codebase has
 * paid for repeatedly: `caret-placement-policy` exists because one question had
 * seven answers, and Q18/Q19 are two silently-stale duplicates of a re-indent
 * rule. One resolution also means a cover reached by dragging, by Shift+Arrow,
 * by Mod+A or by undo is operated on identically, which is what the capability's
 * provenance-independence requirement asserts.
 *
 * `groupRootsByParent` moved here with it. It answers "what shape does a cover
 * have as an operand", which is this module's question, and leaving it in
 * `enforce.ts` while `coverGroupsOf` moved out would have made the two modules
 * import each other.
 */

import type { OutlineDoc } from './model';
import type { OpOutput } from './ops';
import type { LinePos } from './line-pos';
import type { ForestRoot } from './escalate';
import { coveredForestOf, escalateRange, forestCoverOf, subtreeCoverOf } from './escalate';
import type { Cover } from './escalate';
import type { OutlineNode } from './model';
import { walkNodes } from './model';
import { nodeAtLine } from './locate';
import { isEmptyRange, type LineRange } from './line-pos';

/**
 * Roots (document order) split into one contiguous sibling run per parent.
 * A forest span is an interval in document order, so it cannot straddle a
 * parent's children non-contiguously — consecutive roots sharing a parent
 * are therefore always a contiguous run, and a parent change always starts a
 * new group.
 *
 * Every caller that hands roots to `deleteSubtreeGroups` MUST go through
 * this: that function resolves each group with `resolveContiguousGroup`,
 * which REJECTS a group whose members do not share a parent — and a
 * rejection there is a veto, i.e. the user's whole deletion silently refused.
 * Reads `ForestRoot.path` rather than calling `findPath` per root, which was
 * a full-tree search per root (Θ(n²) for a forest of n roots).
 */
export function groupRootsByParent(roots: readonly ForestRoot[]): readonly (readonly number[])[] {
  const groups: number[][] = [];
  let currentParent: string | undefined;
  for (const root of roots) {
    const parentKey = root.path.slice(0, -1).join('/');
    if (parentKey !== currentParent) {
      groups.push([]);
      currentParent = parentKey;
    }
    groups[groups.length - 1]!.push(root.node.id);
  }
  return groups;
}

/** The whole-subtree cover of a (possibly stale, never-escalated) range, as
 * groups — the SAME rule for an already-escalated selection and a mid-node
 * one (`node-edit-enforcement` design D3: "one rule for both paths"). Returns
 * `undefined` when either end is out of jurisdiction (preamble). More than
 * one group means the cover is a mixed-depth forest, newly reachable since
 * `selection-as-subtree-set`. */
export function coverGroupsOf(
  doc: OutlineDoc,
  range: LineRange,
): readonly (readonly number[])[] | undefined {
  const covered = escalateRange(doc, range);
  const loLine = Math.min(covered.anchor.line, covered.head.line);
  const hiLine = Math.max(covered.anchor.line, covered.head.line);
  const startNode = nodeAtLine(doc, loLine);
  const endNode = nodeAtLine(doc, hiLine);
  if (!startNode || !endNode) return undefined;
  return groupRootsByParent(forestCoverOf(doc, startNode, endNode).roots);
}

export interface Operand {
  /** One contiguous sibling run per parent, in document order — the shape the
   * group operations take. */
  readonly groups: readonly (readonly number[])[];
  /**
   * Whether the selection this was resolved from was ALREADY an exact cover.
   *
   * The after-state rule keys on this and not on the root count (design D4):
   * a selection that was a block cover stays one, and an ordinary character
   * range keeps its caret. Root count would make a single-root cover collapse
   * to a caret while a two-root cover survived — the user's selection living or
   * dying by how far they extended it.
   */
  readonly wasCover: boolean;
}

/**
 * The operand for a structural operation, from the current selection.
 *
 * Three inputs resolve to a single root, which is what keeps every existing
 * single-node behaviour byte-identical:
 *
 * - an EMPTY selection — the node whose line span contains the caret line,
 *   exactly as `planKey` and `runOp` each resolved it before;
 * - a range that is not an exact cover — escalated by the shared geometry,
 *   which yields the containing node's own cover;
 * - an exact cover with one root.
 *
 * `undefined` means no jurisdiction (the preamble), and the caller declines —
 * stock behaviour, unchanged.
 */
export function resolveOperand(doc: OutlineDoc, range: LineRange): Operand | undefined {
  if (isEmptyRange(range)) {
    const node = nodeAtLine(doc, range.head.line);
    return node ? { groups: [[node.id]], wasCover: false } : undefined;
  }
  const covered = coveredForestOf(doc, range);
  if (covered) return { groups: groupRootsByParent(covered.roots), wasCover: true };
  const groups = coverGroupsOf(doc, range);
  return groups ? { groups, wasCover: false } : undefined;
}

/** What a drag picks up, and whether the selection has to move to match. */
export interface DragOperand {
  readonly groups: readonly (readonly number[])[];
  /**
   * The cover the selection becomes, where the press landed outside it —
   * `undefined` leaves the selection exactly as it was.
   *
   * A cover IS the block-selection interaction mode, so entering one is not a
   * neutral act: the editor blurs, the covered lines stop rendering raw, and
   * block chrome appears. That is why this is the DRAG's answer and not the
   * press's — a press that never moves is a zoom, which has no business
   * entering block selection on its way.
   */
  readonly collapseTo: Cover | undefined;
}

/**
 * The operand of a DRAG: the same rule every other structural operation
 * resolves by, asked about the node the pointer is holding rather than about
 * the caret.
 *
 * The pressed node inside the current cover means the whole cover travels —
 * dragging several nodes is the same gesture and not a second one. Pressed
 * anywhere else, the operand is that node's own subtree, and the selection
 * becomes its cover so that what is in flight is always what is drawn as
 * selected.
 *
 * INSIDE, not "is one of the roots": a press on a covered root's own
 * descendant is still a press inside the cover, and picking that descendant
 * out of it would drag a part of what the reader can see selected.
 */
export function dragOperand(
  doc: OutlineDoc,
  range: LineRange,
  pressedId: number,
): DragOperand | undefined {
  let pressed: OutlineNode | undefined;
  for (const node of walkNodes(doc)) {
    if (node.id === pressedId) pressed = node;
  }
  if (!pressed) return undefined;

  const covered = coveredForestOf(doc, range);
  if (covered && covered.roots.some((root) => subtreeHolds(root.node, pressedId))) {
    return { groups: groupRootsByParent(covered.roots), collapseTo: undefined };
  }
  return { groups: [[pressed.id]], collapseTo: subtreeCoverOf(doc, pressed) };
}

function subtreeHolds(node: OutlineNode, id: number): boolean {
  return node.id === id || node.children.some((child) => subtreeHolds(child, id));
}

/**
 * The selection a dispatch should state after an accepted operation: the cover
 * of the moved subtrees when the operand WAS a cover, else the caret
 * `caret-placement-policy` computed.
 *
 * Shared rather than written at each dispatch site, because
 * `selection-structural-ops` requires both entry points to resolve their
 * after-state through one rule and not re-derive it. The keyboard path and the
 * command palette had already grown two copies of the caret rule once, which is
 * why `caret-placement-policy` exists at all; this is the same question one
 * layer up.
 *
 * Orientation is left to the caller: it is a property of the selection the user
 * had, which only each adapter can see.
 */
export function afterState(
  result: OpOutput,
  wasCover: boolean,
  caret: LinePos,
): { readonly from: LinePos; readonly to?: LinePos } {
  return wasCover ? { from: result.span.start, to: result.span.end } : { from: caret };
}
