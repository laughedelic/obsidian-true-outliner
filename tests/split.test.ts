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

  // The new first child joins a list that is ALREADY there, so it takes that
  // list's marker — not a fresh bullet. Reported from a real vault as "I select
  // the first elements of a numbered list, press Enter, and get a bullet".
  describe('a new first child adopts the existing children’s marker style', () => {
    it('an ordered child list continues as ordered, and the run renumbers', () => {
      const { text, result } = splitOk('# H\n\n1. a\n2. b\n', '# H', { line: 0, ch: 3 });
      expect(text).toBe('# H\n\n1. \n2. a\n3. b\n');
      expect(result.anchor).toEqual({ line: 2, ch: 3 });
    });

    it('a run that starts at 5 keeps its start; the new item takes it', () => {
      const { text } = splitOk('# H\n\n5. a\n6. b\n', '# H', { line: 0, ch: 3 });
      expect(text).toBe('# H\n\n5. \n6. a\n7. b\n');
    });

    it('the delimiter and the bullet character come from the donor too', () => {
      expect(splitOk('# H\n\n1) a\n2) b\n', '# H', { line: 0, ch: 3 }).text).toBe(
        '# H\n\n1) \n2) a\n3) b\n',
      );
      expect(splitOk('# H\n\n* a\n* b\n', '# H', { line: 0, ch: 3 }).text).toBe(
        '# H\n\n* \n* a\n* b\n',
      );
    });

    it('a task donor carries an UNCHECKED marker, as the sibling path already did', () => {
      const { text } = splitOk('# H\n\n- [x] a\n', '# H', { line: 0, ch: 3 });
      expect(text).toBe('# H\n\n- [ ] \n- [x] a\n');
    });

    it('a NON-empty remainder takes the same marker', () => {
      const { text } = splitOk('# Head\n\n1. a\n', '# Head', { line: 0, ch: 4 });
      expect(text).toBe('# He\n\n1. ad\n2. a\n');
    });

    it('a plain bullet list is unchanged — the donor was already `- `', () => {
      const { text, result } = splitOk('# H\n\n- a\n- b\n', '# H', { line: 0, ch: 3 });
      expect(text).toBe('# H\n\n- \n- a\n- b\n');
      expect(result.anchor).toEqual({ line: 2, ch: 2 });
    });

    it('a nested ordered list under an item takes the item’s indentation, donor’s marker', () => {
      const { text } = splitOk('- p\n\t1. a\n\t2. b\n', '- p', { line: 0, ch: 3 });
      expect(text).toBe('- p\n\t1. \n\t2. a\n\t3. b\n');
    });

    it('a paragraph’s adopted ordered list is the same shape', () => {
      const { text } = splitOk('Intro.\n\n1. a\n2. b\n', 'Intro.', { line: 0, ch: 6 });
      expect(text).toBe('Intro.\n\n1. \n2. a\n3. b\n');
    });
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
    // The blank line is the heading/first-paragraph-child separation this
    // operation now creates (`enter-and-shift-enter-grammar`): required by
    // convention rather than by the parse, and added HERE rather than by
    // global normalization, which would rewrite boundaries the user wrote.
    const { text, result } = splitOk('# Hello world\n', '# Hello world', { line: 0, ch: 8 });
    expect(text).toBe('# Hello \n\nworld\n');
    const doc = parse(text);
    expect(doc.children[0]!.lines[0]).toBe('# Hello ');
    expect(doc.children[0]!.children.map((n) => n.lines[0])).toEqual(['world']);
    expect(result.anchor).toEqual({ line: 2, ch: 0 });
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
    expect(text).toBe('Hello \n====\n\nworld\n');
    const doc = parse(text);
    const head = doc.children[0]!;
    expect(head.setext).toBe(true);
    expect(head.lines).toEqual(['Hello ', '====']);
    expect(head.children.map((n) => n.lines[0])).toEqual(['world']);
    expect(result.anchor).toEqual({ line: 3, ch: 0 });
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

  // ---------------------------------------------- content start: insert before
  //
  // `enter-and-shift-enter-grammar`: a split position at a node's own content
  // start inserts an empty node BEFORE it and divides nothing, so the node's
  // own text never moves. The anchor is the inserted position, not the text.

  it('content start of a CHILDLESS item produces the same document as before, only the anchor moves', () => {
    // The byte-identity claim that makes this a generalization rather than a
    // new behavior (design D2): this document is what the pre-change split
    // already produced. If it changes, the branch is over-reaching.
    const { text, result } = splitOk('- alpha\n', '- alpha', { line: 0, ch: 2 });
    expect(text).toBe('- \n- alpha\n');
    // Pre-change this was {line: 1, ch: 2} — the caret rode down with "alpha".
    expect(result.anchor).toEqual({ line: 0, ch: 2 });
  });

  it('content start of a top-level PARAGRAPH produces the same document as before, only the anchor moves', () => {
    const { text, result } = splitOk('thought\n\nnext\n', 'thought', { line: 0, ch: 0 });
    expect(text).toBe('\n\nthought\n\nnext\n');
    expect(result.anchor).toEqual({ line: 0, ch: 0 });
  });

  it('content start of an item WITH children inserts above; the child stays put', () => {
    const { text, result } = splitOk('- alpha\n\t- child\n', '- alpha', { line: 0, ch: 2 });
    expect(text).toBe('- \n- alpha\n\t- child\n');
    const doc = parse(text);
    // "alpha" keeps its own depth AND its child — it was not demoted.
    expect(doc.children.map((n) => n.lines[0])).toEqual(['- ', '- alpha']);
    expect(doc.children[1]!.children.map((n) => n.lines[0])).toEqual(['\t- child']);
    expect(result.anchor).toEqual({ line: 0, ch: 2 });
  });

  it('content start of an ATX heading inserts an empty heading at the same level', () => {
    const { text, result } = splitOk('## Hello\n', '## Hello', { line: 0, ch: 3 });
    expect(text).toBe('## \n## Hello\n');
    const doc = parse(text);
    expect(doc.children.map((n) => n.lines[0])).toEqual(['## ', '## Hello']);
    // Byte-identical, not merely "still a heading": no child, no demotion.
    expect(doc.children[1]!.children).toEqual([]);
    expect(doc.children[1]!.level).toBe(2);
    expect(result.anchor).toEqual({ line: 0, ch: 3 });
  });

  it('a caret inside a heading’s marker reaches the same content-start case', () => {
    // The clamp to the content column is what makes the marker interior need
    // no rule of its own.
    const { text } = splitOk('# Hello\n', '# Hello', { line: 0, ch: 1 });
    expect(text).toBe('# \n# Hello\n');
  });

  it('content start of a SETEXT heading inserts an ATX sibling, original underline verbatim', () => {
    // An empty setext heading has no encoding at all (design D3).
    const { text } = splitOk('Hello\n====\n', 'Hello', { line: 0, ch: 0 });
    expect(text).toBe('# \nHello\n====\n');
    const doc = parse(text);
    expect(doc.children[1]!.lines).toEqual(['Hello', '====']);
    expect(doc.children[1]!.setext).toBe(true);
  });

  it('content start of a mid-document paragraph widens the gap above it', () => {
    const { text, result } = splitOk('alpha\n\nbeta\n', 'beta', { line: 2, ch: 0 });
    expect(text).toBe('alpha\n\n\n\nbeta\n');
    // Blank-separated from "alpha" above and "beta" below.
    expect(result.anchor).toEqual({ line: 2, ch: 0 });
    expect([...walkNodes(result.doc)].length).toBe(2);
  });

  it('content start of a first CHILD paragraph widens the parent’s own gap', () => {
    const { text, result } = splitOk('# H\n\nbody\n', 'body', { line: 2, ch: 0 });
    expect(text).toBe('# H\n\n\n\nbody\n');
    expect(result.anchor).toEqual({ line: 2, ch: 0 });
  });

  it('content start of an ordered item renumbers the run', () => {
    const { text } = splitOk('1. one\n2. two\n', '2. two', { line: 1, ch: 3 });
    expect(text).toBe('1. one\n2. \n3. two\n');
  });

  // ------------------------------------------------- end of node: one rule
  //
  // The destination scope's kind decides what the empty position becomes: a
  // real node where that kind has an empty encoding, a widened gap where it
  // does not. Four outcomes, one rule.

  it('end of a childless item materializes a real empty sibling', () => {
    const { text, result } = splitOk('- alpha\n', '- alpha', { line: 0, ch: 7 });
    expect(text).toBe('- alpha\n- \n');
    expect(result.anchor).toEqual({ line: 1, ch: 2 });
  });

  it('end of a heading whose children are list items materializes a real empty child', () => {
    const { text, result } = splitOk('# Head\n- item\n', '# Head', { line: 0, ch: 6 });
    expect(text).toBe('# Head\n- \n- item\n');
    expect(result.anchor).toEqual({ line: 1, ch: 2 });
  });

  it('end of a heading whose child scope is a paragraph widens the gap', () => {
    const { text, result } = splitOk('# Head\n\nBody.\n', '# Head', { line: 0, ch: 6 });
    expect(text).toBe('# Head\n\n\n\nBody.\n');
    expect(result.anchor).toEqual({ line: 2, ch: 0 });
  });

  it('end of an item whose first child is a paragraph widens the item’s OWN gap (E10)', () => {
    // The fall-through this replaces put the new position after the entire
    // subtree — below "para" — which is the jump-over-the-subtree shape the
    // content-adjacent rule exists to prevent.
    //
    // The position's own line carries the destination's indentation. At column 0
    // it landed in the right PLACE and the wrong SCOPE: see the materialization
    // test below, which is what that costs.
    const md = '- item\n\n\tpara\n';
    const { text, result } = splitOk(md, '- item', { line: 0, ch: 6 });
    expect(text).toBe('- item\n\n\t\n\n\tpara\n');
    expect(result.anchor).toEqual({ line: 2, ch: 1 });
    // A position, not a node: the tree is unchanged in size.
    expect([...walkNodes(result.doc)].length).toBe([...walkNodes(parse(md))].length);
    // And "para" is still the item's child, not a sibling below it.
    expect(result.doc.children.length).toBe(1);
  });

  it('typing on that position materializes the item’s new FIRST child, keeping the old one', () => {
    // The reason the position is indented at all. At column 0, typing there
    // produced a TOP-LEVEL paragraph and left "para" following it as another
    // top-level node — the item's subtree flattened by one keystroke.
    const md = '- item\n\n\tpara\n';
    const { text, result } = splitOk(md, '- item', { line: 0, ch: 6 });
    const lines = text.split('\n');
    lines[result.anchor.line] = `${lines[result.anchor.line]}x`;
    const typed = parse(lines.join('\n'));
    expect(typed.children.length).toBe(1);
    expect(typed.children[0]!.lines[0]).toBe('- item');
    expect(typed.children[0]!.children.map((n) => n.lines[0])).toEqual(['\tx', '\tpara']);
  });

  it('a position ABOVE a child paragraph is a sibling of it, not a top-level node', () => {
    // Same rule at the content-START branch: Enter there opens a position above,
    // which is a SIBLING position, so it sits at this node's own level.
    const md = '- item\n\n\tpara\n';
    const { text, result } = splitOk(md, '\tpara', { line: 2, ch: 1 });
    expect(text).toBe('- item\n\n\t\n\n\tpara\n');
    expect(result.anchor).toEqual({ line: 2, ch: 1 });
    const lines = text.split('\n');
    lines[result.anchor.line] = `${lines[result.anchor.line]}x`;
    const typed = parse(lines.join('\n'));
    expect(typed.children.length).toBe(1);
    expect(typed.children[0]!.children.map((n) => n.lines[0])).toEqual(['\tx', '\tpara']);
  });

  it('a top-level position is byte-identical to an unindented one', () => {
    // `destinationIndent` is '' at the top level and under a heading, so the two
    // shapes this branch has always produced are unchanged.
    expect(splitOk('thought\n\nnext\n', 'thought', { line: 0, ch: 7 }).text).toBe(
      'thought\n\n\n\nnext\n',
    );
    expect(splitOk('thought\n\nnext\n', 'thought', { line: 0, ch: 7 }).result.anchor).toEqual({
      line: 2,
      ch: 0,
    });
  });

  // ------------------------------------------------------------- whitespace

  it('the split point’s whitespace goes with neither half, for a PARAGRAPH too', () => {
    // Pre-change a paragraph kept it, leaving an invisible leading space with
    // the cursor behind it, while a list item dropped it at the same position.
    const { text, result } = splitOk('one two\n', 'one two', { line: 0, ch: 3 });
    expect(text).toBe('one\n\ntwo\n');
    expect(result.anchor).toEqual({ line: 2, ch: 0 });
  });

  // ----------------------------------------------------------- task markers

  it('a task split carries the marker to the new item, unchecked', () => {
    const atEnd = splitOk('- [x] done\n', '- [x] done', { line: 0, ch: 10 });
    expect(atEnd.text).toBe('- [x] done\n- [ ] \n');

    const midText = splitOk('- [ ] alpha beta\n', '- [ ] alpha beta', { line: 0, ch: 11 });
    expect(midText.text).toBe('- [ ] alpha\n- [ ] beta\n');

    const atStart = splitOk('- [x] done\n', '- [x] done', { line: 0, ch: 2 });
    expect(atStart.text).toBe('- [ ] \n- [x] done\n');
  });

  it('a plain item is unaffected by the task rule', () => {
    const { text } = splitOk('- alpha\n', '- alpha', { line: 0, ch: 7 });
    expect(text).toBe('- alpha\n- \n');
  });

  it('a new child adopts a non-list sibling’s indentation, so an existing child is not re-parented', () => {
    // Measured defect (catalogue E11): `destinationIndent` consulted list-item
    // siblings only, so with the vault set to spaces the new child was written
    // at 2 columns beside a TAB-indented atom — leaving the atom deeper than
    // the node it was a sibling of, which re-parses it as that node's child.
    // The split changed the tree's shape beyond the split.
    const md = '- item text\n\t```\n\tcode\n\t```\n';
    const doc = parse(md);
    const result = splitNode(doc, byLine(doc, '- item text'), { line: 0, ch: 6 }, '  ');
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    const after = parse(encode(result.value.doc));
    const item = after.children[0]!;
    // The remainder is a child of "- item", and so is the code fence — the
    // fence did not become a grandchild under it.
    expect(item.children.map((n) => n.kind)).toEqual(['list-item', 'code']);
    expect(item.children[0]!.children).toEqual([]);
  });

  it('a heading boundary the user wrote is never normalized by an unrelated operation', () => {
    // The regression a GLOBAL heading-separation rule would have caused.
    // `# H` directly followed by `body` is ordinary parsed markdown — a heading
    // with a gap-0 paragraph child — unlike the list-item shape, whose gap-0
    // form cannot come from the parser at all. Normalizing it on every op would
    // rewrite lines belonging to a node the operation never touched.
    const md = '# H\nbody\n\n- one two\n';
    const { text } = splitOk(md, '- one two', { line: 3, ch: 6 });
    expect(text).toBe('# H\nbody\n\n- one \n- two\n');
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
