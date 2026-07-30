/**
 * The caret placement policy (`caret-placement-policy`): each of the four
 * cases, the deletion convention's fallbacks, every rung of the atom ladder,
 * and the recording predicate.
 *
 * These test the PURE decision. The dispatch-level consequences — what the
 * grammar and the enforcement layer actually send to the editor — live in
 * `caret-placement.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { deleteSubtreeGroups, deleteSubtrees, splitNode } from '../src/ops';
import { isAddressable, nodeContentEnd, previousNodeInOrder } from '../src/caret';
import { nodeAtLine, nodeStartLine } from '../src/locate';
import { planCaret, FOCUS_CAPTURING_KINDS, type PlacementFacts } from '../src/caret-policy';
import { arbTree } from './generators';

function byLine(doc: OutlineDoc, line: string): OutlineNode {
  for (const node of walkNodes(doc)) {
    if (node.lines[0] === line) return node;
  }
  throw new Error(`no node with line: ${line}`);
}

/** Run the deletion case the way a dispatch site would. */
function deletionPlan(md: string, firstLine: string): { line: string; ch: number } {
  const before = parse(md);
  const target = byLine(before, firstLine);
  const result = deleteSubtrees(before, [target.id]);
  if (!result.ok) throw new Error(result.rejection.reason);
  const after = result.value.doc;
  const plan = planCaret(
    { kind: 'deletion', removed: [target.id] },
    { before, after, anchor: result.value.anchor },
  );
  const lines = encode(after).split('\n');
  return { line: lines[plan.caret.line] ?? '', ch: plan.caret.ch };
}

describe('planCaret: the deletion convention', () => {
  const md = '# Heading\n\nmiddle\n\nlast paragraph\n';

  it('a MIDDLE node leaves the caret at the preceding node’s content end', () => {
    expect(deletionPlan(md, 'middle')).toMatchObject({ line: '# Heading', ch: 9 });
  });

  it('the LAST node leaves it at the same place by the same rule, not a different one', () => {
    expect(deletionPlan(md, 'last paragraph')).toMatchObject({ line: 'middle', ch: 6 });
  });

  it('the predecessor is the deepest last descendant, not the previous sibling', () => {
    expect(deletionPlan('# H\n\n- a\n  - a1\n\nafter\n', 'after')).toMatchObject({
      line: '  - a1',
      ch: 6,
    });
  });

  it('a heading parent is the predecessor of its own first child', () => {
    expect(deletionPlan('# H\n\nonly child\n', 'only child')).toMatchObject({ line: '# H', ch: 3 });
  });

  it('with no predecessor it falls through to the following node’s content start', () => {
    expect(deletionPlan('first para\n\nsecond para\n', 'first para')).toMatchObject({
      line: 'second para',
      ch: 0,
    });
  });

  it('with neither, it lands at the scope start', () => {
    const before = parse('only.\n');
    const ids = [...walkNodes(before)].map((n) => n.id);
    const result = deleteSubtrees(before, ids);
    if (!result.ok) throw new Error(result.rejection.reason);
    const plan = planCaret(
      { kind: 'deletion', removed: ids },
      { before, after: result.value.doc, anchor: result.value.anchor },
    );
    expect(plan.caret).toEqual({ line: 0, ch: 0 });
  });

  it('with no predecessor it does NOT read the anchor, which a later group can invalidate', () => {
    // Regression (PR #33 review): with several removal groups, the node the
    // anchor names can itself be removed by a later group. `finalize` then
    // reports the scope start, and on a note with FRONTMATTER resolving from
    // that anchor put the caret at a list item's column 0 — inside its marker.
    //
    // NOTE for anyone negative-controlling this: THREE independent fixes each
    // prevent it, so disabling any one (or any two) leaves this green.
    // (1) `deleteSubtreeGroups` now picks a subject that survives the combined
    // removal; (2) `finalize` degrades an unlocatable subject to the scope
    // start instead of a silent line 0; (3) this policy no longer reads the
    // anchor on the no-predecessor path. Disable all three to see it fail —
    // it then reports `{line: 4, ch: 0}`, inside the marker.
    const before = parse('---\ntitle: x\n---\n\n- alpha\n\n- beta\n\n- gamma\n');
    const kids = before.children;
    const removed = [kids[0]!.id, kids[1]!.id];
    const result = deleteSubtreeGroups(before, [[kids[0]!.id], [kids[1]!.id]]);
    if (!result.ok) throw new Error(result.rejection.reason);
    const plan = planCaret(
      { kind: 'deletion', removed },
      { before, after: result.value.doc, anchor: result.value.anchor },
    );
    // `- gamma`'s content start, past its marker — not column 0.
    expect(plan.caret).toEqual({ line: 4, ch: 2 });
    expect(isAddressable(result.value.doc, plan.caret)).toBe(true);
  });
});

describe('planCaret: the focus-capturing atom guard', () => {
  const TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';

  it('the set is exactly { table }, per the measured sweep', () => {
    expect([...FOCUS_CAPTURING_KINDS]).toEqual(['table']);
  });

  it('rung 1: the following node’s content start when the predecessor is a table', () => {
    // Deleting `mid` would put the caret at the table's content end.
    const { line, ch } = deletionPlan(`${TABLE}\n\nmid\n\ntail\n`, 'mid');
    expect({ line, ch }).toEqual({ line: 'tail', ch: 0 });
  });

  it('rung 2: walks BACKWARD when nothing follows', () => {
    const { line, ch } = deletionPlan(`before para\n\n${TABLE}\n\nlast\n`, 'last');
    // Predecessor is the table; nothing follows it, so it steps back past the
    // table to the paragraph above.
    expect({ line, ch }).toEqual({ line: 'before para', ch: 11 });
  });

  it('a code block is NOT capturing — landing inside one is correct', () => {
    const { line, ch } = deletionPlan('```js\nconst x = 1;\n```\n\ntail\n', 'tail');
    expect({ line, ch }).toEqual({ line: '```', ch: 3 });
  });

  it('residual: every candidate capturing leaves the computed position standing', () => {
    const { line } = deletionPlan(`${TABLE}\n\nmid\n\n| c | d |\n| - | - |\n`, 'mid');
    // Both neighbours are tables. The rule does not invent a position; it
    // documents the residual by leaving the seam where it computed it.
    expect(line).toBe('| 1 | 2 |');
  });
});

describe('planCaret: the derived case', () => {
  const facts = (mapped: { line: number; ch: number }): PlacementFacts => {
    const after = parse('- first\n- second\n');
    return { before: after, after, anchor: { line: 1, ch: 2 }, mapped };
  };

  it('uses the mapped position when it is addressable', () => {
    const plan = planCaret({ kind: 'derived' }, facts({ line: 1, ch: 5 }));
    expect(plan.caret).toEqual({ line: 1, ch: 5 });
  });

  it('falls back to the subject when the mapped position is inside a marker', () => {
    const plan = planCaret({ kind: 'derived' }, facts({ line: 1, ch: 0 }));
    expect(plan.caret).toEqual({ line: 1, ch: 2 });
  });

  it('falls back when the mapped position is on a gap line', () => {
    const after = parse('para one\n\npara two\n');
    const plan = planCaret(
      { kind: 'derived' },
      { before: after, after, anchor: { line: 2, ch: 0 }, mapped: { line: 1, ch: 0 } },
    );
    expect(plan.caret).toEqual({ line: 2, ch: 0 });
  });
});

describe('planCaret: subject and exact', () => {
  it('subject re-derives the column, so a heading lands at 0 not past its `#`', () => {
    const after = parse('## Alpha\n\n## Beta\n');
    const plan = planCaret(
      { kind: 'subject' },
      { before: after, after, anchor: { line: 0, ch: 3 } },
    );
    expect(plan.caret).toEqual({ line: 0, ch: 0 });
  });

  it('subject keeps a list marker excluded', () => {
    const after = parse('- alpha\n- beta\n');
    const plan = planCaret(
      { kind: 'subject' },
      { before: after, after, anchor: { line: 0, ch: 2 } },
    );
    expect(plan.caret).toEqual({ line: 0, ch: 2 });
  });

  it('subject leaves an item whose content starts with `#` before the hash', () => {
    const after = parse('- # title\n- second\n');
    const plan = planCaret(
      { kind: 'subject' },
      { before: after, after, anchor: { line: 0, ch: 4 } },
    );
    expect(plan.caret).toEqual({ line: 0, ch: 2 });
  });

  it('exact passes the anchor through verbatim — a join point is not a content start', () => {
    const after = parse('- alphabeta\n');
    const plan = planCaret(
      { kind: 'exact' },
      { before: after, after, anchor: { line: 0, ch: 7 } },
    );
    expect(plan.caret).toEqual({ line: 0, ch: 7 });
  });
});

describe('the deletion convention answers positionally across a re-parse', () => {
  /**
   * The claim design.md D3 rests on: the predecessor lies entirely above the
   * topmost deleted group, so its content-end position is the same in the
   * BEFORE and AFTER documents. That is what lets the policy compute in
   * `before` and return an `after` coordinate.
   */
  it('predecessor content end is identical before and after the deletion', () => {
    fc.assert(
      fc.property(arbTree(), (doc) => {
        const nodes = [...walkNodes(doc)];
        for (const target of nodes) {
          const previous = previousNodeInOrder(doc, target);
          if (!previous) continue;
          const result = deleteSubtrees(doc, [target.id]);
          if (!result.ok) continue;
          const beforeEnd = nodeContentEnd(doc, previous);
          // Re-find the predecessor in the AFTER tree by its start line, which
          // the deletion cannot have moved, then measure its content end there.
          const after = result.value.doc;
          const afterLines = encode(after).split('\n');
          const startLine = nodeStartLine(doc, previous.id);
          const afterNode = [...walkNodes(after)].find(
            (n) => nodeStartLine(after, n.id) === startLine,
          );
          if (!afterNode) return false;
          const afterEnd = nodeContentEnd(after, afterNode);
          if (beforeEnd.line !== afterEnd.line || beforeEnd.ch !== afterEnd.ch) return false;
          // And it is a real position in the resulting text.
          if ((afterLines[afterEnd.line] ?? '').length < afterEnd.ch) return false;
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });
});

/**
 * The invariant docs/research/04 Q29 says is "cheap to assert at each dispatch
 * site and expensive to discover from a real vault": every caret this plugin
 * dispatches is addressable, and no bystander landing sits inside a
 * focus-capturing node.
 *
 * Stated over generated trees rather than enumerated cases because the places
 * that PRODUCE a caret are not all obvious — the mapped cursor, the
 * enforcement rewrites, the operations' own anchors — and each has introduced
 * a violation at least once.
 */
/**
 * `arbTree()` generates no tables — the only focus-capturing kind — and no
 * preamble, so a property stated over it alone cannot exercise the atom guard
 * or the frontmatter path. Measured: with the guard disabled the first version
 * of this property still PASSED. It is re-stated over documents with a table
 * spliced in at a top-level boundary and, half the time, frontmatter on top.
 */
const TABLE_LINES = ['| a | b |', '| - | - |', '| 1 | 2 |', ''];
const PREAMBLE_LINES = ['---', 'title: x', '---', ''];

const arbTreeWithTable = (): fc.Arbitrary<OutlineDoc> =>
  fc.tuple(arbTree(), fc.nat(), fc.boolean()).map(([tree, at, withPreamble]) => {
    const text = encode(tree);
    const lines = text === '' ? [] : text.split('\n');
    const doc = parse(text);
    const starts = doc.children.map((n) => nodeStartLine(doc, n.id)).filter((l) => l >= 0);
    const insertAt = starts.length === 0 ? 0 : starts[at % starts.length]!;
    const withTable = [...lines.slice(0, insertAt), ...TABLE_LINES, ...lines.slice(insertAt)];
    return parse([...(withPreamble ? PREAMBLE_LINES : []), ...withTable].join('\n'));
  });

/** Is `pos` a real position in `doc`'s own text? */
function inBounds(doc: OutlineDoc, pos: { line: number; ch: number }): boolean {
  const lines = encode(doc).split('\n');
  if (pos.line < 0 || pos.line >= Math.max(lines.length, 1)) return false;
  return pos.ch <= (lines[pos.line] ?? '').length;
}

describe('every caret the policy places is a legal position', () => {
  it('deletion: single-node and multi-group, with and without frontmatter', () => {
    fc.assert(
      fc.property(arbTreeWithTable(), fc.nat(), (doc, pick) => {
        const top = doc.children;
        // Single-node deletions…
        for (const target of [...walkNodes(doc)]) {
          const result = deleteSubtrees(doc, [target.id]);
          if (!result.ok) continue;
          if (!checkDeletion(doc, result.value, [target.id])) return false;
        }
        // …and two separate groups, the shape that can remove its own anchor.
        if (top.length >= 2) {
          const i = pick % (top.length - 1);
          const removed = [top[i]!.id, top[i + 1]!.id];
          const result = deleteSubtreeGroups(doc, [[removed[0]!], [removed[1]!]]);
          if (result.ok && !checkDeletion(doc, result.value, removed)) return false;
        }
        return true;
      }),
      { numRuns: 250 },
    );
  });

  function checkDeletion(
    before: OutlineDoc,
    value: { doc: OutlineDoc; anchor: { line: number; ch: number } },
    removed: readonly number[],
  ): boolean {
    const { caret } = planCaret(
      { kind: 'deletion', removed },
      { before, after: value.doc, anchor: value.anchor },
    );
    if (!inBounds(value.doc, caret)) return false;
    if (!isAddressable(value.doc, caret)) return false;
    // …and outside a capturing node, unless every candidate captured.
    const owner = nodeAtLine(value.doc, caret.line);
    if (owner && FOCUS_CAPTURING_KINDS.has(owner.kind)) {
      const anyFree = [...walkNodes(value.doc)].some((n) => !FOCUS_CAPTURING_KINDS.has(n.kind));
      if (anyFree) return false;
    }
    return true;
  }

  it('subject: never lands on a marker or a gap', () => {
    fc.assert(
      fc.property(arbTreeWithTable(), fc.nat(), (doc, n) => {
        const all = [...walkNodes(doc)];
        if (all.length === 0) return true;
        const node = all[n % all.length]!;
        const line = nodeStartLine(doc, node.id);
        if (line < 0) return true;
        const { caret } = planCaret(
          { kind: 'subject' },
          { before: doc, after: doc, anchor: { line, ch: 0 } },
        );
        return inBounds(doc, caret) && isAddressable(doc, caret);
      }),
      { numRuns: 250 },
    );
  });

  it('derived: addressable whether the mapped position is used or the fallback', () => {
    fc.assert(
      fc.property(arbTreeWithTable(), fc.nat(), fc.nat(), (doc, n, mapSeed) => {
        const all = [...walkNodes(doc)];
        if (all.length === 0) return true;
        const node = all[n % all.length]!;
        const line = nodeStartLine(doc, node.id);
        if (line < 0) return true;
        const lines = encode(doc).split('\n');
        // A mapped position anywhere in the document, including gaps and markers.
        const mLine = mapSeed % Math.max(lines.length, 1);
        const { caret } = planCaret(
          { kind: 'derived' },
          {
            before: doc,
            after: doc,
            anchor: { line, ch: 0 },
            mapped: { line: mLine, ch: mapSeed % ((lines[mLine] ?? '').length + 1) },
          },
        );
        return inBounds(doc, caret) && isAddressable(doc, caret);
      }),
      { numRuns: 250 },
    );
  });
});

/**
 * The ONE documented exception to "every dispatched caret is addressable", found
 * by review (PR #33) rather than by the property above — which never exercised
 * an `exact` dispatch.
 *
 * An end-of-paragraph or end-of-heading split has no empty-node encoding, so
 * `structural-operations` specifies that it widens the gap and leaves the cursor
 * on the resulting blank line; typing there materializes the new node. That
 * position is a gap line, and `isAddressable` says so. The behaviour is
 * deliberate and predates this change; what was wrong was this change stating a
 * universal it does not hold to. Pinned here so the exception stays explicit.
 */
describe('the split-materialization exception', () => {
  for (const [label, md, at] of [
    ['paragraph', 'alpha\n', 5],
    ['heading', '# H\n', 3],
  ] as const) {
    it(`an end-of-${label} split lands on the widened gap, by design`, () => {
      const before = parse(md);
      const result = splitNode(before, before.children[0]!.id, { line: 0, ch: at });
      if (!result.ok) throw new Error(result.rejection.reason);
      const { caret } = planCaret(
        { kind: 'exact' },
        { before, after: result.value.doc, anchor: result.value.anchor },
      );
      // The policy passes an `exact` anchor through verbatim…
      expect(caret).toEqual(result.value.anchor);
      // …and this one is deliberately a gap line.
      expect(isAddressable(result.value.doc, caret)).toBe(false);
      expect(encode(result.value.doc).split('\n')[caret.line]).toBe('');
    });
  }
});
