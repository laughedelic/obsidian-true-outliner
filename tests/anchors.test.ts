import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { nodeAtLine } from '../src/locate';
import { resolveZoom } from '../src/zoom';
import { anchorsOf, classifyZoom, headingText, type Anchor } from '../src/anchors';
import { walkNodes } from '../src/model';
import { arbTree } from './generators';

/**
 * Shape -> the start line each block id gets, null where no block is
 * registered for it. Every row but `^f15` is the line Obsidian's metadata gave
 * the id (docs/research/zoom-scoped-backlinks and docs/research/lone-block-id).
 */
const SHAPES: Array<[string, string, Record<string, number | null>]> = [
  // docs/research/zoom-scoped-backlinks, "What a block id names"
  ['paragraph, id at end', 'Some prose. ^p1\n', { p1: 0 }],
  ['paragraph, id directly below', 'Some prose.\n^p2\n', { p2: 0 }],
  ['paragraph, blank, id', 'Some prose.\n\n^p3\n', { p3: 0 }],
  ['item with children, id at end', '- parent ^li1\n  - child\n', { li1: 0 }],
  ['nested item, id at end', '- parent\n  - child ^li2\n', { li2: 1 }],
  ['two-line item, id on continuation', '- first line\n  second line ^li3\n', { li3: 0 }],
  ['heading, id at end', '## Head ^h1\n\nbody\n', { h1: 0 }],
  ['table, blank, id', '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n^t1\n', { t1: 0 }],
  ['table, id directly below', '| a | b |\n| --- | --- |\n| 1 | 2 |\n^t2\n', { t2: 0 }],
  ['quote, blank, id', '> quoted\n\n^q1\n', { q1: 0 }],
  ['quote, id directly below', '> quoted\n^q2\n', { q2: 0 }],
  ['callout, blank, id', '> [!note] Title\n> body\n\n^c1\n', { c1: 0 }],
  ['fence, blank, id', '```\ncode\n```\n\n^code1\n', { code1: 0 }],
  ['two items, blank, id', '- a\n- b\n\n^l1\n', { l1: 0 }],
  ['id indented under an item, after a blank', '- item a\n\n  ^under-a\n- item b\n', { 'under-a': 0 }],
  ['lead, nested list, blank, id', 'Lead.\n- item a\n- item b\n  - nested c\n\n^l2\n', { l2: 1 }],
  ['callout body line ending an id', '> [!note] Title\n> body line ^cb\n', { cb: 0 }],
  ['quote line ending an id', '> quoted line ^qa\n', { qa: 0 }],
  // docs/research/lone-block-id, "What a lone id names"
  ['heading, blank, id', '## H\n\n^h2\n', { h2: 0 }],
  ['heading, id directly below', '## H\n^h3\n', { h3: 0 }],
  ['rule, blank, id', '***\n\n^hr1\n', { hr1: 0 }],
  ['html, blank, id', '<div>html</div>\n\n^html1\n', { html1: 0 }],
  ['fence, id directly below', '```\ncode\n```\n^code2\n', { code2: 0 }],
  ['callout, id directly below', '> [!note] T\n> body\n^c2\n', { c2: 0 }],
  ['table, two blanks, id', '| a |\n| --- |\n| 1 |\n\n\n^t3\n', { t3: 0 }],
  ['paragraph, two blanks, id', 'Para.\n\n\n^p4\n', { p4: 0 }],
  ['table under a heading, blank, id', '## H\n\n| a |\n| --- |\n| 1 |\n\n^t6\n', { t6: 2 }],
  ['id with trailing spaces', '| a |\n| --- |\n| 1 |\n\n^t4   \n', { t4: null }],
  ['id with text directly under', '| a |\n| --- |\n| 1 |\n\n^t5\nMore text.\n', { t5: null }],
  ['two ids in a row', 'Para.\n\n^y1\n\n^y2\n', { y1: null, y2: 0 }],
  ['id as the first line', '^first\n\nPara.\n', { first: null }],
  ['item, child, blank, id at the item column', '- a\n  - child\n\n  ^x1\n', { x1: 0 }],
  ['item, child, blank, id at the child column', '- a\n  - child\n\n    ^x2\n', { x2: 1 }],
  ['item, blank, id, blank, next item', '- a\n\n  ^x4\n\n- b\n', { x4: 0 }],
  ['prose inside an item, blank, id', '- a\n\n  inner prose\n\n  ^x3\n', { x3: 0 }],
  ['table inside an item, blank, id', '- a\n\n  | t |\n  | --- |\n  | 1 |\n\n  ^x5\n', { x5: 0 }],
  ['fence inside an item, blank, id', '- a\n\n  ```\n  code\n  ```\n\n  ^x6\n', { x6: 0 }],
  ['quote inside an item, id directly below', '- a\n\n  > quoted\n  ^x7\n', { x7: 0 }],
  ['two items, id directly below', '- a\n- b\n^l3\n', { l3: 1 }],
  ['lead, two items, id directly below', 'Lead.\n- a\n- b\n^l5\n', { l5: 2 }],
  ['items, nested item, blank, id', '- a\n- b\n  - c\n\n^l4\n', { l4: 0 }],
  ['prose inside an item, ending an id', '- a\n\n  inner prose ^x8\n', { x8: 0 }],
  ['table inside an item, last row ending an id', '- a\n\n  | x | y |\n  | --- | --- |\n  | 1 | 2 | ^x9\n- b\n', { x9: 0 }],
  ['quote inside an item, ending an id', '- a\n\n  > quoted ^x10\n', { x10: 0 }],
  ['lead, items, nested item ending an id', 'Lead.\n- a\n- b\n  - c ^l6\n', { l6: 3 }],
  // docs/research/lone-block-id, "What may follow the id"
  ['lead, blank, id, item directly under', 'Lead.\n\n^id3\n- a\n', { id3: 2 }],
  ['lead, blank, id, heading directly under', 'Lead.\n\n^f1\n## H\n', { f1: 2 }],
  ['table, blank, id, item directly under', '| a |\n| --- |\n| 1 |\n\n^f6\n- a\n', { f6: 4 }],
  ['table, id directly below, item directly under', '| a |\n| --- |\n| 1 |\n^f7\n- a\n', { f7: 3 }],
  ['heading, id directly below, item directly under', '## H\n^f12\n- a\n', { f12: 1 }],
  // Obsidian registers no id here: it reads the id's line as part of the table (design, Risks).
  ['lead, blank, id, table directly under', 'Lead.\n\n^f15\n| a |\n| --- |\n| 1 |\n', { f15: 2 }],
  ['heading, blank, id, item directly under', '## H\n\n^f11\n- a\n', { f11: 2 }],
  ['callout, id, item directly under', '> [!note] T\n> body\n^g9\n- a\n', { g9: 0 }],
  ['lead, blank, id, blank, item', 'Lead.\n\n^id4\n\n- a\n', { id4: 0 }],
  ['heading, blank, id at the end, no newline', '## H\n\n^g11', { g11: 0 }],
  ['lead, id directly under, item directly under', 'Lead.\n^id1\n- a\n', { id1: 0 }],
  ['lead, id directly under, blank, item', 'Lead.\n^id2\n\n- a\n', { id2: 0 }],
  ['two-line lead, id directly under', 'Lead one\nlead two\n^id5\n', { id5: 0 }],
  ['items, blank, indented id, item directly under', '- z\n- a\n\n  ^f8\n- b\n', { f8: 1 }],
  ['item, blank, id, nested item directly under', '- a\n\n  ^f9\n  - c\n', { f9: 0 }],
  ['item, id, item directly under', '- a\n^f10\n- b\n', { f10: 0 }],
  ['item, blank, id, quote directly under', '- a\n\n  ^g1\n  > q\n', { g1: 0 }],
  ['item, id, quote directly under', '- a\n^g2\n> q\n', { g2: 0 }],
  ['item, id, heading directly under', '- a\n^g3\n## H\n', { g3: 0 }],
  ['item, blank, id, heading directly under', '- a\n\n  ^g4\n## H\n', { g4: 0 }],
  ['item, id, ordered item directly under', '- a\n^g5\n1. b\n', { g5: 0 }],
  ['item, blank, id, text directly under', '- a\n\n  ^g6\nText.\n', { g6: null }],
  ['item, id, continuation directly under', '- a\n^g7\n  more\n', { g7: null }],
  // docs/research/lone-block-id, "Two ids in a row" (#208, 27 September 2026)
  ['table, blank, id, blank, id', '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n^t1\n\n^t2\n', { t1: null, t2: 0 }],
  ['quote, lazy id, blank, id', '> q\n^n5\n\n^n6\n', { n5: null, n6: 0 }],
  ['heading, id directly under, blank, id', '## H\n^n9\n\n^n10\n', { n9: null, n10: 0 }],
  ['paragraph, id directly under, blank, id', 'Lead.\n^n15\n\n^n16\n\nAfter.\n', { n15: null, n16: 0 }],
  ['paragraph with an inline id, blank, id', 'Lead. ^k3\n\n^k4\n\nAfter.\n', { k3: null, k4: 0 }],
  ['item, blank, indented id, blank, id at column 0', '- a\n\n  ^n1\n\n^n2\n', { n1: 0, n2: 0 }],
  ['item, lazy id, blank, id at column 0', '- a\n^n3\n\n^n4\n', { n3: 0, n4: 0 }],
  ['two items, indented id under the last, blank, id', '- b\n- a\n\n  ^n7\n\n^n8\n', { n7: 1, n8: 0 }],
  ['nested item, its id, then the parent item id', '- a\n  - c\n\n    ^n11\n\n  ^n12\n', { n11: 1, n12: 0 }],
  ['item, blank, two indented ids in a row', '- a\n\n  ^n13\n\n  ^n14\n', { n13: 0, n14: null }],
  ['item, blank, id, blank, id, next item', '- a\n\n  ^p5\n\n  ^p6\n- b\n', { p5: 0, p6: null }],
  ['item, blank, id, child, blank, id', '- a\n\n  ^p1\n  - c\n\n  ^p2\n', { p1: 0, p2: null }],
  ['item, lazy id, child, blank, id', '- a\n^p3\n  - c\n\n  ^p4\n', { p3: 0, p4: null }],
  ['item, id at content column directly under, blank, id', '- a\n  ^p7\n\n  ^p8\n', { p7: 0, p8: null }],
  ['item, lazy id, blank, indented id', '- a\n^p9\n\n  ^p10\n', { p9: 0, p10: null }],
  ['item with an inline id, blank, indented id', '- a ^k1\n\n  ^k2\n', { k1: 0, k2: null }],
  // docs/research/zoom-scoped-backlinks, "Two ids on one block"
  ['paragraph with an inline id, id directly under', 'Lead. ^k5\n^k6\n\nAfter.\n', { k5: null, k6: 0 }],
  ['heading with an inline id, blank, id', '## H ^k7\n\n^k8\n\nAfter.\n', { k7: null, k8: 0 }],
  ['quote with an inline id, blank, id', '> q ^k9\n\n^k10\n\nAfter.\n', { k9: null, k10: 0 }],
  // docs/research/zoom-scoped-backlinks, "Where an inline id counts"
  ['paragraph, id ending the first of two lines', 'Lead ^m1\nsecond line\n\nAfter.\n', { m1: null }],
  ['item, id ending the first of two lines', '- a ^m2\n  second line\n\nAfter.\n', { m2: null }],
  ['code block, a line inside ending an id', '```\ncode ^m3\nmore\n```\n\nAfter.\n', { m3: null }],
  ['table, a middle row ending an id', '| a | b |\n| --- | --- |\n| 1 | 2 | ^m4\n| 3 | 4 |\n\nAfter.\n', { m4: 0 }],
  ['quote, first of two lines ending an id', '> q ^m5\n> more\n\nAfter.\n', { m5: null }],
  ['setext heading ending an id', 'Title ^m6\n===\n\nAfter.\n', { m6: 0 }],
  ['unclosed code block ending an id', '```\ncode ^m7\n', { m7: null }],
];

function blockLines(md: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const anchor of anchorsOf(parse(md))) if (anchor.kind === 'block') out[anchor.id] = anchor.line;
  return out;
}

describe('anchorsOf: where a block id begins', () => {
  for (const [name, md, expected] of SHAPES) {
    it(name, () => {
      const got = blockLines(md);
      const want = Object.fromEntries(
        Object.entries(expected).filter((entry): entry is [string, number] => entry[1] !== null),
      );
      expect(got).toEqual(want);
    });
  }

  it('files a block under its lower-cased key, and keeps the id as written', () => {
    const [anchor] = anchorsOf(parse('Prose ^XYZ\n')) as [Anchor & { kind: 'block' }];
    expect(anchor).toMatchObject({ kind: 'block', id: 'XYZ', key: 'xyz', line: 0, at: 0 });
  });

  it('gives each anchor the node it belongs to, and the line its id is written on', () => {
    const doc = parse('| a |\n| --- |\n| 1 |\n\n^t1\n');
    const [table] = [...walkNodes(doc)];
    expect(anchorsOf(doc)).toEqual([
      { kind: 'block', id: 't1', key: 't1', line: 0, at: 4, nodeId: table!.id },
    ]);
  });
});

describe('anchorsOf: headings', () => {
  const heading = (md: string): string => {
    const found = anchorsOf(parse(md)).find((a) => a.kind === 'heading');
    return found?.kind === 'heading' ? found.text : '(none)';
  };

  it('is the line after its marker, trimmed', () => {
    expect(heading('## Current sprint   \n')).toBe('Current sprint');
  });

  it('drops closing hashes', () => {
    expect(heading('## Current sprint ##\n')).toBe('Current sprint');
  });

  it('is the first line of a setext heading', () => {
    expect(heading('Current sprint\n===\n')).toBe('Current sprint');
  });

  it('keeps inline markup as written', () => {
    expect(heading('## Emph *bold* and [[Other]] link\n')).toBe('Emph *bold* and [[Other]] link');
  });

  it('keeps an id the line ends in', () => {
    expect(heading('## Head with id ^h1\n')).toBe('Head with id ^h1');
  });

  it('records level, line and node, in the order written, beside the ids', () => {
    const doc = parse('# Top\n\n## Current sprint ^cs\n\n- item ^it\n');
    const [top, sprint, item] = [...walkNodes(doc)];
    expect(anchorsOf(doc)).toEqual([
      { kind: 'heading', text: 'Top', level: 1, line: 0, at: 0, nodeId: top!.id },
      { kind: 'heading', text: 'Current sprint ^cs', level: 2, line: 2, at: 2, nodeId: sprint!.id },
      { kind: 'block', id: 'cs', key: 'cs', line: 2, at: 2, nodeId: sprint!.id },
      { kind: 'block', id: 'it', key: 'it', line: 4, at: 4, nodeId: item!.id },
    ]);
  });

  it('headingText reads a setext heading from its node alone', () => {
    const [node] = [...walkNodes(parse('Title\n---\n'))];
    expect(headingText(node!)).toBe('Title');
  });
});

describe('anchorsOf: property', () => {
  it('every anchor begins on the first line of the node it belongs to', () => {
    fc.assert(
      fc.property(arbTree(), fc.array(fc.nat(), { maxLength: 6 }), (tree, picks) => {
        const lines = encode(tree).split('\n');
        picks.forEach((pick, n) => {
          const i = pick % lines.length;
          if (lines[i]!.trim() !== '') lines[i] = `${lines[i]} ^gen${n}`;
        });
        const doc = parse(lines.join('\n'));
        return anchorsOf(doc).every((anchor) => nodeAtLine(doc, anchor.line)?.id === anchor.nodeId);
      }),
      { numRuns: 500 },
    );
  });
});

describe('classifyZoom', () => {
  const NOTE = [
    '# Top', //                      0
    '', //                           1
    '## Current sprint', //          2  zoom root
    '', //                           3
    '- Alarm list ^alarm', //        4
    '- Triage', //                   5
    '', //                           6
    '| a |', //                      7
    '| --- |', //                    8
    '| 1 |', //                      9
    '', //                          10
    '^tab', //                      11  names the table
    '', //                          12
    '## Backlog', //                13
    '', //                          14
    '- Later ^later', //            15
    '',
  ].join('\n');

  const setup = (rootLine: number) => {
    const doc = parse(NOTE);
    const anchors = anchorsOf(doc);
    const scope = resolveZoom(doc, rootLine)!;
    const resolve = (subpath: string): number | null => {
      const found = anchors.find((a) =>
        a.kind === 'block' ? subpath === `#^${a.id}` : subpath === `#${a.text}`,
      );
      return found?.line ?? null;
    };
    return classifyZoom(anchors, scope.root.id, scope.cover, resolve);
  };

  it("answers node for the root's own heading", () => {
    expect(setup(2).classify('#Current sprint')).toBe('node');
  });

  it("answers below for a descendant's id", () => {
    expect(setup(2).classify('#^alarm')).toBe('below');
  });

  it("answers outside for a sibling's anchors", () => {
    const zoom = setup(2);
    expect(zoom.classify('#^later')).toBe('outside');
    expect(zoom.classify('#Backlog')).toBe('outside');
    expect(zoom.classify('#Top')).toBe('outside');
  });

  it('answers node for an id on the line after a zoomed table', () => {
    expect(setup(7).classify('#^tab')).toBe('node');
  });

  it('answers node for a whole-list id written after the list, zoomed into its first item', () => {
    const doc = parse('- a\n- b\n\n^l1\n');
    const anchors = anchorsOf(doc);
    const scope = resolveZoom(doc, 0)!;
    const zoom = classifyZoom(anchors, scope.root.id, scope.cover, (s) => (s === '#^l1' ? 0 : null));
    expect(scope.cover.end.line).toBeLessThan(3);
    expect(zoom.classify('#^l1')).toBe('node');
  });

  it('answers outside for a subpath the resolver cannot place', () => {
    expect(setup(2).classify('#^missing')).toBe('outside');
  });

  it('offers This branch and not This node for a root with no anchor but an anchored child', () => {
    const zoom = setup(0);
    // `# Top` carries a heading anchor; zoom instead into the unanchored item.
    const item = setup(5);
    expect(zoom.node).toBe(true);
    expect(item.node).toBe(false);
    expect(item.branch).toBe(false);
    const doc = parse('- parent\n  - child ^c\n');
    const anchors = anchorsOf(doc);
    const scope = resolveZoom(doc, 0)!;
    const parent = classifyZoom(anchors, scope.root.id, scope.cover, () => null);
    expect(parent.node).toBe(false);
    expect(parent.branch).toBe(true);
  });
});
