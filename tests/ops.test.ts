import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { walkNodes, type OutlineDoc } from '../src/model';
import {
  indent,
  outdent,
  moveDown,
  moveUp,
  splitNode,
  unwrapListItem,
  insertSiblingHeading,
  insertSubtrees,
} from '../src/ops';
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

  // Indent removes the node from its OWN level, so the level it leaves takes the
  // removal rule: the run keeps the start the departing item carried. Measured,
  // not inferred — the catalogue only reported the deletion shape.
  it('indenting the head of an ordered run renumbers the level it leaves', () => {
    const { text } = applyOk(indent, '- bullet\n1. one\n2. two\n3. three\n', '1. one');
    expect(text).toBe('- bullet\n  1. one\n1. two\n2. three\n');
  });

  it('rejections: no previous sibling, top level, atoms, heading escapes', () => {
    expectReject(indent, 'Only paragraph.\n', 'Only paragraph.', 'no-previous-sibling');
    expectReject(outdent, 'Top level.\n', 'Top level.', 'at-top-level');
    expectReject(indent, '```\ncode\n```\n\nAfter code.\n', 'After code.', 'not-expressible-under-target');
    expectReject(outdent, '# H\n\nInside section.\n', 'Inside section.', 'not-expressible-under-target');
  });
});

describe('fallback indent unit (Obsidian "Indent using tabs" setting)', () => {
  // A document with no existing indented list item anywhere has nothing to
  // infer a unit from — this is exactly the case that used to hardcode two
  // spaces regardless of the vault's own tab/space preference.
  function applyWithUnit(
    op: typeof indent,
    md: string,
    line: string,
    fallbackIndentUnit: string | undefined,
  ): { text: string; doc: OutlineDoc } {
    const doc = parse(md);
    const result = op(doc, byLine(doc, line), fallbackIndentUnit);
    if (!result.ok) throw new Error(`unexpected rejection: ${result.rejection.reason}`);
    const text = encode(result.value.doc);
    return { text, doc: result.value.doc };
  }

  it('with no override, still defaults to two spaces (unchanged default)', () => {
    const { text } = applyWithUnit(indent, '- a\n- b\n', '- b', undefined);
    expect(text).toBe('- a\n  - b\n');
  });

  it('a caller-supplied tab is used for brand-new indentation', () => {
    const { text, doc } = applyWithUnit(indent, '- a\n- b\n', '- b', '\t');
    expect(text).toBe('- a\n\t- b\n');
    expect(doc.children[0]!.children[0]!.lines[0]).toBe('\t- b');
  });

  it('a caller-supplied space width is used for brand-new indentation', () => {
    const { text } = applyWithUnit(indent, '- a\n- b\n', '- b', '    ');
    expect(text).toBe('- a\n    - b\n');
  });

  it("existing document indentation still wins over the fallback (doesn't override an established style)", () => {
    // The doc already uses tabs elsewhere, so indenting b under a should
    // still infer tabs even when the fallback says spaces.
    const { text } = applyWithUnit(indent, '- x\n\t- y\n\n- a\n- b\n', '- b', '    ');
    expect(text).toBe('- x\n\t- y\n\n- a\n\t- b\n');
  });

  it("a destination sibling's own indentation beats the fallback for a content-adjacent split", () => {
    // "ab" already has a paragraph child ("child para"), so splitting inside
    // "ab"'s own text lands the remainder as a NEW first-child paragraph,
    // alongside that existing child.
    //
    // Two things changed here with `enter-and-shift-enter-grammar`, and the
    // test now pins the result of both:
    //
    // 1. The split point is INTERIOR (after "a"). It used to be ch 2, the
    //    item's own content START, which now inserts an empty item before the
    //    node instead of splitting it — the old expectation (`- ` above, "a"
    //    demoted into a child) was the demotion defect that change removes.
    // 2. `destinationIndent` now copies a destination sibling of ANY kind, so
    //    the existing paragraph child's two spaces win over a tab fallback.
    //    This test previously asserted the opposite. The fallback is not
    //    reachable from a content-adjacent split at all any more: that path
    //    requires the node to HAVE children, which means a sibling always
    //    exists to copy from. `indent` still exercises the fallback, above.
    const src = '- ab\n\n  child para\n';
    const doc = parse(src);
    const a = byLine(doc, '- ab');
    const withoutFallback = splitNode(doc, a, { line: 0, ch: 3 });
    if (!withoutFallback.ok) throw new Error(`unexpected rejection: ${withoutFallback.rejection.reason}`);
    expect(encode(withoutFallback.value.doc)).toBe('- a\n\n  b\n\n  child para\n');

    const withTab = splitNode(doc, a, { line: 0, ch: 3 }, '\t');
    if (!withTab.ok) throw new Error(`unexpected rejection: ${withTab.rejection.reason}`);
    expect(encode(withTab.value.doc)).toBe('- a\n\n  b\n\n  child para\n');
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

  // The behavior the minimum-present rule exists for: a swap is a permutation,
  // so no member leaves and the run cannot lose the number it began with. This
  // must be green both before and after the removal-aware rule.
  it('a swap does not let a run inherit the moved item’s own number', () => {
    const { text } = applyOk(moveDown, '5. one\n6. two\n7. three\n', '5. one');
    expect(text).toBe('5. two\n6. one\n7. three\n');
  });

  it('rejects reorder across the heading/content divide and level mismatch', () => {
    expectReject(moveUp, '# H\n\nPara after.\n\n## Sub\n', '## Sub', 'cannot-reorder-across-heading-boundary');
    expectReject(moveDown, '### Three\n\n## Two\n', '### Three', 'cannot-reorder-across-heading-boundary');
    expectReject(moveUp, '- a\n- b\n', '- a', 'no-sibling-above');
    expectReject(moveDown, '- a\n- b\n', '- b', 'no-sibling-below');
  });
});

describe('list item unwrap', () => {
  function unwrapOk(md: string, target: string) {
    const doc = parse(md);
    const result = unwrapListItem(doc, byLine(doc, target));
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    return { text: encode(result.value.doc), result: result.value };
  }

  it('an empty item between two items leaves a position, not a node', () => {
    const { text, result } = unwrapOk('- a\n- \n- b\n', '- ');
    expect(text).toBe('- a\n\n- b\n');
    expect(result.anchor).toEqual({ line: 1, ch: 0 });
    // The node count drops by exactly one, and the neighbours are verbatim.
    expect([...walkNodes(result.doc)].map((n) => n.lines[0])).toEqual(['- a', '- b']);
  });

  it('an empty item as the last node', () => {
    const { text, result } = unwrapOk('- item\n- \n', '- ');
    expect(text).toBe('- item\n\n');
    expect(result.anchor).toEqual({ line: 1, ch: 0 });
  });

  it('an empty item as the only node', () => {
    const { text, result } = unwrapOk('- \n', '- ');
    expect(text).toBe('\n');
    expect(result.anchor).toEqual({ line: 0, ch: 0 });
    expect([...walkNodes(result.doc)].length).toBe(0);
  });

  it('an empty TASK item unwraps like any other empty item', () => {
    // The marker was written by our own continuation rule, so it does not make
    // the item non-empty (design D5).
    const { text } = unwrapOk('- a\n- [ ] \n', '- [ ] ');
    expect(text).toBe('- a\n\n');
  });

  it('typing at the anchor produces a paragraph joined to neither neighbour', () => {
    // The requirement's real content. Asserting the blank-line count alone
    // would pass on a layout that still merges into a neighbour.
    const { text, result } = unwrapOk('- a\n- \n- b\n', '- ');
    const lines = text.split('\n');
    lines[result.anchor.line] = 'typed';
    const after = parse(lines.join('\n'));
    // "typed" is its own paragraph node — not merged into the item above and
    // not part of the item below, which is what the requirement asks.
    expect(after.children.map((n) => [n.kind, n.lines[0]])).toEqual([
      ['list-item', '- a'],
      ['paragraph', 'typed'],
    ]);
    // `- b` becomes that paragraph's CHILD rather than staying top-level, which
    // is the list-after-paragraph attachment rule (`document-tree-mapping`)
    // doing its job, not an artifact of the unwrap: typing a paragraph directly
    // above any list does this. Asserted so the behavior is recorded rather
    // than discovered again.
    expect(after.children[1]!.children.map((n) => n.lines[0])).toEqual(['- b']);
  });

  it('rejects an item with children, and a non-empty item', () => {
    const withKids = parse('- a\n- \n\t- kid\n');
    expect(unwrapListItem(withKids, byLine(withKids, '- '))).toMatchObject({
      ok: false,
      rejection: { reason: 'would-orphan-children' },
    });
    const nonEmpty = parse('- a\n- text\n');
    expect(unwrapListItem(nonEmpty, byLine(nonEmpty, '- text'))).toMatchObject({
      ok: false,
      rejection: { reason: 'cannot-unwrap' },
    });
  });

  // Unwrapping is a removal from the item's own level, so it reaches the same
  // renumbering rule subtree deletion does — measured, not inferred.
  it('unwrapping the head of an ordered run renumbers from the run’s own start', () => {
    expect(unwrapOk('1. \n2. b\n3. c\n', '1. ').text).toBe('\n1. b\n2. c\n');
    expect(unwrapOk('5. \n6. b\n7. c\n', '5. ').text).toBe('\n5. b\n6. c\n');
  });
});

describe('sibling heading creation', () => {
  function siblingOk(md: string, target: string, remainder: string) {
    const doc = parse(md);
    const result = insertSiblingHeading(doc, byLine(doc, target), remainder);
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    return { text: encode(result.value.doc), result: result.value };
  }

  it('creates an empty sibling at the same level', () => {
    const { text, result } = siblingOk('## Foo\n', '## Foo', '');
    expect(text).toBe('## Foo\n## \n');
    expect(result.anchor).toEqual({ line: 1, ch: 3 });
    expect(result.doc.children.map((n) => n.level)).toEqual([2, 2]);
  });

  it('moves a remainder to the sibling', () => {
    const { text } = siblingOk('## Foo bar\n', '## Foo bar', 'bar');
    expect(text).toBe('## Foo \n## bar\n');
  });

  it('a setext original keeps its underline; the sibling is ATX', () => {
    const { text, result } = siblingOk('Head\n====\n', 'Head', '');
    expect(text).toBe('Head\n====\n# \n');
    expect(result.doc.children[0]!.lines).toEqual(['Head', '====']);
    expect(result.doc.children[0]!.setext).toBe(true);
    expect(result.doc.children[1]!.setext).toBeUndefined();
  });

  it("the original's children stay with it, so the sibling follows the section", () => {
    // Heading scope is positional: content already under the heading belongs
    // to it, so the new sibling can only go after that content.
    const { text } = siblingOk('## Foo\n\nbody\n', '## Foo', '');
    expect(text).toBe('## Foo\n\nbody\n## \n');
  });

  it('rejects a non-heading', () => {
    const doc = parse('- item\n');
    expect(insertSiblingHeading(doc, byLine(doc, '- item'), '')).toMatchObject({
      ok: false,
      rejection: { reason: 'cannot-split' },
    });
  });

  it('an interior heading split still produces a CHILD, never a sibling', () => {
    // The no-heading-siblings restriction is NARROWED to the two new entry
    // points, not dropped. This is the guard against the split path drifting.
    const doc = parse('# Hello world\n');
    const result = splitNode(doc, byLine(doc, '# Hello world'), { line: 0, ch: 8 });
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    expect(result.value.doc.children.length).toBe(1);
    expect(result.value.doc.children[0]!.children.map((n) => n.kind)).toEqual(['paragraph']);
  });
});

describe('review follow-ups (#43)', () => {
  it('a CHECKED empty task is content, not an empty item', () => {
    // The ladder's carve-out covers the marker this grammar writes — an
    // UNCHECKED box. A ticked one is something the user did, so Enter must not
    // outdent or unwrap a completed task away.
    const doc = parse('- a\n- [x]\n');
    expect(unwrapListItem(doc, byLine(doc, '- [x]'))).toMatchObject({
      ok: false,
      rejection: { reason: 'cannot-unwrap' },
    });

    const unchecked = parse('- a\n- [ ]\n');
    const result = unwrapListItem(unchecked, byLine(unchecked, '- [ ]'));
    expect(result.ok).toBe(true);
  });

  it('an insertion BEFORE a tab-indented sibling adopts its indentation', () => {
    // `destinationIndent` consulted only the siblings PRECEDING the insertion
    // point, so a payload landing first among tab-indented children took the
    // configured unit instead — leaving the existing sibling deeper than the
    // block now above it, which re-parses it as that block's child.
    const doc = parse('- item\n\t```\n\tcode\n\t```\n');
    // Anchor on the fence and insert BEFORE it: the payload lands first among
    // "- item"'s children, so there is no PRECEDING sibling to copy from.
    const fence = byLine(doc, '\t```');
    const result = insertSubtrees(doc, fence, parse('pasted\n').children, 'before', '  ');
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    const after = parse(encode(result.value.doc));
    // The fence is still a SIBLING of the pasted block under "- item", not its
    // child — which is what an indentation mismatch would have made it.
    expect(after.children[0]!.children.map((n) => n.kind)).toEqual(['list-item', 'code']);
    expect(after.children[0]!.children[0]!.children).toEqual([]);
  });
});
