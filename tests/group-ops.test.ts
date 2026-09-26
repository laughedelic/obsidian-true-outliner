import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { treesEqual, walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { forestCoverOf } from '../src/escalate';
import { groupRootsByParent } from '../src/operand';
import { nodeStartLine } from '../src/locate';
import { applyEdits } from '../src/result';
import { indentWidth } from '../src/parse';
import { markerWidthOf } from '../src/reencode';
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
    let checked = 0;
    fc.assert(
      fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), arbGroupOp, (doc, i, j, op) => {
        if ([...walkNodes(doc)].length === 0) return true;
        const { groups, labels } = operandOf(doc, i, j);
        const result = GROUP_OPS[op](doc, groups);
        if (!result.ok) return true;
        const kept = firstLinesKeptAbove(doc, labels, result.value.doc);
        if (kept === undefined) return false;
        checked += kept;
        return true;
      }),
      { numRuns: 2000 },
    );
    expect(checked).toBeGreaterThan(200);
  });

  /**
   * Moving `10. L2` up renumbers the item it swaps with from `9.` to `10.`, and
   * the widened marker carries `- L1` a column right with it. `- L1` started
   * above the operand, and the oracle counted it as a node nothing could reach.
   */
  it('a sibling a move displaces carries its subtree to its widened marker', () => {
    const doc = parse(['9. L0', '   - L1', '10. L2'].join('\n'));
    const after = applied(doc, 'L2', moveGroupsUp);

    expect(encode(after).split('\n')).toEqual(['9. L2', '10. L0', '    - L1']);
    expect(firstLinesKeptAbove(doc, ['L2'], after)).toBe(1);
  });

  /**
   * The same reach through an ANCESTOR of the operand: outdenting `- L3` changes
   * the sibling list its parent sits in, and that run was not consecutive, so
   * it is normalized and `9. L1` becomes `10. L1`. `- L2` moves with it.
   */
  it('an outdent whose parent widens carries its other children along', () => {
    const doc = parse(['9. L0', '9. L1', '   - L2', '   - L3'].join('\n'));
    const after = applied(doc, 'L3', outdentGroups);

    expect(encode(after).split('\n')).toEqual(['9. L0', '10. L1', '    - L2', '- L3']);
    expect(firstLinesKeptAbove(doc, ['L3'], after)).toBe(1);
  });

  /**
   * Narrowing keeps the tree and drifts the indentation, which no tree
   * comparison sees: `10. L1` renumbered to `9. L1` has to bring `- L2` a
   * column back in, and the oracle holds it to exactly that column.
   */
  it('a marker that narrows above the operand brings its subtree in', () => {
    const doc = parse(['8. L0', '10. L1', '    - L2', '- L3', '1. L4'].join('\n'));
    const after = applied(doc, 'L4', moveGroupsUp);

    expect(encode(after).split('\n')).toEqual(['8. L0', '9. L1', '   - L2', '10. L4', '- L3']);
    expect(firstLinesKeptAbove(doc, ['L4'], after)).toBe(2);
  });

  /**
   * `09.` and `10.` are the same width, so the subtree must NOT move, though the
   * number gained a digit: the oracle reads the width from the marker as
   * written, and rejects a child that drifted anyway.
   */
  it('a renumbering that keeps a marker width moves nothing below it', () => {
    const doc = parse(['09. L0', '    - L1', '10. L2'].join('\n'));
    const after = applied(doc, 'L2', moveGroupsUp);

    expect(encode(after).split('\n')).toEqual(['9. L2', '10. L0', '    - L1']);
    expect(firstLinesKeptAbove(doc, ['L2'], after)).toBe(1);
    const drifted = parse(['9. L2', '10. L0', '     - L1'].join('\n'));
    expect(firstLinesKeptAbove(doc, ['L2'], drifted)).toBeUndefined();
  });

  /**
   * A tab after the marker runs to the next tab stop, so the content column
   * is what moves, not the digit count: `9.⇥` and `10.⇥` both reach column 4
   * and `- L1` stays; `99.⇥` reaches 4 and `100.⇥` reaches 8, so it moves four.
   */
  it('a tab after the marker moves the subtree by its content column', () => {
    const same = parse(['9.\tL0', '    - L1', '10.\tL2'].join('\n'));
    const kept = applied(same, 'L2', moveGroupsUp);
    expect(encode(kept).split('\n')).toEqual(['9.\tL2', '10.\tL0', '    - L1']);
    expect(firstLinesKeptAbove(same, ['L2'], kept)).toBe(1);

    const wider = parse(['99.\tL0', '    - L1', '100.\tL2'].join('\n'));
    const moved = applied(wider, 'L2', moveGroupsUp);
    expect(encode(moved).split('\n')).toEqual(['99.\tL2', '100.\tL0', '        - L1']);
    expect(firstLinesKeptAbove(wider, ['L2'], moved)).toBe(1);
  });
});

/** The document a group operation leaves, with `label`'s node as the operand. */
function applied(
  doc: OutlineDoc,
  label: string,
  op: (doc: OutlineDoc, groups: readonly (readonly number[])[]) => OpResult<OpOutput>,
): OutlineDoc {
  const result = op(doc, [[nodeByLabel(doc, label)!.id]]);
  if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
  return result.value.doc;
}

/**
 * The minimal-edit oracle: every node above the operand's first root keeps its
 * first line in `after`. Returns how many nodes it checked, or `undefined` at
 * the first one that changed.
 *
 * Scoped to nodes ABOVE the first moved root on purpose. Below it, an
 * operation legitimately rewrites lines it did not move: outdent re-parents
 * following siblings, and ordered runs renumber — the one documented exception
 * to minimal edits. Above it, renumbering is the only thing that reaches: a
 * reorder relocates the sibling it swaps with, and a run that was not
 * consecutive is normalized wherever it stands, the operand's own ancestors
 * included. A renumbered marker that changes width moves its item's content
 * column, and its whole subtree moves with it; so a node under ordered items
 * keeps its text and moves by exactly the sum of their content columns' moves,
 * and a node under none of them keeps its first line verbatim.
 */
function firstLinesKeptAbove(
  before: OutlineDoc,
  labels: readonly string[],
  after: OutlineDoc,
): number | undefined {
  const firstRootLine = Math.min(
    ...labels.map((label) => nodeStartLine(before, nodeByLabel(before, label)!.id)),
  );
  // Each node's shift: the columns its ordered ancestors' content columns
  // moved by, read the way the parser reads them, tab stops included.
  const shift = new Map<number, number>();
  const measure = (nodes: readonly OutlineNode[], inherited: number): void => {
    for (const node of nodes) {
      shift.set(node.id, inherited);
      let own = 0;
      if (node.listStyle?.type === 'ordered') {
        const renumbered = nodeByLabel(after, labelOf(node)!);
        if (renumbered) {
          own = markerWidthOf(renumbered.lines[0]!) - markerWidthOf(node.lines[0]!);
        }
      }
      measure(node.children, inherited + own);
    }
  };
  measure(before.children, 0);

  const above = [...walkNodes(before)].filter((node) => {
    // Ordered items are excluded wherever they sit: their own markers are
    // what renumbering rewrites, including above the operand in a run that
    // was not consecutive.
    if (node.listStyle?.type === 'ordered') return false;
    const start = nodeStartLine(before, node.id);
    return start >= 0 && start + node.lines.length <= firstRootLine;
  });
  let checked = 0;
  for (const node of above) {
    const moved = nodeByLabel(after, labelOf(node)!);
    if (!moved) return undefined;
    const was = node.lines[0]!;
    const is = moved.lines[0]!;
    const by = shift.get(node.id)!;
    if (by === 0 ? is !== was : is.trimStart() !== was.trimStart()) return undefined;
    if (indentWidth(is) !== indentWidth(was) + by) return undefined;
    checked++;
  }
  return checked;
}

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
    // The shape design D10 was written for, and the one `reorder-absorption`
    // now refuses. Both candidate results reparent `- L0`: the composition's
    // `L2 / L1 / - L0` and the order rule's `L1 / L2 / - L0` alike re-parse
    // with it as the last paragraph's CHILD, because a list item cannot follow
    // a paragraph as its sibling. The run's order is never at stake here — the
    // run does not move.
    const doc = parse('- L0\n\nL1\n\nL2\n');
    const before = encode(doc);
    const result = moveGroupsUp(doc, [idsOf(doc, 'L1', 'L2')]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('reorder-not-expressible');
    expect(encode(doc)).toBe(before);
  });

  // WHERE the refusal is asked, pinned by the one case that can tell the two
  // placements apart. The run is `[fence, - a]` moving down past `P`: move down
  // applies its roots in reverse, so step one puts `- a` behind `P` — which has
  // no encoding — while the arrangement the whole run would have finished at,
  // `P` / fence / `- a`, is perfectly ordinary.
  //
  // It is REFUSED, because the group form is defined as applying the
  // single-node form to each root in turn and that sequence cannot be
  // performed. Checking the composed tree instead would accept here, and would
  // make the group form accept where the composition rejects — breaking its own
  // definition, the Group closure scenario, and the oracle equality property
  // below. This test is what fails if the check is ever moved.
  it('a run is refused when a STEP is inexpressible, though its final arrangement is not', () => {
    const md = '```\nx\n```\n\n- a\n\nP\n';
    const doc = parse(md);
    const result = moveGroupsDown(doc, [idsOf(doc, '```', '- a')]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('reorder-not-expressible');
    expect(encode(doc)).toBe(md);

    // Same reason as the composition's own first step, which is the agreement
    // the per-step placement exists to keep.
    const step = moveDown(doc, idsOf(doc, '- a')[0]!);
    expect(step.ok).toBe(false);
    if (step.ok) return;
    expect(step.rejection.reason).toBe('reorder-not-expressible');
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
