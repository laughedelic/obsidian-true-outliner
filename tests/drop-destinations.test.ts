import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { resolveZoom } from '../src/zoom';
import {
  dropSeams,
  nearestIndex,
  resolveDestination,
  type DropSeam,
} from '../src/drop-destinations';

function byLine(doc: OutlineDoc, line: string): OutlineNode {
  for (const node of walkNodes(doc)) {
    if (node.lines[0] === line) return node;
  }
  throw new Error(`no node with line: ${line}`);
}

/** A seam's own line, and the depths it offers — the whole of what a pointer
 * position has to choose between. */
function shape(seams: readonly DropSeam[]): string[] {
  return seams.map((seam) => `${seam.line}: ${seam.candidates.map((c) => c.depth).join(',')}`);
}

/** The fixture the companion mockup draws (docs/research/prototypes). */
const NESTED = [
  '# Section',
  '',
  '- work',
  '  - thread',
  '    - shipped',
  '    - prototype review',
  '      - severity sort',
  '    - open questions',
  '      - touch fallback',
  '',
  '# The next section',
  '',
].join('\n');

describe('dropSeams', () => {
  it('offers one destination per level below a deep last child', () => {
    const doc = parse(NESTED);
    const seams = dropSeams(doc, [byLine(doc, '    - prototype review')]);
    const last = seams.find((seam) => seam.belowId === byLine(doc, '# The next section').id)!;
    // Five: from a child of the section, out through every ancestor of the
    // row above, to one level inside it. Not the root, which the mockup's
    // slider reaches — a bulleted run written before `# The next section` is
    // still inside `# Section`, so that column is a heading run's alone.
    expect(last.candidates.map((c) => c.depth)).toEqual([1, 2, 3, 4, 5]);
    expect(last.candidates.map((c) => c.parentId)).toEqual([
      byLine(doc, '# Section').id,
      byLine(doc, '- work').id,
      byLine(doc, '  - thread').id,
      byLine(doc, '    - open questions').id,
      byLine(doc, '      - touch fallback').id,
    ]);
    // Each one sits just past whatever of that parent's children is above the
    // seam, which for the deepest is all of them.
    expect(last.candidates.map((c) => c.index)).toEqual([1, 1, 3, 1, 0]);
  });

  it('offers nothing shallower than the node below the seam', () => {
    const doc = parse(NESTED);
    const seams = dropSeams(doc, [byLine(doc, '      - touch fallback')]);
    const seam = seams.find((s) => s.belowId === byLine(doc, '    - prototype review').id)!;
    // `- shipped` is three levels in and has ancestors at every level above,
    // but landing outside `- prototype review`'s own depth would make that row
    // a descendant of the dropped run.
    expect(seam.candidates.map((c) => c.depth)).toEqual([3, 4]);
  });

  it('offers no seam inside a node that renders several rows', () => {
    const doc = parse(
      [
        '- one',
        '',
        '| a | b |',
        '| --- | --- |',
        '| 1 | 2 |',
        '',
        '```js',
        'const x = 1;',
        'const y = 2;',
        '```',
        '',
        'a paragraph that runs',
        'over two source lines',
        '',
      ].join('\n'),
    );
    const seams = dropSeams(doc, [byLine(doc, '- one')]);
    const table = byLine(doc, '| a | b |');
    const fence = byLine(doc, '```js');
    const para = byLine(doc, 'a paragraph that runs');
    // One seam per node boundary, never one per row: no seam between a table's
    // header and its body, inside a fence, or between a paragraph's own lines.
    // Nor on either side of a trailing gap line, which owns no boundary.
    expect(seams.map((s) => s.line)).toEqual([0, 2, 6, 11, 14]);
    // And an atom offers no level inside itself, so the seams after the table
    // and the fence stay at the depth those nodes sit at.
    const afterTable = seams.find((s) => s.belowId === fence.id)!;
    const afterFence = seams.find((s) => s.belowId === para.id)!;
    expect(afterTable.candidates.map((c) => c.depth)).toEqual([0]);
    expect(afterFence.candidates.map((c) => c.depth)).toEqual([0]);
    expect(table.children).toEqual([]);
  });

  it('offers the document’s own two ends, and never the preamble', () => {
    const doc = parse(
      ['---', 'title: note', '---', '', '- one', '- two', ''].join('\n'),
    );
    const seams = dropSeams(doc, [byLine(doc, '- two')]);
    const first = seams[0]!;
    const last = seams[seams.length - 1]!;
    // The first seam is the one before the first NODE: the preamble is outside
    // jurisdiction, so no destination is above or inside it.
    expect(first.line).toBe(4);
    expect(first.aboveId).toBeUndefined();
    expect(first.candidates.map((c) => c.parentId)).toEqual(['root']);
    expect(first.candidates.map((c) => c.index)).toEqual([0]);
    // And the last seam takes a run to the end of the document at the top
    // level, rather than having no bound at all for want of a node below it.
    expect(last.line).toBe(7);
    expect(last.belowId).toBeUndefined();
    expect(last.candidates[0]!.depth).toBe(0);
  });

  it('offers no seam or depth inside the run itself', () => {
    const doc = parse(NESTED);
    const review = byLine(doc, '    - prototype review');
    const severity = byLine(doc, '      - severity sort');
    const seams = dropSeams(doc, [review]);
    // Not just the run's own rows: the seams BETWEEN its descendants would
    // each still offer a parent inside it.
    for (const seam of seams) {
      for (const candidate of seam.candidates) {
        expect(candidate.parentId === review.id || candidate.parentId === severity.id).toBe(false);
      }
    }
    // The seam between the run's root and its own first child is gone
    // entirely, having nothing left to offer.
    expect(seams.some((s) => s.aboveId === review.id)).toBe(false);
  });

  it('takes the deep bound from what is VISIBLE, and lands last inside a fold', () => {
    const doc = parse(NESTED);
    const thread = byLine(doc, '  - thread');
    const seams = dropSeams(doc, [byLine(doc, '# The next section')], {
      folded: new Set([thread.id]),
    });
    // Everything under `- thread` is off screen, so its levels are not
    // candidates and its descendants' seams do not exist.
    expect(shape(seams)).toEqual(['0: 0', '2: 1', '3: 2', '10: 0,1,2,3', '12: 0']);
    const afterThread = seams.find((s) => s.line === 10)!;
    // One level inside a folded node is still offered, and names its LAST
    // child — the seam sits after everything the fold hides.
    const inside = afterThread.candidates.find((c) => c.depth === 3)!;
    expect(inside.parentId).toBe(thread.id);
    expect(inside.index).toBe(thread.children.length);
  });

  it('resolves legality per COLUMN, not per seam', () => {
    // The payload's own deepest heading is two levels below its root, so its
    // root fits at `h5` and not at `h6`.
    const doc = parse(
      [
        '# A',
        '',
        '## A1',
        '',
        '# B',
        '',
        '## B1',
        '',
        '### B2',
        '',
        '#### B3',
        '',
        '##### B4',
        '',
      ].join('\n'),
    );
    const seams = dropSeams(doc, [byLine(doc, '# A')]);
    const last = seams[seams.length - 1]!;
    // The seam's interval runs to one level inside `##### B4`, but the deepest
    // column is refused while every shallower one is offered — a refusal that
    // depends on the destination's DEPTH, which no kind check could see.
    expect(last.candidates.map((c) => c.depth)).toEqual([0, 1, 2, 3, 4]);
  });

  it('says what the run will BECOME at each destination', () => {
    const doc = parse(
      ['# A', '', '## A1', '', '# B', '', '- item', '  - child', ''].join('\n'),
    );
    const seams = dropSeams(doc, [byLine(doc, '## A1')]);
    // Re-encoded for where it lands, by the same call the release makes: a
    // heading landing among list items arrives as one, carrying its own `#`
    // run as text rather than keeping the glyph it has in flight.
    const last = seams[seams.length - 1]!;
    const asChild = last.candidates.find((c) => c.parentId === byLine(doc, '- item').id)!;
    expect(asChild.firstLine.trimStart().startsWith('-')).toBe(true);
    // And a run that has not left its own scope keeps the line it has.
    const home = seams.find((s) => s.belowId === byLine(doc, '## A1').id)!;
    expect(home.candidates.some((c) => c.firstLine === '## A1')).toBe(true);
  });

  it('puts a run dropped between a parent and its first child FIRST', () => {
    // The seam one level inside a node sits after everything it holds only
    // when it shows no children — a leaf, or a folded node. Between a heading
    // and its first paragraph the run becomes the first child. Measured before
    // the two were told apart: dropped there, a subtree landed at the end of
    // the section.
    const doc = parse(['# One', '', 'intro', '', '- a', '- b', '', '# Two', '', '- x', ''].join('\n'));
    const seams = dropSeams(doc, [byLine(doc, '- x')]);
    const firstChild = seams.find((s) => s.belowId === byLine(doc, 'intro').id)!;
    expect(firstChild.candidates.map((c) => [c.depth, c.parentId, c.index])).toEqual([
      [1, byLine(doc, '# One').id, 0],
    ]);
    // And the seam AFTER a leaf's own line still puts the run inside it, last —
    // which for a leaf is also first.
    const afterLeaf = seams.find((s) => s.aboveId === byLine(doc, '- b').id)!;
    const inside = afterLeaf.candidates.find((c) => c.parentId === byLine(doc, '- b').id)!;
    expect(inside.index).toBe(0);
  });

  it('does not offer a non-heading run the columns of the headings above it', () => {
    // A paragraph written after a heading is inside it, whatever column it was
    // dropped on: every one of those drops wrote the same document as the
    // innermost heading's own. So the columns are not offered. A heading run
    // is re-levelled there instead, and keeps them.
    const doc = parse(['# H1', '', '## H2', '', '### H3', '', 'para1', '', 'para2', ''].join('\n'));
    const last = (roots: OutlineNode[]) => dropSeams(doc, roots).at(-1)!;
    const para = last([byLine(doc, 'para1')]);
    expect(para.candidates.map((c) => c.depth)).toEqual([3, 4]);
    expect(para.candidates.map((c) => c.parentId)).toEqual([
      byLine(doc, '### H3').id,
      byLine(doc, 'para2').id,
    ]);
    // A heading dragged to the same seam still reaches the root and both
    // headings, re-levelled to each.
    const heading = last([byLine(doc, '### H3')]);
    expect(heading.candidates.map((c) => [c.depth, c.firstLine])).toEqual([
      [0, '# H3'],
      [1, '## H3'],
      [2, '### H3'],
    ]);
  });

  it('offers no destination outside an active zoom', () => {
    const source = parse(
      ['# One', '', '- a', '  - a1', '', '# Two', '', '- b', ''].join('\n'),
    );
    const scope = resolveZoom(source, 2)!;
    const zoomed = scope.document;
    const seams = dropSeams(zoomed, [byLine(zoomed, '  - a1')]);
    // Resolution runs over the scope's own re-rooted document, so no node
    // outside it can be named as a parent at all.
    for (const seam of seams) {
      for (const candidate of seam.candidates) {
        expect(
          candidate.parentId === 'root' ||
            [...walkNodes(zoomed)].some((n) => n.id === candidate.parentId),
        ).toBe(true);
      }
    }
    expect([...walkNodes(zoomed)].map((n) => n.lines[0])).toEqual(['- a', '  - a1']);
  });

  it('a scoped document offers nothing at the zoom root\u2019s own level', () => {
    const source = parse(['# One', '', '- a', '  - a1', '', '# Two', '', '- b', ''].join('\n'));
    const scope = resolveZoom(source, 2)!;
    const zoomed = scope.document;
    const operand = [byLine(zoomed, '  - a1')];

    // The re-rooted document's own top level is the zoom ROOT's level, so a
    // `'root'` candidate is a SIBLING of the root — reachable in the source,
    // and outside the scope. Nothing in a document says whether it is a
    // scope's or a file's, so the caller that applied the zoom says so.
    expect(dropSeams(zoomed, operand).some((s) => s.candidates.some((c) => c.parentId === 'root')))
      .toBe(true);
    const scoped = dropSeams(zoomed, operand, { scoped: true });
    expect(scoped.some((s) => s.candidates.some((c) => c.parentId === 'root'))).toBe(false);
    // And what is left is still a place to drop: the root's own children.
    expect(scoped.length).toBeGreaterThan(0);
    for (const seam of scoped) {
      for (const candidate of seam.candidates) {
        expect(candidate.parentId).toBe(byLine(zoomed, '- a').id);
      }
    }
  });
});

describe('nearestIndex', () => {
  it('partitions the axis with no position resolving to none', () => {
    // Columns at the default two-space unit, as `chrome-line.ts` lays them out.
    const columns = [0, 14, 28, 42, 56, 70];
    const resolved: number[] = [];
    for (let x = -80; x <= 160; x += 0.5) {
      const index = nearestIndex(x, columns);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(columns.length);
      resolved.push(index);
    }
    // Clamped at both ends rather than falling off them.
    expect(nearestIndex(-1000, columns)).toBe(0);
    expect(nearestIndex(1000, columns)).toBe(columns.length - 1);
    // Every column is reachable, and the sweep never goes backwards.
    expect([...new Set(resolved)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(resolved).toEqual([...resolved].sort((a, b) => a - b));
  });

  it('leaves no dead band, where the hit test an earlier draft borrowed does', () => {
    // `guideHit`'s arithmetic: `unit / 2 - 2` left of a column and `unit / 3`
    // right of it. That covers `unit * 5 / 6 - 2` of every unit between two
    // columns and leaves `unit / 6 + 2` — 7.33px at the unit the design
    // records — resolving to nothing at all. A release that resolves nothing
    // cancels the drag, so the band would throw the gesture away for landing
    // between two columns.
    const unit = 32;
    const columns = [0, 1, 2, 3, 4, 5].map((depth) => depth * unit);
    const band = (x: number): number | null => {
      for (let i = 0; i < columns.length; i++) {
        const delta = x - columns[i]!;
        if (delta > unit / 3 || -delta > unit / 2 - 2) continue;
        return i;
      }
      return null;
    };
    let dead = 0;
    for (let x = 0; x <= 5 * unit; x += 0.5) {
      if (band(x) === null) dead++;
      expect(nearestIndex(x, columns)).toBeGreaterThanOrEqual(0);
    }
    expect(dead).toBeGreaterThan(0);
  });
});

describe('resolveDestination', () => {
  const doc = parse(NESTED);
  const seams = dropSeams(doc, [byLine(doc, '    - prototype review')]);
  const geometry = {
    // One row per line, as a view with uniform rows would report them.
    seamY: seams.map((seam) => seam.line * 20),
    columnX: (depth: number) => depth * 14,
  };

  it('names one destination for every position over a seam', () => {
    const seam = seams.find((s) => s.belowId === byLine(doc, '# The next section').id)!;
    const y = seam.line * 20;
    const seen: number[] = [];
    for (let x = -100; x <= 200; x += 0.5) {
      const resolved = resolveDestination(seams, geometry, { x, y });
      expect(resolved).toBeDefined();
      expect(resolved!.seam).toBe(seam);
      seen.push(resolved!.destination.depth);
    }
    // Every column of the seam is reachable, in order, and nothing between two
    // of them resolves to none.
    expect([...new Set(seen)]).toEqual([1, 2, 3, 4, 5]);
  });

  it('takes the seam from the vertical axis alone', () => {
    const first = seams[0]!;
    const last = seams[seams.length - 1]!;
    expect(resolveDestination(seams, geometry, { x: 0, y: -1000 })!.seam).toBe(first);
    expect(resolveDestination(seams, geometry, { x: 0, y: 10000 })!.seam).toBe(last);
  });

  it('names nothing where there is no seam', () => {
    expect(resolveDestination([], geometry, { x: 0, y: 0 })).toBeUndefined();
  });
});
