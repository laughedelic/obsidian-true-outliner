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
import { deleteSubtrees } from '../src/ops';
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
function deletionPlan(md: string, firstLine: string): { line: string; ch: number; record: boolean } {
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
  return { line: lines[plan.caret.line] ?? '', ch: plan.caret.ch, record: plan.record };
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

  it('a deletion is always recorded — mapping cannot reproduce a seam', () => {
    expect(deletionPlan(md, 'middle').record).toBe(true);
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

  it('is NOT recorded when the mapped position is used', () => {
    expect(planCaret({ kind: 'derived' }, facts({ line: 1, ch: 5 })).record).toBe(false);
  });

  it('falls back to the subject when the mapped position is inside a marker', () => {
    const plan = planCaret({ kind: 'derived' }, facts({ line: 1, ch: 0 }));
    expect(plan.caret).toEqual({ line: 1, ch: 2 });
  });

  it('the fallback IS recorded — that is the gap this change closes', () => {
    expect(planCaret({ kind: 'derived' }, facts({ line: 1, ch: 0 })).record).toBe(true);
  });

  it('falls back when the mapped position is on a gap line', () => {
    const after = parse('para one\n\npara two\n');
    const plan = planCaret(
      { kind: 'derived' },
      { before: after, after, anchor: { line: 2, ch: 0 }, mapped: { line: 1, ch: 0 } },
    );
    expect(plan.caret).toEqual({ line: 2, ch: 0 });
    expect(plan.record).toBe(true);
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
 * `arbTree()` generates no tables — the only focus-capturing kind — so a
 * property stated over it alone cannot exercise the atom guard at all.
 * Measured: with the guard disabled the property still passed. It is
 * re-stated over documents with a table spliced in at a top-level boundary,
 * which is what makes the guard's half of it falsifiable.
 */
const TABLE_LINES = ['| a | b |', '| - | - |', '| 1 | 2 |', ''];

const arbTreeWithTable = (): fc.Arbitrary<OutlineDoc> =>
  fc.tuple(arbTree(), fc.nat()).map(([tree, at]) => {
    const text = encode(tree);
    const lines = text === '' ? [] : text.split('\n');
    const doc = parse(text);
    // Top-level node start lines, so the table lands as a sibling.
    const starts = doc.children.map((n) => nodeStartLine(doc, n.id)).filter((l) => l >= 0);
    const insertAt = starts.length === 0 ? 0 : starts[at % starts.length]!;
    const withTable = [...lines.slice(0, insertAt), ...TABLE_LINES, ...lines.slice(insertAt)];
    return parse(withTable.join('\n'));
  });

describe('every dispatched caret is addressable', () => {
  it('over generated trees, for every deletable node', () => {
    fc.assert(
      fc.property(arbTreeWithTable(), (doc) => {
        for (const target of [...walkNodes(doc)]) {
          const result = deleteSubtrees(doc, [target.id]);
          if (!result.ok) continue;
          const after = result.value.doc;
          const { caret } = planCaret(
            { kind: 'deletion', removed: [target.id] },
            { before: doc, after, anchor: result.value.anchor },
          );
          const lines = encode(after).split('\n');
          // A real position in the resulting text…
          if (caret.line < 0 || caret.line >= Math.max(lines.length, 1)) return false;
          if (caret.ch > (lines[caret.line] ?? '').length) return false;
          // …that a caret may occupy…
          if (!isAddressable(after, caret)) return false;
          // …and, unless every candidate captured, outside a capturing node.
          const owner = nodeAtLine(after, caret.line);
          if (owner && FOCUS_CAPTURING_KINDS.has(owner.kind)) {
            const anyFree = [...walkNodes(after)].some((n) => !FOCUS_CAPTURING_KINDS.has(n.kind));
            if (anyFree) return false;
          }
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('the subject case never lands on a marker or a gap', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), (doc, n) => {
        const all = [...walkNodes(doc)];
        if (all.length === 0) return true;
        const node = all[n % all.length]!;
        const anchor = { line: nodeStartLine(doc, node.id), ch: 0 };
        if (anchor.line < 0) return true;
        const { caret } = planCaret({ kind: 'subject' }, { before: doc, after: doc, anchor });
        return isAddressable(doc, caret);
      }),
      { numRuns: 300 },
    );
  });
});
