import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { encode, encodeLines } from '../src/encode';
import { misplacedBlockIds, type BlockIdCorrection } from '../src/block-ids';
import { applyEdits } from '../src/result';
import { walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { RESEARCH_SHAPES } from './block-id-shapes';

function nodes(doc: OutlineDoc): OutlineNode[] {
  return [...walkNodes(doc)];
}

/** The node holding `id`, attached or as a paragraph of its own, and how. */
function holder(doc: OutlineDoc, id: string): { node: OutlineNode; attached: boolean } {
  for (const node of walkNodes(doc)) {
    if (node.blockId?.line.trim() === id) return { node, attached: true };
    if (node.lines.some((line) => line.trim() === id)) return { node, attached: false };
  }
  throw new Error(`no node holds ${id}`);
}

describe('a lone block id belongs to the node it names', () => {
  it('attaches an id after a table to the table', () => {
    const doc = parse(RESEARCH_SHAPES['table, blank, id']!);
    expect(nodes(doc).map((n) => n.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    const table = nodes(doc)[1]!;
    expect(table.blockId).toEqual({ gap: [''], line: '^t1' });
    expect(table.trailingGap).toEqual(['']);
    expect(nodes(doc).some((n) => n.lines.includes('^t1'))).toBe(false);
  });

  it('attaches an id directly under a table, a quote, a callout or a fence', () => {
    for (const [shape, id, kind] of [
      ['table, id directly under', '^t2', 'table'],
      ['quote, id directly under', '^q2', 'quote'],
      ['callout, id directly under', '^c2', 'callout'],
      ['fence, id directly under', '^code2', 'code'],
    ] as const) {
      const { node, attached } = holder(parse(RESEARCH_SHAPES[shape]!), id);
      expect(attached, shape).toBe(true);
      expect(node.kind, shape).toBe(kind);
      expect(node.blockId!.gap, shape).toEqual([]);
    }
  });

  it('skips the blank lines before the id, however many', () => {
    const { node, attached } = holder(parse(RESEARCH_SHAPES['paragraph, two blank lines, id']!), '^p4');
    expect(attached).toBe(true);
    expect(node.lines).toEqual(['Prose.']);
    expect(node.blockId!.gap).toEqual(['', '']);
  });

  it('attaches an id after a heading to the heading, before its children', () => {
    const doc = parse(RESEARCH_SHAPES['heading, blank, id']!);
    const heading = doc.children[0]!;
    expect(heading.blockId?.line).toBe('^h2');
    expect(heading.children.map((c) => c.lines)).toEqual([['body']]);
    expect(holder(parse(RESEARCH_SHAPES['heading, id directly under']!), '^h3').attached).toBe(true);
  });

  it('attaches every other block outside a list, a rule and an html block included', () => {
    for (const [shape, id] of [
      ['paragraph, blank, id', '^p3'],
      ['callout, blank, id', '^c1'],
      ['fence, blank, id', '^code1'],
      ['hr, blank, id', '^hr1'],
      ['html, blank, id', '^html1'],
      ['table under a heading, blank, id', '^t6'],
    ] as const) {
      expect(holder(parse(RESEARCH_SHAPES[shape]!), id).attached, shape).toBe(true);
    }
  });

  it('attaches an id indented under a list item to the item, which has no children', () => {
    const { node, attached } = holder(parse(RESEARCH_SHAPES['indented id under an item']!), '^under-a');
    expect(attached).toBe(true);
    expect(node.lines).toEqual(['- item a']);
    expect(node.children).toEqual([]);
    expect(holder(parse(RESEARCH_SHAPES['indented id after a nested item']!), '^x2').node.lines).toEqual([
      '  - child',
    ]);
  });

  it('attaches an id directly under the last item to that item', () => {
    for (const [shape, id] of [
      ['id at column 0 directly under a list', '^l3'],
      ['list under a lead paragraph, id directly under', '^l5'],
    ] as const) {
      const { node, attached } = holder(parse(RESEARCH_SHAPES[shape]!), id);
      expect(attached, shape).toBe(true);
      expect(node.lines, shape).toEqual(['- b']);
    }
  });

  it('leaves an id after a list, after an item, or inside an item as a paragraph of its own', () => {
    for (const [shape, id] of [
      ['list, blank, id', '^l1'],
      ['list under a lead paragraph, blank, id', '^l2'],
      ['list whose last item has a child, blank, id', '^l4'],
      ['indented id after an item and its child', '^x1'],
      ['id after a paragraph inside an item', '^x3'],
      ['table inside an item, blank, indented id', '^x5'],
      ['fence inside an item, blank, indented id', '^x6'],
      ['quote inside an item, indented id directly under', '^x7'],
    ] as const) {
      const { node, attached } = holder(parse(RESEARCH_SHAPES[shape]!), id);
      expect(attached, shape).toBe(false);
      expect(node.kind, shape).toBe('paragraph');
    }
  });

  it('leaves consecutive ids, an id with nothing above it, and non-ids unattached', () => {
    const run = parse(RESEARCH_SHAPES['paragraph, blank, id, blank, id']!);
    expect(holder(run, '^y1').attached).toBe(false);
    expect(holder(run, '^y2').attached).toBe(false);
    expect(holder(parse(RESEARCH_SHAPES['id at the start of a note']!), '^first').attached).toBe(false);
    const spaced = parse(RESEARCH_SHAPES['table, id with trailing spaces']!);
    expect(nodes(spaced).some((n) => n.blockId)).toBe(false);
    const joined = parse(RESEARCH_SHAPES['table, blank, id, text directly under']!);
    expect(nodes(joined).some((n) => n.blockId)).toBe(false);
    expect(nodes(joined).find((n) => n.lines[0] === '^t5')?.lines).toEqual(['^t5', 'More text.']);
  });

  it('leaves an id outside a list unattached when a block follows it directly', () => {
    for (const [shape, id] of [
      ['paragraph, blank, id, list directly under', '^id3'],
      ['paragraph, blank, id, heading directly under', '^f1'],
      ['table, id directly under, list directly under', '^f7'],
      ['heading, id directly under, list directly under', '^f12'],
    ] as const) {
      const { node, attached } = holder(parse(RESEARCH_SHAPES[shape]!), id);
      expect(attached, shape).toBe(false);
      expect(node.lines, shape).toEqual([id]);
    }
    expect(holder(parse(RESEARCH_SHAPES['heading, blank, id, end of note']!), '^g11').attached).toBe(true);
  });

  it('attaches an id with a block directly under it when the id is a lazy line of a quote or an item', () => {
    for (const [shape, id, first] of [
      ['callout, id directly under, list directly under', '^g9', '> [!note] T'],
      ['item, blank, indented id, nested item directly under', '^f9', '- a'],
      ['item, lazy id, heading directly under', '^g3', '- a'],
    ] as const) {
      const { node, attached } = holder(parse(RESEARCH_SHAPES[shape]!), id);
      expect(attached, shape).toBe(true);
      expect(node.lines[0], shape).toBe(first);
    }
    const nested = holder(parse(RESEARCH_SHAPES['item, blank, indented id, nested item directly under']!), '^f9');
    expect(nested.node.children.map((c) => c.lines)).toEqual([['  - c']]);
  });

  it('keeps an id directly under a paragraph as a line of the paragraph', () => {
    const lead = parse(RESEARCH_SHAPES['paragraph, id directly under, list directly under']!).children[0]!;
    expect(lead.lines).toEqual(['Lead.', '^id1']);
    expect(lead.blockId).toBeUndefined();
    expect(lead.children.map((c) => c.lines[0])).toEqual(['- a', '- b']);
  });

  it('round-trips every shape byte-identically', () => {
    for (const [shape, md] of Object.entries(RESEARCH_SHAPES)) {
      expect(encode(parse(md)), shape).toBe(md);
    }
  });
});

describe('misplaced block ids', () => {
  const found = (md: string) => misplacedBlockIds(parse(md));
  const after = (md: string, correction: BlockIdCorrection): string =>
    applyEdits(encodeLines(parse(md)), correction.edits).join('\n');
  const menu = (md: string): string[] =>
    found(md).flatMap((m) => m.corrections.map((c) => (c.kind === 'attach' ? `attach ${c.targetText}` : c.kind)));

  it('marks nothing where every id is attached, inline, or absent', () => {
    for (const shape of [
      'table, blank, id',
      'paragraph, blank, id',
      'heading, blank, id',
      'indented id under an item',
      'id at column 0 directly under a list',
      'paragraph, id directly under, list directly under',
      'callout, id directly under, list directly under',
    ]) {
      expect(found(RESEARCH_SHAPES[shape]!), shape).toEqual([]);
    }
  });

  it('reads an id after a list as the whole list, and offers the lead and the last node', () => {
    const md = RESEARCH_SHAPES['list under a lead paragraph, blank, id']!;
    const [only] = found(md);
    expect(only).toMatchObject({ line: 5, from: 0, to: 3, id: '^l2', reading: { kind: 'whole-list' } });
    expect(menu(md)).toEqual(['attach Lead.', 'attach nested c', 'remove']);
    expect(after(md, only!.corrections[0]!)).toBe('Lead. ^l2\n- a\n- b\n  - nested c\n\nAfter.\n');
    expect(after(md, only!.corrections[1]!)).toBe('Lead.\n- a\n- b\n  - nested c ^l2\n\nAfter.\n');
    expect(after(md, only!.corrections[2]!)).toBe('Lead.\n- a\n- b\n  - nested c\n\nAfter.\n');
    expect(only!.corrections[0]!.caret).toEqual({ line: 0, ch: 9 });
  });

  it('offers only the last node for a list with no lead', () => {
    expect(menu('- a\n- b\n\n^l1\n\nAfter.\n')).toEqual(['attach b', 'remove']);
    expect(menu('## H\n\n- a\n- b\n\n^l1\n\nAfter.\n')).toEqual(['attach b', 'remove']);
    // A paragraph the list sits under is its lead, blank line or not.
    expect(menu(RESEARCH_SHAPES['list, blank, id']!)).toEqual(['attach Before.', 'attach b', 'remove']);
    expect(menu(RESEARCH_SHAPES['list whose last item has a child, blank, id']!)).toEqual(['attach c', 'remove']);
  });

  it('reads an id inside an item as the item, and offers it and a different last item', () => {
    const x1 = RESEARCH_SHAPES['indented id after an item and its child']!;
    expect(found(x1)[0]!.reading).toEqual({ kind: 'item', itemText: 'a' });
    expect(menu(x1)).toEqual(['attach a', 'attach child', 'remove']);
    expect(after(x1, found(x1)[0]!.corrections[0]!)).toBe('- a ^x1\n  - child\n- b\n');
    for (const shape of [
      'id after a paragraph inside an item',
      'table inside an item, blank, indented id',
      'fence inside an item, blank, indented id',
      'quote inside an item, indented id directly under',
    ]) {
      expect(menu(RESEARCH_SHAPES[shape]!), shape).toEqual(['attach a', 'remove']);
    }
  });

  it('reads the first of two ids, and an id with nothing above it, as naming nothing', () => {
    const run = RESEARCH_SHAPES['paragraph, blank, id, blank, id']!;
    expect(found(run).map((m) => [m.id, m.reading])).toEqual([['^y1', { kind: 'nothing', because: 'next-id' }]]);
    expect(menu(run)).toEqual(['remove']);
    expect(after(run, found(run)[0]!.corrections[0]!)).toBe('Prose.\n\n^y2\n\nAfter.\n');
    const firstLine = RESEARCH_SHAPES['id at the start of a note']!;
    expect(found(firstLine)[0]!.reading).toEqual({ kind: 'nothing', because: 'nothing-above' });
    expect(after(firstLine, found(firstLine)[0]!.corrections[0]!)).toBe('Prose.\n');
  });

  it('reads an id with a block directly under it as naming nothing, and separates them', () => {
    const md = RESEARCH_SHAPES['paragraph, blank, id, list directly under']!;
    expect(found(md)[0]!.reading).toEqual({ kind: 'nothing', because: 'block-below' });
    expect(menu(md)).toEqual(['separate', 'remove']);
    expect(after(md, found(md)[0]!.corrections[0]!)).toBe('Lead.\n\n^id3\n\n- a\n- b\n\nAfter.\n');
    expect(after(md, found(md)[0]!.corrections[1]!)).toBe('Lead.\n\n- a\n- b\n\nAfter.\n');
  });

  it('reads trailing whitespace and a joined line as no id, and fixes each', () => {
    const spaced = RESEARCH_SHAPES['table, id with trailing spaces']!;
    expect(found(spaced)[0]!.reading).toEqual({ kind: 'not-an-id', because: 'trailing-space' });
    expect(menu(spaced)).toEqual(['trim', 'remove']);
    const joined = RESEARCH_SHAPES['table, blank, id, text directly under']!;
    expect(found(joined)[0]!.reading).toEqual({ kind: 'not-an-id', because: 'joined' });
    expect(menu(joined)).toEqual(['separate', 'remove']);
  });

  it('leaves every corrected note with nothing marked, and every fixed id attached', () => {
    for (const [shape, md] of Object.entries(RESEARCH_SHAPES)) {
      for (const misplaced of found(md)) {
        for (const correction of misplaced.corrections) {
          const text = after(md, correction);
          const label = `${shape}: ${correction.kind} ${correction.targetText ?? ''}`;
          expect(found(text).filter((m) => m.id === misplaced.id), label).toEqual([]);
          if (correction.kind === 'trim' || correction.kind === 'separate') {
            expect(holder(parse(text), misplaced.id).attached, label).toBe(true);
          }
        }
      }
    }
  });

  it('never offers a target that already carries an id', () => {
    const md = 'Lead. ^own\n- a\n- b\n\n^l2\n\nAfter.\n';
    expect(menu(md)).toEqual(['attach b', 'remove']);
  });
});
