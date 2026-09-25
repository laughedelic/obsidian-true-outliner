import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
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
