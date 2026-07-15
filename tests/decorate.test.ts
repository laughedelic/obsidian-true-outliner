import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { decorate } from '../src/plugin/decorate';

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
