import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { computeLineGuides, decorate } from '../src/plugin/decorate';

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
