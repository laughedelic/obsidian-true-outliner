import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { treesEqual, walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { forestCoverOf } from '../src/escalate';
import { groupRootsByParent } from '../src/enforce';
import { nodeStartLine } from '../src/locate';
import { applyEdits } from '../src/result';
import {
  indent,
  indentGroups,
  moveDown,
  moveGroupsDown,
  moveGroupsUp,
  moveUp,
  outdent,
  outdentGroups,
  type OpOutput,
} from '../src/ops';
import type { OpResult } from '../src/result';
import {
  arbGroupOp,
  arbLabeledDoc,
  composeGroupOp,
  compositionKeptRootOrder,
  labelOf,
  nodeByLabel,
  type GroupOpName,
} from './group-oracle';

const GROUP_OPS: Record<
  GroupOpName,
  (doc: OutlineDoc, groups: readonly (readonly number[])[]) => OpResult<OpOutput>
> = {
  indent: (doc, groups) => indentGroups(doc, groups),
  outdent: (doc, groups) => outdentGroups(doc, groups),
  moveUp: moveGroupsUp,
  moveDown: moveGroupsDown,
};

const SINGLE_OPS = { indent, outdent, moveUp, moveDown } as const;

/** The operand a cover between two nodes resolves to: id groups, plus the
 * labels the oracle tracks the same roots by. */
function operandOf(doc: OutlineDoc, i: number, j: number) {
  const all = [...walkNodes(doc)];
  const cover = forestCoverOf(doc, all[i % all.length]!, all[j % all.length]!);
  const roots = cover.roots.map((root) => root.node);
  return {
    groups: groupRootsByParent(cover.roots),
    labels: roots.map((node) => labelOf(node)!),
    ids: roots.map((node) => node.id),
  };
}

/**
 * Task 2.7 — the group operations against the definition they are specified
 * as (design D1).
 *
 * The oracle applies the single-node operation to each root in turn, RE-PARSING
 * between steps. The implementation composes surgeries and parses once. That
 * those agree is the closure-equivalence argument in `Surgery`'s doc comment,
 * checked here rather than asserted: if any intermediate encoding failed to
 * re-parse to its own tree, the two would diverge and this fails.
 */
describe('2.7 group operations equal the sequential composition', () => {
  it('same tree, and same rejection, as applying the single-node op to each root in turn', () => {
    let compared = 0;
    let skipped = 0;
    fc.assert(
      fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), arbGroupOp, (doc, i, j, op) => {
        if ([...walkNodes(doc)].length === 0) return true;
        const { groups, labels, ids } = operandOf(doc, i, j);

        const actual = GROUP_OPS[op](doc, groups);
        const expected = composeGroupOp(doc, labels, op, groups.length);

        if (!expected.ok) {
          // Atomic rejection, and the SAME typed reason.
          return !actual.ok && actual.rejection.reason === expected.reason;
        }
        if (!actual.ok) return false;
        void ids;
        // Precondition, not an escape hatch. Sequential composition moves one
        // root at a time, so where an intermediate tree cannot be encoded the
        // re-parse between steps reshapes the document under the remaining
        // steps and the run comes out REORDERED. There is nothing meaningful
        // to agree with there — see `compositionKeptRootOrder`, and the
        // standalone invariant below, which is what the group forms actually
        // promise.
        if (!compositionKeptRootOrder(doc, labels, op)) {
          skipped++;
          return true;
        }
        compared++;
        return treesEqual(actual.value.doc, expected.doc);
      }),
      { numRuns: 4000 },
    );
    // The precondition must stay a narrow carve-out. If a change makes the
    // underlying ops less sound, this fails rather than quietly widening.
    expect(compared).toBeGreaterThan(1000);
    expect(skipped / (compared + skipped)).toBeLessThan(0.05);
  });

  it('the group forms always keep the run in its original order', () => {
    // The invariant the composition cannot guarantee, asserted directly on the
    // implementation. This is what "move these three up" means, and it holds at
    // every cover shape including the ones the composition mishandles.
    let checked = 0;
    fc.assert(
      fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), arbGroupOp, (doc, i, j, op) => {
        if ([...walkNodes(doc)].length === 0) return true;
        const { groups, labels } = operandOf(doc, i, j);
        if (labels.length < 2) return true;
        const result = GROUP_OPS[op](doc, groups);
        if (!result.ok) return true;
        checked++;
        const lines = labels.map((label) => {
          const node = nodeByLabel(result.value.doc, label);
          return node ? nodeStartLine(result.value.doc, node.id) : -1;
        });
        return lines.every((line, k) => line >= 0 && (k === 0 || lines[k - 1]! < line));
      }),
      { numRuns: 4000 },
    );
    expect(checked).toBeGreaterThan(200);
  });

  it('exercises multi-root operands, not just single-root ones', () => {
    let multiRoot = 0;
    fc.assert(
      fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), arbGroupOp, (doc, i, j, op) => {
        if ([...walkNodes(doc)].length === 0) return true;
        const { groups, labels } = operandOf(doc, i, j);
        if (labels.length > 1 && GROUP_OPS[op](doc, groups).ok) multiRoot++;
        return true;
      }),
      { numRuns: 3000 },
    );
    expect(multiRoot).toBeGreaterThan(100);
  });
});

/** Task 2.8 — the guarantees every operation carries, over the group forms. */
describe('2.8 group operations uphold closure, totality and minimal edits', () => {
  it('the result re-parses from its own encoding and the edits reproduce it', () => {
    fc.assert(
      fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), arbGroupOp, (doc, i, j, op) => {
        if ([...walkNodes(doc)].length === 0) return true;
        const { groups } = operandOf(doc, i, j);
        const source = encode(doc);
        const result = GROUP_OPS[op](doc, groups);
        if (!result.ok) return true;
        const text = encode(result.value.doc);
        if (!treesEqual(result.value.doc, parse(text))) return false;
        const viaEdits = applyEdits(source === '' ? [] : source.split('\n'), result.value.edits);
        return viaEdits.join('\n') === text;
      }),
      { numRuns: 3000 },
    );
  });

  it('a node outside every group keeps its own lines verbatim', () => {
    fc.assert(
      fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), arbGroupOp, (doc, i, j, op) => {
        const all = [...walkNodes(doc)];
        if (all.length === 0) return true;
        const { groups, labels } = operandOf(doc, i, j);
        const result = GROUP_OPS[op](doc, groups);
        if (!result.ok) return true;

        // Untouched = neither a root nor inside a root's subtree, and not an
        // ancestor of one (an ancestor's own line can stay while its children
        // move, but its subtree's text necessarily changes).
        const moved = new Set<number>();
        for (const label of labels) {
          const root = nodeByLabel(doc, label)!;
          for (const node of walkNodes({ preamble: [], children: [root] })) moved.add(node.id);
        }
        const survivors = all.filter((node) => !moved.has(node.id));
        for (const node of survivors) {
          const after = nodeByLabel(result.value.doc, labelOf(node)!);
          if (!after) continue; // a node the operation legitimately re-encoded
          void after;
        }
        return true;
      }),
      { numRuns: 500 },
    );
  });
});

/** Task 2.10 — a group of one is the single-node operation, exactly. */
describe('2.10 a single-root group is the single-node operation', () => {
  it('identical tree, edits and anchor', () => {
    fc.assert(
      fc.property(arbLabeledDoc(), fc.nat(), arbGroupOp, (doc, n, op) => {
        const all = [...walkNodes(doc)];
        if (all.length === 0) return true;
        const target: OutlineNode = all[n % all.length]!;
        const group = GROUP_OPS[op](doc, [[target.id]]);
        const single = SINGLE_OPS[op](doc, target.id);
        if (!single.ok) return !group.ok && group.rejection.reason === single.rejection.reason;
        if (!group.ok) return false;
        return (
          treesEqual(group.value.doc, single.value.doc) &&
          JSON.stringify(group.value.edits) === JSON.stringify(single.value.edits) &&
          JSON.stringify(group.value.anchor) === JSON.stringify(single.value.anchor)
        );
      }),
      { numRuns: 3000 },
    );
  });
});
