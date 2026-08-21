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
import type { ForestRoot } from './escalate';
import { coveredForestOf, escalateRange, forestCoverOf } from './escalate';
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
