import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { walkNodes, type OutlineDoc } from '../src/model';
import { forestCoverOf, subtreeCoverOf } from '../src/escalate';
import { nodeStartLine } from '../src/locate';
import { resolveOperand } from '../src/operand';
import type { LineRange } from '../src/line-pos';
import { arbLabeledDoc } from './group-oracle';

const DOC = '- p\n- a\n- b\n- c\n';

function nodeWith(doc: OutlineDoc, marker: string) {
  return [...walkNodes(doc)].find((n) => n.lines[0]!.includes(marker))!;
}

/** The exact cover of `from`..`to`, as an oriented range. */
function coverRange(doc: OutlineDoc, from: string, to: string, backward = false): LineRange {
  const cover = forestCoverOf(doc, nodeWith(doc, from), nodeWith(doc, to)).cover;
  return backward
    ? { anchor: cover.end, head: cover.start }
    : { anchor: cover.start, head: cover.end };
}

describe('operand resolution', () => {
  it('an empty selection resolves to the node at the caret line', () => {
    const doc = parse(DOC);
    const b = nodeWith(doc, '- b');
    const line = nodeStartLine(doc, b.id);
    const operand = resolveOperand(doc, {
      anchor: { line, ch: 2 },
      head: { line, ch: 2 },
    });
    expect(operand).toEqual({ groups: [[b.id]], wasCover: false });
  });

  it('a caret on a gap line resolves to the node that owns the gap', () => {
    const doc = parse('- a\n\n- b\n');
    const a = nodeWith(doc, '- a');
    const operand = resolveOperand(doc, { anchor: { line: 1, ch: 0 }, head: { line: 1, ch: 0 } });
    expect(operand?.groups).toEqual([[a.id]]);
  });

  it('a within-node character range resolves to that node alone, and is not a cover', () => {
    const doc = parse(DOC);
    const b = nodeWith(doc, '- b');
    const line = nodeStartLine(doc, b.id);
    const operand = resolveOperand(doc, {
      anchor: { line, ch: 2 },
      head: { line, ch: 4 },
    });
    expect(operand).toEqual({ groups: [[b.id]], wasCover: false });
  });

  it('an exact cover resolves to its roots and is marked a cover', () => {
    const doc = parse(DOC);
    const operand = resolveOperand(doc, coverRange(doc, '- a', '- c'));
    expect(operand?.wasCover).toBe(true);
    expect(operand?.groups).toEqual([
      [nodeWith(doc, '- a').id, nodeWith(doc, '- b').id, nodeWith(doc, '- c').id],
    ]);
  });

  it('a preamble range has no jurisdiction', () => {
    const doc = parse('---\ntitle: t\n---\n\n- a\n');
    expect(
      resolveOperand(doc, { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } }),
    ).toBeUndefined();
  });

  it('a forward and a backward selection of the same subtrees give the same operand', () => {
    const doc = parse(DOC);
    const forward = resolveOperand(doc, coverRange(doc, '- a', '- c'));
    const backward = resolveOperand(doc, coverRange(doc, '- a', '- c', true));
    expect(backward).toEqual(forward);
  });

  it('a dragged range and the exact cover of the same nodes give the same groups', () => {
    // A drag ends mid-node; extension and Mod+A leave an exact cover. Both
    // resolve to the same operand roots — only `wasCover` differs, which is the
    // after-state discriminator, not part of what is acted on.
    const doc = parse(DOC);
    const aLine = nodeStartLine(doc, nodeWith(doc, '- a').id);
    const cLine = nodeStartLine(doc, nodeWith(doc, '- c').id);
    const dragged = resolveOperand(doc, {
      anchor: { line: aLine, ch: 3 },
      head: { line: cLine, ch: 3 },
    });
    const cover = resolveOperand(doc, coverRange(doc, '- a', '- c'));
    expect(dragged?.groups).toEqual(cover?.groups);
    expect(dragged?.wasCover).toBe(false);
    expect(cover?.wasCover).toBe(true);
  });

  it('orientation never changes the operand, on any document', () => {
    let compared = 0;
    fc.assert(
      fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), (doc, i, j) => {
        const all = [...walkNodes(doc)];
        if (all.length === 0) return true;
        const cover = forestCoverOf(doc, all[i % all.length]!, all[j % all.length]!).cover;
        const forward = resolveOperand(doc, { anchor: cover.start, head: cover.end });
        const backward = resolveOperand(doc, { anchor: cover.end, head: cover.start });
        compared++;
        return JSON.stringify(forward) === JSON.stringify(backward);
      }),
      { numRuns: 2000 },
    );
    expect(compared).toBeGreaterThan(1000);
  });

  it('a single node selected as a cover is one root', () => {
    const doc = parse(DOC);
    const b = nodeWith(doc, '- b');
    const cover = subtreeCoverOf(doc, b);
    const operand = resolveOperand(doc, { anchor: cover.start, head: cover.end });
    expect(operand).toEqual({ groups: [[b.id]], wasCover: true });
  });
});
