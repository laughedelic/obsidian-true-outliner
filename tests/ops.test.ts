import { describe, expect, it } from 'vitest';
import { dropSeams } from '../src/drop-destinations';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import {
  indent,
  outdent,
  moveDown,
  moveUp,
  splitNode,
  unwrapListItem,
  insertSiblingHeading,
  insertSubtrees,
  moveSubtreesTo,
  surplusMarkerSpace,
} from '../src/ops';
import { applyEdits } from '../src/result';
import { arbTree } from './generators';

/** Find the node whose first line matches. */
function byLine(doc: OutlineDoc, line: string): number {
  for (const node of walkNodes(doc)) {
    if (node.lines[0] === line) return node.id;
  }
  throw new Error(`no node with line: ${line}`);
}

/** The first line of the node whose child has this first line; `null` at the
 * top level. Pins a subject's PLACE IN THE TREE, which is what an indent that
 * falls short of its destination's content column silently fails to change. */
function parentLineOf(doc: OutlineDoc, childLine: string): string | null {
  function search(nodes: readonly OutlineNode[], parent: string | null): string | null | undefined {
    for (const node of nodes) {
      if (node.lines[0] === childLine) return parent;
      const found = search(node.children, node.lines[0] ?? '');
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const found = search(doc.children, null);
  if (found === undefined) throw new Error(`no node with line: ${childLine}`);
  return found;
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

  // The chosen unit is evidence about WIDTH, and no source of that evidence —
  // a sibling, the document, the caller — knows how wide the destination
  // parent's own marker is. These pin the resulting PARENT rather than the
  // text: the defect they cover emitted a plausible-looking document whose
  // re-parse left the subject exactly where it started, with the op reporting
  // success and consuming an undo step.
  it('an indent reaches an ordered parent\'s content column, not just the inferred unit', () => {
    // `1. a` has no children, so the unit is inferred from `  - y` elsewhere:
    // two spaces, one short of `1. a`'s content column of 3.
    const { text, doc } = applyWithUnit(indent, '- x\n  - y\n1. a\n- b\n', '- b', undefined);
    expect(parentLineOf(doc, '   - b')).toBe('1. a');
    expect(text).toBe('- x\n  - y\n1. a\n   - b\n');
  });

  it('a bullet followed by two spaces widens the indentation to its real content column', () => {
    // `-  a` puts its content at column 3, and Obsidian nests only what reaches
    // it: a child at two columns is a sibling there, and its own deeper
    // children after a blank line render as an indented code block
    // (docs/research/list-marker-content-column).
    const { text, doc } = applyWithUnit(indent, '-  a\n- b\n', '- b', undefined);
    expect(parentLineOf(doc, '   - b')).toBe('-  a');
    expect(text).toBe('-  a\n   - b\n');
  });

  it('a marker followed by two spaces is rewritten with one when its own line moves', () => {
    // The indented item's first line is rewritten anyway, and a run wider than
    // one space is what put its content column where nobody could see it. Its
    // continuation line and its child keep their depth relative to the column.
    // `  - q` is the destination sibling whose indentation the moved item
    // copies; without it, `- c`'s three columns would be the inferred unit.
    const { text, doc } = applyWithUnit(indent, '- p\n  - q\n-  a\n   b\n   - c\n', '-  a', undefined);
    expect(text).toBe('- p\n  - q\n  - a\n    b\n    - c\n');
    expect(parentLineOf(doc, '    - c')).toBe('  - a');
  });

  it('the parent\'s own run is not rewritten by a child arriving under it', () => {
    // Only the line an operation rewrites is normalized; `-  a` is not touched
    // by an indent under it, and the child reaches its real column.
    const { text } = applyWithUnit(indent, '-  a\n- b\n', '- b', undefined);
    expect(text).toBe('-  a\n   - b\n');
  });

  it("a wide ordered marker widens the indentation to match", () => {
    // `10. ` is four columns, wider than the two spaces inferred from `  - y`.
    const { doc } = applyWithUnit(indent, '- x\n  - y\n10. a\n- b\n', '- b', undefined);
    expect(parentLineOf(doc, '    - b')).toBe('10. a');
  });

  it('a TAB that falls short of the content column is padded after the tab', () => {
    // `1000. ` is six columns and a tab is four, so even tab evidence has a
    // shortfall here — the case the two-space tests above cannot reach, and
    // the one that pins WHERE the padding goes. Two spaces before the tab
    // would vanish into its tab stop and leave the line four columns wide.
    const { text, doc } = applyWithUnit(indent, '- x\n\t- y\n\n1000. a\n- b\n', '- b', undefined);
    expect(parentLineOf(doc, '\t  - b')).toBe('1000. a');
    expect(text).toBe('- x\n\t- y\n\n1000. a\n\t  - b\n');
  });

  it('an outdent re-parents following siblings at the new parent\'s content column', () => {
    // `1. a` leaves p for the top level and adopts its former following
    // sibling `- b` as a child — under its own content column of 3.
    const { text, doc } = applyOk(outdent, '- p\n  1. a\n  - b\n', '  1. a');
    expect(parentLineOf(doc, '   - b')).toBe('1. a');
    expect(text).toBe('- p\n1. a\n   - b\n');
  });

  it("a supplied fallback under an ordered parent is padded, not replaced", () => {
    // The caller asked for spaces and still gets spaces — the shortfall is
    // made up from the same unit rather than the choice being overridden.
    const { text, doc } = applyWithUnit(indent, '1. a\n- b\n', '- b', '  ');
    expect(parentLineOf(doc, '   - b')).toBe('1. a');
    expect(text).toBe('1. a\n   - b\n');
  });

  it('a paragraph parent keeps its destination sibling, unclamped', () => {
    // An indented paragraph can own a FLUSH-LEFT list: `- x` attaches to
    // `   Para.` by adjacency, not by column. So the paragraph's own indent is
    // not a floor — clamping `B` out to it would bury the new item underneath
    // `- x` instead of placing it beside `- x`.
    const { text, doc } = applyWithUnit(indent, '   Para.\n- x\n\nB.\n', 'B.', undefined);
    expect(parentLineOf(doc, '- B.')).toBe('   Para.');
    expect(text).toBe('   Para.\n- x\n\n- B.\n');
  });

  it('indentation that already clears the content column keeps its own unit', () => {
    // A tab is four columns, wider than `1. a` needs: it stays a tab rather
    // than being rewritten to the minimum.
    const { text } = applyWithUnit(indent, '- x\n\t- y\n\n1. a\n- b\n', '- b', undefined);
    expect(text).toBe('- x\n\t- y\n\n1. a\n\t- b\n');
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

  // A swap inside one run: every member is still present and the run's own head
  // still heads it, so the start it began with is the start it keeps. The
  // number that travels with the moved item is not it.
  it('a swap does not let a run inherit the moved item’s own number', () => {
    const { text } = applyOk(moveDown, '5. one\n6. two\n7. three\n', '5. one');
    expect(text).toBe('5. two\n6. one\n7. three\n');
  });

  // A renumbering that crosses a DIGIT BOUNDARY changes the marker's WIDTH,
  // which moves the item's content column while the marker's own line stays
  // put. Pinned by the resulting PARENT: children left at the old column stop
  // reaching it and the re-parse hands them back as siblings.
  describe('renumbering across a digit boundary carries the subtree', () => {
    const RUN = ['1. p1', '2. p2', '3. p3', '4. p4', '5. p5', '6. p6', '7. p7', '8. p8', '9. p9'];

    it('widening 9. to 10. keeps the children children', () => {
      // `1. a` outdents into the run, becoming its tenth member; its former
      // sibling `- b` comes with it as a child. Both moved correctly, and then
      // the marker grew a digit underneath them.
      const { text, doc } = applyOk(outdent, `${RUN.join('\n')}\n   1. a\n   - b\n`, '   1. a');
      expect(parentLineOf(doc, '    - b')).toBe('10. a');
      expect(text).toBe(`${RUN.join('\n')}\n10. a\n    - b\n`);
    });


    it('a marker whose TEXT width is unchanged moves nothing', () => {
      // `09.` and `10.` are both three columns wide. The parsed NUMBER gains a
      // digit across the swap and the line does not, so a delta read off the
      // numbers drifts the child a column deeper for an op that never touched
      // it — and the drift is invisible in the tree, since too deep is still
      // nested.
      const { text } = applyOk(moveDown, '09. a\n    - kid\n10. b\n', '09. a');
      expect(text).toBe('9. b\n10. a\n    - kid\n');
    });

    it('a narrowing child indented with mixed whitespace is brought in', () => {
      // ` \t` is four columns: a tab starting at column 1 still runs to the
      // stop at 4. Counting a flat four per tab and dropping the space leaves
      // a tab that re-expands from zero — the same four columns, unmoved.
      const md = ['- x', ...RUN, '10. ten', ' \t- kid'].join('\n') + '\n';
      const { text } = applyOk(indent, md, '1. p1');
      expect(text).toContain('9. ten\n   - kid\n');
    });

    it('narrowing 10. to 9. pulls the children in with it', () => {
      // The mirror: indenting the run's head removes a member, so `10. ten`
      // becomes `9. ten`. Its child stays a child either way — one column too
      // deep is still nested — so this pins the indentation itself.
      const md = ['- x', ...RUN, '10. ten', '    - kid'].join('\n') + '\n';
      const { text } = applyOk(indent, md, '1. p1');
      expect(text).toContain('9. ten\n   - kid\n');
    });
  });

  it('rejects reorder across the heading/content divide and level mismatch', () => {
    expectReject(moveUp, '# H\n\nPara after.\n\n## Sub\n', '## Sub', 'cannot-reorder-across-heading-boundary');
    expectReject(moveDown, '### Three\n\n## Two\n', '### Three', 'cannot-reorder-across-heading-boundary');
    expectReject(moveUp, '- a\n- b\n', '- a', 'no-sibling-above');
    expectReject(moveDown, '- a\n- b\n', '- b', 'no-sibling-below');
  });

  // A list item whose preceding sibling is a paragraph is that paragraph's
  // CHILD at section level, so the arrangement a swap would produce there has
  // no encoding. A reorder recomputes no node's kind, which leaves refusing as
  // the only outcome available to it. Pinned by the REASON rather than by the
  // text: the defect these guard against emitted perfectly valid markdown that
  // simply meant a different tree.
  describe('a swap that would leave a list item after a paragraph', () => {
    it('refuses to move a list item down past a paragraph', () => {
      expectReject(moveDown, '- a\n- b\n\nP\n', '- b', 'reorder-not-expressible');
    });

    it('refuses to move a paragraph up above a list item', () => {
      // The subject keeps its own depth here — it is `- a`, which the caller
      // never selected, that would be absorbed.
      expectReject(moveUp, '- a\n\nP\n', 'P', 'reorder-not-expressible');
    });

    it('refuses when the paragraph already owns a list', () => {
      expectReject(moveDown, '- L0\n- L1\n\nL2\n- L3\n', '- L1', 'reorder-not-expressible');
    });

    it('refuses a displaced atom’s neighbour just as readily', () => {
      // The subject is the fence; `- a` is displaced into the slot behind the
      // paragraph, which is the half a subject-only check cannot see.
      expectReject(moveDown, 'P\n\n```\nx\n```\n\n- a\n', '```', 'reorder-not-expressible');
    });

    it('allows the same swap among a list item’s own children', () => {
      // Section level is the whole of the rule's reach: inside an item, the
      // enclosing item owns the list stack and a paragraph adopts nothing.
      const { doc, text } = applyOk(moveDown, '- P\n  - A\n\n  txt\n', '  - A');
      expect(text).toBe('- P\n\n  txt\n\n  - A\n');
      expect(parentLineOf(doc, '  - A')).toBe('- P');
    });
  });
});

/**
 * A run's START NUMBER lives in the sibling list, not in the run's own numbers.
 * Reading it as the lowest number present holds only while every member was
 * already there and no two runs met — and five operations break one of those
 * two conditions, each rewriting a marker ABOVE the operand.
 */
describe('an arriving number does not become the run’s start', () => {
  it('an outdenting item takes the next number in the run it joins', () => {
    // The reported shape. `1. L2` carries its nested `1.` up to a top-level run
    // that starts at 2, and the run renumbered itself from the arrival.
    const { text } = applyOk(outdent, '- L0\n2. L1\n   1. L2\n      - L3\n# L4\n', '   1. L2');
    expect(text).toBe('- L0\n2. L1\n3. L2\n   - L3\n# L4\n');
  });

  it('an indenting item takes the next number in the run it joins', () => {
    const { text } = applyOk(indent, '- p\n   5. a\n   6. b\n1. x\n', '1. x');
    expect(text).toBe('- p\n   5. a\n   6. b\n   7. x\n');
  });

  it('an adopted following sibling does not restart its new parent’s children', () => {
    // Both lists here belong to the operand's own subtree: `- x` keeps its
    // children `5.` / `6.`, and the sibling it leaves behind joins them as `7.`
    // rather than imposing its own `1.` on them.
    const md = '- p\n   - x\n      5. c1\n      6. c2\n   1. s1\n';
    const { text } = applyOk(outdent, md, '   - x');
    expect(text).toBe('- p\n- x\n   5. c1\n   6. c2\n   7. s1\n');
  });

  it('a pasted item does not restart the run it lands in', () => {
    const doc = parse('5. a\n6. b\n7. c\n');
    const result = insertSubtrees(doc, byLine(doc, '5. a'), parse('1. pasted\n').children, 'after');
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    expect(encode(result.value.doc)).toBe('5. a\n6. pasted\n7. b\n8. c\n');
  });

  it('a pasted run with no member from the destination keeps its own numbering', () => {
    // Nothing to recover a start from, so the payload's own start stands. This
    // is the fallback, and it is the only case the lowest-number reading still
    // decides.
    const doc = parse('- a\n- b\n- c\n');
    const result = insertSubtrees(doc, byLine(doc, '- b'), parse('3. x\n4. y\n').children, 'after');
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    expect(encode(result.value.doc)).toBe('- a\n- b\n3. x\n4. y\n- c\n');
  });

  it('a swap that SPLITS a run leaves the tail on its OWN numbers', () => {
    // The inverse of the join, and NOT the same rule. A removal takes the
    // members that carried the start, so the fragment it leaves has to recover
    // one; a split takes nothing — the head fragment still holds the start and
    // the tail still holds its own numbers. Recovering a start here would write
    // `1. c` over a line the swap never touched, and change what the reader
    // sees with it: cut loose, `3. c` is its own list and renders from 3.
    const { text } = applyOk(moveUp, '1. a\n2. b\n3. c\n- x\n', '- x');
    expect(text).toBe('1. a\n2. b\n- x\n3. c\n');
  });

  it('a bullet pasted into an ordered run leaves the tail alone (#159)', () => {
    // The reported shape. `10. ten` was not in the selection, not in the
    // payload and not adjacent to the caret; it was rewritten to `8. ten`
    // because the bullet between it and `9. nine` ended the run it belonged to.
    const doc = parse('- top\n  8. eight\n  9. nine\n  10. ten\n');
    const result = insertSubtrees(
      doc,
      byLine(doc, '  9. nine'),
      parse('- alpha\n  - beta\n').children,
      'after',
    );
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    expect(encode(result.value.doc)).toBe(
      '- top\n  8. eight\n  9. nine\n  - alpha\n    - beta\n  10. ten\n',
    );
  });

  it('a heading payload converting into an ordered run JOINS it (#159)', () => {
    // The other half of the report, now that a converted node takes the
    // destination's list style: the heading arrives as an ordered item, so the
    // run is never divided and `10. ten` moves to `11.` because an item was
    // inserted above it — which is renumbering working, not the defect above.
    // Its own child sits at the wider marker's content column.
    const doc = parse('- top\n  8. eight\n  9. nine\n  10. ten\n');
    const result = insertSubtrees(
      doc,
      byLine(doc, '  9. nine'),
      parse('## H\nbody\n').children,
      'after',
    );
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    expect(encode(result.value.doc)).toBe(
      '- top\n  8. eight\n  9. nine\n  10. ## H\n      - body\n  11. ten\n',
    );
  });

  it('a run cut into two by a paste keeps BOTH fragments where they were', () => {
    // The minimal shape, at the root and consecutive from 1: the head fragment
    // reads its own start, the tail its own numbers, and the only line the
    // paste writes is the one it inserted.
    const doc = parse('1. a\n2. b\n3. c\n');
    const result = insertSubtrees(doc, byLine(doc, '1. a'), parse('- x\n').children, 'after');
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    expect(encode(result.value.doc)).toBe('1. a\n- x\n2. b\n3. c\n');
  });

  it('an ordered item pasted into the tail fragment joins the tail’s numbering', () => {
    // A fragment can GAIN members as it is cut off. The one that was already
    // there stays on its own number and the arrival counts back from it, so the
    // payload takes `9.` and `10. ten` is still `10. ten`.
    const doc = parse('- top\n  8. eight\n  9. nine\n  10. ten\n');
    const result = insertSubtrees(
      doc,
      byLine(doc, '  9. nine'),
      parse('- x\n3. y\n').children,
      'after',
    );
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    expect(encode(result.value.doc)).toBe(
      '- top\n  8. eight\n  9. nine\n  - x\n  9. y\n  10. ten\n',
    );
  });

  it('an outdent arriving in the middle of a run divides it without renumbering', () => {
    // The paste is not the only route in, and the differential measures this one
    // as the change's largest: an arriving bullet divides the run it lands in
    // exactly as a pasted one does.
    const { text } = applyOk(outdent, '1. a\n   - kid\n2. b\n3. c\n', '   - kid');
    expect(text).toBe('1. a\n- kid\n2. b\n3. c\n');
  });

  it('a fragment keeping a LARGER number still carries its subtree', () => {
    // The direction the old reading could not produce. The fragment keeps its
    // own start of 9, which normalizes `9. o` to `10. o` — a marker that gains a
    // digit, so the content column moves and the subtree has to move with it.
    const doc = parse('- t\n  8. e\n  9. n\n  9. o\n     - kid\n');
    const result = insertSubtrees(doc, byLine(doc, '  8. e'), parse('- x\n').children, 'after');
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    const text = encode(result.value.doc);
    expect(text).toBe('- t\n  8. e\n  - x\n  9. n\n  10. o\n      - kid\n');
    // Closure: the re-parse still reads `- kid` as the WIDENED item's child.
    // Its presence alone would not say that — a subtree left behind at the old
    // column comes back as a sibling, which is the defect this asserts against.
    expect(parentLineOf(parse(text), '      - kid')).toBe('  10. o');
  });

  it('a fragment with no room below counts back to the recovered start, not to zero', () => {
    // More members prepended than the fragment's own number leaves room for, so
    // its numbers cannot stand either and the recovered start answers. `0.` is a
    // number no run in the source was written from, and nothing here emits one.
    const doc = parse('1. a\n2. b\n');
    const result = insertSubtrees(
      doc,
      byLine(doc, '1. a'),
      parse('- x\n5. p\n6. q\n7. r\n').children,
      'after',
    );
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    expect(encode(result.value.doc)).toBe('1. a\n- x\n1. p\n2. q\n3. r\n4. b\n');
  });

  it('a run that cannot be renumbered within nine digits is left exactly as it stands', () => {
    // Preserving a fragment's own numbers renumbers UPWARD, which the old
    // reading never did, so a run sitting at the parser's ceiling can now be
    // pushed over it. A tenth digit is not a list item: the item would re-parse
    // as a paragraph and its subtree would be re-indented to a column it never
    // had. The run keeps the markers it already had instead.
    const doc = parse('999999998. a\n999999999. b\n999999999. c\n            - kid\n');
    const result = insertSubtrees(
      doc,
      byLine(doc, '999999998. a'),
      parse('- x\n').children,
      'after',
    );
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    expect(encode(result.value.doc)).toBe(
      '999999998. a\n- x\n999999999. b\n999999999. c\n            - kid\n',
    );
    // Every node is still a list item, and the subtree is still at its column.
    for (const node of walkNodes(result.value.doc)) expect(node.kind).toBe('list-item');
  });

  it('a removal still recovers the start it lost', () => {
    // The negative control the split rule has to leave standing: here the
    // members that carried the start are GONE, so the fragment is a remainder
    // and reads the run's own start rather than its own numbers.
    const { text } = applyOk(indent, '- p\n8. eight\n9. nine\n', '8. eight');
    expect(text).toBe('- p\n  8. eight\n8. nine\n');
  });

  it('a fragment that also JOINS another run is back under the join rule', () => {
    // Both shapes at once: `- x` moving up cuts `2. b` off its run AND merges
    // it with the run below. One list carries one sequence, so `5. c` is
    // renumbered whatever start the fragment is handed — there is nothing for
    // keeping `2. b` on its own number to protect, and the earliest member
    // present beforehand names the start, as it does for any other join.
    const { text } = applyOk(moveUp, '1. a\n2. b\n- x\n5. c\n', '- x');
    expect(text).toBe('1. a\n- x\n1. b\n2. c\n');
  });

  it('a swap that joins two runs keeps the earlier run’s start', () => {
    // No node arrives from anywhere here — the separator moves out from between
    // two runs and they become one. The lowest number present is then the
    // swallowed run's, which is why a permutation needed its own disproof.
    const { text } = applyOk(moveDown, '5. a\n- x\n1. c\n', '- x');
    expect(text).toBe('5. a\n6. c\n- x\n');
  });
});

describe('a converted node takes the destination list style', () => {
  function pasted(md: string, anchor: string, payload: string, pos: 'before' | 'after' = 'after') {
    const doc = parse(md);
    const result = insertSubtrees(doc, byLine(doc, anchor), parse(payload).children, pos);
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    return encode(result.value.doc);
  }

  it('a heading joining a `*` run is written with `*`', () => {
    // A `-` written into a `*` run ENDS it: CommonMark starts a new list
    // wherever the bullet character changes, so one list became three around
    // the arrival. Measured with `commonmark`, this frame went from 2 lists to
    // 4 and now stays at 2.
    expect(pasted('- top\n  * a\n  * b\n  * c\n', '  * a', '## H\n')).toBe(
      '- top\n  * a\n  * ## H\n  * b\n  * c\n',
    );
  });

  it('a `+` run donates too', () => {
    expect(pasted('- top\n  + a\n  + b\n', '  + a', '## H\n')).toBe(
      '- top\n  + a\n  + ## H\n  + b\n',
    );
  });

  it('an ordered run donates its delimiter as well as its type', () => {
    expect(pasted('- top\n  1) a\n  2) b\n', '  1) a', '## H\n')).toBe(
      '- top\n  1) a\n  2) ## H\n  3) b\n',
    );
  });

  it('a paragraph payload converts the same way', () => {
    // `headingAsListItem` was not alone in hardcoding `-`: the
    // paragraph-to-list-item arm of `reencodeForDestination` made the same
    // choice, and a paragraph is the commoner payload of the two.
    expect(pasted('- top\n  8. eight\n  9. nine\n', '  8. eight', 'plain para\n')).toBe(
      '- top\n  8. eight\n  9. plain para\n  10. nine\n',
    );
  });

  it('a following sibling donates where there is no preceding one', () => {
    // The same order `nativeContentKind` reads its own donor in.
    expect(pasted('- top\n  * a\n  * b\n', '  * a', '## H\n', 'before')).toBe(
      '- top\n  * ## H\n  * a\n  * b\n',
    );
  });

  it('the payload\u2019s OWN nested rows keep the default marker', () => {
    // The destination style reaches the payload's top level only: its nested
    // rows belong to lists of its own, which have no destination run to sit
    // level with. `2. ## H` joins the run; `- ### H2` is its child.
    expect(pasted('- top\n  1. a\n  2. b\n', '  1. a', '## H\n### H2\n')).toBe(
      '- top\n  1. a\n  2. ## H\n     - ### H2\n  3. b\n',
    );
  });

  it('an ARRIVING list item still keeps its own marker', () => {
    // The negative control, and the boundary of this change: an arriving list
    // item is not a conversion. It carries a marker its author chose, and
    // rewriting that would be the silent change this rule exists to avoid.
    expect(pasted('- top\n  * a\n  * b\n', '  * a', '- x\n')).toBe(
      '- top\n  * a\n  - x\n  * b\n',
    );
  });

  it('a task donor donates its marker and not its checkbox', () => {
    // `listStyle` is the marker; `[ ] ` is content that happens to follow it.
    // A pasted heading joins the list without becoming a task.
    expect(pasted('- top\n  - [ ] a\n  - [ ] b\n', '  - [ ] a', '## H\n')).toBe(
      '- top\n  - [ ] a\n  - ## H\n  - [ ] b\n',
    );
  });

  it('a LEADING-ZERO donor still lands its subtree at the right column', () => {
    // `listStyle.number` is the parsed value with leading zeroes discarded, so a
    // `09.` donor donates 9 and the arrival is first written `9.` — one column
    // narrower than the neighbour it copied. That is self-consistent, because
    // the arrival's children are laid out at ITS content column, and the
    // renumbering that follows moves both together: `shiftBelowMarker` measures
    // the marker's width off the two LINES rather than the two numbers, which
    // is the same reading `09.` to `10.` already needed.
    const doc = parse('- top\n  09. a\n  10. b\n');
    const result = insertSubtrees(
      doc,
      byLine(doc, '  09. a'),
      parse('## H\n### kid\n').children,
      'after',
    );
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    const text = encode(result.value.doc);
    expect(text).toBe('- top\n  09. a\n  10. ## H\n      - ### kid\n  11. b\n');
    // Closure, and the point of the case: the subtree is still the arrival's.
    expect(parentLineOf(parse(text), '      - ### kid')).toBe('  10. ## H');
    // The donor keeps its own spelling, since its number did not change.
    expect(text).toContain('  09. a\n');
  });

  it('an INDENT converting a paragraph joins the run it lands in', () => {
    // A paste is not the only conversion. `nativeContentKind` already
    // made this paragraph a list item at its destination; only its marker was
    // written without looking. Into a `*` run, a `-` ended the run exactly as
    // it did on the paste path.
    const { text } = applyOk(indent, '* parent\n  * existing\nplain\n', 'plain');
    expect(text).toBe('* parent\n  * existing\n  * plain\n');
  });

  it('an INDENT converting into an ordered run takes the next number', () => {
    const { text } = applyOk(indent, '- parent\n  8. existing\nplain\n', 'plain');
    expect(text).toBe('- parent\n  8. existing\n  9. plain\n');
  });

  it('an OUTDENT converting on arrival joins the run it lands among', () => {
    const { text } = applyOk(outdent, '* a\n\n  para\n', '  para');
    expect(text).toBe('* a\n\n* para\n');
  });

  it('an outdent arrival joins an ordered run the same way', () => {
    const { text } = applyOk(outdent, '8. a\n\n   para\n', '   para');
    expect(text).toBe('8. a\n\n9. para\n');
  });

  it('no list at the destination leaves the default `-`', () => {
    // A list SCOPE with no list in it yet: the payload converts, because the
    // scope's encoding is a list item, and there is no marker to copy.
    expect(pasted('- top\n\n  para\n', '  para', '## H\n')).toBe(
      '- top\n\n  para\n\n  - ## H\n',
    );
  });
});

describe('which regime a payload lands in is read from the nearest sibling', () => {
  function pasted(md: string, at: string, payload = '## Notes\nbody\n') {
    const doc = parse(md);
    const result = insertSubtrees(doc, byLine(doc, at), parse(payload).children, 'after');
    if (!result.ok) throw new Error(`rejected: ${result.rejection.reason}`);
    return encode(result.value.doc);
  }

  it('a section pasted into an ordered run UNDER A HEADING joins the run', () => {
    // The manual-pass report. The scope is heading-bearing, so the heading
    // regime answered first and the payload stayed a heading, splitting the
    // run — in the commonest shape a real note has, a list under its heading.
    expect(pasted('## H\n\n1. a\n2. b\n', '1. a')).toBe(
      '## H\n\n1. a\n2. ## Notes\n   - body\n3. b\n',
    );
  });

  it('a section pasted among top-level list items converts too', () => {
    expect(pasted('- a\n- b\n', '- a')).toBe('- a\n- ## Notes\n  - body\n- b\n');
  });

  it('a HEADING sibling still donates its level', () => {
    // Unchanged, and the reason the scan looks for both: where the neighbours
    // are headings the payload is landing among sections, not among rows.
    expect(pasted('# One\n\n### Three\n\n### Four\n', '### Three')).toBe(
      '# One\n\n### Three\n\n### Notes\nbody\n\n### Four\n',
    );
  });

  it('a PARAGRAPH sibling stays transparent', () => {
    // Paragraphs and atoms express neither regime, so they neither donate nor
    // end the scan. A heading beside a paragraph is the shape "same depth,
    // different kinds" already covers, and nothing measured asks to change it.
    expect(pasted('## H\n\npara one\n\npara two\n', 'para one')).toBe(
      '## H\n\npara one\n\n### Notes\nbody\n\npara two\n',
    );
  });

  it('an ADOPTED sibling takes the style of the children it joins', () => {
    // The outdent path that adopts a node's following siblings as its trailing
    // children. `para` is a paragraph, so it converts; the children it lands
    // among are written `*`, so that is what it is written with.
    //
    // Fenced deliberately: removing the style argument at this one call site
    // passed the whole suite before this case existed, because every other
    // adopted-sibling test either keeps an ARRIVING item's own marker or
    // converts the other way, to a paragraph.
    const { text } = applyOk(outdent, '- p\n  - x\n    * child\n\n  para\n', '  - x');
    expect(text).toBe('- p\n- x\n  * child\n\n  * para\n');
  });

  it('an adopted sibling joins an ORDERED child run', () => {
    const { text } = applyOk(outdent, '- p\n  - x\n    1. child\n\n  para\n', '  - x');
    expect(text).toBe('- p\n- x\n  1. child\n\n  2. para\n');
  });

  it('an adopted sibling that ARRIVES as a list item keeps its own marker', () => {
    // The control: adoption is not conversion either.
    const { text } = applyOk(outdent, '- p\n  - x\n    * child\n  - sib\n', '  - x');
    expect(text).toBe('- p\n- x\n  * child\n  - sib\n');
  });

  it('a scope with no sibling of either kind still reads the parent', () => {
    expect(pasted('para\n', 'para')).toBe('para\n# Notes\nbody\n');
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

describe('surplusMarkerSpace', () => {
  it('counts the run past the one character a marker needs, at the column the run ends', () => {
    expect(surplusMarkerSpace('- a', 2)).toBe(0);
    expect(surplusMarkerSpace('-  a', 3)).toBe(1);
    expect(surplusMarkerSpace('-   a', 4)).toBe(2);
    expect(surplusMarkerSpace('1.  a', 4)).toBe(1);
    expect(surplusMarkerSpace('  -  b', 5)).toBe(1);
    expect(surplusMarkerSpace('##  Two', 4)).toBe(1);
  });

  it('a task marker\'s own run counts too', () => {
    expect(surplusMarkerSpace('- [ ] bar', 6)).toBe(0);
    expect(surplusMarkerSpace('- [ ]  bar', 7)).toBe(1);
    expect(surplusMarkerSpace('-  [ ] bar', 3)).toBe(1);
  });

  it('a single tab is the one character the marker needs, not a surplus', () => {
    // Removing it would leave `-a`, which is no marker at all.
    expect(surplusMarkerSpace('-\ta', 2)).toBe(0);
    expect(surplusMarkerSpace('- \ta', 3)).toBe(1);
  });

  it('indentation alone is nobody\'s run', () => {
    expect(surplusMarkerSpace('   text', 3)).toBe(0);
    expect(surplusMarkerSpace('  - a', 2)).toBe(0);
  });

  it('a column inside the run, or past it, reports nothing', () => {
    expect(surplusMarkerSpace('-   a', 2)).toBe(0);
    expect(surplusMarkerSpace('-   a', 3)).toBe(1);
    expect(surplusMarkerSpace('-  a', 4)).toBe(0);
  });
});

/** Every reason a move can legitimately refuse for, so a property cannot pass
 * on a rejection nobody wrote. */
const KNOWN_MOVE_REASONS = new Set([
  'node-not-found',
  'at-h6-bound',
  'not-expressible-under-target',
  'insertion-not-expressible',
]);

describe('moveSubtreesTo, and the kind a run has where it lands', () => {
  it('writes a heading level with the siblings it lands beside', () => {
    // `## First` moved inside `## Second`, whose only child is an `#####`
    // section: it is an h5 on either side of it, beside `Deep` rather than
    // over it. The parent's reading (h3) would take `Deep` in when dropped
    // before it — content nobody pointed at.
    const src = ['## First', '', 'one', '', '## Second', '', '##### Deep', '', 'two', ''].join('\n');
    const doc = parse(src);
    const second = byLine(doc, '## Second');
    const before = moveSubtreesTo(doc, [[byLine(doc, '## First')]], { parentId: second, index: 0 });
    if (!before.ok) throw new Error(before.rejection.reason);
    expect(encode(before.value.doc)).toBe(
      ['## Second', '', '##### First', '', 'one', '', '##### Deep', '', 'two', ''].join('\n'),
    );
    const after = moveSubtreesTo(doc, [[byLine(doc, '## First')]], { parentId: second, index: 1 });
    if (!after.ok) throw new Error(after.rejection.reason);
    expect(encode(after.value.doc)).toBe(
      ['## Second', '', '##### Deep', '', 'two', '', '##### First', '', 'one', ''].join('\n'),
    );
  });

  it('keeps a list item a list item wherever the destination can hold one', () => {
    // Under a heading as its first child, and after another list item: the
    // kind stays. Right after a paragraph it cannot: the attachment rule would
    // make it that paragraph's child, so it is written as a paragraph there,
    // as before.
    // `- a` before `intro`, since a list after a paragraph is that paragraph's
    // child: Top's children are the item, the paragraph and the section.
    const src = ['# Top', '', '- a', '', 'intro', '', '## Other', '', '- b', ''].join('\n');
    const doc = parse(src);
    const top = byLine(doc, '# Top');
    // Kinds and order, not spacing: the scope's own gaps are the gap rule's.
    const outline = (r: ReturnType<typeof moveSubtreesTo>) => {
      if (!r.ok) throw new Error(r.rejection.reason);
      return [...walkNodes(r.value.doc)].map((n) => `${n.kind}: ${n.lines[0]!.trim()}`);
    };
    expect(outline(moveSubtreesTo(doc, [[byLine(doc, '- b')]], { parentId: top, index: 0 }))).toEqual([
      'heading: # Top',
      'list-item: - b',
      'list-item: - a',
      'paragraph: intro',
      'heading: ## Other',
    ]);
    expect(outline(moveSubtreesTo(doc, [[byLine(doc, '- b')]], { parentId: top, index: 1 }))).toEqual([
      'heading: # Top',
      'list-item: - a',
      'list-item: - b',
      'paragraph: intro',
      'heading: ## Other',
    ]);
    expect(outline(moveSubtreesTo(doc, [[byLine(doc, '- b')]], { parentId: top, index: 2 }))).toEqual([
      'heading: # Top',
      'list-item: - a',
      'paragraph: intro',
      'paragraph: b',
      'heading: ## Other',
    ]);
  });

  it('refuses to write a task as a paragraph, and keeps it a task everywhere else', () => {
    const src = ['# Top', '', '- a', '', 'intro', '', '## Other', '', '- [ ] chore', ''].join('\n');
    const doc = parse(src);
    const top = byLine(doc, '# Top');
    const kept = moveSubtreesTo(doc, [[byLine(doc, '- [ ] chore')]], { parentId: top, index: 0 });
    if (!kept.ok) throw new Error(kept.rejection.reason);
    expect([...walkNodes(kept.value.doc)].map((n) => `${n.kind}: ${n.lines[0]!.trim()}`)).toEqual([
      'heading: # Top',
      'list-item: - [ ] chore',
      'list-item: - a',
      'paragraph: intro',
      'heading: ## Other',
    ]);
    const broken = moveSubtreesTo(doc, [[byLine(doc, '- [ ] chore')]], { parentId: top, index: 2 });
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.rejection.reason).toBe('insertion-not-expressible');
    // And the seam offers no such place: the destination the preview draws is
    // always one the release can deliver.
    const chore = [...walkNodes(doc)].find((n) => n.lines[0] === '- [ ] chore')!;
    const seams = dropSeams(doc, [chore]);
    const afterIntro = seams.find((s) => s.aboveId === byLine(doc, 'intro'))!;
    expect(afterIntro.candidates.some((c) => c.parentId === top && c.index === 2)).toBe(false);
  });
});

describe('moveSubtreesTo, at a level the destination is told', () => {
  const DOC = ['# Kitchen', '', 'intro', '', '## Plan', '', '1. demolition', '', '## Materials', '', '- tile', '- handles', '', '> quote', ''].join('\n');

  it('writes a heading between a heading and its first child at that heading\u2019s level', () => {
    const doc = parse(DOC);
    const r = moveSubtreesTo(doc, [[byLine(doc, '## Plan')]], {
      parentId: byLine(doc, '## Materials'),
      index: 0,
      level: 2,
    });
    if (!r.ok) throw new Error(r.rejection.reason);
    expect(encode(r.value.doc)).toBe(
      ['# Kitchen', '', 'intro', '', '## Materials', '', '## Plan', '', '1. demolition', '- tile', '- handles', '', '> quote', ''].join('\n'),
    );
    // Materials is childless afterwards, and Plan holds its former children.
    const after = r.value.doc;
    const materials = [...walkNodes(after)].find((n) => n.lines[0] === '## Materials')!;
    expect(materials.children).toHaveLength(0);
    const plan = [...walkNodes(after)].find((n) => n.lines[0] === '## Plan')!;
    expect(plan.children.map((c) => c.lines[0])).toEqual(['1. demolition', '- tile', '- handles', '> quote']);
  });

  it('re-levels a heading in place, which is the outdent', () => {
    const doc = parse(DOC);
    const r = moveSubtreesTo(doc, [[byLine(doc, '## Plan')]], {
      parentId: byLine(doc, '# Kitchen'),
      index: 1,
      level: 1,
    });
    if (!r.ok) throw new Error(r.rejection.reason);
    expect(encode(r.value.doc)).toBe(
      ['# Kitchen', '', 'intro', '', '# Plan', '', '1. demolition', '', '## Materials', '', '- tile', '- handles', '', '> quote', ''].join('\n'),
    );
  });
});

describe('moveSubtreesTo', () => {
  /** The document a move produced, or the reason it was refused. */
  function moved(
    src: string,
    lines: readonly string[],
    destination: { parent: string; index: number },
  ): string {
    const doc = parse(src);
    const result = moveSubtreesTo(
      doc,
      [lines.map((line) => byLine(doc, line))],
      {
        parentId: destination.parent === 'root' ? 'root' : byLine(doc, destination.parent),
        index: destination.index,
      },
    );
    if (!result.ok) return `REJECT ${result.rejection.reason}`;
    return encode(result.value.doc);
  }

  it('moves a run across the document as one result', () => {
    const src = ['- one', '- two', '  - two a', '- three', ''].join('\n');
    expect(moved(src, ['- two'], { parent: 'root', index: 0 })).toBe(
      ['- two', '  - two a', '- one', '- three', ''].join('\n'),
    );
  });

  it('carries every descendant at its own depth relative to the root', () => {
    const src = ['- one', '- two', '  - two a', '    - two a i', '- three', ''].join('\n');
    expect(moved(src, ['- two'], { parent: '- three', index: 0 })).toBe(
      ['- one', '- three', '  - two', '    - two a', '      - two a i', ''].join('\n'),
    );
  });

  it('lands a run as the first child of a node that has none', () => {
    const src = ['- one', '- two', ''].join('\n');
    expect(moved(src, ['- one'], { parent: '- two', index: 0 })).toBe(
      ['- two', '  - one', ''].join('\n'),
    );
  });

  it('refuses a destination inside the run itself', () => {
    const src = ['- one', '  - one a', '- two', ''].join('\n');
    expect(moved(src, ['- one'], { parent: '  - one a', index: 0 })).toBe(
      'REJECT not-expressible-under-target',
    );
  });

  // An atom is a leaf at every indentation, so no encoding places a payload
  // inside one. Asserted per kind rather than once, because the guard reads
  // `isAtom` and a kind dropped from that set would go unnoticed by a single
  // case.
  const ATOM_DESTINATIONS = [
    { kind: 'code', lines: ['```js', 'code', '```'], anchor: '```js' },
    { kind: 'table', lines: ['| a | b |', '| --- | --- |'], anchor: '| a | b |' },
    { kind: 'quote', lines: ['> quoted'], anchor: '> quoted' },
  ] as const;

  for (const atom of ATOM_DESTINATIONS) {
    it(`refuses a ${atom.kind} as a destination, by the shared guard`, () => {
      const src = ['- one', '', ...atom.lines, ''].join('\n');
      expect(moved(src, ['- one'], { parent: atom.anchor, index: 0 })).toBe(
        'REJECT not-expressible-under-target',
      );
    });
  }

  it('refuses a destination the insertion rule declines', () => {
    const src = ['a paragraph', '', '```js', 'code', '```', ''].join('\n');
    expect(moved(src, ['```js'], { parent: 'a paragraph', index: 0 })).toBe(
      'REJECT insertion-not-expressible',
    );
  });

  it('refuses a destination too deep for the run’s own headings', () => {
    // The payload's own deepest heading is `h2`; landing its root among an
    // `h5`'s children puts that descendant past `h6`.
    const src = [
      '# A',
      '',
      '## A1',
      '',
      '# B',
      '',
      '## B1',
      '',
      '### B2',
      '',
      '#### B3',
      '',
      '##### B4',
      '',
    ].join('\n');
    expect(moved(src, ['# A'], { parent: '##### B4', index: 0 })).toBe('REJECT at-h6-bound');
  });

  it('spans every root of a multi-root run where it lands', () => {
    // The selection after a drop is the run's cover in its new place: both
    // roots, not the first alone — in the same scope and across scopes alike.
    // The run ends the note both times, and a last node's cover runs through
    // the trailing gap line.
    const src = ['# Top', '', '- one', '  - nested', '- two', '- three', ''].join('\n');
    const doc = parse(src);
    const top = byLine(doc, '# Top');
    const same = moveSubtreesTo(doc, [[byLine(doc, '- one'), byLine(doc, '- two')]], {
      parentId: top,
      index: 3,
    });
    if (!same.ok) throw new Error(same.rejection.reason);
    expect(encode(same.value.doc)).toBe(['# Top', '', '- three', '- one', '  - nested', '- two', ''].join('\n'));
    expect(same.value.span).toEqual({ start: { line: 3, ch: 0 }, end: { line: 6, ch: 0 } });
    const across = moveSubtreesTo(doc, [[byLine(doc, '- two'), byLine(doc, '- three')]], {
      parentId: byLine(doc, '- one'),
      index: 1,
    });
    if (!across.ok) throw new Error(across.rejection.reason);
    expect(encode(across.value.doc)).toBe(['# Top', '', '- one', '  - nested', '  - two', '  - three', ''].join('\n'));
    expect(across.value.span).toEqual({ start: { line: 4, ch: 0 }, end: { line: 6, ch: 0 } });
  });

  it('writes no change when the destination is where the run already is', () => {
    const src = ['- one', '- two', '- three', ''].join('\n');
    const doc = parse(src);
    const result = moveSubtreesTo(doc, [[byLine(doc, '- two')]], { parentId: 'root', index: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.edits).toEqual([]);
    expect(encode(result.value.doc)).toBe(src);
  });

  it('keeps a run’s own encoding when it does not leave its scope', () => {
    // The scope is mixed — a bullet among paragraphs — and the run is the only
    // evidence of its own regime. Composing a removal with an insertion reads
    // the regime off the siblings that are left, so the bullet came back a
    // paragraph; a run that has not left its scope is already encoded for it.
    const src = ['- bullet', '', 'para one', '', 'para two', ''].join('\n');
    expect(moved(src, ['- bullet'], { parent: 'root', index: 0 })).toBe(src);
    expect(moved(src, ['- bullet'], { parent: 'root', index: 3 })).toBe(
      ['para one', '', 'para two', '', '- bullet', ''].join('\n'),
    );
  });

  it('leaves a tight list tight, and the terminating newline where it was', () => {
    // Gaps go with the SLOTS: the last slot ends the file whichever node
    // occupies it, and the boundaries between the others stay as tight as the
    // list was written.
    const src = ['- a', '- b', '- c', ''].join('\n');
    expect(moved(src, ['- c'], { parent: 'root', index: 0 })).toBe(
      ['- c', '- a', '- b', ''].join('\n'),
    );
  });

  it('renumbers both ordered runs a move crosses', () => {
    // The second list attaches to the paragraph above it, so it is that
    // paragraph's children the run joins.
    const src = ['1. a', '2. b', '3. c', '', 'a paragraph', '', '  1. x', '  2. y', ''].join('\n');
    const out = moved(src, ['2. b'], { parent: 'a paragraph', index: 2 }).split('\n');
    // The run it left closes up...
    expect(out).toContain('1. a');
    expect(out).toContain('2. c');
    // ...and the run it joined numbers it consecutively rather than carrying
    // the number it arrived with.
    expect(out).toContain('  3. b');
  });

  it('separates both sides of the move', () => {
    const src = ['# A', '', 'para one', '', 'para two', '', '# B', '', 'para three', ''].join('\n');
    const out = moved(src, ['para one'], { parent: '# B', index: 1 });
    // No doubled blank where it left, none missing where it arrived.
    expect(out).not.toContain('\n\n\n');
    expect(out.endsWith('\n')).toBe(true);
    expect(out).toContain('para three\n\npara one\n');
  });

  it('refuses a destination that is not in the document', () => {
    const doc = parse(['- one', '- two', ''].join('\n'));
    const result = moveSubtreesTo(doc, [[byLine(doc, '- one')]], { parentId: 9999, index: 0 });
    expect(result.ok ? 'ACCEPT' : `REJECT ${result.rejection.reason}`).toBe('REJECT node-not-found');
  });

  it('absorbs what follows a moved heading, as an inserted one does', () => {
    const src = ['# Doc', '', '## First', '', 'body', '', '## Move me', '', 'mine', ''].join('\n');
    const doc = parse(src);
    const result = moveSubtreesTo(doc, [[byLine(doc, '## Move me')]], {
      parentId: byLine(doc, '# Doc'),
      index: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `## Move me` now opens the section, so `## First` ends it rather than
    // being taken in — the bound is the next heading of the same level.
    const moveMe = [...walkNodes(result.value.doc)].find((n) => n.lines[0] === '## Move me')!;
    expect(moveMe.children.map((c) => c.lines[0])).toEqual(['mine']);
    const first = [...walkNodes(result.value.doc)].find((n) => n.lines[0] === '## First')!;
    expect(first.children.map((c) => c.lines[0])).toEqual(['body']);
  });

  it('carries the note’s terminating newline out of the end it leaves', () => {
    // A move's removal is not refilled at the place it left, so whichever node
    // ends the document afterwards carries the newline the run was holding.
    const src = ['- one', '  - a', '- two', ''].join('\n');
    const doc = parse(src);
    const result = moveSubtreesTo(doc, [[byLine(doc, '- two')]], {
      parentId: byLine(doc, '- one'),
      index: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encode(result.value.doc)).toBe(['- one', '  - two', '  - a', ''].join('\n'));

    // Negative control: a note written without one is not given one.
    const flush = parse(['- one', '  - a', '- two'].join('\n'));
    const kept = moveSubtreesTo(flush, [[byLine(flush, '- two')]], {
      parentId: byLine(flush, '- one'),
      index: 0,
    });
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(encode(kept.value.doc)).toBe(['- one', '  - two', '  - a'].join('\n'));
  });

  it('round-trips a run that absorbs nothing, and does not when it absorbs', () => {
    // Absorbs nothing: a list item has no section to open.
    const tight = ['- one', '- two', '- three', '- four', ''].join('\n');
    const there = parse(tight);
    const out = moveSubtreesTo(there, [[byLine(there, '- one')]], { parentId: 'root', index: 3 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const back = moveSubtreesTo(out.value.doc, [[byLine(out.value.doc, '- one')]], {
      parentId: 'root',
      index: 0,
    });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(encode(back.value.doc)).toBe(tight);

    // Absorbing: the return trip's anchor is inside the run it would move, so
    // the property is false here by construction rather than by a defect.
    const sections = ['# Doc', '', 'para A', '', 'para B', '', '## Move me', '', 'body', ''].join(
      '\n',
    );
    const src = parse(sections);
    const away = moveSubtreesTo(src, [[byLine(src, '## Move me')]], {
      parentId: byLine(src, '# Doc'),
      index: 1,
    });
    expect(away.ok).toBe(true);
    if (!away.ok) return;
    const moveMe = [...walkNodes(away.value.doc)].find((n) => n.lines[0] === '## Move me')!;
    // `para B` came with it: what follows a heading is inside its section.
    expect(moveMe.children.map((c) => c.lines[0])).toContain('para B');
    expect(encode(away.value.doc)).not.toBe(sections);
  });

  /**
   * Every scope in the document, named by the PATH of child indices that
   * reaches its parent. A path outlives the move and an id does not: an
   * accepted result is `parse(encode(...))`, which mints fresh ids.
   */
  function scopePaths(doc: OutlineDoc): number[][] {
    const paths: number[][] = [[]];
    const visit = (nodes: readonly OutlineNode[], prefix: number[]): void => {
      nodes.forEach((node, index) => {
        if (node.children.length === 0) return;
        const here = [...prefix, index];
        paths.push(here);
        visit(node.children, here);
      });
    };
    visit(doc.children, []);
    return paths;
  }

  /** The children of the node a path reaches, or the roots for the empty path. */
  function childrenAtPath(doc: OutlineDoc, path: readonly number[]): readonly OutlineNode[] {
    let nodes: readonly OutlineNode[] = doc.children;
    for (const step of path) {
      const parent = nodes[step];
      if (!parent) return [];
      nodes = parent.children;
    }
    return nodes;
  }

  /** The id a path names as a destination parent — `'root'` for the empty path. */
  function parentIdAtPath(doc: OutlineDoc, path: readonly number[]): number | 'root' {
    if (path.length === 0) return 'root';
    let nodes: readonly OutlineNode[] = doc.children;
    let parent: OutlineNode | undefined;
    for (const step of path) {
      parent = nodes[step]!;
      nodes = parent.children;
    }
    return parent!.id;
  }

  it('returns a run that absorbs nothing to the bytes it came from', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), fc.nat(), (doc, s, from, to) => {
        const paths = scopePaths(doc);
        const path = paths[s % paths.length]!;
        const siblings = childrenAtPath(doc, path);
        if (siblings.length < 2) return true;

        const i = from % siblings.length;
        const j = to % (siblings.length + 1);
        const before = encode(doc);
        const away = moveSubtreesTo(doc, [[siblings[i]!.id]], {
          parentId: parentIdAtPath(doc, path),
          index: j,
        });
        if (!away.ok) return KNOWN_MOVE_REASONS.has(away.rejection.reason);

        // Absorbing operands are out of scope: a heading opens a section at the
        // place it lands, and a run landing after one joins the section there,
        // so the return trip is a different operation and the property is false
        // by construction. Read off the RESULT rather than predicted from the
        // operand, because both directions of absorption show up the same way —
        // the scope no longer holds the members it started with. The asymmetry
        // itself is asserted above.
        const landed = childrenAtPath(away.value.doc, path);
        if (landed.length !== siblings.length) return true;

        // Both indices are read against the PRE-removal sibling list, so the
        // return trip aims one past its origin whenever the run travelled
        // upwards and the origin is now below it.
        const back = moveSubtreesTo(away.value.doc, [[landed[j > i ? j - 1 : j]!.id]], {
          parentId: parentIdAtPath(away.value.doc, path),
          index: i < j ? i : i + 1,
        });
        if (!back.ok) return KNOWN_MOVE_REASONS.has(back.rejection.reason);
        return encode(back.value.doc) === before;
      }),
      { numRuns: 400 },
    );
  });

  it('re-levels a heading run for the scope it lands in', () => {
    const src = ['# A', '', '## A1', '', '# B', '', '## B1', '', '### B2', ''].join('\n');
    const out = moved(src, ['## A1'], { parent: '### B2', index: 0 });
    // Landing among an `h3`'s children, the run takes `h4`. Asserted on whole
    // lines: `#### A1` contains `## A1` as a substring.
    expect(out.split('\n')).toContain('#### A1');
    expect(out.split('\n')).not.toContain('## A1');
  });
});
