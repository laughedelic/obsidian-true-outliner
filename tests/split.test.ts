import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { treesEqual, walkNodes, type OutlineDoc } from '../src/model';
import { splitNode } from '../src/ops';
import { applyEdits } from '../src/result';
import { arbTree } from './generators';

function byLine(doc: OutlineDoc, line: string): number {
  for (const node of walkNodes(doc)) if (node.lines[0] === line) return node.id;
  throw new Error(`no node: ${line}`);
}

function splitOk(md: string, line: string, pos: { line: number; ch: number }) {
  const doc = parse(md);
  const result = splitNode(doc, byLine(doc, line), pos);
  if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
  const viaEdits = applyEdits(md === '' ? [] : md.split('\n'), result.value.edits).join('\n');
  const text = encode(result.value.doc);
  expect(viaEdits).toBe(text);
  return { text, result: result.value };
}

describe('splitNode', () => {
  it('splits a list item mid-text; cursor after the new marker', () => {
    const { text, result } = splitOk('- alpha beta\n', '- alpha beta', { line: 0, ch: 8 });
    expect(text).toBe('- alpha \n- beta\n');
    expect(result.cursor).toEqual({ line: 1, ch: 2 });
  });

  it('end-of-item split creates an empty item node', () => {
    const { text, result } = splitOk('- alpha\n- omega\n', '- alpha', { line: 0, ch: 7 });
    expect(text).toBe('- alpha\n- \n- omega\n');
    expect(result.cursor).toEqual({ line: 1, ch: 2 });
  });

  it('a parent with children puts the remainder as its new FIRST CHILD (amendment 2026-07-21)', () => {
    // Content-adjacent split: the remainder lands directly below the split
    // point, above the existing children — never jumping over the subtree.
    const { text, result } = splitOk('- parent text\n\t- child\n', '- parent text', {
      line: 0,
      ch: 9,
    });
    expect(text).toBe('- parent \n\t- text\n\t- child\n');
    const doc = parse(text);
    expect(doc.children[0]!.children.map((n) => n.lines[0])).toEqual(['\t- text', '\t- child']);
    expect(result.cursor).toEqual({ line: 1, ch: 3 });
  });

  it('a paragraph with a child list splits its remainder into a first child list item', () => {
    const { text } = splitOk('one two\n- child\n', 'one two', { line: 0, ch: 4 });
    expect(text).toBe('one \n- two\n- child\n');
    const doc = parse(text);
    expect(doc.children[0]!.children.map((n) => n.lines[0])).toEqual(['- two', '- child']);
  });

  it('end-of-node split of a parent creates an empty first child item', () => {
    const { text, result } = splitOk('- parent\n\t- child\n', '- parent', { line: 0, ch: 8 });
    expect(text).toBe('- parent\n\t- \n\t- child\n');
    expect(result.cursor).toEqual({ line: 1, ch: 3 });
  });

  it('splits a paragraph mid-text with blank separation', () => {
    const { text, result } = splitOk('one two\n\nafter\n', 'one two', { line: 0, ch: 4 });
    expect(text).toBe('one \n\ntwo\n\nafter\n');
    expect(result.cursor).toEqual({ line: 2, ch: 0 });
  });

  it('end-of-paragraph split yields a gap and cursor, no phantom node', () => {
    const md = 'thought\n\nnext\n';
    const { text, result } = splitOk(md, 'thought', { line: 0, ch: 7 });
    // Two blanks: the cursor line is blank-separated on both sides, so
    // typing there creates a sibling instead of rejoining a neighbor.
    expect(text).toBe('thought\n\n\n\nnext\n');
    expect(result.cursor).toEqual({ line: 2, ch: 0 });
    // Same node count — the sibling materializes when the user types.
    expect([...walkNodes(result.doc)].length).toBe([...walkNodes(parse(md))].length);
  });

  it('never splits inside a marker; clamps to content start', () => {
    const { text } = splitOk('- alpha\n', '- alpha', { line: 0, ch: 1 });
    expect(text).toBe('- \n- alpha\n'); // upper keeps '- ', text moves down
  });

  it('renumbers ordered runs across the split', () => {
    const { text } = splitOk('1. one two\n2. three\n', '1. one two', { line: 0, ch: 7 });
    expect(text).toBe('1. one \n2. two\n3. three\n');
  });

  it('splits continuation lines of multiline items', () => {
    const { text } = splitOk('- first\n  second line\n', '- first', { line: 1, ch: 9 });
    expect(text).toBe('- first\n  second \n- line\n');
  });

  it('rejects headings, atoms, and out-of-node positions', () => {
    const doc = parse('# Head\n\n```\ncode\n```\n');
    const head = byLine(doc, '# Head');
    const fence = byLine(doc, '```');
    expect(splitNode(doc, head, { line: 0, ch: 3 })).toMatchObject({
      ok: false,
      rejection: { reason: 'cannot-split' },
    });
    expect(splitNode(doc, fence, { line: 3, ch: 2 })).toMatchObject({
      ok: false,
      rejection: { reason: 'cannot-split' },
    });
    const para = parse('text\n\nmore\n');
    expect(splitNode(para, byLine(para, 'text'), { line: 2, ch: 0 })).toMatchObject({
      ok: false,
      rejection: { reason: 'cannot-split' },
    });
  });

  it('property: split closes over the mapping at any position', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(40), (tree, n, chSeed) => {
        const text = encode(tree);
        const doc = parse(text);
        const nodes = [...walkNodes(doc)];
        if (nodes.length === 0) return true;
        const node = nodes[n % nodes.length]!;
        // Position somewhere on the node's first line.
        const lines = text === '' ? [] : text.split('\n');
        let start = doc.preamble.length;
        const findStart = (list: readonly (typeof node)[]): boolean => {
          for (const candidate of list) {
            if (candidate === node) return true;
            start += candidate.lines.length + candidate.trailingGap.length;
            if (findStart(candidate.children)) return true;
          }
          return false;
        };
        findStart(doc.children);
        const lineText = lines[start] ?? '';
        const result = splitNode(doc, node.id, { line: start, ch: chSeed % (lineText.length + 1) });
        if (!result.ok) return result.rejection.reason === 'cannot-split';
        const reencoded = encode(result.value.doc);
        if (!treesEqual(result.value.doc, parse(reencoded))) return false;
        return applyEdits(lines, result.value.edits).join('\n') === reencoded;
      }),
      { numRuns: 1500 },
    );
  });
});
