import { describe, expect, it, vi } from 'vitest';
import { parse } from '../src/parse';
import { walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { editSite, outlineView } from '../src/edit-site';
import { deleteSubtrees, indent, moveSubtreesTo, moveGroupsUp, outdent } from '../src/ops';

/**
 * Task 1 of `created-seams-are-separated`: the edit site as a function of the
 * tree an operation started from and the surgery it built. The surgery is
 * captured at `finalize`'s encode, the last encode an operation runs, so every
 * case below goes through the real op.
 */
const encoded = vi.hoisted(() => ({ last: undefined as OutlineDoc | undefined }));
vi.mock('../src/encode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/encode')>();
  return {
    ...actual,
    encode: (doc: OutlineDoc) => {
      encoded.last = doc;
      return actual.encode(doc);
    },
  };
});

function node(doc: OutlineDoc, firstLine: string): OutlineNode {
  for (const n of walkNodes(doc)) if (n.lines[0] === firstLine) return n;
  throw new Error(`no node opening with ${firstLine}`);
}

/** The first lines of the blocks whose seam above is at the edit site. */
function siteOf(before: OutlineDoc, run: () => { ok: boolean }): string[] {
  encoded.last = undefined;
  const result = run();
  expect(result.ok).toBe(true);
  const surgery = encoded.last!;
  const site = editSite(before, surgery);
  return [...walkNodes(surgery)].filter((n) => site.has(n.id)).map((n) => n.lines[0]!.trim());
}

describe('the outline view', () => {
  const view = (text: string, line: string, margin = 0): string =>
    outlineView(node(parse(text), line), margin);

  it('sets aside an ordinal, a heading level, indentation and a block id', () => {
    expect(view('1. a\n', '1. a')).toBe(view('7. a\n', '7. a'));
    expect(view('- a\n', '- a')).toBe(view('* a\n', '* a'));
    expect(view('## B\n', '## B')).toBe(view('#### B\n', '#### B'));
    expect(view('Lead.\n', 'Lead.')).toBe(view('Lead. ^id\n', 'Lead. ^id'));
    expect(view('Lead.\n', 'Lead.')).toBe(view('Lead.\n^id\n', 'Lead.'));
    expect(view('B\n===\n', 'B')).toBe(view('# B\n', '# B'));
  });

  it('keeps kind and text', () => {
    expect(view('- a\n', '- a')).not.toBe(view('a\n', 'a'));
    expect(view('- [ ] a\n', '- [ ] a')).not.toBe(view('- [ ] b\n', '- [ ] b'));
    expect(view('## B\n', '## B')).not.toBe(view('## C\n', '## C'));
    expect(view('> q\n', '> q')).not.toBe(view('q\n', 'q'));
  });
});

describe('the edit site of an operation', () => {
  it('keeps a moved run of several roots whole, and puts its edges at the edit site', () => {
    const doc = parse('## A\n> q\nbody\n\n## B\ntext\n');
    const b = node(doc, '## B');
    const site = siteOf(doc, () =>
      moveSubtreesTo(doc, [[node(doc, '> q').id, node(doc, 'body').id]], {
        parentId: b.id,
        index: 1,
      }),
    );
    expect(site).toContain('> q');
    expect(site).not.toContain('body');
  });

  it('writes no block where an ordered run renumbers', () => {
    const doc = parse('1. a\n2. b\n3. c\npara\n');
    expect(siteOf(doc, () => deleteSubtrees(doc, [node(doc, '1. a').id]))).toEqual([]);
  });

  it('puts only the seam above the heading a Tab re-parents at the edit site', () => {
    const doc = parse('# A\n## B0\n## B\ntext\n### C\nbody\n');
    expect(siteOf(doc, () => indent(doc, node(doc, '## B').id))).toEqual(['### B']);
  });

  it('does the same for a root-level heading', () => {
    const doc = parse('## Packing\nx\n## Budget\n### Transport\nbus\n');
    expect(siteOf(doc, () => indent(doc, node(doc, '## Budget').id))).toEqual(['### Budget']);
  });

  it('writes no block where an outdent only consumes a level skip', () => {
    const doc = parse('# Log\n### Monday\ntext\n');
    expect(siteOf(doc, () => outdent(doc, node(doc, '### Monday').id))).toEqual([]);
  });

  it('writes no block where a lone id is dropped onto its host', () => {
    const doc = parse('Lead.\n- a\n\n^id\n');
    const lead = node(doc, 'Lead.');
    const site = siteOf(doc, () =>
      moveSubtreesTo(doc, [[node(doc, '^id').id]], { parentId: lead.id, index: 0 }),
    );
    expect(site).not.toContain('- a');
  });

  it('keeps a seam between two selected roots a group move carries', () => {
    const doc = parse('# X\n> p\na\n> b\n# N\n');
    const site = siteOf(doc, () => moveGroupsUp(doc, [[node(doc, 'a').id, node(doc, '> b').id]]));
    expect(site).toEqual(['a', '> p', '# N']);
  });

  it('puts the seams of a block an indent converts at the edit site', () => {
    const doc = parse('para\n\nx\n> q\n');
    expect(siteOf(doc, () => indent(doc, node(doc, 'x').id))).toEqual(['- x', '> q']);
  });

  it('has nothing at the edit site of a tree compared with itself', () => {
    const doc = parse('# H\n> q\nbody\n- a\n- b\n\n^id\n');
    expect(editSite(doc, doc).size).toBe(0);
  });
});
