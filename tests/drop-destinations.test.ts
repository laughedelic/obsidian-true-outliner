import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { moveSubtreesTo } from '../src/ops';
import { arbTree } from './generators';
import { isAtom, ownSpan, walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { resolveZoom } from '../src/zoom';
import {
  dropSeams,
  nearestIndex,
  resolveDestination,
  seams,
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
    // Nor on either side of a trailing gap line, which owns no boundary. The
    // run's own two boundaries are both seams: the top offers the run's own
    // place back — `- one` is a leaf at the top level, so that is its one
    // column — and the bottom is dead, so the pointer there snaps to no
    // neighbour.
    expect(seams.map((s) => s.line)).toEqual([0, 2, 6, 11, 14]);
    expect(seams.slice(0, 2).map((s) => s.candidates.map((c) => c.index))).toEqual([[0], []]);
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
    // And the last seam is the run's own bottom, dead: `- two` already ends the
    // note. The seam at its top offers its own place, at the top level, and
    // the one column inside the node above it.
    expect(last.line).toBe(7);
    expect(last.belowId).toBeUndefined();
    expect(last.candidates).toEqual([]);
    const top = seams.find((s) => s.line === 5)!;
    expect(top.candidates.map((c) => c.depth)).toEqual([0, 1]);
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
    // entirely; the one seam still naming the root as its upper node is the
    // run's own bottom, which offers nothing.
    const under = seams.filter((s) => s.aboveId === review.id);
    expect(under.map((s) => s.candidates)).toEqual([[]]);
  });

  it('takes the deep bound from what is VISIBLE, and lands last inside a fold', () => {
    const doc = parse(NESTED);
    const thread = byLine(doc, '  - thread');
    const seams = dropSeams(doc, [byLine(doc, '# The next section')], {
      folded: new Set([thread.id]),
    });
    // Everything under `- thread` is off screen, so its levels are not
    // candidates and its descendants' seams do not exist.
    // The run is a heading, so every seam also offers it the root's level,
    // written as `# Next` there — at its own top, that is the place it already
    // has. Its own bottom, the document's end, offers nothing at all.
    expect(shape(seams)).toEqual(['0: 0', '2: 0,1', '3: 0,1,2', '10: 0,1,2,3', '12: ']);
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

  it('names the kind the run will have, not what its first line parses as', () => {
    // A table's first line on its own is a paragraph; the mark the preview
    // draws is the node's. And a heading re-levelled by the column carries
    // the level it will be written at.
    const doc = parse(
      ['# A', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', '- item', '', '## B', ''].join('\n'),
    );
    const seams = dropSeams(doc, [byLine(doc, '| a | b |')]);
    const marks = seams.flatMap((s) => s.candidates.map((c) => c.mark.kind));
    expect(marks.length).toBeGreaterThan(0);
    expect(new Set(marks)).toEqual(new Set(['table']));
    const heading = dropSeams(doc, [byLine(doc, '## B')]).find((s) => s.line === 2)!;
    expect(heading.candidates.map((c) => c.mark)).toEqual([
      { kind: 'heading', level: 1 },
      { kind: 'heading', level: 2 },
    ]);
  });

  it('says how far each absorbed row moves, and under which node the run lands', () => {
    // `## C` dropped between `## B` and its paragraph `foo`, at each of the
    // three levels the seam offers. `foo` becomes C's child every time, one
    // past C's column: in by one under an h3, level under an h2 written beside
    // B, out by one under an h1. And the run lands under B, A, and the root.
    const doc = parse(['# A', '', '## B', '', 'foo', '', '## C', ''].join('\n'));
    const seam = dropSeams(doc, [byLine(doc, '## C')]).find((s) => s.aboveId === byLine(doc, '## B').id)!;
    expect(
      seam.candidates.map((c) => [c.firstLine, c.absorbs?.shifts.map((x) => x.by), c.landsUnder ?? c.parentId]),
    ).toEqual([
      ['# C', [-1], 'root'],
      ['## C', [0], byLine(doc, '# A').id],
      ['### C', [1], byLine(doc, '## B').id],
    ]);
  });

  it('carries a list item\u2019s task state and ordered delimiter to the mark', () => {
    // The ghost draws these in a bullet's place: the checkbox as it is, since
    // a drop does not toggle it, and the ordered item's delimiter, since its
    // number is the renumbering's answer and not the item's.
    const doc = parse(['# A', '', '- [x] done', '- [ ] open', '1) first', '- plain', ''].join('\n'));
    const listOf = (line: string) =>
      dropSeams(doc, [byLine(doc, line)]).flatMap((s) => s.candidates.map((c) => c.mark.list));
    expect(new Set(listOf('- [x] done').map((l) => JSON.stringify(l)))).toEqual(new Set([JSON.stringify({ task: true })]));
    expect(new Set(listOf('- [ ] open').map((l) => JSON.stringify(l)))).toEqual(new Set([JSON.stringify({ task: false })]));
    expect(new Set(listOf('1) first').map((l) => JSON.stringify(l)))).toEqual(new Set([JSON.stringify({ ordered: ')' })]));
    expect(listOf('- plain').every((l) => l === undefined)).toBe(true);
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
    // At the run's own seam its own place is offered as it is — `## A1`, the
    // way out of the drag — beside the same position read one level out, as
    // `# A1`.
    const home = seams.find((s) => s.line === 2)!;
    expect(home.candidates.map((c) => c.firstLine)).toEqual(['# A1', '## A1']);
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
    // The seam at the note's end that offers anything: the run's own bottom is
    // dead, and for `### H3` that is the note's end itself.
    const last = (roots: OutlineNode[]) =>
      dropSeams(doc, roots).filter((s) => s.candidates.length > 0).at(-1)!;
    const para = last([byLine(doc, 'para1')]);
    expect(para.candidates.map((c) => c.depth)).toEqual([3, 4]);
    expect(para.candidates.map((c) => c.parentId)).toEqual([
      byLine(doc, '### H3').id,
      byLine(doc, 'para2').id,
    ]);
    // A heading dragged to the same seam still reaches the root and both
    // headings, re-levelled to each; the seam is the run's own top, so the
    // `###` column is its own place, offered back.
    const heading = last([byLine(doc, '### H3')]);
    expect(heading.candidates.map((c) => [c.depth, c.firstLine])).toEqual([
      [0, '# H3'],
      [1, '## H3'],
      [2, '### H3'],
    ]);
  });

  it('names the rows a written heading would absorb, and where they stop', () => {
    // `## Move me` dropped after `intro` opens a section over the three
    // siblings that follow — up to `## Next`, which can stand beside it. The
    // span is read from the line the destination WRITES, so the same run
    // dropped where it arrives as a list item absorbs nothing.
    const doc = parse(
      ['# Section', '', 'intro', '', 'details', '', 'more details', '', '- a list', '', '## Next', '', 'body', '', '## Move me', '', 'its body', ''].join('\n'),
    );
    const move = byLine(doc, '## Move me');
    const afterIntro = dropSeams(doc, [move]).find((s) => s.aboveId === byLine(doc, 'intro').id)!;
    const asChild = afterIntro.candidates.find((c) => c.depth === 1)!;
    expect(asChild.firstLine).toBe('## Move me');
    // From `details`'s first line through `- a list`'s gap, not into `## Next`.
    expect(asChild.absorbs).toMatchObject({ from: 4, to: 10 });
    // Dropped inside the list it becomes an item and takes nothing.
    const intoList = dropSeams(doc, [move]).find((s) => s.aboveId === byLine(doc, '- a list').id)!;
    const asItem = intoList.candidates.find((c) => c.firstLine.trimStart().startsWith('-'))!;
    expect(asItem.absorbs).toBeUndefined();
  });

  it('offers seams with nothing in hand, for an insertion', () => {
    // The same places a drag resolves, asked about a kind rather than a run:
    // no interior to exclude, and the heading rule keyed on the kind alone.
    const doc = parse(['# H1', '', '## H2', '', '### H3', '', 'para1', '', 'para2', ''].join('\n'));
    const last = seams(doc, { kind: 'paragraph' }).at(-1)!;
    expect(last.places.map((p) => p.depth)).toEqual([3, 4]);
    const heading = seams(doc, { kind: 'heading' }).at(-1)!;
    expect(heading.places.map((p) => p.depth)).toEqual([0, 1, 2, 3, 4]);
    // Every seam of the document is present, the ones inside `### H3` included.
    expect(seams(doc, { kind: 'paragraph' }).map((s) => s.line)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('offers a heading run every level shallower than its neighbours, at the same place', () => {
    // Kitchen Renovation: `## Plan` precedes `## Materials`, whose children
    // end the note. Dropped between `## Materials` and its first child AT
    // LEVEL TWO, Plan closes Materials' section and takes its children —
    // a legal move the interval alone never offered, since the node below
    // would become a descendant of the drop; for a heading that is the
    // absorption the drop means, not a different operation.
    const doc = parse(
      ['# Kitchen', '', 'intro', '', '## Plan', '', '1. demolition', '', '## Materials', '', '- tile', '- handles', '\t- brass', '', '> quote', ''].join('\n'),
    );
    const plan = byLine(doc, '## Plan');
    const all = dropSeams(doc, [plan]);
    const underMaterials = all.find((s) => s.aboveId === byLine(doc, '## Materials').id)!;
    expect(underMaterials.candidates.map((c) => [c.depth, c.firstLine, c.level ?? null])).toEqual([
      [0, '# Plan', 1],
      [1, '## Plan', 2],
      [2, '### Plan', 3],
    ]);
    // Written at level two, it takes every child of Materials — the quote too.
    const asPeer = underMaterials.candidates[1]!;
    expect(asPeer.absorbs).toMatchObject({ from: 10, to: 16 });
    // One level in, a heading can still be Materials' child, so it stays one,
    // one level inside Materials, and its section takes the list and the
    // quote that follow it. Paste writes a list item here instead, since it
    // has no column to say which parent was meant.
    const asChild = underMaterials.candidates[2]!;
    expect(asChild.absorbs).toMatchObject({ from: 10, to: 16 });
  });

  it('merges the seams either side of the run, and keeps the place it already has', () => {
    const doc = parse(
      ['# Kitchen', '', 'intro', '', '## Plan', '', '1. demolition', '', '## Materials', '', '- tile', ''].join('\n'),
    );
    const plan = byLine(doc, '## Plan');
    const all = dropSeams(doc, [plan]);
    // One seam between `intro` and `## Materials`, drawn at the run's own top.
    const home = all.find((s) => s.aboveId === byLine(doc, 'intro').id)!;
    expect(home.belowId).toBe(byLine(doc, '## Materials').id);
    expect(home.line).toBe(4);
    // Its own place — a child of Kitchen at index 1 as `## Plan` — is offered
    // back, named by its own index rather than the one past it, so the algebra
    // reads the no-op. In place one level out is `# Plan`, the outdent, taking
    // the rest of the note.
    expect(home.candidates.map((c) => [c.depth, c.firstLine, c.index])).toEqual([
      [0, '# Plan', 1],
      [1, '## Plan', 1],
      [2, '- ## Plan', 0],
    ]);
    expect(home.candidates[0]!.absorbs).toMatchObject({ from: 8, to: 12 });
    expect(home.candidates[1]!.absorbs).toBeUndefined();
    // A paragraph gets no shallower level anywhere.
    const intro = byLine(doc, 'intro');
    for (const seam of dropSeams(doc, [intro])) {
      expect(seam.candidates.every((c) => c.level === undefined)).toBe(true);
    }
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
    const source = parse(['# One', '', '- a', '  - a1', '  - a2', '', '# Two', '', '- b', ''].join('\n'));
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
    // And what is left is still a place to drop: the root's own children. (A
    // root with the run as its only child offers nothing at all — every
    // column would put it back where it is.)
    expect(scoped.some((s) => s.candidates.length > 0)).toBe(true);
    const inScope = new Set([byLine(zoomed, '- a').id, byLine(zoomed, '  - a2').id]);
    for (const seam of scoped) {
      for (const candidate of seam.candidates) {
        expect(inScope.has(candidate.parentId as number)).toBe(true);
      }
    }
  });

  /** What the release writes for the run at one of its candidates: its first
   * line, and the first line of the node it lands under (`null` at the top). */
  function landing(
    doc: OutlineDoc,
    roots: readonly OutlineNode[],
    c: DropSeam['candidates'][number],
  ): { firstLine: string; under: string | null } {
    const result = moveSubtreesTo(
      doc,
      roots.map((root) => [root.id]),
      c.level === undefined
        ? { parentId: c.parentId, index: c.index }
        : { parentId: c.parentId, index: c.index, level: c.level },
    );
    if (!result.ok) return { firstLine: `refused: ${result.rejection.reason}`, under: null };
    const at = result.value.span.start.line;
    let line = result.value.doc.preamble.length;
    let under: string | null | undefined;
    const walk = (nodes: readonly OutlineNode[], parent: OutlineNode | null): void => {
      for (const node of nodes) {
        if (under !== undefined) return;
        if (line === at) under = parent ? parent.lines[0]! : null;
        line += ownSpan(node);
        walk(node.children, node);
      }
    };
    walk(result.value.doc.children, null);
    return { firstLine: encode(result.value.doc).split('\n')[at]!, under: under ?? null };
  }

  function released(doc: OutlineDoc, roots: readonly OutlineNode[], c: DropSeam['candidates'][number]): string {
    return landing(doc, roots, c).firstLine;
  }

  it('draws what the release writes for a run whose roots have different parents', () => {
    // `### a1` and `## b` are one cover. Dropped among Top's children, only
    // `## b` was already there, so the release removes both and writes the run
    // for the destination: `a1` beside the h2s is an h2.
    const doc = parse(['# Top', '## a', '### a1', '## b', '## c', ''].join('\n'));
    const roots = [byLine(doc, '### a1'), byLine(doc, '## b')];
    const top = byLine(doc, '# Top').id;
    const last = dropSeams(doc, roots).find((s) => s.aboveId === byLine(doc, '## c').id)!;
    const beside = last.candidates.find((c) => c.parentId === top && c.level === undefined)!;
    expect(beside.firstLine).toBe('## a1');
    expect(released(doc, roots, beside)).toBe('## a1');
  });

  it('writes a heading beside the siblings it lands among, where its level closes the section above', () => {
    // `## C` skips to `#### D`. Every place that makes B a child of C writes it
    // an h4, beside D — the one between D and `bar` included, which closes D's
    // section and takes `bar`. Its column's own depth read an h3.
    const doc = parse(['# A', '## B', '## C', 'foo', '#### D', 'bar', ''].join('\n'));
    const b = byLine(doc, '## B');
    const c = byLine(doc, '## C').id;
    const underC = dropSeams(doc, [b]).flatMap((seam) =>
      seam.candidates.filter((d) => (d.landsUnder ?? d.parentId) === c).map((d) => d.firstLine),
    );
    expect(underC).toEqual(['#### B', '#### B', '#### B', '#### B']);
    // Where a level is skipped above the parent too, the column's depth read
    // the parent's own level, which closes the parent: B landed a level out
    // from the one the preview named.
    const skipped = parse(['# A', '## B', '# A2', '### C', '#### D', 'bar', ''].join('\n'));
    const between = dropSeams(skipped, [byLine(skipped, '## B')]).find(
      (seam) => seam.aboveId === byLine(skipped, '#### D').id,
    )!;
    const levelled = between.candidates.find((d) => d.landsUnder === byLine(skipped, '### C').id)!;
    expect(levelled.firstLine).toBe('#### B');
    expect(landing(skipped, [byLine(skipped, '## B')], levelled).under).toBe('### C');
  });

  it('keeps a dragged heading a heading wherever the column’s parent can hold one', () => {
    // B owns a list and then a paragraph. Dropped after P, the four columns
    // are A's sibling, B's sibling, B's child and P's child; only the last
    // parent cannot hold a heading. B's child was written as a list item
    // there, which after P re-parsed as P's child.
    const doc = parse(['## X', '## A', '### B', '- item', 'P', ''].join('\n'));
    const x = byLine(doc, '## X');
    const after = (line: string) =>
      dropSeams(doc, [x]).find((seam) => seam.aboveId === byLine(doc, line).id)!.candidates;
    const afterP = after('P');
    expect(afterP.map((c) => c.firstLine)).toEqual(['## X', '### X', '#### X', '- ## X']);
    expect(afterP.map((c) => landing(doc, [x], c).under)).toEqual([null, '## A', '### B', 'P']);
    // Between the list item and P, B's child is still a heading, and its
    // section takes P. Paste writes a list item here, joining the list: it
    // has only the caret to go by (edit-ops, "a section landing among LIST
    // ITEMS converts instead").
    const afterItem = after('- item');
    const asChild = afterItem.find((c) => c.depth === 2)!;
    expect(asChild.firstLine).toBe('#### X');
    expect(asChild.absorbs).toBeDefined();
    expect(landing(doc, [x], asChild).under).toBe('### B');
    expect(afterItem.find((c) => c.depth === 3)!.firstLine).toBe('  - ## X');
  });

  it('re-levels a heading moved within its parent past a shallower sibling', () => {
    // Kept as written, `##### d` after `#### X` re-parses as X's child.
    const doc = parse(['### T', '##### d', '#### X', 'x', ''].join('\n'));
    const d = byLine(doc, '##### d');
    const last = dropSeams(doc, [d]).find((seam) => seam.aboveId === byLine(doc, 'x').id)!;
    const underT = last.candidates.find((c) => c.parentId === byLine(doc, '### T').id)!;
    expect(underT.firstLine).toBe('#### d');
    expect(landing(doc, [d], underT).under).toBe('### T');
  });

  it('writes a list item moved after a paragraph in its own parent as a paragraph', () => {
    // Kept as written, it would be the paragraph's child; a task cannot be a
    // paragraph, so that column is not offered to one.
    const doc = parse(['- bullet', '', 'para one', '', 'para two', ''].join('\n'));
    const bullet = byLine(doc, '- bullet');
    const end = dropSeams(doc, [bullet]).find((seam) => seam.aboveId === byLine(doc, 'para two').id)!;
    const top = end.candidates.find((c) => c.parentId === 'root')!;
    expect(top.firstLine).toBe('bullet');
    expect(landing(doc, [bullet], top).under).toBe(null);
    const tasks = parse(['- [ ] chore', '', 'para', ''].join('\n'));
    const chore = byLine(tasks, '- [ ] chore');
    const afterPara = dropSeams(tasks, [chore]).find((seam) => seam.aboveId === byLine(tasks, 'para').id)!;
    expect(afterPara.candidates.some((c) => c.parentId === 'root')).toBe(false);
  });

  it('takes a run whose roots have different parents to its first root’s place as a move', () => {
    // `#### h` and `### C` are one cover. At h's own place, C comes to it,
    // so the place is not a no-op, and the heading keeps its kind there like
    // at any other: it was written `- #### h`, which after P re-parsed as P's
    // child.
    const doc = parse(['## A', '### B', '- x', 'P', '#### h', '### C', ''].join('\n'));
    const roots = [byLine(doc, '#### h'), byLine(doc, '### C')];
    const home = dropSeams(doc, roots).find((seam) => seam.aboveId === byLine(doc, 'P').id)!;
    const underB = home.candidates.find((c) => c.parentId === byLine(doc, '### B').id)!;
    expect(underB.firstLine).toBe('#### h');
    expect(landing(doc, roots, underB).under).toBe('### B');
  });

  it('draws what the release writes, at every destination it offers', () => {
    // Runs of one to three roots, each starting where the one before it ends,
    // which is every shape a cover takes. Some headings are written a level
    // deeper than the generator makes them, so a note can skip a level.
    const size = (node: OutlineNode): number =>
      1 + node.children.reduce((total, child) => total + size(child), 0);
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.integer({ min: 1, max: 3 }), fc.nat(), (tree, at, count, skew) => {
        let heading = 0;
        const text = encode(tree).replace(/^(#{1,5}) /gm, (whole, marks: string) =>
          (skew >> heading++ % 30) & 1 ? `#${marks} ` : whole,
        );
        const doc = parse(text);
        const nodes = [...walkNodes(doc)];
        if (nodes.length === 0) return;
        const roots = [nodes[at % nodes.length]!];
        while (roots.length < count) {
          const next = nodes[nodes.indexOf(roots[roots.length - 1]!) + size(roots[roots.length - 1]!)];
          if (!next) break;
          roots.push(next);
        }
        const lines = nodes.map((node) => node.lines[0]!);
        for (const seam of dropSeams(doc, roots)) {
          for (const candidate of seam.candidates) {
            const landed = landing(doc, roots, candidate);
            expect(landed.firstLine).toBe(candidate.firstLine);
            // And it lands under the node the preview accents, where its line
            // names it. Not for a run carrying an atom: taking one out from
            // between a paragraph and a list lets the list attach to the
            // paragraph, which moves a neighbour the preview does not draw
            // (#206).
            if (roots.some((root) => isAtom(root))) continue;
            const parentId = candidate.landsUnder ?? candidate.parentId;
            const parent = parentId === 'root' ? null : nodes.find((node) => node.id === parentId)!.lines[0]!;
            if (parent === null || lines.indexOf(parent) === lines.lastIndexOf(parent)) {
              expect(landed.under).toBe(parent);
            }
          }
        }
      }),
      { numRuns: 150 },
    );
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

  it('names nothing near the run’s own bottom, rather than the seam past it', () => {
    // The dead seam exists for this: a pointer setting the run down where it
    // was must resolve to nothing, not snap to the neighbour below and move it.
    const review = byLine(doc, '    - prototype review');
    const bottom = seams.find((s) => s.aboveId === review.id)!;
    expect(bottom.candidates).toEqual([]);
    expect(resolveDestination(seams, geometry, { x: 0, y: bottom.line * 20 })).toBeUndefined();
  });
});
