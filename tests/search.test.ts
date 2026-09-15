/**
 * The matcher every search surface reads: the grammar, and what "the content
 * the footer shows for a reference" means.
 *
 * The last suite here is the one that keeps `referenceMatches` honest. It
 * states the D2 corpus on the tree, `buildRows` states it on the rows, and
 * nothing but a test holds the two definitions to each other — so it compares
 * them directly rather than asserting a shape either one could drift out of.
 */

import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import {
  matchNodes,
  matchRanges,
  matchesText,
  referenceMatches,
  referenceTexts,
} from '../src/search';
import type { OutlineDoc, OutlineNode } from '../src/model';
import { buildRows } from '../src/plugin/footer-model';

/**
 * One reference, with a distinct word planted at every position D2 names and
 * one position it excludes.
 *
 * `apricot` sits on an ancestor's first line, `marmalade` on the same
 * ancestor's SECOND line — a lineage segment shows the first only, so the two
 * words are how that rule is asserted rather than assumed. The list attaches to
 * the paragraph above it, which is what makes a multi-line ancestor reachable
 * at all: every other kind that can be an ancestor here is one line.
 */
const NOTE = `# Journal seeded with apricot

Intro line one.
Intro line two mentions marmalade.

- The reference node mentions persimmon
  - immediate child says quince
    - deeper descendant says chrysalis
- unrelated sibling
`;

/** Ids are handed out fresh on every parse, so the fixture is addressed by
 * content and never by a literal id. */
function idOf(doc: OutlineDoc, needle: string): number {
  const find = (nodes: readonly OutlineNode[]): OutlineNode | undefined => {
    for (const node of nodes) {
      if (node.lines.some((l) => l.includes(needle))) return node;
      const below = find(node.children);
      if (below) return below;
    }
    return undefined;
  };
  const node = find(doc.children);
  if (!node) throw new Error(`no node containing ${needle}`);
  return node.id;
}

function fixture(): { doc: OutlineDoc; nodeId: number } {
  const doc = parse(NOTE);
  return { doc, nodeId: idOf(doc, 'The reference node') };
}

describe('the grammar', () => {
  it('matches a literal substring', () => {
    expect(matchesText('the reference node mentions persimmon', 'node ment')).toBe(true);
    expect(matchesText('the reference node mentions persimmon', 'nodement')).toBe(false);
  });

  it('ignores case on both sides', () => {
    expect(matchesText('Aurora Dashboard', 'aurora')).toBe(true);
    expect(matchesText('aurora dashboard', 'AURORA')).toBe(true);
  });

  it('trims the query, and only the query', () => {
    expect(matchesText('Aurora Dashboard', '  aurora  ')).toBe(true);
    // Surrounding whitespace comes off the term; whitespace INSIDE it is part
    // of what the reader asked for.
    expect(matchesText('AuroraDashboard', 'aurora dashboard')).toBe(false);
  });

  it('admits everything on an empty query', () => {
    expect(matchesText('', '')).toBe(true);
    expect(matchesText('anything at all', '')).toBe(true);
    expect(matchesText('anything at all', '   ')).toBe(true);
  });
});

describe('where a term sits in a piece of text', () => {
  it('finds every occurrence, left to right', () => {
    expect(matchRanges('one two one two one', 'one')).toEqual([
      { from: 0, to: 3 },
      { from: 8, to: 11 },
      { from: 16, to: 19 },
    ]);
  });

  it('finds an occurrence whose case differs from the query', () => {
    expect(matchRanges('Aurora and aurora', 'AURORA')).toEqual([
      { from: 0, to: 6 },
      { from: 11, to: 17 },
    ]);
  });

  it('reports ranges over the ORIGINAL text, so the match keeps its own case', () => {
    const text = 'The Aurora Dashboard';
    const [range] = matchRanges(text, 'aurora');
    expect(text.slice(range!.from, range!.to)).toBe('Aurora');
  });

  it('never overlaps two occurrences', () => {
    // 'aaa' occurs at 0 and at 2 if overlaps were allowed; they cannot both be
    // cut out of one string, so the second starts after the first ends.
    expect(matchRanges('aaaaa', 'aaa')).toEqual([{ from: 0, to: 3 }]);
  });

  it('sizes a range by the TRIMMED term, not the query as typed', () => {
    const text = 'the Aurora Dashboard';
    // A reader's trailing space is not part of what they are looking for, so a
    // range that counted it would mark one character too many — and, at the end
    // of a text node, run past it.
    expect(matchRanges(text, '  aurora  ')).toEqual([{ from: 4, to: 10 }]);
    expect(text.slice(4, 10)).toBe('Aurora');
  });

  it('finds nothing for an empty query', () => {
    expect(matchRanges('anything at all', '')).toEqual([]);
    expect(matchRanges('anything at all', '   ')).toEqual([]);
  });

  it('agrees with the grammar about what counts as an occurrence', () => {
    const text = 'the Aurora Dashboard';
    for (const query of ['aurora', 'AURORA', '  dashboard  ', 'nope', '']) {
      expect(matchRanges(text, query).length > 0).toBe(
        matchesText(text, query) && query.trim().length > 0,
      );
    }
  });
});

describe('what the footer shows for a reference', () => {
  it('matches the referencing node’s own text', () => {
    const { doc, nodeId } = fixture();
    expect(referenceMatches(doc, nodeId, 'persimmon')).toBe(true);
  });

  it('matches an ancestor’s first line', () => {
    const { doc, nodeId } = fixture();
    expect(referenceMatches(doc, nodeId, 'apricot')).toBe(true);
    expect(referenceMatches(doc, nodeId, 'Intro line one')).toBe(true);
  });

  it('does not match an ancestor’s later lines, which no segment shows', () => {
    const { doc, nodeId } = fixture();
    expect(referenceMatches(doc, nodeId, 'marmalade')).toBe(false);
  });

  it('matches a child the footer renders', () => {
    const { doc, nodeId } = fixture();
    expect(referenceMatches(doc, nodeId, 'quince')).toBe(true);
  });

  it('does not match a descendant deeper than the footer renders', () => {
    const { doc, nodeId } = fixture();
    expect(referenceMatches(doc, nodeId, 'chrysalis')).toBe(false);
  });

  it('does not match text that is nowhere in the reference’s content', () => {
    const { doc, nodeId } = fixture();
    expect(referenceMatches(doc, nodeId, 'persimmons of the third kind')).toBe(false);
    // A sibling's text is in the note, but not in what the footer shows here.
    expect(referenceMatches(doc, nodeId, 'unrelated sibling')).toBe(false);
  });

  it('admits every reference on an empty query', () => {
    const { doc, nodeId } = fixture();
    expect(referenceMatches(doc, nodeId, '')).toBe(true);
    expect(referenceMatches(doc, nodeId, '  ')).toBe(true);
  });

  it('matches nothing for a node that is not in the document', () => {
    const { doc } = fixture();
    expect(referenceMatches(doc, -1, 'persimmon')).toBe(false);
  });
});

describe('nodes whose own text matches', () => {
  it('finds every node carrying the term, in document order', () => {
    const doc = parse(NOTE);
    const ids = matchNodes(doc, 'says');
    expect(ids).toEqual([idOf(doc, 'immediate child'), idOf(doc, 'deeper descendant')]);
  });

  it('reads the node’s own lines, not a per-kind preview', () => {
    const doc = parse(NOTE);
    // `marmalade` is on the paragraph's second line, which no preview quotes.
    expect(matchNodes(doc, 'marmalade')).toEqual([idOf(doc, 'Intro line one')]);
  });

  it('returns every node on an empty query', () => {
    const doc = parse(NOTE);
    expect(matchNodes(doc, '').length).toBe(6);
  });
});

describe('the corpus is the rows', () => {
  it('searches exactly the texts buildRows renders for a match', () => {
    const { doc, nodeId } = fixture();
    const rows = buildRows(
      doc,
      (node) => node.id === nodeId,
      [],
      () => undefined,
      () => false,
    );

    const rendered = rows.flatMap((row) => {
      if (row.type === 'lineage') return row.segments.map((s) => s.markdown);
      if (row.type === 'node') return [row.markdown];
      return [];
    });

    expect(referenceTexts(doc, nodeId)).toEqual(rendered);
  });
});
