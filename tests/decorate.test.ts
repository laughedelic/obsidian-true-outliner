import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import {
  computeLineGuides,
  computePositionTrail,
  decorate,
  type AncestorTrail,
} from '../src/plugin/decorate';

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
});

describe('computePositionTrail: caret-derived accents (hierarchy-position-indicators)', () => {
  const trail = (md: string, cursorLine: number, style: AncestorTrail) =>
    computePositionTrail(parse(md), cursorLine, style);

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
      expect(trail(NESTED, 4, 'off').currentLine).toBe(4);
      expect(trail(NESTED, 6, 'off').currentLine).toBe(6);
    });

    it('resolves a caret on a continuation line to the node’s FIRST line', () => {
      const md = '# A\n\nfirst\nsecond\nthird\n';
      expect(trail(md, 3, 'off').currentLine).toBe(2);
      expect(trail(md, 4, 'off').currentLine).toBe(2);
    });

    it('resolves a caret on a blank gap line to the node that gap belongs to', () => {
      // Line 1 is "# A"'s own trailing gap; line 3 is "## B"'s.
      expect(trail(NESTED, 1, 'off').currentLine).toBe(0);
      expect(trail(NESTED, 3, 'off').currentLine).toBe(2);
    });

    it('flags whether the current node is a list item (native bullet vs. our marker)', () => {
      const md = '# A\n\n- item\n';
      expect(trail(md, 0, 'off').currentIsListItem).toBe(false);
      expect(trail(md, 2, 'off').currentIsListItem).toBe(true);
    });

    it('reports no current node for an empty or preamble-only document', () => {
      expect(trail('', 0, 'guides').currentLine).toBe(null);
      expect(trail('---\ntitle: x\n---\n\n', 1, 'guides').currentLine).toBe(null);
    });

    it('reports no current node for a caret past the end of the document', () => {
      expect(trail(NESTED, 99, 'path').currentLine).toBe(null);
    });

    it("is reported even when the trail style is 'off', which draws nothing", () => {
      const t = trail(NESTED, 4, 'off');
      expect(t.currentLine).toBe(4);
      expect(t.byLine.size).toBe(0);
    });
  });

  describe("'guides' style", () => {
    it("accents every strict ancestor's guide across that ancestor's whole subtree", () => {
      // Caret in "### C" (depth 2): ancestors are "# A" (0) and "## B" (1).
      expect(shape(trail(NESTED, 4, 'guides'))).toEqual([
        [1, '0:full'], // A's gap — inside A's subtree
        [2, '0:full'], // ## B
        [3, '0:full,1:full'], // B's gap — inside both
        [4, '0:full,1:full'], // ### C
        [5, '0:full,1:full'],
        [6, '0:full,1:full'], // text under C
        [7, '0:full,1:full'],
      ]);
    });

    it("never accents the current node's own level, only strict ancestors", () => {
      const depths = [...trail(NESTED, 4, 'guides').byLine.values()].flatMap((f) =>
        f.accents.map((a) => a.depth),
      );
      expect(depths).not.toContain(2);
    });

    it("leaves a sibling subtree's own guide unaccented", () => {
      const md = ['# One', '', '## Under one', '', '# Two', '', '## Under two', ''].join('\n');
      //           0         1    2              3    4        5    6              7
      const t = trail(md, 6, 'guides'); // caret under "# Two"
      // Only "# Two"'s subtree (lines 5-7) is accented; "# One"'s (1-3) is not.
      expect(shape(t)).toEqual([
        [5, '0:full'],
        [6, '0:full'],
        [7, '0:full'],
      ]);
    });

    it('accents a guide on the same gap lines the base guide layer covers', () => {
      const t = trail(NESTED, 6, 'guides');
      // Line 5 is C's own gap and line 3 is B's — both inside the accented
      // ancestors' subtrees, matching computeLineGuides' own continuity.
      expect(t.byLine.get(3)?.accents.map((a) => a.depth)).toEqual([0, 1]);
      expect(t.byLine.get(5)?.accents.map((a) => a.depth)).toEqual([0, 1, 2]);
    });

    it('draws nothing at all for a top-level node with no ancestors', () => {
      expect(trail(NESTED, 0, 'guides').byLine.size).toBe(0);
    });

    it('accents no ancestor markers — that belongs to the path style', () => {
      expect(ancestors(trail(NESTED, 6, 'guides'))).toEqual([]);
      expect(ancestors(trail(NESTED, 4, 'guides'))).toEqual([]);
    });
  });

  describe("'path' style", () => {
    it('runs one connected path from the root to the current node', () => {
      // Caret in "### C" (line 4). A's segment leaves A's own marker (line 0,
      // lower half), runs through the gap, arrives at B's line; B's segment
      // does the same down to C's line, where the path ends.
      expect(shape(trail(NESTED, 4, 'path'))).toEqual([
        [0, '0:bottom'],
        [1, '0:full'],
        [2, '0:top,1:bottom'],
        [3, '1:full'],
        [4, '1:top'],
      ]);
    });

    it('stops at the current node, never continuing into its own subtree', () => {
      const t = trail(NESTED, 4, 'path');
      expect(Math.max(...[...t.byLine.keys()])).toBe(4); // "### C"'s own line
      expect(t.byLine.has(6)).toBe(false); // "text under C" carries nothing
    });

    it('does not accent the full extent of an ancestor the way guides does', () => {
      const md = ['# A', '', '## B', '', 'tail of A’s subtree', ''].join('\n');
      //           0      1    2      3    4
      const t = trail(md, 2, 'path'); // caret in "## B"
      // Line 4 is still inside A's subtree, but below B — nothing there.
      expect(t.byLine.has(4)).toBe(false);
      expect(shape(t)).toEqual([
        [0, '0:bottom'],
        [1, '0:full'],
        [2, '0:top'],
      ]);
    });

    it('carries nothing into a sibling subtree', () => {
      const md = ['# One', '', '## Under one', '', '# Two', '', '## Under two', ''].join('\n');
      const t = trail(md, 6, 'path');
      expect(shape(t)).toEqual([
        [4, '0:bottom'],
        [5, '0:full'],
        [6, '0:top'],
      ]);
    });

    it('draws nothing for a top-level node — it has no ancestor at all', () => {
      const t = trail(NESTED, 0, 'path');
      expect(t.byLine.size).toBe(0);
      expect(ancestors(t)).toEqual([]);
    });

    it('spans a multi-line ancestor’s continuation lines at full height', () => {
      const md = ['first line', 'second line', '', '- child', ''].join('\n');
      //           0             1              2    3
      const t = trail(md, 3, 'path');
      expect(shape(t)).toEqual([
        [0, '0:bottom'],
        [1, '0:full'],
        [2, '0:full'],
        [3, '0:top'],
      ]);
    });

    it("accents every ancestor's own marker, which is what replaced the elbows", () => {
      // Caret in "### C": both "# A" (line 0) and "## B" (line 2) are
      // ancestors, and neither is a list item.
      expect(ancestors(trail(NESTED, 4, 'path'))).toEqual([
        [0, false],
        [2, false],
      ]);
      // The current node itself is NOT in there — it has its own accent,
      // under its own setting.
      expect(trail(NESTED, 4, 'path').currentLine).toBe(4);
    });

    it('marks a list-item ancestor as native, so the bullet gets accented', () => {
      const md = ['# A', '', '- one', '  - two', ''].join('\n');
      //           0      1    2        3
      expect(ancestors(trail(md, 3, 'path'))).toEqual([
        [0, false], // "# A" — our own marker icon
        [2, true], // "- one" — Obsidian's native bullet
      ]);
    });
  });

  describe('list levels (native columns this layer cannot address)', () => {
    it('runs the segment at the shallower non-list column, through the list levels', () => {
      const md = ['# A', '', '- one', '  - two', '    - three', ''].join('\n');
      //           0      1    2        3          4
      const t = trail(md, 4, 'path'); // caret on the deepest list item
      // A's own segment is the whole drawn path; the two list ancestors
      // between A and the caret contribute no column of their own.
      expect(shape(t)).toEqual([
        [0, '0:bottom'],
        [1, '0:full'],
        [2, '0:full'],
        [3, '0:full'],
        [4, '0:top'],
      ]);
      // Their MARKERS are still accented, though — a bullet is a real element
      // at the real native column, so it needs none of the geometry the
      // segments cannot address.
      expect(ancestors(t)).toEqual([
        [0, false],
        [2, true],
        [3, true],
      ]);
    });

    it('accents only the non-list ancestor in the guides style', () => {
      const md = ['# A', '', '- one', '  - two', '    - three', ''].join('\n');
      const t = trail(md, 4, 'guides');
      const depths = new Set(
        [...t.byLine.values()].flatMap((f) => f.accents.map((a) => a.depth)),
      );
      expect([...depths]).toEqual([0]); // never 1 or 2, the list levels
    });

    it('draws no segment anywhere in a pure list, in either style', () => {
      const md = ['- one', '  - two', '    - three', ''].join('\n');
      expect(trail(md, 2, 'guides').byLine.size).toBe(0);
      expect(trail(md, 2, 'path').byLine.size).toBe(0);
      // The current node is still reported — the marker accent needs it.
      expect(trail(md, 2, 'path').currentLine).toBe(2);
      expect(trail(md, 2, 'path').currentIsListItem).toBe(true);
    });

    it('still accents the ancestor bullets in a pure list, where no line can be drawn', () => {
      const md = ['- one', '  - two', '    - three', ''].join('\n');
      // This is the whole reason ancestor markers exist: with no non-list
      // ancestor there is nothing to draw, yet the levels are still legible.
      expect(ancestors(trail(md, 2, 'path'))).toEqual([
        [0, true],
        [1, true],
      ]);
      expect(ancestors(trail(md, 2, 'guides'))).toEqual([]);
    });
  });
});
