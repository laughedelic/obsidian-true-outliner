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

  it('every node above the operand keeps its own first line verbatim', () => {
    // Scoped to nodes ABOVE the first moved root on purpose. Below it, an
    // operation legitimately rewrites lines it did not move: outdent re-parents
    // following siblings, and ordered runs renumber — the one documented
    // exception to minimal edits. Above it, nothing an operation does can reach,
    // so a changed line there is a real defect.
    let checked = 0;
    fc.assert(
      fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), arbGroupOp, (doc, i, j, op) => {
        const all = [...walkNodes(doc)];
        if (all.length === 0) return true;
        const { groups, labels } = operandOf(doc, i, j);
        const result = GROUP_OPS[op](doc, groups);
        if (!result.ok) return true;

        const firstRootLine = Math.min(
          ...labels.map((label) => nodeStartLine(doc, nodeByLabel(doc, label)!.id)),
        );
        const above = all.filter((node) => {
          // Ordered items are excluded wherever they sit: renumbering is the
          // one documented exception to minimal edits, and it reaches UPWARD
          // within a run — an outdent arriving in a run can rewrite the marker
          // of an item above the operand. (That particular rewrite is a
          // pre-existing bug, filed separately: the arriving node's inherited
          // number hijacks the run's start.)
          if (node.listStyle?.type === 'ordered') return false;
          const start = nodeStartLine(doc, node.id);
          return start >= 0 && start + node.lines.length <= firstRootLine;
        });
        for (const node of above) {
          const after = nodeByLabel(result.value.doc, labelOf(node)!);
          if (!after || after.lines[0] !== node.lines[0]) return false;
          checked++;
        }
        return true;
      }),
      { numRuns: 2000 },
    );
    expect(checked).toBeGreaterThan(200);
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

// --------------------------------------------------------------- scenarios

/** Ids of the nodes whose first line contains each marker, in document order. */
function idsOf(doc: OutlineDoc, ...markers: string[]): number[] {
  return markers.map((marker) => {
    const node = [...walkNodes(doc)].find((n) => n.lines[0]!.includes(marker));
    if (!node) throw new Error(`no node containing ${marker}`);
    return node.id;
  });
}

describe('group operation scenarios', () => {
  it('a sibling run indents as a block, in order, after existing children', () => {
    const doc = parse('- a\n  - kid\n- b\n- c\n');
    const result = indentGroups(doc, [idsOf(doc, '- b', '- c')]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toBe('- a\n  - kid\n  - b\n  - c\n');
  });

  it('a run moves down past its own neighbour, not past itself', () => {
    const doc = parse('- a\n- b\n- c\n');
    const result = moveGroupsDown(doc, [idsOf(doc, '- a', '- b')]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toBe('- c\n- a\n- b\n');
  });

  it('a run keeps its order where a step-at-a-time composition would reverse it', () => {
    // The amended rule (design D10). Moving one root at a time yields
    // `L2 / L1 / - L0`, because after step one `- L0` re-parses as L1's child
    // and L2's previous sibling becomes L1 itself.
    const doc = parse('- L0\n\nL1\n\nL2\n');
    const result = moveGroupsUp(doc, [idsOf(doc, 'L1', 'L2')]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toBe('L1\n\nL2\n\n- L0\n');
  });

  it('a multi-parent reorder is rejected, and nothing is moved', () => {
    const doc = parse('- p\n  - q\n  - r\n- t\n');
    const groups = [idsOf(doc, '- r'), idsOf(doc, '- t')];
    for (const op of [moveGroupsUp, moveGroupsDown]) {
      const result = op(doc, groups);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.rejection.reason).toBe('cannot-reorder-across-scopes');
    }
  });

  it('a multi-parent indent applies to every group', () => {
    const doc = parse('- p\n  - q\n  - r\n- s\n- t\n');
    const groups = [idsOf(doc, '- r'), idsOf(doc, '- t')];
    const result = indentGroups(doc, groups);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `- r` goes under `- q`; `- t` goes under `- s`.
    expect(encode(result.value.doc)).toBe('- p\n  - q\n    - r\n- s\n  - t\n');
  });

  it('one inexpressible root rejects the whole group and changes nothing', () => {
    const doc = parse('- p\n- a\n- b\n');
    // `- p` has no previous sibling, so the run [p, a] cannot indent.
    const result = indentGroups(doc, [idsOf(doc, '- p', '- a')]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('no-previous-sibling');
  });

  it('an empty forest is rejected', () => {
    const doc = parse('- a\n');
    for (const op of [indentGroups, outdentGroups, moveGroupsUp, moveGroupsDown]) {
      const result = op(doc, []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.rejection.reason).toBe('empty-selection');
    }
  });

  it('renumbers an ordered run once, from the start it began with', () => {
    // Indenting the head of `5. 6. 7.` away leaves the survivors renumbering
    // from 5 — computed over the final membership, not once per step.
    const doc = parse('- bullet\n5. one\n6. two\n7. three\n');
    const result = indentGroups(doc, [idsOf(doc, 'one', 'two')]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toBe('- bullet\n  5. one\n  6. two\n5. three\n');
  });

  it('states a span that is exactly the cover of the moved roots', () => {
    const doc = parse('- a\n- b\n- c\n');
    const result = indentGroups(doc, [idsOf(doc, '- b', '- c')]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The invariant, not the coordinates: the span IS the forest cover of the
    // moved roots in the result, so a caller can dispatch it as a selection
    // with no further geometry. (Its end includes the last root's owned
    // trailing gap, which is what makes it an exact cover.)
    const after = result.value.doc;
    const moved = idsOf(after, '- b', '- c').map(
      (id) => [...walkNodes(after)].find((n) => n.id === id)!,
    );
    const cover = forestCoverOf(after, moved[0]!, moved[1]!).cover;
    expect(result.value.span).toEqual(cover);
  });

  it('states a span for a single-node operation too', () => {
    const doc = parse('- a\n- b\n');
    const result = indentGroups(doc, [idsOf(doc, '- b')]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = result.value.doc;
    const b = [...walkNodes(after)].find((n) => n.lines[0]!.includes('- b'))!;
    expect(result.value.span).toEqual(forestCoverOf(after, b, b).cover);
  });
});
