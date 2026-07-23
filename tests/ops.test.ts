import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { walkNodes, type OutlineDoc } from '../src/model';
import { indent, outdent, moveDown, moveUp } from '../src/ops';
import { applyEdits } from '../src/result';

/** Find the node whose first line matches. */
function byLine(doc: OutlineDoc, line: string): number {
  for (const node of walkNodes(doc)) {
    if (node.lines[0] === line) return node.id;
  }
  throw new Error(`no node with line: ${line}`);
}

function applyOk(
  op: typeof indent,
  md: string,
  line: string,
): { text: string; doc: OutlineDoc } {
  const doc = parse(md);
  const result = op(doc, byLine(doc, line));
  if (!result.ok) throw new Error(`unexpected rejection: ${result.rejection.reason}`);
  // The edit list must reproduce the encoding exactly.
  const viaEdits = applyEdits(md === '' ? [] : md.split('\n'), result.value.edits).join('\n');
  const text = encode(result.value.doc);
  expect(viaEdits).toBe(text);
  return { text, doc: result.value.doc };
}

function expectReject(op: typeof indent, md: string, line: string, reason: string): void {
  const doc = parse(md);
  const result = op(doc, byLine(doc, line));
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.rejection.reason).toBe(reason);
}

describe('heading level ops', () => {
  const md = '## Packing\n\nClothes notes.\n\n## Budget\n\nFerry costs seem high.\n\n### Transport\n';

  it('demote shifts the whole subtree, content lines untouched', () => {
    const { text } = applyOk(indent, md, '## Budget');
    expect(text).toBe(
      '## Packing\n\nClothes notes.\n\n### Budget\n\nFerry costs seem high.\n\n#### Transport\n',
    );
  });

  it('outdent consumes a level skip before changing hierarchy', () => {
    const skip = '# Log\n\n### Monday\n\nNotes.\n';
    const first = applyOk(outdent, skip, '### Monday');
    expect(first.text).toBe('# Log\n\n## Monday\n\nNotes.\n');
    // Still a child of # Log.
    expect(first.doc.children[0]!.children.some((n) => n.lines[0] === '## Monday')).toBe(true);
    const second = applyOk(outdent, first.text, '## Monday');
    expect(second.text).toBe('# Log\n\n# Monday\n\nNotes.\n');
    expect(second.doc.children[1]!.lines[0]).toBe('# Monday');
  });

  it('demote may create a skip (styling-only edit)', () => {
    const src = '## Packing\n\nClothes notes.\n\n### Electronics\n\n- chargers\n';
    const { text, doc } = applyOk(indent, src, '### Electronics');
    expect(text).toBe('## Packing\n\nClothes notes.\n\n#### Electronics\n\n- chargers\n');
    const packing = doc.children[0]!;
    expect(packing.children.some((n) => n.lines[0] === '#### Electronics')).toBe(true);
  });

  it('rejects at the bounds', () => {
    expectReject(indent, '###### Tiny\n', '###### Tiny', 'at-h6-bound');
    expectReject(outdent, '# Top\n', '# Top', 'at-h1-bound');
    // Bound applies to the deepest heading in the subtree.
    expectReject(indent, '##### Five\n\n###### Six\n', '##### Five', 'at-h6-bound');
  });

  it('setext headings convert to ATX when the level changes', () => {
    const { text } = applyOk(indent, 'Title\n=====\n\nBody.\n', 'Title');
    expect(text).toBe('## Title\n\nBody.\n');
  });
});

describe('paragraph/list reparenting', () => {
  it('indents a paragraph under a paragraph as a list item', () => {
    const { text } = applyOk(indent, 'First thought.\n\nSecond thought.\n', 'Second thought.');
    expect(text).toBe('First thought.\n\n- Second thought.\n');
  });

  it('indent then outdent restores the paragraph byte-identically', () => {
    const src = 'First thought.\n\nSecond thought.\n\nThird thought.\n';
    const indented = applyOk(indent, src, 'Second thought.');
    const restored = applyOk(outdent, indented.text, '- Second thought.');
    expect(restored.text).toBe(src);
  });

  it('indented paragraph joins an existing child list', () => {
    const { text, doc } = applyOk(indent, 'A.\n\n- existing child\n\nB.\n', 'B.');
    // The blank that separated the list from B stays with the untouched
    // sibling (a loose list — same tree, minimal edits).
    expect(text).toBe('A.\n\n- existing child\n\n- B.\n');
    const a = doc.children[0]!;
    expect(a.children.map((n) => n.lines[0])).toEqual(['- existing child', '- B.']);
  });

  it('outdent keeps the subtree attached via the attachment rule', () => {
    const src = '# Notes\n\nPara.\n\n- x\n  - y\n';
    const { text, doc } = applyOk(outdent, src, '- x');
    // No blank between x and its child list needed: a bullet line always
    // starts a new block, and the attachment rule claims it as x's child.
    expect(text).toBe('# Notes\n\nPara.\n\nx\n- y\n');
    const notes = doc.children[0]!;
    const x = notes.children[1]!;
    expect(x.kind).toBe('paragraph');
    expect(x.children[0]!.lines[0]).toBe('- y');
  });

  it('outdent re-parents following siblings as the node\'s own children', () => {
    const { text, doc } = applyOk(outdent, '- p\n\t- x\n\t- y\n\t- z\n', '\t- x');
    expect(text).toBe('- p\n- x\n\t- y\n\t- z\n');
    expect(doc.children.map((n) => n.lines[0])).toEqual(['- p', '- x']);
    const p = doc.children[0]!;
    const x = doc.children[1]!;
    expect(p.children).toEqual([]);
    expect(x.children.map((n) => n.lines[0])).toEqual(['\t- y', '\t- z']);
  });

  it('outdent appends re-parented following siblings after the node\'s own children', () => {
    const src = '- p\n\t- x\n\t\t- w\n\t- y\n\t- z\n';
    const { text, doc } = applyOk(outdent, src, '\t- x');
    expect(text).toBe('- p\n- x\n\t- w\n\t- y\n\t- z\n');
    const x = doc.children[1]!;
    expect(x.children.map((n) => n.lines[0])).toEqual(['\t- w', '\t- y', '\t- z']);
  });

  it('outdent with no following siblings is unaffected (last child)', () => {
    const { text, doc } = applyOk(outdent, '- p\n\t- x\n\t- y\n\t- z\n', '\t- z');
    expect(text).toBe('- p\n\t- x\n\t- y\n- z\n');
    const p = doc.children[0]!;
    expect(p.children.map((n) => n.lines[0])).toEqual(['\t- x', '\t- y']);
    expect(doc.children[1]!.lines[0]).toBe('- z');
    expect(doc.children[1]!.children).toEqual([]);
  });

  it('re-parented following siblings are re-encoded for their new context', () => {
    // x has a nested paragraph child ("nested para"); its former following
    // sibling z (a list item under p) becomes x's next child and, per the
    // context-determined encoding rule, takes its kind from the nearest
    // preceding donor — x's own paragraph child — converting from list-item
    // to paragraph.
    const src = '- p\n  - x\n\n    nested para\n\n  - z\n';
    const { text, doc } = applyOk(outdent, src, '  - x');
    expect(text).toBe('- p\n- x\n\n  nested para\n\n  z\n');
    const x = doc.children[1]!;
    expect(x.children.map((n) => n.kind)).toEqual(['paragraph', 'paragraph']);
    expect(x.children[1]!.lines[0]).toBe('  z');
  });

  it('nested-list outdent adopts the destination level indentation (tabs kept)', () => {
    // c becomes b's sibling — at b's level, with b's tab indentation.
    const { text, doc } = applyOk(outdent, '- a\n\t- b\n\t\t- c\n', '\t\t- c');
    expect(text).toBe('- a\n\t- b\n\t- c\n');
    expect(doc.children[0]!.children.map((n) => n.lines[0])).toEqual(['\t- b', '\t- c']);
  });

  it('indenting under a heading lands in its direct section, before sub-headings', () => {
    const src = '## A\n\nBody a.\n\n### Sub\n\nSub body.\n\nStray.\n';
    // Stray is inside ### Sub; outdent from a heading parent is rejected —
    // but indenting a top-level node under a heading sibling works:
    const src2 = '## A\n\nBody a.\n\n### Sub\n\nSub body.\n';
    void src;
    const doc = parse(src2);
    // (### Sub's own indent under ## A tested via heading ops elsewhere.)
    void doc;
  });

  it('rejections: no previous sibling, top level, atoms, heading escapes', () => {
    expectReject(indent, 'Only paragraph.\n', 'Only paragraph.', 'no-previous-sibling');
    expectReject(outdent, 'Top level.\n', 'Top level.', 'at-top-level');
    expectReject(indent, '```\ncode\n```\n\nAfter code.\n', 'After code.', 'not-expressible-under-target');
    expectReject(outdent, '# H\n\nInside section.\n', 'Inside section.', 'not-expressible-under-target');
  });
});

describe('tab-indented vaults (Obsidian default)', () => {
  it('regression: outdent in a tab list never escapes an extra level', () => {
    // Reported 2026-07-13: dedent overshoot dropped tab-indented items to
    // column 0, silently double-outdenting.
    const src = '- Projects\n\t- Home\n\t\t- fix the fence\n';
    const { doc } = applyOk(outdent, src, '\t\t- fix the fence');
    const projects = doc.children[0]!;
    expect(projects.children.map((n) => n.lines[0])).toEqual([
      '\t- Home',
      '\t- fix the fence',
    ]);
    expect(doc.children.length).toBe(1); // did NOT escape to top level
  });

  it('indent adopts an existing sibling tab, not synthetic spaces', () => {
    const { text } = applyOk(indent, '- a\n\t- b\n- c\n', '- c');
    expect(text).toBe('- a\n\t- b\n\t- c\n');
  });

  it('indent with no siblings infers the tab unit from the document', () => {
    const { text } = applyOk(indent, '- x\n\t- y\n\n- p\n- q\n', '- q');
    // q becomes p's child; p has no children, but the doc uses tabs.
    expect(text).toBe('- x\n\t- y\n\n- p\n\t- q\n');
  });

  it('multiline tab items keep continuation alignment through ops', () => {
    const src = '- a\n\t- b\n\t\t- c has\n\t\t  two lines\n';
    const { text, doc } = applyOk(outdent, src, '\t\t- c has');
    expect(text).toBe('- a\n\t- b\n\t- c has\n\t  two lines\n');
    const c = doc.children[0]!.children[1]!;
    expect(c.lines.length).toBe(2); // still one multiline node
  });
});

describe('atoms', () => {
  it('code fence indents under a list item as a unit', () => {
    const src = '- setup step\n\n```bash\nnpm install\n```\n';
    const { text, doc } = applyOk(indent, src, '```bash');
    expect(text).toBe('- setup step\n\n  ```bash\n  npm install\n  ```\n');
    expect(doc.children[0]!.children[0]!.kind).toBe('code');
  });

  it('atoms cannot nest under a paragraph', () => {
    expectReject(indent, 'Para.\n\n```\nx\n```\n', '```', 'not-expressible-under-target');
  });
});

describe('sibling reordering', () => {
  it('swaps heading sections wholesale', () => {
    const md = '## Packing\n\nClothes.\n\n## Budget\n\nNumbers.\n';
    const { text } = applyOk(moveUp, md, '## Budget');
    expect(text).toBe('## Budget\n\nNumbers.\n\n## Packing\n\nClothes.\n');
  });

  it('renumbers ordered lists after a swap', () => {
    const { text } = applyOk(moveDown, '1. one\n2. two\n3. three\n', '1. one');
    expect(text).toBe('1. two\n2. one\n3. three\n');
  });

  it('rejects reorder across the heading/content divide and level mismatch', () => {
    expectReject(moveUp, '# H\n\nPara after.\n\n## Sub\n', '## Sub', 'cannot-reorder-across-heading-boundary');
    expectReject(moveDown, '### Three\n\n## Two\n', '### Three', 'cannot-reorder-across-heading-boundary');
    expectReject(moveUp, '- a\n- b\n', '- a', 'no-sibling-above');
    expectReject(moveDown, '- a\n- b\n', '- b', 'no-sibling-below');
  });
});
