import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeNode, type OutlineDoc } from '../src/model';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { arbMarkdownText } from './generators';
import { planKey } from '../src/plugin/grammar';
import {
  caretGuideScope,
  computeLineGuides,
  computePositionTrail,
  decorate,
  hasSingleRoot,
  visibleGuideDepths,
  positionBisectsANode,
  resolvedOutline,
  materializeProbe,
  materializeProvisional,
  provisionalFact,
  shiftCaretScope,
  shiftLines,
  shiftTrail,
  zoomAwareCaretScope,
  zoomAwarePositionTrail,
  type LineDecorationFact,
  type PositionHighlight,
} from '../src/plugin/decorate';
import { resolveZoom } from '../src/zoom';

describe('decorate: indentation depth', () => {
  it('agrees across heading, list, and paragraph-adjacency encodings', () => {
    const md = [
      '# Top',
      '',
      '## Mid',
      '',
      '### Deep heading',
      '',
      '- item',
      '  - nested item',
      '',
      'Parent para.',
      '- Child para as list item.',
      '',
    ].join('\n');
    const doc = parse(md);
    const facts = decorate(doc);

    // "# Top" depth 0, "## Mid" depth 1, "### Deep heading" depth 2 (tree
    // position, not raw '#' count minus one).
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
    expect(byLine.get(0)?.depth).toBe(0); // # Top
    expect(byLine.get(2)?.depth).toBe(1); // ## Mid
    expect(byLine.get(4)?.depth).toBe(2); // ### Deep heading

    // "- item" is a top-level list under "### Deep heading" -> depth 3;
    // "  - nested item" is its child -> depth 4.
    expect(byLine.get(6)?.depth).toBe(3); // - item
    expect(byLine.get(7)?.depth).toBe(4); // nested item

    // Paragraph-adjacency: "Parent para." top-level under the deep heading
    // (depth 3, sibling of "- item"); its list-item-encoded paragraph child
    // is depth 4 - matching the nested list item's depth exactly.
    const parentLine = md.split('\n').indexOf('Parent para.');
    const childLine = md.split('\n').indexOf('- Child para as list item.');
    expect(byLine.get(parentLine)?.depth).toBe(3);
    expect(byLine.get(childLine)?.depth).toBe(4);
  });

  it('excludes trailing gap (blank separator) lines', () => {
    const md = 'First.\n\nSecond.\n';
    const doc = parse(md);
    const facts = decorate(doc);
    const lines = facts.map((f) => f.lineNumber);
    expect(lines).toEqual([0, 2]); // line 1 is the blank gap, no fact
  });

  it('includes multiline node continuation lines at the node’s own depth', () => {
    const md = '- item\n  continuation\n';
    const doc = parse(md);
    const facts = decorate(doc);
    expect(facts.map((f) => f.lineNumber)).toEqual([0, 1]);
    expect(facts[0]!.depth).toBe(0);
    expect(facts[1]!.depth).toBe(0);
  });

  it('produces no facts for an empty document or preamble-only document', () => {
    expect(decorate(parse(''))).toEqual([]);
    expect(decorate(parse('---\nt: 1\n---\n'))).toEqual([]);
  });

  it('decorates every node kind, including atoms', () => {
    const md = '# Heading\n\nPara.\n\n- item\n\n```\ncode\n```\n';
    const doc = parse(md);
    const facts = decorate(doc);
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));

    expect(byLine.has(0)).toBe(true); // # Heading
    expect(byLine.has(2)).toBe(true); // Para.
    expect(byLine.has(4)).toBe(true); // - item
    expect(byLine.has(6)).toBe(true); // ```
    expect(byLine.has(7)).toBe(true); // code
    expect(byLine.has(8)).toBe(true); // ```
  });
});

describe('decorate: first line / native marker flags', () => {
  it('marks only the first line of each node as isFirstLine', () => {
    const md = 'Para one\nsecond line\n\n- list item\n  continuation\n\n## Heading\n';
    const doc = parse(md);
    const facts = decorate(doc);
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));

    expect(byLine.get(0)?.isFirstLine).toBe(true); // "Para one"
    expect(byLine.get(1)?.isFirstLine).toBe(false); // "second line"
    expect(byLine.get(3)?.isFirstLine).toBe(true); // "- list item"
    expect(byLine.get(4)?.isFirstLine).toBe(false); // list continuation
    expect(byLine.get(6)?.isFirstLine).toBe(true); // "## Heading"
  });

  it('flags hasNativeMarker only for list-item first lines', () => {
    const md = 'Para one\n\n- list item\n  continuation\n\n## Heading\n\n```\ncode\n```\n';
    const doc = parse(md);
    const facts = decorate(doc);
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));

    expect(byLine.get(0)?.hasNativeMarker).toBe(false); // "Para one"
    expect(byLine.get(2)?.hasNativeMarker).toBe(true); // "- list item"
    expect(byLine.get(3)?.hasNativeMarker).toBe(false); // continuation, not first line
    expect(byLine.get(5)?.hasNativeMarker).toBe(false); // "## Heading"
    expect(byLine.get(7)?.hasNativeMarker).toBe(false); // code fence opener
  });

  it('flags isAtom only for atom-kind nodes, every one of their lines', () => {
    const md = 'Para one\n\n- list item\n\n## Heading\n\n```\ncode line\n```\n';
    const doc = parse(md);
    const facts = decorate(doc);
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));

    expect(byLine.get(0)?.isAtom).toBe(false); // "Para one"
    expect(byLine.get(2)?.isAtom).toBe(false); // "- list item"
    expect(byLine.get(4)?.isAtom).toBe(false); // "## Heading"
    expect(byLine.get(6)?.isAtom).toBe(true); // ``` (opener)
    expect(byLine.get(7)?.isAtom).toBe(true); // "code line"
    expect(byLine.get(8)?.isAtom).toBe(true); // ``` (closer)
  });
});

describe('decorate: node kind (Experiment 5, block markers)', () => {
  it('carries the node kind at every line, including list-item continuations', () => {
    const md = [
      '# Heading',
      '',
      'Para.',
      '',
      '- item',
      '  continuation',
      '',
      '```',
      'code',
      '```',
      '',
      '> quoted',
      '',
    ].join('\n');
    const doc = parse(md);
    const facts = decorate(doc);
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));

    expect(byLine.get(0)?.kind).toBe('heading');
    expect(byLine.get(2)?.kind).toBe('paragraph');
    expect(byLine.get(4)?.kind).toBe('list-item');
    expect(byLine.get(5)?.kind).toBe('list-item'); // continuation carries the same kind
    expect(byLine.get(7)?.kind).toBe('code');
    expect(byLine.get(8)?.kind).toBe('code');
    expect(byLine.get(9)?.kind).toBe('code');
    expect(byLine.get(11)?.kind).toBe('quote');
  });

  it('carries whether the node has children, constant across its own lines', () => {
    // Separate, minimal fixtures per case — a paragraph/list-item followed
    // by more content nests that content as a CHILD (same adjacency rule
    // MIXED_MD's own "Parent para." + list item relies on), so isolating
    // each case avoids accidentally testing the wrong node's children.
    const headingWithChild = decorate(parse('# H\n\npara\n'));
    expect(headingWithChild.find((f) => f.lineNumber === 0)?.hasChildren).toBe(true);
    expect(headingWithChild.find((f) => f.lineNumber === 2)?.hasChildren).toBe(false); // leaf para

    const listItems = decorate(parse('- item\n  - nested\n\n- item2\n'));
    expect(listItems.find((f) => f.lineNumber === 0)?.hasChildren).toBe(true); // has nested
    expect(listItems.find((f) => f.lineNumber === 3)?.hasChildren).toBe(false); // no children

    const code = decorate(parse('```\ncode\n```\n'));
    expect(code.every((f) => f.hasChildren === false)).toBe(true); // atoms are always leaves
  });
});

describe('decorate: supplemental depth (additive list margin)', () => {
  it('flags isListItem for every line of a list item, including continuations', () => {
    const md = 'Para.\n\n- item\n  continuation\n\n## Heading\n';
    const doc = parse(md);
    const facts = decorate(doc);
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));

    expect(byLine.get(0)?.isListItem).toBe(false); // "Para."
    expect(byLine.get(2)?.isListItem).toBe(true); // "- item"
    expect(byLine.get(3)?.isListItem).toBe(true); // continuation
    expect(byLine.get(5)?.isListItem).toBe(false); // "## Heading"
  });

  it('is 0 for a list with no non-list-item ancestors (byte-identical invariant)', () => {
    const md = [
      '- level 1',
      '  1. level 2',
      '     - level 3',
      '',
    ].join('\n');
    const doc = parse(md);
    const facts = decorate(doc);
    for (const f of facts) {
      if (f.isListItem) expect(f.supplementalDepth).toBe(0);
    }
  });

  it('is constant across an entire nested list under a heading, equal to the root’s own depth', () => {
    const md = ['# Section', '', '- top item', '  - nested item', '    - deeply nested', ''].join(
      '\n',
    );
    const doc = parse(md);
    const facts = decorate(doc);
    const listFacts = facts.filter((f) => f.isListItem);
    expect(listFacts.length).toBeGreaterThan(0);
    // "- top item" is depth 1 (under "# Section"): that's the root's own
    // depth, so every item in the chain — regardless of how deeply nested
    // within the list — carries the same supplementalDepth.
    for (const f of listFacts) expect(f.supplementalDepth).toBe(1);
  });

  it('re-roots at a list item that starts a new chain under a non-list-item ancestor', () => {
    const md = ['Parent para.', '- Child para as list item.', ''].join('\n');
    const doc = parse(md);
    const facts = decorate(doc);
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
    const childLine = md.split('\n').indexOf('- Child para as list item.');
    const child = byLine.get(childLine)!;
    expect(child.isListItem).toBe(true);
    expect(child.depth).toBe(1);
    // Its own depth is the chain root's depth, since its parent (a
    // paragraph) is not itself a list item.
    expect(child.supplementalDepth).toBe(1);
  });

  it('recomputes independently for separate lists under separate heading depths', () => {
    const md = ['# A', '', '- one', '', '## B', '', '- two', '  - two nested', ''].join('\n');
    const doc = parse(md);
    const facts = decorate(doc);
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
    // "- one" (depth 1, under "# A") roots its own 1-item list at 1.
    expect(byLine.get(2)?.supplementalDepth).toBe(1);
    // "- two" (depth 2, under "## B") roots a separate list at 2; its
    // nested child inherits that root, not "- one"'s.
    expect(byLine.get(6)?.supplementalDepth).toBe(2);
    expect(byLine.get(7)?.supplementalDepth).toBe(2);
  });

  it('is 0 (unused) for non-list-item nodes', () => {
    const md = '# Heading\n\nPara.\n\n```\ncode\n```\n';
    const doc = parse(md);
    const facts = decorate(doc);
    for (const f of facts) {
      if (!f.isListItem) expect(f.supplementalDepth).toBe(0);
    }
  });
});

describe('computeLineGuides: per-line active guide depths (Experiment 2b)', () => {
  it('produces empty guideDepths for every line of a flat, childless document', () => {
    const md = 'First.\n\nSecond.\n\nThird.\n';
    const facts = computeLineGuides(parse(md));
    expect(facts.every((f) => f.guideDepths.length === 0)).toBe(true);
  });

  it("a leaf node's own line has no active guide (only strict ancestors count)", () => {
    const md = '- lone item\n';
    const facts = computeLineGuides(parse(md));
    const own = facts.find((f) => f.lineNumber === 0)!;
    expect(own.guideDepths).toEqual([]);
    expect(own.isGapLine).toBe(false);
  });

  it('flags every fact isGapLine: false except a leaf’s own trailing blank separator lines', () => {
    const md = 'First.\n\nSecond.\n';
    const facts = computeLineGuides(parse(md));
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
    expect(byLine.get(0)?.isGapLine).toBe(false); // "First."
    expect(byLine.get(1)?.isGapLine).toBe(true); // blank separator
    expect(byLine.get(2)?.isGapLine).toBe(false); // "Second."
  });

  it('a non-list ancestor bridges a guide onto every descendant line, including list-item ones', () => {
    const md = [
      '# Section',
      '',
      '- top item',
      '  - nested item',
      '    - deeply nested item',
      '',
    ].join('\n');
    const facts = computeLineGuides(parse(md));
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
    // "# Section" itself (line 0) is the owner, not a descendant of itself.
    expect(byLine.get(0)?.guideDepths).toEqual([]);
    // Every descendant line — all three list items — carries depth 0's
    // guide, regardless of how deeply nested within the list itself.
    expect(byLine.get(2)?.guideDepths).toEqual([0]); // - top item
    expect(byLine.get(3)?.guideDepths).toEqual([0]); // - nested item
    expect(byLine.get(4)?.guideDepths).toEqual([0]); // - deeply nested item
  });

  it('a pure list nesting (no non-list ancestor) has no active guide anywhere', () => {
    const md = [
      '- level 1 (bullet)',
      '  1. level 2 (ordered)',
      '     - level 3 (bullet)',
      '       1. level 4 (ordered)',
      '',
    ].join('\n');
    const facts = computeLineGuides(parse(md));
    expect(facts.every((f) => f.guideDepths.length === 0)).toBe(true);
  });

  it('a list item never itself owns a guide for its own children', () => {
    const md = ['- parent', '  - child', ''].join('\n');
    const facts = computeLineGuides(parse(md));
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
    expect(byLine.get(1)?.guideDepths).toEqual([]); // "  - child"
  });

  it('carries an outer list ancestor’s guide past a non-list child', () => {
    // heading(0) > item(1) > paragraph(2) > item(2): the paragraph is a child of
    // the outer item, and the item after it is the paragraph's SIBLING. Both
    // are still inside the outer item, so both must keep it on the list track —
    // a non-list node contributes nothing to that track but must not clear it.
    const md = ['# H', '', '- outer item', '', '\ttext under the item', '\t- inner item', ''].join(
      '\n',
    );
    const facts = computeLineGuides(parse(md));
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
    expect(byLine.get(4)?.listGuideDepths).toEqual([1]); // the paragraph child
    expect(byLine.get(5)?.listGuideDepths).toEqual([1]); // the item after it
    expect(byLine.get(4)?.guideDepths).toEqual([0]);
    expect(byLine.get(5)?.guideDepths).toEqual([0]);
  });

  it('reports the list track for every shape a list can take', () => {
    const depthsOf = (md: string) =>
      computeLineGuides(parse(md)).map((f) => [
        f.lineNumber,
        [...f.guideDepths],
        [...f.listGuideDepths],
        f.isGapLine,
      ]);

    // A pure list: no non-list ancestor anywhere, so the whole hierarchy is on
    // the list track and `guideDepths` stays empty throughout.
    expect(depthsOf(['- one', '\t- two', '\t\t- three', ''].join('\n'))).toEqual([
      [0, [], [], false],
      [1, [], [0], false],
      [2, [], [0, 1], false],
      // The file's last line: nothing of any of these subtrees remains below
      // it, so the tail carries none of them.
      [3, [], [], true],
    ]);

    // Under a heading, both tracks are populated and neither absorbs the other.
    expect(depthsOf(['# H', '', '- one', '\t- two', ''].join('\n'))).toEqual([
      [0, [], [], false],
      [1, [0], [], true],
      [2, [0], [], false],
      [3, [0], [1], false],
      [4, [], [], true],
    ]);

    // A list attached to a paragraph sits one level deeper — the paragraph owns
    // a guide on the non-list track, the items on the list track.
    expect(depthsOf(['Para.', '- one', '\t- two', ''].join('\n'))).toEqual([
      [0, [], [], false],
      [1, [0], [], false],
      [2, [0], [1], false],
      [3, [], [], true],
    ]);

    // A multi-line item's continuation carries exactly what its first line does.
    expect(depthsOf(['# H', '', '- one', '\t- two', '\t  still two', ''].join('\n'))).toEqual([
      [0, [], [], false],
      [1, [0], [], true],
      [2, [0], [], false],
      [3, [0], [1], false],
      [4, [0], [1], false],
      [5, [], [], true],
    ]);

    // A blank line between two items keeps both tracks, so a guide drawn from
    // either does not break across the gap — the half of the rule the tail cut
    // leaves alone: line 1 has content of the same ancestry below it, line 4
    // does not.
    expect(depthsOf(['- one', '', '- two', '\t- child', ''].join('\n'))).toEqual([
      [0, [], [], false],
      [1, [], [], true],
      [2, [], [], false],
      [3, [], [0], false],
      [4, [], [], true],
    ]);
  });

  it('carries the list track through a non-list node that OWNS children', () => {
    // The shape the walk has to be right about and the parser does not
    // currently produce: a paragraph with children, inside a list chain.
    // Built directly, because the invariant belongs to the walk rather than to
    // whichever trees today's attachment rule happens to build — an earlier
    // version reset the track to empty at every non-list node, which drops an
    // ancestor that is still an ancestor.
    const doc: OutlineDoc = {
      preamble: [],
      children: [
        makeNode({
          kind: 'list-item',
          lines: ['- outer item'],
          children: [
            makeNode({
              kind: 'paragraph',
              lines: ['text under the item'],
              children: [
                makeNode({ kind: 'list-item', lines: ['- inner item'] }),
              ],
            }),
          ],
        }),
      ],
    };
    const byLine = new Map(computeLineGuides(doc).map((f) => [f.lineNumber, f]));
    expect(byLine.get(2)?.guideDepths).toEqual([1]); // the paragraph owns one
    expect(byLine.get(2)?.listGuideDepths).toEqual([0]); // and the item above it still does
  });

  it('a multi-line (Shift+Enter) node’s continuation line inherits the same guideDepths as its first line', () => {
    const md = ['# Parent', '', '- child first line', '  second line of child', ''].join('\n');
    const facts = computeLineGuides(parse(md));
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
    expect(byLine.get(2)?.guideDepths).toEqual([0]); // first line
    expect(byLine.get(3)?.guideDepths).toEqual([0]); // continuation line
  });

  it('nests: a deeper non-list ancestor’s own guide is appended to its parent’s, not replacing it', () => {
    const md = ['# A', '', '## B', '', '### C', '', 'para', ''].join('\n');
    const doc = parse(md);
    const facts = computeLineGuides(doc);
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
    // Lines: 0 "# A", 2 "## B", 4 "### C", 6 "para".
    expect(byLine.get(0)?.guideDepths).toEqual([]); // A: no ancestors
    expect(byLine.get(2)?.guideDepths).toEqual([0]); // B: under A
    expect(byLine.get(4)?.guideDepths).toEqual([0, 1]); // C: under A, B
    expect(byLine.get(6)?.guideDepths).toEqual([0, 1, 2]); // para: under A, B, C
  });

  it('is a strict superset of decorate()’s line coverage (every decorate() line plus gap-only lines)', () => {
    const md = [
      '# Top',
      '',
      '## Mid',
      '',
      '- item',
      '  - nested item',
      '',
      'Parent para.',
      '- Child para as list item.',
      '',
      '```js',
      'code line',
      '```',
      '',
    ].join('\n');
    const doc = parse(md);
    const decorateLines = new Set(decorate(doc).map((f) => f.lineNumber));
    const guideLines = new Set(computeLineGuides(doc).map((f) => f.lineNumber));
    for (const line of decorateLines) expect(guideLines.has(line)).toBe(true);
    // At least one gap-only line exists (e.g. the blank line after "- item"'s
    // "  - nested item" chain) that decorate() has no fact for at all.
    expect(guideLines.size).toBeGreaterThan(decorateLines.size);
  });

  describe('gap-line guide continuity (blank separators between siblings)', () => {
    it('a leaf’s trailing blank line inherits the SAME guideDepths as its own content, for guide continuity', () => {
      // "# Section" (depth 0, owns a guide) -> "para one" (leaf, depth 1)
      // -> blank line -> "para two" (leaf, depth 1, sibling of para one).
      const md = ['# Section', '', 'para one', '', 'para two', ''].join('\n');
      const facts = computeLineGuides(parse(md));
      const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
      expect(byLine.get(2)?.guideDepths).toEqual([0]); // "para one"
      expect(byLine.get(3)?.guideDepths).toEqual([0]); // blank line between them
      expect(byLine.get(3)?.isGapLine).toBe(true);
      expect(byLine.get(4)?.guideDepths).toEqual([0]); // "para two"
    });

    it('a node WITH children ALSO gets a gap fact before its own first child, using childGuideDepths', () => {
      // "# Section" has a child ("para"), so its own trailingGap (the blank
      // line right after "# Section") is "before my first child" — already
      // inside "# Section"'s own subtree, so it carries the SAME guideDepths
      // "para" itself gets ([0], from "# Section" newly owning a guide),
      // not the empty guideDepths "# Section" itself had. An earlier version
      // left this case uncovered on the reasoning that Experiment 2a's own
      // overlay span doesn't cover it either — true, but an incidental
      // artifact of 2a's span computation, not a deliberate goal; real-vault
      // review found the guide visibly stopping short here, so this is a
      // genuine improvement over 2a's behavior, not mere parity with it.
      const md = ['# Section', '', 'para', ''].join('\n');
      const facts = computeLineGuides(parse(md));
      const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
      expect(byLine.get(1)?.guideDepths).toEqual([0]); // blank line right after "# Section"
      expect(byLine.get(1)?.isGapLine).toBe(true);
      expect(byLine.get(2)?.guideDepths).toEqual([0]); // "para"
    });

    it('gap lines between list items stay empty (list items own no guide, matching their content lines)', () => {
      const md = ['# Section', '', '- one', '', '- two', ''].join('\n');
      const facts = computeLineGuides(parse(md));
      const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
      // Both list items bridge "# Section"'s guide (depth 0)...
      expect(byLine.get(2)?.guideDepths).toEqual([0]); // "- one"
      expect(byLine.get(4)?.guideDepths).toEqual([0]); // "- two"
      // ...and so does the gap between them, for the same reason a gap
      // between two non-list siblings does.
      expect(byLine.get(3)?.guideDepths).toEqual([0]);
      expect(byLine.get(3)?.isGapLine).toBe(true);
    });

    it('no gap fact at all when guideDepths would be empty anyway (top-level, no ancestor)', () => {
      const md = 'First.\n\nSecond.\n';
      const facts = computeLineGuides(parse(md));
      const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
      // The fact still exists (isGapLine: true) but decorations.ts skips
      // rendering when guideDepths is empty — verified structurally here.
      expect(byLine.get(1)?.guideDepths).toEqual([]);
    });
  });

  describe('guide tails (a guide ends at its subtree’s last content line)', () => {
    const byLine = (md: string) =>
      new Map(computeLineGuides(parse(md)).map((f) => [f.lineNumber, f]));

    it('ends a guide at its subtree’s last content line, not in the blanks below it', () => {
      // 0 "# Doc"  1 ""  2 "## A"  3 ""  4 "para"  5 ""  6 ""  7 "## B"  8 ""  9 "other"
      const md = ['# Doc', '', '## A', '', 'para', '', '', '## B', '', 'other', ''].join('\n');
      const g = byLine(md);
      expect(g.get(4)?.guideDepths).toEqual([0, 1]); // "para", inside both
      // The blanks are past everything "## A" contains, and "## B" is at A's own
      // level — so A's guide stops at "para" while "# Doc"'s carries on.
      expect(g.get(5)?.guideDepths).toEqual([0]);
      expect(g.get(6)?.guideDepths).toEqual([0]);
      expect(g.get(7)?.guideDepths).toEqual([0]); // "## B"'s own line
    });

    it('does not run a guide off the end of the document', () => {
      const g = byLine(['# Doc', '', '## A', '', 'para', ''].join('\n'));
      expect(g.get(4)?.guideDepths).toEqual([0, 1]);
      expect(g.get(5)?.guideDepths).toEqual([]);
      // Still a fact, and still flagged — only its depths narrowed.
      expect(g.get(5)?.isGapLine).toBe(true);
    });

    it('ends every guide one run of blanks closes on the SAME row', () => {
      // 0 "# A"  1 ""  2 "## B"  3 ""  4 "### C"  5 ""  6 "deep"  7 ""  8 ""  9 "# A2"
      const md = ['# A', '', '## B', '', '### C', '', 'deep', '', '', '# A2', '', 'x', ''].join(
        '\n',
      );
      const g = byLine(md);
      expect(g.get(6)?.guideDepths).toEqual([0, 1, 2]); // "deep"
      // Every row of the run has the same content line below it ("# A2", which
      // is inside none of the three), so all three end together on "deep"
      // rather than dropping out one row at a time.
      expect(g.get(7)?.guideDepths).toEqual([]);
      expect(g.get(8)?.guideDepths).toEqual([]);
    });

    it('ends guides at different depths on different rows when content separates them', () => {
      // 0 "# A"  1 "## B"  2 "in B"  3 ""  4 "## B2"  5 "in B2"  6 ""
      const md = ['# A', '## B', 'in B', '', '## B2', 'in B2', ''].join('\n');
      const g = byLine(md);
      // "## B" holds nothing below "in B", so its guide ends there — but "# A"
      // holds "## B2" below, so its guide runs through the blank and on.
      expect(g.get(2)?.guideDepths).toEqual([0, 1]);
      expect(g.get(3)?.guideDepths).toEqual([0]);
      expect(g.get(5)?.guideDepths).toEqual([0, 1]);
      expect(g.get(6)?.guideDepths).toEqual([]);
    });

    it('treats a blank line INSIDE an atom as content, not as a tail', () => {
      // A fenced block swallows every line to its close, blank ones included,
      // so the blank at 4 is one of the atom's own lines: nothing has ended
      // there and the guide runs straight through it.
      const md = ['# H', '', '```js', 'a', '', 'b', '```', ''].join('\n');
      const g = byLine(md);
      expect(g.get(4)?.isGapLine).toBe(false);
      expect(g.get(4)?.guideDepths).toEqual([0]);
      expect(g.get(3)?.guideDepths).toEqual([0]);
      expect(g.get(5)?.guideDepths).toEqual([0]);
      expect(g.get(7)?.guideDepths).toEqual([]); // the real tail
    });

    it('extends the guide to an open provisional position, and to the blanks between', () => {
      // 0 "# H"  1 ""  2 "## A"  3 ""  4 "para"  5 ""  6 ""
      const md = ['# H', '', '## A', '', 'para', '', ''].join('\n');
      const closed = byLine(md);
      expect(closed.get(5)?.guideDepths).toEqual([]);
      expect(closed.get(6)?.guideDepths).toEqual([]);

      // The SAME document with a position open on line 6, which is what makes
      // this control exact: nothing about the text differs, only the caret.
      const open = new Map(
        computeLineGuides(parse(md), 6).map((f) => [f.lineNumber, f]),
      );
      expect(open.get(6)?.guideDepths).toEqual([0, 1]);
      // And the row between, or the extension would have a hole in it.
      expect(open.get(5)?.guideDepths).toEqual([0, 1]);
    });

    it('adds no DEPTH: a childless node with a position below it owns no guide', () => {
      // "## A" has no children, so it owns no guide anywhere in this document.
      // The position stands for one — rendering it would be rendering a node
      // that does not exist yet.
      const md = ['# H', '', '## A', ''].join('\n');
      const open = new Map(
        computeLineGuides(parse(md), 3).map((f) => [f.lineNumber, f]),
      );
      expect(open.get(3)?.guideDepths).toEqual([0]);
    });

    it('cuts a list tail like any other, on both tracks', () => {
      // 0 "# H"  1 ""  2 "- one"  3 "\t- two"  4 ""  5 "# H2"
      const md = ['# H', '', '- one', '\t- two', '', '# H2', ''].join('\n');
      const g = byLine(md);
      expect(g.get(3)?.guideDepths).toEqual([0]);
      expect(g.get(3)?.listGuideDepths).toEqual([1]);
      // Nothing of the heading's subtree or of "- one"'s remains below.
      expect(g.get(4)?.guideDepths).toEqual([]);
      expect(g.get(4)?.listGuideDepths).toEqual([]);
    });
  });
});

describe('visibleGuideDepths: which of a line’s guides are drawn', () => {
  /** Two sections, each with a child, so depth 0 belongs to two different
   * ancestors — the case a set of depths alone cannot tell apart. */
  const md = ['# One', '', 'under one', '', '# Two', '', 'under two', ''].join('\n');
  const doc = parse(md);
  const guides = new Map(computeLineGuides(doc).map((g) => [g.lineNumber, g]));
  /** "under two" — inside `# Two`, which owns a guide at depth 0. */
  const UNDER_TWO = 6;
  /** "under one" — inside `# One`, which owns its own guide at depth 0. */
  const UNDER_ONE = 2;

  const ctx = (over: Partial<Parameters<typeof visibleGuideDepths>[1]> = {}) => ({
    visibility: 'all' as const,
    hideSingleRoot: false,
    singleRoot: hasSingleRoot(doc),
    caret: null,
    ...over,
  });

  const drawn = (line: number, over = {}): readonly number[] =>
    visibleGuideDepths(guides.get(line)!.guideDepths, ctx(over), line);

  it('draws every ancestor level by default', () => {
    expect(drawn(UNDER_ONE)).toEqual([0]);
    expect(drawn(UNDER_TWO)).toEqual([0]);
  });

  it('draws nothing at all when the layer is off', () => {
    expect(drawn(UNDER_ONE, { visibility: 'off' })).toEqual([]);
    expect(drawn(UNDER_TWO, { visibility: 'off' })).toEqual([]);
  });

  it('draws only the levels the cursor is inside — by ancestor, not by depth', () => {
    // The caret is in "under two". Both rows carry a guide at depth 0, and only
    // one of those depth-0 guides belongs to an ancestor of the caret's node. A
    // filter keyed on depth alone would keep the sibling section's guide lit.
    const caret = caretGuideScope(doc, UNDER_TWO);
    expect(drawn(UNDER_TWO, { visibility: 'ancestors', caret })).toEqual([0]);
    expect(drawn(UNDER_ONE, { visibility: 'ancestors', caret })).toEqual([]);
  });

  describe('the caret’s own node, and what hangs off it', () => {
    // One root with two levels below it, so a caret in the middle has an
    // ancestor above, a guide of its own, and a descendant's guide below.
    //
    //  0 # Root                            depth 0
    //  2 ## Mid    <- the caret's node       depth 1, owns the depth-1 guide
    //  4 ### Deep  <- inside it              depth 2, owns the depth-2 guide
    //  6 body      <- inside both            depth 3
    //  8 ## Other  <- a sibling of Mid       depth 1, outside the subtree
    // 10 other body                          depth 2
    const nested = parse(
      ['# Root', '', '## Mid', '', '### Deep', '', 'body', '', '## Other', '', 'other body', ''].join(
        '\n',
      ),
    );
    const nestedGuides = new Map(computeLineGuides(nested).map((g) => [g.lineNumber, g]));
    const at = (
      line: number,
      over: Partial<Parameters<typeof visibleGuideDepths>[1]> = {},
    ): readonly number[] =>
      visibleGuideDepths(
        nestedGuides.get(line)!.guideDepths,
        {
          visibility: 'all',
          hideSingleRoot: false,
          singleRoot: hasSingleRoot(nested),
          caret: null,
          ...over,
        },
        line,
      );
    const CARET_IN_MID = 2;
    const DEEP = 4;
    const BODY = 6;
    const OTHER_BODY = 10;

    it('the whole ladder is what every other mode is a subset of', () => {
      expect(at(DEEP, {})).toEqual([0, 1]);
      expect(at(BODY, {})).toEqual([0, 1, 2]);
      expect(at(OTHER_BODY, {})).toEqual([0, 1]);
    });

    it('“subtree” adds the guides owned inside that node', () => {
      const caret = caretGuideScope(nested, CARET_IN_MID);
      // A row inside Deep carries Mid's own guide AND Deep's, both owned within
      // the caret's subtree — and not the root's, which is above it.
      expect(at(BODY, { visibility: 'subtree', caret })).toEqual([1, 2]);
      expect(at(DEEP, { visibility: 'subtree', caret })).toEqual([1]);
      expect(at(OTHER_BODY, { visibility: 'subtree', caret })).toEqual([]);
    });

    it('“subtree” draws nothing for a node with no children', () => {
      // A childless node's own guide has an empty span, and that span is what
      // the mode reads, so there is nothing to draw anywhere.
      const caret = caretGuideScope(nested, OTHER_BODY);
      expect(caret!.ownFrom).toBeGreaterThan(caret!.ownTo);
      expect(at(BODY, { visibility: 'subtree', caret })).toEqual([]);
      expect(at(OTHER_BODY, { visibility: 'subtree', caret })).toEqual([]);
    });

    it('“ancestors” and “subtree” are duals across the caret’s own node', () => {
      const caret = caretGuideScope(nested, CARET_IN_MID);
      const ancestors = at(BODY, { visibility: 'ancestors', caret });
      const subtree = at(BODY, { visibility: 'subtree', caret });
      // On a row inside the caret's subtree, every guide belongs to exactly one
      // of them: the route down to the caret's node, or the ladder inside it.
      expect([...ancestors, ...subtree].sort()).toEqual(at(BODY, {}));
      expect(ancestors.filter((d) => subtree.includes(d))).toEqual([]);
      // The seam is the caret's own node's column: the shallowest the subtree
      // keeps, and one deeper than the deepest the ancestors do.
      expect(Math.min(...subtree)).toBe(Math.max(...ancestors) + 1);
    });
  });

  it('drops the outermost guide only where the document has a single root', () => {
    // Two roots here, so the outermost guide names something: it is kept.
    expect(drawn(UNDER_TWO, { hideSingleRoot: true })).toEqual([0]);

    const single = parse(['# Title', '', '## Section', '', 'deep', ''].join('\n'));
    const singleGuides = new Map(computeLineGuides(single).map((g) => [g.lineNumber, g]));
    const deep = singleGuides.get(4)!;
    expect(deep.guideDepths).toEqual([0, 1]);
    const singleCtx = {
      visibility: 'all' as const,
      hideSingleRoot: true,
      singleRoot: hasSingleRoot(single),
      caret: null,
    };
    // Only the outermost goes; a single chain below it keeps every level, so
    // the ladder never depends on content several levels away.
    expect(visibleGuideDepths(deep.guideDepths, singleCtx, 4)).toEqual([1]);
  });

  it('a single root with a single child keeps that child’s own guide', () => {
    const single = parse(['# Title', '', '## Only', '', 'deep', ''].join('\n'));
    expect(hasSingleRoot(single)).toBe(true);
    const guide = computeLineGuides(single).find((g) => g.lineNumber === 4)!;
    const out = visibleGuideDepths(
      guide.guideDepths,
      { visibility: 'all', hideSingleRoot: true, singleRoot: true, caret: null },
      4,
    );
    expect(out).toEqual([1]);
  });

  it('reports a single root for the document it is asked about, not for a subtree of it', () => {
    // The qualifier's fact has to come from the document its GUIDES came from.
    // A zoom scope is re-rooted, so it always answers "one root" — reading it
    // for a ladder computed over the whole note drops an outermost guide that
    // names something. The predicate is per-document precisely so the caller
    // has to say which one it means.
    const whole = parse(['# One', '', 'a', '', '# Two', '', 'b', ''].join('\n'));
    expect(hasSingleRoot(whole)).toBe(false);
    const subtree = resolveZoom(whole, 0)!; // zoom into "# One"
    expect(hasSingleRoot(subtree.document)).toBe(true);
  });

  it('reports a single root for one top-level node, and not for two', () => {
    expect(hasSingleRoot(parse('# Only\n\nbody\n'))).toBe(true);
    expect(hasSingleRoot(doc)).toBe(false);
    expect(hasSingleRoot(parse(''))).toBe(false);
  });
});

describe('computePositionTrail: caret-derived accents (hierarchy-position-indicators)', () => {
  const trail = (md: string, cursorLine: number, highlight: PositionHighlight) =>
    computePositionTrail(parse(md), cursorLine, highlight);

  /** The three settings pairs the old single-enum tests were written against,
   * kept as shorthands so each case still reads as one intent. */
  const OFF: PositionHighlight = { guides: 'off', markers: 'off' };
  const FULL: PositionHighlight = { guides: 'full', markers: 'current' };
  const LINEAGE: PositionHighlight = { guides: 'lineage', markers: 'lineage' };

  /** Compact per-line view: line number, then its 'depth:extent' accents. */
  const shape = (t: ReturnType<typeof trail>) =>
    [...t.byLine.values()]
      .sort((a, b) => a.lineNumber - b.lineNumber)
      .map((f) => [f.lineNumber, f.accents.map((a) => `${a.depth}:${a.extent}`).join(',')]);

  /** Which lines carry an accented ancestor marker, and of which kind. */
  const ancestors = (t: ReturnType<typeof trail>) =>
    [...t.ancestorLines.entries()].sort((a, b) => a[0] - b[0]);

  const NESTED = ['# A', '', '## B', '', '### C', '', 'text under C', ''].join('\n');
  //              0     1    2      3    4        5    6              7

  describe('current node', () => {
    it("resolves to the caret's own node and reports its first line", () => {
      expect(trail(NESTED, 4, OFF).currentLine).toBe(4);
      expect(trail(NESTED, 6, OFF).currentLine).toBe(6);
    });

    it('resolves a caret on a continuation line to the node’s FIRST line', () => {
      const md = '# A\n\nfirst\nsecond\nthird\n';
      expect(trail(md, 3, OFF).currentLine).toBe(2);
      expect(trail(md, 4, OFF).currentLine).toBe(2);
    });

    it('resolves a caret on a blank gap line to the node that gap belongs to', () => {
      // Line 1 is "# A"'s own trailing gap; line 3 is "## B"'s.
      expect(trail(NESTED, 1, OFF).currentLine).toBe(0);
      expect(trail(NESTED, 3, OFF).currentLine).toBe(2);
    });

    it('flags whether the current node is a list item (native bullet vs. our marker)', () => {
      const md = '# A\n\n- item\n';
      expect(trail(md, 0, OFF).currentIsListItem).toBe(false);
      expect(trail(md, 2, OFF).currentIsListItem).toBe(true);
    });

    it('reports no current node for an empty or preamble-only document', () => {
      expect(trail('', 0, FULL).currentLine).toBe(null);
      expect(trail('---\ntitle: x\n---\n\n', 1, FULL).currentLine).toBe(null);
    });

    it('reports no current node for a caret past the end of the document', () => {
      expect(trail(NESTED, 99, LINEAGE).currentLine).toBe(null);
    });

    it("is reported even when the trail style is 'off', which draws nothing", () => {
      const t = trail(NESTED, 4, OFF);
      expect(t.currentLine).toBe(4);
      expect(t.byLine.size).toBe(0);
    });
  });

  describe("'guides' style", () => {
    it("accents every strict ancestor's guide across that ancestor's whole subtree", () => {
      // Caret in "### C" (depth 2): ancestors are "# A" (0) and "## B" (1).
      expect(shape(trail(NESTED, 4, FULL))).toEqual([
        [1, '0:full'], // A's gap — inside A's subtree
        [2, '0:full'], // ## B
        [3, '0:full,1:full'], // B's gap — inside both
        [4, '0:full,1:full'], // ### C
        [5, '0:full,1:full'],
        [6, '0:full,1:full'], // text under C — the subtree's last content line
        // Line 7 is the trailing gap below everything. The base guide ends at
        // 6, so an accent there would sit on a column with nothing under it.
      ]);
    });

    it("never accents the current node's own level, only strict ancestors", () => {
      const depths = [...trail(NESTED, 4, FULL).byLine.values()].flatMap((f) =>
        f.accents.map((a) => a.depth),
      );
      expect(depths).not.toContain(2);
    });

    it("leaves a sibling subtree's own guide unaccented", () => {
      const md = ['# One', '', '## Under one', '', '# Two', '', '## Under two', ''].join('\n');
      //           0         1    2              3    4        5    6              7
      const t = trail(md, 6, FULL); // caret under "# Two"
      // Only "# Two"'s subtree is accented; "# One"'s (1-3) is not — and it
      // stops at line 6, its last content line, not in the gap below it.
      expect(shape(t)).toEqual([
        [5, '0:full'],
        [6, '0:full'],
      ]);
    });

    it("ends a 'full' accent exactly where the guide it accents ends", () => {
      // Stated as the relationship rather than as two line numbers: every row an
      // accent lands on carries a guide at that same depth. That is the whole
      // invariant, and it survives a change to either extent.
      const md = ['# A', '', '## B', '', 'para', '', '', '# A2', '', 'x', ''].join('\n');
      const guides = new Map(computeLineGuides(parse(md)).map((g) => [g.lineNumber, g]));
      for (const style of [FULL, LINEAGE]) {
        const t = trail(md, 4, style);
        expect(t.byLine.size).toBeGreaterThan(0);
        for (const [line, fact] of t.byLine) {
          for (const accent of fact.accents) {
            expect(guides.get(line)?.guideDepths).toContain(accent.depth);
          }
        }
      }
    });

    it("draws no 'full' accent on the trailing gap below the subtree", () => {
      // 0 "# A"  1 ""  2 "## B"  3 ""  4 "para"  5 ""  6 ""
      const md = ['# A', '', '## B', '', 'para', '', ''].join('\n');
      const t = trail(md, 4, FULL);
      expect(t.byLine.get(4)?.accents.map((a) => a.depth)).toEqual([0, 1]);
      expect(t.byLine.get(5)).toBeUndefined();
      expect(t.byLine.get(6)).toBeUndefined();
    });

    it("reaches an open position's own row, the way the extended guide does", () => {
      // `computeTrail` computes the trail against the MATERIALIZED document, in
      // which the position's row is a node's own line — so it reaches that row
      // without being told to, and lands where the extended guide lands.
      const md = ['# H', '', '## A', '', 'para', '', ''].join('\n');
      const probe = md.split('\n');
      probe[6] = 'x';
      const open = new Map(computeLineGuides(parse(md), 6).map((g) => [g.lineNumber, g]));
      expect(open.get(6)?.guideDepths).toEqual([0, 1]);
      expect(trail(probe.join('\n'), 6, FULL).byLine.get(6)?.accents.map((a) => a.depth)).toEqual([
        0, 1,
      ]);
    });

    it('accents a depth the document has no guide at, below a childless node', () => {
      // The other side of computing against the materialized document: "## A"
      // is childless in the real one and owns no guide anywhere, but the
      // position makes it a parent, so the trail accents its depth on a row the
      // base layer draws nothing at. Pinned here as a fact about the trail —
      // the clip that answers it lives in `guideBackground`, which imports
      // `obsidian` and so is e2e's to cover, not vitest's.
      const md = ['# H', '', '## A', ''].join('\n');
      const t = trail(['# H', '', '## A', 'x'].join('\n'), 3, FULL);
      expect(t.byLine.get(3)?.accents.map((a) => a.depth)).toEqual([0, 1]);
      const guides = new Map(computeLineGuides(parse(md), 3).map((g) => [g.lineNumber, g]));
      expect(guides.get(3)?.guideDepths).toEqual([0]);
    });

    it('accents a guide on the same gap lines the base guide layer covers', () => {
      const t = trail(NESTED, 6, FULL);
      // Line 5 is C's own gap and line 3 is B's — both inside the accented
      // ancestors' subtrees, matching computeLineGuides' own continuity.
      expect(t.byLine.get(3)?.accents.map((a) => a.depth)).toEqual([0, 1]);
      expect(t.byLine.get(5)?.accents.map((a) => a.depth)).toEqual([0, 1, 2]);
    });

    it('draws nothing at all for a top-level node with no ancestors', () => {
      expect(trail(NESTED, 0, FULL).byLine.size).toBe(0);
    });

    it('accents no ancestor markers — that belongs to the path style', () => {
      expect(ancestors(trail(NESTED, 6, FULL))).toEqual([]);
      expect(ancestors(trail(NESTED, 4, FULL))).toEqual([]);
    });
  });

  describe("'path' style", () => {
    it('runs one connected path from the root to the current node', () => {
      // Caret in "### C" (line 4). A's segment starts on the row AFTER A's own
      // (line 1, its gap) and stops at B's row; B's does the same down to C's
      // row, where the path ends. Nothing is drawn on A's or B's own rows —
      // their accented markers are what connect the segments there.
      expect(shape(trail(NESTED, 4, LINEAGE))).toEqual([
        [1, '0:full'],
        [2, '0:top'],
        [3, '1:full'],
        [4, '1:top'],
      ]);
    });

    it('starts each segment exactly where the guides style starts its own', () => {
      // The two styles differ ONLY in where the accent ENDS. Anything drawn on
      // an ancestor's own row would sit where that ancestor's guide does not
      // exist — and right on top of its own marker, centered on that column.
      const guides = trail(NESTED, 4, FULL);
      const path = trail(NESTED, 4, LINEAGE);
      const firstAccentedLine = (t: ReturnType<typeof trail>, depth: number) =>
        Math.min(
          ...[...t.byLine.values()]
            .filter((f) => f.accents.some((a) => a.depth === depth))
            .map((f) => f.lineNumber),
        );
      expect(firstAccentedLine(path, 0)).toBe(firstAccentedLine(guides, 0));
      expect(firstAccentedLine(path, 1)).toBe(firstAccentedLine(guides, 1));
    });

    it('stops at the current node, never continuing into its own subtree', () => {
      const t = trail(NESTED, 4, LINEAGE);
      expect(Math.max(...[...t.byLine.keys()])).toBe(4); // "### C"'s own line
      expect(t.byLine.has(6)).toBe(false); // "text under C" carries nothing
    });

    it('does not accent the full extent of an ancestor the way guides does', () => {
      const md = ['# A', '', '## B', '', 'tail of A’s subtree', ''].join('\n');
      //           0      1    2      3    4
      const t = trail(md, 2, LINEAGE); // caret in "## B"
      // Line 4 is still inside A's subtree, but below B — nothing there.
      expect(t.byLine.has(4)).toBe(false);
      expect(shape(t)).toEqual([
        [1, '0:full'],
        [2, '0:top'],
      ]);
    });

    it('carries nothing into a sibling subtree', () => {
      const md = ['# One', '', '## Under one', '', '# Two', '', '## Under two', ''].join('\n');
      const t = trail(md, 6, LINEAGE);
      expect(shape(t)).toEqual([
        [5, '0:full'],
        [6, '0:top'],
      ]);
    });

    it('draws nothing for a top-level node — it has no ancestor at all', () => {
      const t = trail(NESTED, 0, LINEAGE);
      expect(t.byLine.size).toBe(0);
      expect(ancestors(t)).toEqual([]);
    });

    it('skips a multi-line ancestor’s OWN rows, continuation lines included', () => {
      const md = ['first line', 'second line', '', '- child', ''].join('\n');
      //           0             1              2    3
      // Lines 0-1 are the ancestor's own; its guide exists on neither, so the
      // accent starts at its gap (line 2). Same rule the guides style follows.
      const t = trail(md, 3, LINEAGE);
      expect(shape(t)).toEqual([
        [2, '0:full'],
        [3, '0:top'],
      ]);
    });

    it("accents every ancestor's own marker, which is what replaced the elbows", () => {
      // Caret in "### C": both "# A" (line 0) and "## B" (line 2) are
      // ancestors, and neither is a list item.
      expect(ancestors(trail(NESTED, 4, LINEAGE))).toEqual([
        [0, false],
        [2, false],
      ]);
      // The current node itself is NOT in there — it has its own accent,
      // under its own setting.
      expect(trail(NESTED, 4, LINEAGE).currentLine).toBe(4);
    });

    it('marks a list-item ancestor as native, so the bullet gets accented', () => {
      const md = ['# A', '', '- one', '  - two', ''].join('\n');
      //           0      1    2        3
      expect(ancestors(trail(md, 3, LINEAGE))).toEqual([
        [0, false], // "# A" — our own marker icon
        [2, true], // "- one" — Obsidian's native bullet
      ]);
    });
  });

  describe('the two axes are independent', () => {
    it('accents ancestor markers with no guides at all — the pure-list rendering', () => {
      const t = trail(NESTED, 4, { guides: 'off', markers: 'lineage' });
      expect(t.byLine.size).toBe(0); // nothing drawn
      expect(ancestors(t)).toEqual([
        [0, false],
        [2, false],
      ]);
    });

    it('draws lineage guides while marking only the current node', () => {
      const t = trail(NESTED, 4, { guides: 'lineage', markers: 'current' });
      expect(shape(t)).toEqual([
        [1, '0:full'],
        [2, '0:top'],
        [3, '1:full'],
        [4, '1:top'],
      ]);
      expect(ancestors(t)).toEqual([]); // ancestors unmarked
      expect(t.currentLine).toBe(4); // the current one still reported
    });

    it('combines full guides with lineage markers', () => {
      const t = trail(NESTED, 4, { guides: 'full', markers: 'lineage' });
      // Full extents, as the guides axis alone would give — through line 6, the
      // last content line, with nothing on the trailing gap at 7.
      expect(t.byLine.get(6)?.accents.map((a) => a.depth)).toEqual([0, 1]);
      expect(t.byLine.get(7)).toBeUndefined();
      // …plus every ancestor's marker, as the markers axis alone would give.
      expect(ancestors(t)).toEqual([
        [0, false],
        [2, false],
      ]);
    });

    it('reports the current node whatever either axis says', () => {
      for (const guides of ['off', 'full', 'lineage'] as const) {
        for (const markers of ['off', 'current', 'lineage'] as const) {
          expect(trail(NESTED, 4, { guides, markers }).currentLine).toBe(4);
        }
      }
    });
  });

  describe('list levels, now on the same grid as every other kind', () => {
    // These three used to assert the opposite: that a list level got no
    // segment, because it had no column this layer could address. That was
    // `hierarchy-position-indicators`' stated omission, and
    // `lists-on-the-outline-grid` closes it by putting every list level at
    // `depth × unit`. They are kept, pointed the other way, so the change of
    // contract is visible in the diff rather than silent.

    it('steps one segment per ancestor, list levels included', () => {
      const md = ['# A', '', '- one', '  - two', '    - three', ''].join('\n');
      //           0      1    2        3          4
      const t = trail(md, 4, LINEAGE); // caret on the deepest list item
      // A(0) hands over to one(1), one hands over to two(2), two arrives at the
      // caret. Every rung draws, and the route is unbroken where it crosses
      // from the heading into the list.
      expect(shape(t)).toEqual([
        [1, '0:full'],
        [2, '0:top'],
        [3, '1:top'],
        [4, '2:top'],
      ]);
      // The ancestor markers are accented as before — the bullets and the
      // segments now describe the same levels rather than standing in for
      // each other.
      expect(ancestors(t)).toEqual([
        [0, false],
        [2, true],
        [3, true],
      ]);
    });

    it('accents every ancestor level in the guides style, list levels included', () => {
      const md = ['# A', '', '- one', '  - two', '    - three', ''].join('\n');
      const t = trail(md, 4, FULL);
      const depths = new Set(
        [...t.byLine.values()].flatMap((f) => f.accents.map((a) => a.depth)),
      );
      expect([...depths].sort()).toEqual([0, 1, 2]);
    });

    it('draws the route inside a pure list, where there is no non-list ancestor at all', () => {
      const md = ['- one', '  - two', '    - three', ''].join('\n');
      //           0        1          2
      const t = trail(md, 2, LINEAGE);
      // one(0) hands over to two(1), two arrives at the caret. Nothing rendered
      // here at all before: a pure list was the case the omission hurt most.
      expect(shape(t)).toEqual([
        [1, '0:top'],
        [2, '1:top'],
      ]);
      expect(t.currentLine).toBe(2);
      expect(t.currentIsListItem).toBe(true);

      const full = trail(md, 2, FULL);
      const depths = new Set(
        [...full.byLine.values()].flatMap((f) => f.accents.map((a) => a.depth)),
      );
      expect([...depths].sort()).toEqual([0, 1]);
    });

    it('accents the ancestor bullets in a pure list, alongside the segments', () => {
      const md = ['- one', '  - two', '    - three', ''].join('\n');
      // Ancestor markers were the ONLY thing legible in a pure list while the
      // segments were omitted. They stay: the bullet is the junction each
      // segment arrives at, which is what replaced the elbows.
      expect(ancestors(trail(md, 2, LINEAGE))).toEqual([
        [0, true],
        [1, true],
      ]);
      expect(ancestors(trail(md, 2, FULL))).toEqual([]);
    });
  });
});

describe('zoomAwarePositionTrail: the caret trail re-based against a zoom scope', () => {
  const LINEAGE: PositionHighlight = { guides: 'lineage', markers: 'lineage' };

  it('is a plain passthrough with no scope', () => {
    const md = ['# A', '## B', '- one', '  - two', ''].join('\n');
    const doc = parse(md);
    const plain = computePositionTrail(doc, 3, LINEAGE);
    expect(zoomAwarePositionTrail(doc, 3, null, LINEAGE)).toEqual(plain);
  });

  it('accents the RE-BASED depth, not the source document’s own', () => {
    // 0 "# A" (depth 0)  1 "## B" (depth 1, zoom root)  2 "- one" (depth 2)
    // 3 "  - two" (depth 3, the caret)  4 "" (trailing gap)
    const md = ['# A', '## B', '- one', '  - two', ''].join('\n');
    const doc = parse(md);
    const scope = resolveZoom(doc, 1)!; // zoom into "## B"
    expect(scope.startLine).toBe(1);

    const zoomed = zoomAwarePositionTrail(doc, 3, scope, LINEAGE);
    // Ancestors are still named by their ABSOLUTE line — "## B" (1) and
    // "- one" (2) — the same lines a marker consumer indexes by whether or
    // not a zoom is active, and the same result the bug (which never touched
    // markers) already produced.
    expect([...zoomed.ancestorLines.keys()].sort()).toEqual([1, 2]);
    expect(zoomed.currentLine).toBe(3);

    // The guide accent is what the bug actually broke. Re-based, "two"'s own
    // row carries depth 1 — its ONE ancestor inside the zoomed subtree,
    // "- one", which the re-rooted sub-document places at depth 1 because the
    // zoom root "## B" now sits at depth 0. The un-rebased computation this
    // replaces would instead put depth 2 there (B's own absolute depth 1 plus
    // one's absolute depth 2, counted from the document's real root) — a
    // stripe that either lands on the wrong guide column once the base guides
    // ARE re-based, or on none at all, in a deeper document where it exceeds
    // what the zoomed view renders.
    const line3 = zoomed.byLine.get(3);
    expect(line3?.accents).toEqual([{ depth: 1, extent: 'top' }]);

    // Cross-checked against the reference computation the fix is built from:
    // running `computePositionTrail` directly on the scope's own re-rooted
    // sub-document, with the cursor translated into its local numbering, then
    // shifting every line number in the result back by `scope.startLine`.
    const local = computePositionTrail(scope.document, 3 - scope.startLine, LINEAGE);
    expect(zoomed.currentLine).toBe(local.currentLine! + scope.startLine);
    expect([...zoomed.ancestorLines.keys()].sort()).toEqual(
      [...local.ancestorLines.keys()].map((l) => l + scope.startLine).sort((a, b) => a - b),
    );
  });

  it('keeps the depth-0 root itself un-accented, the same as unzoomed', () => {
    // The zoom root has no ancestor of its own inside the visible subtree, so
    // its own row carries no guide accent — matching a top-level node's own
    // row unzoomed, which `computePositionTrail`'s own "own rows carry none"
    // rule already gives every other root.
    const md = ['# A', '## B', '- one', ''].join('\n');
    const doc = parse(md);
    const scope = resolveZoom(doc, 1)!;
    const zoomed = zoomAwarePositionTrail(doc, 2, scope, LINEAGE);
    expect(zoomed.byLine.get(1)).toBeUndefined();
  });
});

describe('materializeProvisional: the position derived against the view’s own document', () => {
  // The document docs/research/12 measures the leak on: one hidden ancestor
  // above the zoom root, so every source-frame depth is exactly one too many.
  const ZOOMED = ['# Top', '', '## Mid', '', '- one', '  - nested', '', '- two', ''].join('\n');
  const MID_LINE = 2;
  const POSITION_LINE = 6;

  it('answers exactly what the unscoped helpers do when no zoom is active', () => {
    fc.assert(
      fc.property(arbMarkdownText, (text: string) => {
        const lines = text === '' ? [] : text.split('\n');
        for (let line = 0; line < lines.length; line++) {
          const derived = materializeProvisional(text, line, undefined, null);
          expect(derived?.fact ?? null).toEqual(provisionalFact(text, line));
          const probe = materializeProbe(text, line);
          // By its facts and its text, not by identity: every parse allocates
          // fresh node ids (`zoom.ts`'s `reresolveZoom`), so two parses of the
          // same bytes are deep-unequal by construction.
          expect(derived === null ? null : encode(derived.doc)).toEqual(probe);
          expect(derived === null ? null : decorate(derived.doc)).toEqual(
            probe === null ? null : decorate(parse(probe)),
          );
          expect(derived?.offset ?? 0).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('renders a new-node position at the depth the zoomed view gives its siblings', () => {
    const scope = resolveZoom(parse(ZOOMED), MID_LINE)!;
    const derived = materializeProvisional(ZOOMED, POSITION_LINE, undefined, scope)!;
    // `- one` is what a sibling of this position renders as, and the zoomed view
    // puts it one level in from the root.
    const sibling = decorate(scope.document).find(
      (fact) => fact.lineNumber === 4 - scope.startLine,
    )!;
    expect(derived.fact.depth).toBe(sibling.depth);
    expect(derived.fact.lineNumber).toBe(POSITION_LINE);
    expect(derived.offset).toBe(scope.startLine);
    // And the whole-buffer derivation is what put it a level too deep.
    expect(materializeProvisional(ZOOMED, POSITION_LINE, undefined, null)!.fact.depth).toBe(
      sibling.depth + 1,
    );
  });

  it('leaves every visible line where the zoomed view had it, for a bisecting position', () => {
    const md = ['# Top', '', '## Mid', '', 'para one', '', 'para two', '', '- item', ''].join('\n');
    const scope = resolveZoom(parse(md), MID_LINE)!;
    const derived = materializeProvisional(md, 5, undefined, scope)!;
    expect(derived.joins).toBe(true);

    const zoomed = decorate(scope.document);
    const shifted = decorate(derived.doc);
    for (const line of [2, 4, 6, 8]) {
      const local = line - scope.startLine;
      expect(shifted.find((f) => f.lineNumber === local)!.depth).toBe(
        zoomed.find((f) => f.lineNumber === local)!.depth,
      );
    }

    // Derived from the whole buffer instead, the same lines come back one level
    // right — the hidden ancestor counted twice.
    const unscoped = decorate(materializeProvisional(md, 5, undefined, null)!.doc);
    for (const line of [2, 4, 6, 8]) {
      expect(unscoped.find((f) => f.lineNumber === line)!.depth).toBe(
        zoomed.find((f) => f.lineNumber === line - scope.startLine)!.depth + 1,
      );
    }
  });

  it('declines for a caret outside the scope, rather than probing a line the view has not got', () => {
    const scope = resolveZoom(parse(ZOOMED), MID_LINE)!;
    expect(materializeProvisional(ZOOMED, 1, undefined, scope)).toBeNull();
  });
});

describe('a zoomed render composed the way the decoration layer composes it', () => {
  // `factsFor` and `computeTrail` read an `EditorState`, which the unit suite
  // cannot build — `decorations.ts` imports `obsidian`. What they DO with the
  // materialization is arithmetic on line numbers, and that is what these pin;
  // that the right branch performs it is what `80-outline-zoom` checks.
  const NESTED = ['# Top', '', '## Mid', '', '- one', '  - nested', '', '- two', ''].join('\n');
  const BISECTED = ['# Top', '', '## Mid', '', 'para one', '', 'para two', '', '- item', ''].join(
    '\n',
  );
  const LINEAGE: PositionHighlight = { guides: 'lineage', markers: 'lineage' };

  it('lands a bisected subtree on its own source lines, at the zoomed depths', () => {
    const scope = resolveZoom(parse(BISECTED), 2)!;
    const derived = materializeProvisional(BISECTED, 5, undefined, scope)!;
    expect(derived.joins).toBe(true);
    const before = shiftLines(decorate(scope.document), scope.startLine);
    const after = shiftLines(decorate(derived.doc), derived.offset);

    // The absolute rows the editor renders, not the sub-document's own — the
    // shift is the whole of what this branch adds to the derivation.
    expect(after.map((f) => f.lineNumber)).toEqual([2, 4, 5, 6, 8]);
    // Depth is the invariant across the position, line by line. WHICH node a
    // line belongs to is not: the resolved outline reads the position's
    // neighbours as one node, which is the bisecting case's whole rule.
    for (const fact of before) {
      expect(after.find((f) => f.lineNumber === fact.lineNumber)!.depth).toBe(fact.depth);
    }
  });

  it('draws no guide column for a hidden ancestor while a position is open', () => {
    const scope = resolveZoom(parse(NESTED), 2)!;
    const derived = materializeProvisional(NESTED, 6, undefined, scope)!;
    const guides = shiftLines(
      computeLineGuides(scope.document, derived.line - derived.offset),
      derived.offset,
    );
    // The zoom root owns no ancestor column, and its child carries exactly one:
    // the root's. The whole-note derivation adds `# Top`'s to both.
    expect(guides.find((g) => g.lineNumber === 2)!.guideDepths).toEqual([]);
    expect(guides.find((g) => g.lineNumber === 4)!.guideDepths).toEqual([0]);

    const unscoped = computeLineGuides(parse(NESTED), derived.line);
    expect(unscoped.find((g) => g.lineNumber === 2)!.guideDepths).toEqual([0]);
    expect(unscoped.find((g) => g.lineNumber === 4)!.guideDepths).toEqual([0, 1]);
  });

  it('accents the position on a column the zoomed guides actually draw', () => {
    const scope = resolveZoom(parse(NESTED), 2)!;
    const derived = materializeProvisional(NESTED, 6, undefined, scope)!;
    const trail = shiftTrail(
      computePositionTrail(derived.doc, derived.line - derived.offset, LINEAGE),
      derived.offset,
    );
    const guides = shiftLines(
      computeLineGuides(scope.document, derived.line - derived.offset),
      derived.offset,
    );
    // Every accent sits on a depth its own line carries a guide at — the clip
    // `accentsOn` applies, here satisfied rather than papered over.
    for (const [line, fact] of trail.byLine) {
      const drawn = guides.find((g) => g.lineNumber === line);
      const carried = [...(drawn?.guideDepths ?? []), ...(drawn?.listGuideDepths ?? [])];
      for (const accent of fact.accents) expect(carried).toContain(accent.depth);
    }
    expect(trail.byLine.size).toBeGreaterThan(0);
  });

  it('reads the caret’s ancestors in the zoomed frame, as the typed line would', () => {
    // `caretScope` feeds the caret-scoped guide modes, which the default `all`
    // never consults, so this is where that path is pinned. The probe types a
    // character at the caret, so the position's scope has to be exactly the
    // scope a caret there has once that character is really typed.
    const scope = resolveZoom(parse(NESTED), 2)!;
    const derived = materializeProvisional(NESTED, 6, undefined, scope)!;
    const provisional = shiftCaretScope(
      caretGuideScope(derived.doc, derived.line - derived.offset),
      derived.offset,
    );
    const typedText = NESTED.split('\n')
      .map((line, i) => (i === 6 ? `x${line}` : line))
      .join('\n');
    const typed = zoomAwareCaretScope(parse(typedText), 6, resolveZoom(parse(typedText), 2));
    expect(provisional).toEqual(typed);

    // And what `ancestors` draws from it: the zoom root's column on every row of
    // its subtree, the position's own row included, and no column for `# Top`,
    // which the view is hiding.
    const guides = new Map(
      shiftLines(
        computeLineGuides(scope.document, derived.line - derived.offset),
        derived.offset,
      ).map((g) => [g.lineNumber, g]),
    );
    const ctx = {
      visibility: 'ancestors' as const,
      hideSingleRoot: false,
      singleRoot: hasSingleRoot(scope.document),
      caret: provisional,
    };
    for (const row of [3, 4, 5, 6, 7]) {
      const g = guides.get(row)!;
      const depths = [...g.guideDepths, ...g.listGuideDepths].sort((a, b) => a - b);
      expect(visibleGuideDepths(depths, ctx, row)).toEqual([0]);
    }
  });
});

describe('provisionalFact: what a caret-occupied blank line would become', () => {
  // Enter's provisional position is blank-separated on both sides; Shift+Enter's
  // is adjacent to the node above. The layer never has to know which key ran —
  // the two shapes parse differently, which is exactly what
  // enter-and-shift-enter-grammar's D1 chose the encoding to guarantee.

  it('reports a new node at the destination depth for Enter’s position', () => {
    const md = ['# H', '', 'para', '', '', '', 'next', ''].join('\n');
    const fact = provisionalFact(md, 4)!;
    expect(fact).toBeTruthy();
    expect(fact.kind).toBe('paragraph');
    expect(fact.isFirstLine).toBe(true);
    // A sibling of `para`, which sits one level down inside the heading — not
    // the depth 0 the undecorated line renders at today.
    expect(fact.depth).toBe(1);
    expect(fact.isListItem).toBe(false);
  });

  it('reports the same depth a real node at that position has', () => {
    const md = ['# H', '', 'para', '', '', '', 'next', ''].join('\n');
    const provisional = provisionalFact(md, 4)!;
    const real = decorate(parse(md)).find((f) => f.lineNumber === 2)!;
    expect(provisional.depth).toBe(real.depth);
    expect(provisional.kind).toBe(real.kind);
    expect(provisional.isFirstLine).toBe(real.isFirstLine);
  });

  it('reports a CONTINUATION line for Shift+Enter’s position, carrying supplementalDepth', () => {
    const md = ['# H', '', '- alpha', '  - beta', '    ', ''].join('\n');
    const fact = provisionalFact(md, 4)!;
    expect(fact.isListItem).toBe(true);
    // Not a first line: a continuation renders no marker, exactly as the real
    // one it is about to become does not.
    expect(fact.isFirstLine).toBe(false);
    expect(fact.depth).toBe(2);
    // The whole of the reported defect: this is what the gap line renders
    // without, putting the caret at the list's PARENT column.
    expect(fact.supplementalDepth).toBe(1);
  });

  it('matches the fact the same line has once a character is actually typed', () => {
    const blank = ['# H', '', '- alpha', '  - beta', '    ', ''].join('\n');
    const typed = ['# H', '', '- alpha', '  - beta', '    x', ''].join('\n');
    expect(provisionalFact(blank, 4)).toEqual(
      decorate(parse(typed)).find((f) => f.lineNumber === 4),
    );
  });

  it('contributes no geometry inside a pure list', () => {
    // The byte-identical invariant: with no non-list ancestor there is nothing
    // for this layer to add, so the position renders as stock.
    const md = ['- alpha', '  - beta', '    ', ''].join('\n');
    const fact = provisionalFact(md, 2)!;
    expect(fact.isListItem).toBe(true);
    expect(fact.supplementalDepth).toBe(0);
    expect(fact.isFirstLine).toBe(false);
  });

  it('declines a line that already has a fact of its own', () => {
    const md = ['# H', '', 'para', ''].join('\n');
    expect(provisionalFact(md, 0)).toBeNull();
    expect(provisionalFact(md, 2)).toBeNull();
  });

  it('declines a blank line INSIDE an atom, which is a node’s own line', () => {
    const md = ['```', 'code', '', 'more', '```', ''].join('\n');
    // Line 2 is blank but belongs to the fence; it already renders as the fence.
    expect(decorate(parse(md)).some((f) => f.lineNumber === 2)).toBe(true);
    expect(provisionalFact(md, 2)).toBeNull();
  });

  it('declines the preamble and documents with no node at all', () => {
    const withFrontmatter = ['---', 'title: x', '---', '', '', 'para', ''].join('\n');
    expect(provisionalFact(withFrontmatter, 3)).toBeNull();
    expect(provisionalFact('', 0)).toBeNull();
    expect(provisionalFact('\n', 0)).toBeNull();
    expect(provisionalFact(['---', 'title: x', '---', ''].join('\n'), 3)).toBeNull();
  });

  it('declines a line past the end of the document', () => {
    expect(provisionalFact('para\n', 9)).toBeNull();
  });

  it('claims the document’s own trailing blank line, which a node does own', () => {
    // Not a provisional position any keypress makes, but the caret can rest
    // there, and typing continues the node above — so that is what it renders as.
    const md = ['# H', '', 'para', ''].join('\n');
    const fact = provisionalFact(md, 3)!;
    expect(fact.isFirstLine).toBe(false);
    expect(fact.depth).toBe(1);
  });

  it('leaves the line’s GUIDES exactly where they were (design D8)', () => {
    // The fact and the guide come from different documents — the probe's and
    // the real one's — so the two must agree about this line, or the guide
    // column would shift as the fact appears. The real one is asked with the
    // position open, which is how `factsFor` asks it: a position counts as
    // content for where a guide ENDS, and the probe's row is content outright,
    // so anything else would make the two disagree by construction.
    for (const [md, line] of [
      [['# H', '', 'para', '', '', '', 'next', ''].join('\n'), 4],
      [['# H', '', '- alpha', '  - beta', '    ', ''].join('\n'), 4],
      [['- item', '', '\t', '', '\tpara', ''].join('\n'), 2],
    ] as const) {
      const real = computeLineGuides(parse(md), line).find((g) => g.lineNumber === line)!;
      const probe = md.split('\n');
      probe[line] = `${probe[line]}x`;
      const previewed = computeLineGuides(parse(probe.join('\n'))).find(
        (g) => g.lineNumber === line,
      )!;
      expect(previewed.guideDepths).toEqual(real.guideDepths);
    }
  });

  it('probes at the CARET, not at the end of the line', () => {
    // A whitespace-only line is two different places depending on where the
    // caret is in it: after the whitespace the character continues the item
    // above, before it the character starts a top-level node. Both are
    // reachable — the second by a programmatic placement, which
    // content-space-caret deliberately leaves where it lands.
    const md = ['- alpha', '  ', ''].join('\n');
    const afterWhitespace = provisionalFact(md, 1, 2)!;
    expect(afterWhitespace.isListItem).toBe(true);
    expect(afterWhitespace.isFirstLine).toBe(false);

    const atColumnZero = provisionalFact(md, 1, 0)!;
    expect(atColumnZero.isListItem).toBe(false);
    expect(atColumnZero.kind).toBe('paragraph');
    expect(atColumnZero.isFirstLine).toBe(true);
    expect(atColumnZero.depth).toBe(0);
    // And each matches what typing at that column actually produces.
    expect(atColumnZero).toEqual(
      decorate(parse(['- alpha', 'x  ', ''].join('\n'))).find((f) => f.lineNumber === 1),
    );
  });

  it('clamps a caret column past the line’s own end', () => {
    const md = ['- alpha', '  ', ''].join('\n');
    expect(provisionalFact(md, 1, 99)).toEqual(provisionalFact(md, 1, 2));
    expect(provisionalFact(md, 1, -5)).toEqual(provisionalFact(md, 1, 0));
  });

  it('reports the item’s CHILD scope for a position an indented Enter opened', () => {
    // The shape splitNode's indentation fix exists for: at column 0 this same
    // position reports depth 0 — truthfully, since that is what typing there
    // would produce, which is why the encoding had to be fixed rather than the
    // rendering made to lie about it.
    const indented = ['- item', '', '\t', '', '\tpara', ''].join('\n');
    expect(provisionalFact(indented, 2)!.depth).toBe(1);
    const flat = ['- item', '', '', '', '\tpara', ''].join('\n');
    expect(provisionalFact(flat, 2)!.depth).toBe(0);
  });
});

describe('positionBisectsANode: which parse the document’s facts come from', () => {
  // The gate that decides whether an open provisional position leaves every
  // other line on the raw parse (it stands for a NEW node, or bisected nothing,
  // so nothing else may move) or hands the whole document to the tree it stands
  // for (it BISECTED an existing node, which made the raw parse wrong).

  /** The facts of the tree a position at `line`/`ch` stands for. */
  function materialized(md: string, line: number, ch?: number): LineDecorationFact[] {
    const probe = materializeProbe(md, line, ch);
    expect(probe).not.toBeNull();
    return decorate(parse(probe!));
  }

  function bisects(md: string, line: number, ch?: number): boolean {
    return positionBisectsANode(materialized(md, line, ch), line);
  }

  it('a bisected item’s second line stops being a paragraph child', () => {
    // The reported shape: Shift+Enter at the end of `- foo` in `- foo` / `  bar`.
    const md = ['- foo', '  ', '  bar', ''].join('\n');
    // What the raw parse makes of it, and what the report describes seeing: a
    // first-line paragraph one level deeper, which renders `depth * unit` to the
    // right of where it was and carries a marker.
    const raw = decorate(parse(md)).find((f) => f.lineNumber === 2)!;
    expect(raw.kind).toBe('paragraph');
    expect(raw.depth).toBe(1);
    expect(raw.isFirstLine).toBe(true);

    expect(bisects(md, 1, 2)).toBe(true);
    const tail = materialized(md, 1, 2).find((f) => f.lineNumber === 2)!;
    expect(tail.isListItem).toBe(true);
    expect(tail.isFirstLine).toBe(false);
    expect(tail.depth).toBe(0);
    expect(tail.supplementalDepth).toBe(0);
  });

  it('restores the item’s own supplementalDepth under a heading', () => {
    // The margin the displaced line loses is the whole visible jump here: the
    // raw parse gives it `padding-left: depth * unit`, the item's own regime
    // gives it `margin-left: supplementalDepth * unit`.
    const md = ['# H', '', '- foo', '  ', '  bar', ''].join('\n');
    expect(decorate(parse(md)).find((f) => f.lineNumber === 4)!.depth).toBe(2);

    expect(bisects(md, 3, 2)).toBe(true);
    const tail = materialized(md, 3, 2).find((f) => f.lineNumber === 4)!;
    expect(tail.isListItem).toBe(true);
    expect(tail.supplementalDepth).toBe(1);
    expect(tail.isFirstLine).toBe(false);
  });

  it('handles a nested item, where the raw parse displaces it two levels', () => {
    const md = ['- top', '\t- foo', '\t  ', '\t  bar', ''].join('\n');
    expect(decorate(parse(md)).find((f) => f.lineNumber === 3)!.depth).toBe(2);

    expect(bisects(md, 2, 4)).toBe(true);
    const tail = materialized(md, 2, 4).find((f) => f.lineNumber === 3)!;
    expect(tail.isListItem).toBe(true);
    expect(tail.depth).toBe(1);
    expect(tail.isFirstLine).toBe(false);
  });

  it('takes a bisected PARAGRAPH’s marker back off its second line', () => {
    // No depth change here — both halves sit at the same level. What the
    // bisection does is make the second line a FIRST line, which is what makes a
    // marker appear on it.
    const md = ['alpha', '', 'beta', ''].join('\n');
    expect(decorate(parse(md)).find((f) => f.lineNumber === 2)!.isFirstLine).toBe(true);

    expect(bisects(md, 1, 0)).toBe(true);
    const tail = materialized(md, 1, 0).find((f) => f.lineNumber === 2)!;
    expect(tail.isFirstLine).toBe(false);
    expect(tail.kind).toBe('paragraph');
    expect(tail.depth).toBe(0);
  });

  it('gives the upper half its child back', () => {
    // The bisection does not only displace the tail: the tail TAKES the node's
    // child with it, because the attachment rule now reaches the lower half.
    // Under `markerVisibility: 'with-children'` the upper half's marker
    // disappears for as long as the position is open.
    const md = ['  continuation', '  ', 'code inside', '- item', ''].join('\n');
    expect(decorate(parse(md)).find((f) => f.lineNumber === 0)!.hasChildren).toBe(false);
    expect(bisects(md, 1, 2)).toBe(true);
    expect(materialized(md, 1, 2).find((f) => f.lineNumber === 0)!.hasChildren).toBe(true);
  });

  it('reaches a line the artifact node swallowed, beyond the node entirely', () => {
    // `⇥tab lead` becomes a paragraph when the item is bisected, and a paragraph
    // absorbs the following line — so `plain text` stops being a node of its own,
    // two removes from anything the keypress touched. A line SPAN cannot express
    // this, which is why the gate hands over the whole document.
    const md = ['- item', '  ', '\ttab lead', 'plain text', ''].join('\n');
    const raw = decorate(parse(md)).find((f) => f.lineNumber === 3)!;
    expect(raw.isFirstLine).toBe(false);
    expect(raw.depth).toBe(1);

    expect(bisects(md, 1, 2)).toBe(true);
    const swallowed = materialized(md, 1, 2).find((f) => f.lineNumber === 3)!;
    expect(swallowed.isFirstLine).toBe(true);
    expect(swallowed.depth).toBe(0);
  });

  it('declines an end-of-node position, which bisected nothing', () => {
    // The gate needs a line of the node still BELOW the position. Rendering
    // would not care either way — the two parses agree about every line here,
    // asserted below — but an operation would: the document's own final blank
    // line joins the node above it, and `indent` re-emits a node's lines, so Tab
    // would write trailing whitespace at the end of the file.
    for (const [md, line, ch] of [
      [['- foo', '  ', ''].join('\n'), 1, 2],
      [['# H', '', '- foo', '  ', ''].join('\n'), 3, 2],
      [['First.', '', 'Second.', ''].join('\n'), 3, 0],
    ] as const) {
      expect(bisects(md, line, ch)).toBe(false);
      // And nothing is lost by declining: apart from the position's own line,
      // the resolved facts and the raw ones agree everywhere.
      const resolved = new Map(materialized(md, line, ch).map((f) => [f.lineNumber, f]));
      for (const raw of decorate(parse(md))) {
        expect({ line: raw.lineNumber, fact: resolved.get(raw.lineNumber) }).toEqual({
          line: raw.lineNumber,
          fact: raw,
        });
      }
    }
  });

  it('declines a position that would materialize a NEW node', () => {
    // Enter's blank-separated position: the node it stands for does not exist
    // yet, so nothing else may render as though it did.
    expect(bisects(['# H', '', 'para', '', '', '', 'next', ''].join('\n'), 4)).toBe(false);
    // And the adoption shape: typing on the first blank line makes a paragraph
    // that takes `beta` as its continuation, which would strip the marker `beta`
    // really has. Design D3's childless-heading guard is the same case.
    expect(bisects(['# H', '', '', 'beta', ''].join('\n'), 2)).toBe(false);
    expect(bisects(['# H', '', '', ''].join('\n'), 2)).toBe(false);
  });
});


describe('resolvedOutline: the tree a position stands for, in the buffer’s own text', () => {
  it('holds the bisected node whole, with the position among its own lines', () => {
    const md = ['- one', '- foo', '  ', '  bar', ''].join('\n');
    const doc = resolvedOutline(md, 2, 2)!;
    expect(doc).not.toBeNull();
    expect(doc.children.map((n) => n.lines)).toEqual([['- one'], ['- foo', '  ', '  bar']]);
    expect(doc.children[1]!.children).toEqual([]);
  });

  it('carries no probe character anywhere, so an operation cannot write one', () => {
    // The reason this is a function and not `parse(materializeProbe(...))` at
    // each call site: operations re-emit a node's lines.
    for (const [md, line, ch] of [
      [['- one', '- foo', '  ', '  bar', ''].join('\n'), 2, 2],
      [['# H', '', '- foo', '  ', '  bar', ''].join('\n'), 3, 2],
      [['alpha', '', 'beta', ''].join('\n'), 1, 0],
    ] as const) {
      const doc = resolvedOutline(md, line, ch)!;
      expect(doc).not.toBeNull();
      // Byte-identity against the BUFFER, which is the property that makes an
      // operation's edits correct against it.
      expect(encode(doc)).toBe(md);
    }
  });

  it('declines a position that stands for a new node, and a line that is not one', () => {
    expect(resolvedOutline(['# H', '', 'para', '', '', '', 'next', ''].join('\n'), 4)).toBeNull();
    expect(resolvedOutline(['# H', '', '', 'beta', ''].join('\n'), 2)).toBeNull();
    expect(resolvedOutline(['- foo', '  bar', ''].join('\n'), 0)).toBeNull();
  });

  it('keeps a real child attached to the node it belongs to', () => {
    const md = ['- foo', '  ', '  bar', '\t- kid', ''].join('\n');
    const doc = resolvedOutline(md, 1, 2)!;
    expect(doc.children).toHaveLength(1);
    expect(doc.children[0]!.lines).toEqual(['- foo', '  ', '  bar']);
    expect(doc.children[0]!.children.map((n) => n.lines)).toEqual([['\t- kid']]);
  });
});

/** Apply a plan's changes to the text they were computed against. */
function applyPlanChanges(
  text: string,
  changes: readonly { from: { line: number; ch: number }; to: { line: number; ch: number }; text: string }[],
): string {
  const lines = text === '' ? [] : text.split('\n');
  const offsetOf = (pos: { line: number; ch: number }): number => {
    let acc = 0;
    for (let i = 0; i < pos.line && i < lines.length; i++) acc += (lines[i] ?? '').length + 1;
    return acc + pos.ch;
  };
  let out = text;
  for (const change of [...changes].sort((a, b) => offsetOf(b.from) - offsetOf(a.from))) {
    out = out.slice(0, offsetOf(change.from)) + change.text + out.slice(offsetOf(change.to));
  }
  return out;
}

describe('the overlay reproduces the facts the keypress displaced (design D1/D2)', () => {
  // The invariant `outline-decorations` states — "No line renders differently
  // because a position is open" — tested against the document as it was BEFORE
  // the keypress, which is the only thing that can settle it. Shift+Enter is run
  // for real rather than approximated, so the property is about the grammar's
  // own output and not about a fixture's idea of it.

  /** The facts a consumer sees, exactly as `factsFor` composes them. */
  function overlay(open: string, position: number): Map<number, LineDecorationFact> {
    const raw = new Map(decorate(parse(open)).map((f) => [f.lineNumber, f]));
    const probe = materializeProbe(open, position);
    if (probe === null) return raw;
    const materializedFacts = decorate(parse(probe));
    if (positionBisectsANode(materializedFacts, position)) {
      return new Map(materializedFacts.map((f) => [f.lineNumber, f]));
    }
    const own = materializedFacts.find((f) => f.lineNumber === position);
    if (own) raw.set(position, own);
    return raw;
  }

  /** The guides a consumer sees, through the same gate. */
  function overlayGuides(open: string, position: number): Map<number, readonly number[]> {
    const probe = materializeProbe(open, position);
    const source =
      probe !== null && positionBisectsANode(decorate(parse(probe)), position) ? probe : open;
    return new Map(computeLineGuides(parse(source)).map((g) => [g.lineNumber, g.guideDepths]));
  }

  /** Every line that is one of a node's own lines but not that node's last. */
  function interiorLines(md: string): number[] {
    const facts = decorate(parse(md));
    const byLine = new Map(facts.map((f) => [f.lineNumber, f]));
    return facts
      .filter((f) => byLine.get(f.lineNumber + 1)?.isFirstLine === false)
      .map((f) => f.lineNumber);
  }

  /**
   * Shift+Enter at the end of `line`, as the grammar actually writes it — or
   * null when the key produced something other than an interior position, which
   * the reconstruction below CHECKS rather than assumes. A heading's Shift+Enter
   * drafts a sibling instead of continuing (`insertSiblingHeading`), and a
   * `==` / `---` setext heading reaches that branch from a line that looks
   * interior; without this check the property would compare two documents that
   * are not the same document one keypress apart.
   */
  function openPositionAt(md: string, line: number): string | null {
    const outcome = planKey(md, { line, ch: (md.split('\n')[line] ?? '').length }, 'continue');
    if (outcome === null || 'notice' in outcome) return null;
    const lines = md.split('\n');
    const open = applyPlanChanges(md, outcome.plan.changes);
    const openLines = open.split('\n');
    const inserted = openLines.length === lines.length + 1;
    const headSame = openLines.slice(0, line + 1).join('\n') === lines.slice(0, line + 1).join('\n');
    const tailSame = openLines.slice(line + 2).join('\n') === lines.slice(line + 1).join('\n');
    const blank = (openLines[line + 1] ?? 'x').trim() === '';
    return inserted && headSame && tailSame && blank ? open : null;
  }

  function check(md: string, line: number): void {
    const open = openPositionAt(md, line);
    if (open === null) return;
    const position = line + 1;
    // The invariant is about a position that JOINS the node it was opened
    // inside. Where the grammar writes one that does not — an item whose marker
    // has no trailing space gets no continuation indent, so `-` / `⇥tab lead`
    // opens a column-0 line that parses as a top-level paragraph — there is no
    // tree in which the node is whole, and no overlay can repair it. Measured
    // and recorded as a follow-up; see the test below.
    // Read INLINE rather than through `positionBisectsANode`: calling the
    // implementation's own gate here would make this property vacuous the moment
    // that gate is broken, which is exactly when it needs to fail.
    const probe = materializeProbe(open, position);
    if (probe === null) return;
    const positionFact = decorate(parse(probe)).find((f) => f.lineNumber === position);
    if (!positionFact || positionFact.isFirstLine) return;
    const before = new Map(decorate(parse(md)).map((f) => [f.lineNumber, f]));
    const after = overlay(open, position);

    for (const [l, was] of before) {
      const now = after.get(l <= line ? l : l + 1);
      if (!now) continue; // the keypress moved text off this line entirely
      const shape = (f: LineDecorationFact): unknown => ({
        depth: f.depth,
        kind: f.kind,
        isFirstLine: f.isFirstLine,
        isListItem: f.isListItem,
        isAtom: f.isAtom,
        supplementalDepth: f.supplementalDepth,
        hasNativeMarker: f.hasNativeMarker,
      });
      // Everything that reaches the rendering. `hasChildren` is deliberately
      // excluded and checked separately below.
      expect({ md, position, line: l, fact: shape(now) }).toEqual({
        md,
        position,
        line: l,
        fact: shape(was),
      });
      // A bisection can give the bisected node an artifact CHILD — the tail
      // attaches to it, which is the same rule that makes the tail a child
      // rather than a sibling. That only ever happens to a LIST ITEM, whose
      // marker is Obsidian's own bullet and never one this layer draws, so it
      // reaches nothing rendered. Asserted rather than argued.
      if (now.hasChildren !== was.hasChildren) expect(now.isListItem).toBe(true);
    }

    // Guides ride the same gate (design D2): a bisection can REMOVE an ancestor
    // as well as add one — `####### seven` / `<div>` / `- item` is the measured
    // shape, where the item attaches to the paragraph and stops attaching once
    // the paragraph's tail becomes an html block — so the guide column would
    // otherwise blink out on a line the keypress never touched.
    const beforeGuides = computeLineGuides(parse(md));
    const afterGuides = overlayGuides(open, position);
    for (const g of beforeGuides) {
      const now = afterGuides.get(g.lineNumber <= line ? g.lineNumber : g.lineNumber + 1);
      if (now === undefined) continue;
      expect({ md, position, line: g.lineNumber, guides: now }).toEqual({
        md,
        position,
        line: g.lineNumber,
        guides: g.guideDepths,
      });
    }
  }

  it('holds over the shapes this change was reported for', () => {
    for (const md of [
      ['- foo', '  bar', ''].join('\n'),
      ['# H', '', '- foo', '  bar', ''].join('\n'),
      ['- top', '\t- foo', '\t  bar', ''].join('\n'),
      ['- foo', '  bar', '  baz', ''].join('\n'),
      ['alpha', 'beta', ''].join('\n'),
      ['# H', '', 'first', '', 'alpha', 'beta', ''].join('\n'),
      ['- foo', '  bar', '\t- kid', ''].join('\n'),
    ]) {
      const lines = interiorLines(md);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) check(md, line);
    }
  });

  it('a position the grammar writes OUTSIDE its node is not one this can repair', () => {
    // `-` has no space after its marker, so `LIST_CONT_RE` does not match it and
    // Shift+Enter writes an empty line rather than the item's content column —
    // while `parse` reads `-` as an item whose content column is 2. Typing on
    // that position makes a TOP-LEVEL paragraph, so the position stands for no
    // continuation and the gate stays shut. The node below it stays displaced.
    // A buffer defect, out of this change's scope (proposal.md — Non-Goals) and
    // recorded in docs/research/12.
    const md = ['-', '\ttab lead', ''].join('\n');
    const open = openPositionAt(md, 0)!;
    expect(open).toBe(['-', '', '\ttab lead', ''].join('\n'));
    expect(positionBisectsANode(decorate(parse(materializeProbe(open, 1)!)), 1)).toBe(false);
  });

  it('holds over generated documents', () => {
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        for (const line of interiorLines(md)) check(md, line);
      }),
      { numRuns: 300 },
    );
  });

  it('leaves every other line on the raw parse when the position invents a node', () => {
    // The other half of the gate: an invented node must not reach any line but
    // the position's own, which is what keeps `hasChildren` on a childless
    // heading from flipping while a position is open (design D3's e2e guard).
    fc.assert(
      fc.property(arbMarkdownText, (md) => {
        const lines = md === '' ? [] : md.split('\n');
        for (let line = 0; line < lines.length; line++) {
          const probe = materializeProbe(md, line);
          if (probe === null) continue;
          const facts = decorate(parse(probe));
          if (facts.find((f) => f.lineNumber === line)?.isFirstLine !== true) continue;
          expect(positionBisectsANode(facts, line)).toBe(false);
          const composed = overlay(md, line);
          for (const raw of decorate(parse(md))) {
            expect({ line: raw.lineNumber, fact: composed.get(raw.lineNumber) }).toEqual({
              line: raw.lineNumber,
              fact: raw,
            });
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});
