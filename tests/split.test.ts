import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { treesEqual, walkNodes, type OutlineDoc } from '../src/model';
import { mergeNodes, splitNode } from '../src/ops';
import { nodeAtLine } from '../src/locate';
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
    expect(result.anchor).toEqual({ line: 1, ch: 2 });
  });

  it('end-of-item split creates an empty item node', () => {
    const { text, result } = splitOk('- alpha\n- omega\n', '- alpha', { line: 0, ch: 7 });
    expect(text).toBe('- alpha\n- \n- omega\n');
    expect(result.anchor).toEqual({ line: 1, ch: 2 });
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
    expect(result.anchor).toEqual({ line: 1, ch: 3 });
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
    expect(result.anchor).toEqual({ line: 1, ch: 3 });
  });

  it('splits a paragraph mid-text with blank separation', () => {
    const { text, result } = splitOk('one two\n\nafter\n', 'one two', { line: 0, ch: 4 });
    expect(text).toBe('one \n\ntwo\n\nafter\n');
    expect(result.anchor).toEqual({ line: 2, ch: 0 });
  });

  it('end-of-paragraph split yields a gap and cursor, no phantom node', () => {
    const md = 'thought\n\nnext\n';
    const { text, result } = splitOk(md, 'thought', { line: 0, ch: 7 });
    // Two blanks: the cursor line is blank-separated on both sides, so
    // typing there creates a sibling instead of rejoining a neighbor.
    expect(text).toBe('thought\n\n\n\nnext\n');
    expect(result.anchor).toEqual({ line: 2, ch: 0 });
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

  it('rejects atoms and out-of-node positions', () => {
    const doc = parse('```\ncode\n```\n');
    const fence = byLine(doc, '```');
    expect(splitNode(doc, fence, { line: 1, ch: 2 })).toMatchObject({
      ok: false,
      rejection: { reason: 'cannot-split' },
    });
    const para = parse('text\n\nmore\n');
    expect(splitNode(para, byLine(para, 'text'), { line: 2, ch: 0 })).toMatchObject({
      ok: false,
      rejection: { reason: 'cannot-split' },
    });
  });

  it('splits a childless heading mid-text into the heading plus a new paragraph child', () => {
    const { text, result } = splitOk('# Hello world\n', '# Hello world', { line: 0, ch: 8 });
    expect(text).toBe('# Hello \nworld\n');
    const doc = parse(text);
    expect(doc.children[0]!.lines[0]).toBe('# Hello ');
    expect(doc.children[0]!.children.map((n) => n.lines[0])).toEqual(['world']);
    expect(result.anchor).toEqual({ line: 1, ch: 0 });
  });

  it('splits a heading with an existing paragraph child, separated by a blank line', () => {
    const { text } = splitOk('# Head\n\nBody.\n', '# Head', { line: 0, ch: 3 });
    expect(text).toBe('# H\n\nead\n\nBody.\n');
    const doc = parse(text);
    // Both halves stay distinct paragraph nodes — they must NOT merge.
    expect(doc.children[0]!.children.map((n) => n.lines[0])).toEqual(['ead', 'Body.']);
  });

  it('splits a heading with an existing list-item child; remainder becomes a matching list item, no separator needed', () => {
    const { text } = splitOk('# Head\n- item\n', '# Head', { line: 0, ch: 3 });
    expect(text).toBe('# H\n- ead\n- item\n');
    const doc = parse(text);
    expect(doc.children[0]!.children.map((n) => n.lines[0])).toEqual(['- ead', '- item']);
  });

  it('end-of-heading split widens the gap like the paragraph case, cursor blank-separated on both sides', () => {
    // Goes through the same gap-widen mechanism as a childless-paragraph
    // end-of-node split (not the old heading-only blind single-newline
    // insertion) — one more blank line than before this change, same
    // "blank-separated on both sides" guarantee paragraphs already get.
    const { text, result } = splitOk('# Head\n\nBody.\n', '# Head', { line: 0, ch: 6 });
    expect(text).toBe('# Head\n\n\n\nBody.\n');
    expect(result.anchor).toEqual({ line: 2, ch: 0 });
  });

  it('rejects a split on a setext heading\'s underline line', () => {
    const doc = parse('Head\n====\n');
    const head = byLine(doc, 'Head');
    expect(splitNode(doc, head, { line: 1, ch: 1 })).toMatchObject({
      ok: false,
      rejection: { reason: 'cannot-split' },
    });
  });

  // Setext headings are a 2-line encoding (title + underline). The underline
  // is NOT a continuation line of the title — a naive `lines.slice(lineIndex
  // + 1)` would sweep it into the split-off remainder, and re-parsing
  // "<title-head>\n<title-tail>\n====" (no longer separated by an underline
  // of its own) reinterprets the whole thing as ONE multi-line setext
  // heading, silently undoing the split. `arbTree()` never generates setext
  // headings (grep confirms no 'setext' in tests/generators.ts), so the
  // property-test suite below does NOT exercise this shape — these are
  // deliberately explicit, not relying on generated coverage.

  it('splits a childless setext heading mid-title; the underline stays with the heading', () => {
    const { text, result } = splitOk('Hello world\n====\n', 'Hello world', { line: 0, ch: 6 });
    expect(text).toBe('Hello \n====\nworld\n');
    const doc = parse(text);
    const head = doc.children[0]!;
    expect(head.setext).toBe(true);
    expect(head.lines).toEqual(['Hello ', '====']);
    expect(head.children.map((n) => n.lines[0])).toEqual(['world']);
    expect(result.anchor).toEqual({ line: 2, ch: 0 });
  });

  it('splits a setext heading with an existing paragraph child, underline stays attached, separator inserted', () => {
    const { text } = splitOk('Head\n====\n\nBody.\n', 'Head', { line: 0, ch: 2 });
    expect(text).toBe('He\n====\n\nad\n\nBody.\n');
    const doc = parse(text);
    const head = doc.children[0]!;
    expect(head.lines).toEqual(['He', '====']);
    expect(head.children.map((n) => n.lines[0])).toEqual(['ad', 'Body.']);
  });

  it('splits a setext heading with an existing list-item child; remainder becomes a matching list item', () => {
    const { text } = splitOk('Head\n====\n- item\n', 'Head', { line: 0, ch: 2 });
    expect(text).toBe('He\n====\n- ad\n- item\n');
    const doc = parse(text);
    expect(doc.children[0]!.lines).toEqual(['He', '====']);
    expect(doc.children[0]!.children.map((n) => n.lines[0])).toEqual(['- ad', '- item']);
  });

  it('end-of-setext-heading split widens the gap, underline stays with the heading', () => {
    const { text, result } = splitOk('Head\n====\n\nBody.\n', 'Head', { line: 0, ch: 4 });
    expect(text).toBe('Head\n====\n\n\n\nBody.\n');
    const doc = parse(text);
    expect(doc.children[0]!.lines).toEqual(['Head', '====']);
    expect(result.anchor).toEqual({ line: 3, ch: 0 });
  });

  it('merging a list item into a heading then splitting back out preserves the heading\'s original gap (2026-07-24 regression)', () => {
    // The reported bug: merge "item1" into "# Head" (Backspace at item1's
    // content-start), then press Enter at the merge's own join-point cursor
    // to split it back out. Before the mergeNodes fix, the heading's
    // original blank-line gap was already lost at the MERGE step (it took
    // item1's own trailingGap, which was empty since item1/item2 were
    // adjacent list items) — the subsequent split just faithfully
    // propagated that already-corrupted (empty) gap. Simulates the real
    // editor: each op re-locates its target node fresh by cursor line in
    // the freshly re-parsed post-merge document, exactly as the CM6 layer
    // does between independent keystrokes (ids are not stable across ops).
    const md = '# Head\n\n- item1\n- item2\n';
    const doc = parse(md);
    const headId = byLine(doc, '# Head');
    const merged = mergeNodes(doc, headId);
    if (!merged.ok) throw new Error(`merge rejected: ${merged.rejection.reason}`);
    expect(encode(merged.value.doc)).toBe('# Headitem1\n\n- item2\n');

    const freshDoc = parse(encode(merged.value.doc));
    const nodeAtCursor = nodeAtLine(freshDoc, merged.value.anchor.line)!;
    const split = splitNode(freshDoc, nodeAtCursor.id, merged.value.anchor);
    if (!split.ok) throw new Error(`split rejected: ${split.rejection.reason}`);
    expect(encode(split.value.doc)).toBe('# Head\n\n- item1\n- item2\n');
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
