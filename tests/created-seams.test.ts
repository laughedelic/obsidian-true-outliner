import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import {
  deleteSubtrees,
  finalize,
  indent,
  insertSiblingHeading,
  insertSubtrees,
  mergeNodes,
  moveGroupsUp,
  moveSubtreesTo,
  outdent,
  splitNode,
  type OpOutput,
} from '../src/ops';
import type { OpResult } from '../src/result';
import { arbTree } from './generators';

/**
 * `created-seams-are-separated`: what each operation's edit site gives
 * (`structural-operations`, "A seam at an operation's edit site is
 * separated"). Each case goes through the real op, on the note the scenario
 * names.
 */

function node(doc: OutlineDoc, firstLine: string): OutlineNode {
  for (const n of walkNodes(doc)) if (n.lines[0] === firstLine) return n;
  throw new Error(`no node opening with ${firstLine}`);
}

function text(result: OpResult<OpOutput>): string {
  if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
  return encode(result.value.doc);
}

const paste = (source: string, after: string, payload: string): string => {
  const doc = parse(source);
  return text(insertSubtrees(doc, node(doc, after).id, parse(payload).children, 'after'));
};

describe('insertion, removal and moves', () => {
  it('a pasted quote is separated from the paragraph below it', () => {
    const doc = parse('## H\nbelow\n');
    const payload = parse('    first\n\n    > quote\n').children;
    expect(text(insertSubtrees(doc, node(doc, 'below').id, payload, 'before'))).toBe(
      '## H\n\nfirst\n\n> quote\n\nbelow\n',
    );
  });

  it('a paste after a line that repeats in the payload is still separated', () => {
    const out = paste('> quote\nx\n\ny\n', '> quote', 'x\n\nz\n');
    expect(out.startsWith('> quote\n\nx\n')).toBe(true);
  });

  it('a drag that ends a list above a paragraph separates them', () => {
    const doc = parse('- item\n- other\n  - kid\n\n    <div>\n\nafter\n');
    const out = text(moveSubtreesTo(doc, [[node(doc, '  - kid').id]], { parentId: 'root', index: 0 }));
    expect(out).toBe('- kid\n\n  <div>\n\n- item\n- other\n\nafter\n');
  });

  it('a removal that joins a quote and a paragraph separates them', () => {
    const doc = parse('> q\n---\n\nafter\n');
    expect(text(deleteSubtrees(doc, [node(doc, '---').id]))).toBe('> q\n\nafter\n');
  });

  it('a removal that joins a quote and a paragraph after a checked task separates them', () => {
    for (const box of ['[x]', '[X]']) {
      const doc = parse(`- ${box}\n> q\nafter\n`);
      expect(text(deleteSubtrees(doc, [node(doc, '> q').id]))).toBe(`- ${box}\n\nafter\n`);
    }
  });

  it('a quote pasted before an empty item that holds a subtree is separated from it', () => {
    const doc = parse('# H\n> old\n-\n  - child\n');
    const out = text(insertSubtrees(doc, node(doc, '-').id, parse('> new\n').children, 'before'));
    expect(out).toBe(
      '# H\n> old\n\n> new\n\n-\n  - child\n');
  });

  it('a list item inserted into a tight list keeps it tight', () => {
    expect(paste('- a\n- b\n', '- a', '- x\n')).toBe('- a\n- x\n- b\n');
  });

  it('a code block dropped as the last child of an item in a tight list keeps it tight', () => {
    const doc = parse('- a\n- b\n- c\n\n```\nk\n```\n');
    const b = node(doc, '- b');
    const out = text(moveSubtreesTo(doc, [[node(doc, '```').id]], { parentId: b.id, index: 0 }));
    expect(out).toBe('- a\n- b\n  ```\n  k\n  ```\n- c\n');
  });

  it('a reorder separates the flush seams at the moved block’s edges', () => {
    const doc = parse('## Packing\nx\n## Budget\ny\n');
    expect(text(moveGroupsUp(doc, [[node(doc, '## Budget').id]]))).toBe(
      '## Budget\ny\n\n## Packing\nx\n',
    );
  });

  it('a reorder leaves the seams between the blocks it passed as written', () => {
    const doc = parse('| t1 | b |\n| --- | --- |\n\n\n> q2\n## h3\nx\n');
    const out = text(moveSubtreesTo(doc, [[node(doc, '## h3').id]], { parentId: 'root', index: 0 }));
    expect(out).toContain('| --- | --- |\n\n\n> q2');
  });

  it('renumbering writes no block', () => {
    const doc = parse('1. a\n2. b\n3. c\npara\n');
    expect(text(deleteSubtrees(doc, [node(doc, '1. a').id]))).toBe('1. b\n2. c\npara\n');
  });

  it('a level shift writes only the heading it moves', () => {
    const doc = parse('# A\n## B0\n## B\ntext\n### C\nbody\n');
    expect(text(indent(doc, node(doc, '## B').id))).toBe('# A\n## B0\n\n### B\ntext\n#### C\nbody\n');
  });

  it('a level shift at the root writes only the heading it moves', () => {
    const doc = parse('## Packing\nx\n## Budget\n### Transport\nbus\n');
    expect(text(indent(doc, node(doc, '## Budget').id))).toBe(
      '## Packing\nx\n\n### Budget\n#### Transport\nbus\n',
    );
  });

  it('a level-skip outdent writes no block', () => {
    const doc = parse('# Log\n### Monday\ntext\n');
    expect(text(outdent(doc, node(doc, '### Monday').id))).toBe('# Log\n## Monday\ntext\n');
  });

  it('a seam inside a moved run is left as written', () => {
    const doc = parse('## A\n> q\nbody\n\n## B\ntext\n');
    const out = text(
      moveSubtreesTo(doc, [[node(doc, '> q').id, node(doc, 'body').id]], {
        parentId: node(doc, '## B').id,
        index: 1,
      }),
    );
    expect(out).toContain('> q\nbody');
  });

  it('a payload of a paragraph over a four-column list keeps the list flush', () => {
    expect(paste('# H\n', '# H', 'para\n    - a\n')).toBe('# H\n\npara\n    - a\n');
  });

  it('a group move keeps a seam between two selected roots', () => {
    const doc = parse('# X\n> p\na\n> b\n# N\n');
    const out = text(moveGroupsUp(doc, [[node(doc, 'a').id, node(doc, '> b').id]]));
    expect(out).toBe('# X\n\na\n> b\n\n> p\n\n# N\n');
  });
});

describe('rewrites', () => {
  it('a heading split separates the new child', () => {
    const doc = parse('# Hello world\n');
    expect(text(splitNode(doc, node(doc, '# Hello world').id, { line: 0, ch: 8 }))).toBe(
      '# Hello \n\nworld\n',
    );
  });

  it('a setext split separates the remainder from the heading', () => {
    const doc = parse('Hello world\n====\n');
    expect(text(splitNode(doc, node(doc, 'Hello world').id, { line: 0, ch: 6 }))).toBe(
      'Hello \n====\n\nworld\n',
    );
  });

  it('a split separates the blocks it wrote', () => {
    const doc = parse('# H\npara text\n> q\n');
    expect(text(splitNode(doc, node(doc, 'para text').id, { line: 1, ch: 4 }))).toBe(
      '# H\n\npara\n\ntext\n\n> q\n',
    );
  });

  it('a merge separates the merged block from its flush neighbours', () => {
    const doc = parse('- a\n\npara\n> q\n');
    expect(text(mergeNodes(doc, node(doc, '- a').id))).toBe('- apara\n\n> q\n');
  });

  it('an outdent that takes a quote out of a list separates it from the list', () => {
    const doc = parse('- a\n- b\n  > q\n');
    expect(text(outdent(doc, node(doc, '  > q').id))).toBe('- a\n- b\n\n> q\n');
  });

  it('a remainder’s heading is separated, and so is the original’s first child', () => {
    const doc = parse('## Foo bar\ntext\n');
    expect(text(insertSiblingHeading(doc, node(doc, '## Foo bar').id, 'bar'))).toBe(
      '## Foo \n\ntext\n\n## bar\n',
    );
  });

  it('an empty drafted heading is a place, written as today', () => {
    const doc = parse('## Foo\n');
    expect(text(insertSiblingHeading(doc, node(doc, '## Foo').id, ''))).toBe('## Foo\n## \n');
  });
});

describe('limits', () => {
  it('a lone id line stays flush above the block below it', () => {
    const doc = parse('Lead.\n\n^id3\n> q\n# H\n');
    expect(text(deleteSubtrees(doc, [node(doc, '> q').id]))).toBe('Lead.\n\n^id3\n# H\n');
  });

  it('dropping a lone id writes no block', () => {
    const doc = parse('Lead.\n- a\n\n^id\n');
    const lead = node(doc, 'Lead.');
    const out = text(moveSubtreesTo(doc, [[node(doc, '^id').id]], { parentId: lead.id, index: 0 }));
    expect(out).toContain('^id\n- a');
  });

  it('an attached id stays on its block, with the separator below it', () => {
    const doc = parse('para\n');
    const payload = parse('- x\n  ^idx\n').children;
    expect(text(insertSubtrees(doc, node(doc, 'para').id, payload, 'before'))).toBe('- x\n  ^idx\n\npara\n');
  });

  it('an unrelated operation leaves a flush quote and paragraph elsewhere byte-identical', () => {
    const doc = parse('> q\nbody\n\n# H\n\na\n\nb\n');
    expect(text(moveGroupsUp(doc, [[node(doc, 'b').id]]))).toContain('> q\nbody\n');
  });
});

describe('the pass on a tree compared with itself', () => {
  it('changes nothing on any generated document', () => {
    fc.assert(
      fc.property(arbTree(), (tree) => {
        const doc = parse(encode(tree));
        const result = finalize(doc, doc, undefined);
        return result.ok && encode(result.value.doc) === encode(doc);
      }),
      { numRuns: 300 },
    );
  });
});

describe('dispatch', () => {
  it('a move that gains a blank line is still a move, and leaves the table it passes alone', async () => {
    const { editsToChanges } = await import('../src/plugin/dispatch');
    const source = 'x\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\npara\n\ny\n';
    const doc = parse(source);
    const result = moveGroupsUp(doc, [[node(doc, 'para').id]]);
    if (!result.ok) throw new Error(result.rejection.reason);
    // `para` lands above the table, and the seam between them gains a line.
    expect(encode(result.value.doc)).toBe('x\n\npara\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\ny\n');
    const changes = editsToChanges(source.split('\n'), result.value.edits);
    for (const change of changes) {
      // No change range starts inside a table row (lines 2 to 4) or spans one.
      expect(change.from.line >= 2 && change.from.line <= 4 && change.from.ch > 0).toBe(false);
      expect(change.from.line <= 2 && change.to.line > 4).toBe(false);
      expect(change.from.line > 2 && change.from.line <= 4 && change.to.line > change.from.line).toBe(false);
    }
  });
});
