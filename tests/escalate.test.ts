import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import {
  clampCursorToContent,
  coveredSubtreeRoots,
  escalateRange,
  escalateRanges,
  rangesEqual,
  type LinePos,
  type LineRange,
} from '../src/escalate';
import { nodeAtLine } from '../src/locate';
import { contentColumnCh } from '../src/ops';
import { arbTree } from './generators';

const pos = (line: number, ch: number): LinePos => ({ line, ch });
const range = (anchor: LinePos, head: LinePos): LineRange => ({ anchor, head });

describe('escalateRange: spec scenarios (design.md D4)', () => {
  // H
  //  - Para one.
  //  - Para two.
  //     - item
  //        - child
  const md = '# H\n\nPara one.\n\nPara two.\n\n- item\n  - child\n';
  const doc = parse(md);

  it('cursor (empty range) is never altered', () => {
    const r = range(pos(2, 3), pos(2, 3));
    expect(escalateRange(doc, r)).toEqual(r);
  });

  it('within-node selection (word/phrase) is untouched', () => {
    const r = range(pos(2, 1), pos(2, 5));
    expect(escalateRange(doc, r)).toEqual(r);
  });

  it('drag from mid-paragraph into the next paragraph escalates to both subtrees in full', () => {
    const r = range(pos(2, 5), pos(4, 3));
    const result = escalateRange(doc, r);
    // "child" (line 7) is the deepest last descendant; line 8 is its own
    // trailing gap (the document's final blank line), now part of the cover.
    expect(result).toEqual(range(pos(2, 0), pos(8, 0)));
  });

  it('backward drag stays backward: head lands at the start side', () => {
    const r = range(pos(4, 3), pos(2, 5)); // anchor lower, head upper: backward
    const result = escalateRange(doc, r);
    expect(result).toEqual(range(pos(8, 0), pos(2, 0)));
  });

  it('selection leaving a parent covers the heading\'s entire subtree', () => {
    const r = range(pos(0, 2), pos(2, 3)); // starts in heading text, ends in Para one
    const result = escalateRange(doc, r);
    expect(result).toEqual(range(pos(0, 0), pos(8, 0)));
  });

  it('keyboard selection crossing a boundary (Shift+ArrowDown-style range) escalates', () => {
    // From end of "Para one." to start of "Para two." — still crosses.
    const r = range(pos(2, 'Para one.'.length), pos(4, 0));
    const result = escalateRange(doc, r);
    expect(result).toEqual(range(pos(2, 0), pos(8, 0)));
  });

  it('preamble jurisdiction: a range with either end in the preamble passes through', () => {
    const withFm = parse('---\nk: 1\n---\n\n# H\n\nBody.\n');
    const r = range(pos(1, 0), pos(5, 2)); // starts in frontmatter, ends in Body
    expect(escalateRange(withFm, r)).toEqual(r);
  });

  it('a range entirely in the preamble passes through', () => {
    const withFm = parse('---\nk: 1\n---\n\n# H\n\nBody.\n');
    const r = range(pos(1, 0), pos(1, 3));
    expect(escalateRange(withFm, r)).toEqual(r);
  });
});

describe('escalateRange: gap-line trigger and expand-only (D4 amendments)', () => {
  const md = 'First.\n\nSecond.\n';
  const doc = parse(md);
  // 0 'First.' / 1 gap / 2 'Second.' / 3 final gap

  it('drag past a node\'s end onto its gap line escalates to that single node', () => {
    const result = escalateRange(doc, range(pos(0, 2), pos(1, 0)));
    // Whole node from its first char through its own owned trailing gap
    // (one blank line here, so the cover's end already lands here).
    expect(result).toEqual(range(pos(0, 0), pos(1, 0)));
  });

  it('dragging back into the node\'s own content stays character-level', () => {
    const r = range(pos(0, 2), pos(0, 5));
    expect(escalateRange(doc, r)).toEqual(r);
  });

  it('drag onto only the first line of a multi-blank-line gap still includes the whole gap', () => {
    const loose = parse('First.\n\n\nSecond.\n');
    // 0 'First.' / 1 gap / 2 gap / 3 'Second.' / 4 final gap
    // The drag only reaches the first of First.'s two owned blank lines.
    const result = escalateRange(loose, range(pos(0, 2), pos(1, 0)));
    expect(result).toEqual(range(pos(0, 0), pos(2, 0)));
  });

  it('cursor placed on a gap line is never moved', () => {
    const r = range(pos(1, 0), pos(1, 0));
    expect(escalateRange(doc, r)).toEqual(r);
  });

  it('Select All shape in a single-node note is unchanged (expand-only)', () => {
    const single = parse('Para.\n');
    const all = range(pos(0, 0), pos(1, 0)); // spans content + final newline
    expect(escalateRange(single, all)).toEqual(all);
  });

  it('Select All shape in a multi-node note without frontmatter is unchanged', () => {
    const all = range(pos(0, 0), pos(3, 0));
    expect(escalateRange(doc, all)).toEqual(all);
  });

  it('gap trigger on a heading covers its whole section subtree', () => {
    const sec = parse('# H\n\nBody one.\n\nBody two.\n');
    // 0 '# H' / 1 gap(H) / 2 'Body one.' / 3 gap / 4 'Body two.' / 5 gap
    const result = escalateRange(sec, range(pos(0, 1), pos(1, 0)));
    // Line 5 is "Body two."'s own trailing gap — included in the cover.
    expect(result).toEqual(range(pos(0, 0), pos(5, 0)));
  });
});

describe('escalateRanges: uniform multi-range escalation (D4 amendment)', () => {
  const md = 'One.\n\nTwo.\n\nThree.\n\nFour.\n';
  const doc = parse(md);
  // 0 'One.' / 2 'Two.' / 4 'Three.' / 6 'Four.'

  it('once any range escalates, within-node ranges escalate to their own node', () => {
    const result = escalateRanges(doc, [
      range(pos(0, 1), pos(0, 3)), // within "One."
      range(pos(4, 2), pos(6, 2)), // crosses Three./Four.
    ]);
    // Each node's own trailing gap (line 1 for "One.", line 7 for "Four.")
    // is included in its cover.
    expect(result[0]).toEqual(range(pos(0, 0), pos(1, 0)));
    expect(result[1]).toEqual(range(pos(4, 0), pos(7, 0)));
  });

  it('all-within-node multi-range selections stay byte-for-byte native', () => {
    const ranges = [range(pos(0, 1), pos(0, 3)), range(pos(2, 0), pos(2, 2))];
    expect(escalateRanges(doc, ranges)).toEqual(ranges);
  });

  it('cursors are never moved, even when another range escalates', () => {
    const cursor = range(pos(2, 1), pos(2, 1));
    const result = escalateRanges(doc, [cursor, range(pos(4, 2), pos(6, 2))]);
    expect(result[0]).toEqual(cursor);
  });

  it('preamble ranges stay untouched, even when another range escalates', () => {
    const withFm = parse('---\nk: 1\n---\n\nAlpha.\n\nBeta.\n');
    // 0-2 frontmatter / 3 gap / 4 'Alpha.' / 5 gap / 6 'Beta.' / 7 gap
    const inPreamble = range(pos(1, 0), pos(1, 3));
    const result = escalateRanges(withFm, [inPreamble, range(pos(4, 2), pos(6, 2))]);
    expect(result[0]).toEqual(inPreamble);
    // Line 7 is "Beta."'s own trailing gap — included in the cover.
    expect(result[1]).toEqual(range(pos(4, 0), pos(7, 0)));
  });

  it('orientation of a force-escalated range is preserved', () => {
    const backward = range(pos(0, 3), pos(0, 1)); // backward within "One."
    const result = escalateRanges(doc, [backward, range(pos(4, 2), pos(6, 2))]);
    // Anchor lands at the cover's end (line 1, "One."'s own trailing gap).
    expect(result[0]).toEqual(range(pos(1, 0), pos(0, 0)));
  });
});

describe('escalateRange: multi-sibling scope resolution', () => {
  const md = '# One\n\nBody one.\n\n# Two\n\nBody two.\n\n# Three\n\nBody three.\n';
  const doc = parse(md);
  // 0 '# One' / 1 gap / 2 'Body one.' / 3 gap
  // 4 '# Two' / 5 gap / 6 'Body two.' / 7 gap
  // 8 '# Three' / 9 gap / 10 'Body three.'

  it('escalates to the contiguous run of whole top-level sections, not just the endpoints', () => {
    const r = range(pos(2, 3), pos(6, 2)); // Body one → Body two
    const result = escalateRange(doc, r);
    // Must cover from section One's own start through section Two's end,
    // including section Two's own trailing gap (line 7) — section Two's
    // own subtree end, not section Three's.
    expect(result.anchor).toEqual(pos(0, 0));
    expect(result.head).toEqual(pos(7, 0));
  });
});

describe('escalateRange: cross-node escalation includes the reached node\'s owned gap (escalate-include-owned-gap, docs/research/13)', () => {
  it('reaching a node\'s content via a cross-node drag is enough, no second drag onto its gap needed', () => {
    // A node's owned gap spans two blank lines; the drag stops mid-content
    // in the second node, never touching its gap at all.
    const md = 'paragraph A\n\n\nparagraph B\n\n\nparagraph C\n';
    const doc = parse(md);
    // 0 'paragraph A' / 1 gap / 2 gap / 3 'paragraph B' / 4 gap / 5 gap / 6 'paragraph C' / 7 gap
    const result = escalateRange(doc, range(pos(0, 5), pos(3, 3)));
    // Covers A + its gap + B + B's ENTIRE owned gap (lines 4-5), even though
    // the drag only reached line 3.
    expect(result).toEqual(range(pos(0, 0), pos(5, 0)));
  });
});

describe('escalateRange: idempotence and boundary invariants (property)', () => {
  /** All lines that resolve to a node, i.e. every candidate cursor line. */
  function resolvableLines(doc: ReturnType<typeof parse>, totalLines: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < totalLines; i++) if (nodeAtLine(doc, i)) out.push(i);
    return out;
  }

  it('escalating an escalated range is a no-op', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, aPick, bPick) => {
        const text = encode(tree);
        const lines = text === '' ? [] : text.split('\n');
        const doc = parse(text);
        const candidates = resolvableLines(doc, lines.length);
        if (candidates.length < 2) return true;
        const aLine = candidates[aPick % candidates.length]!;
        const bLine = candidates[bPick % candidates.length]!;
        const r = range(pos(aLine, 0), pos(bLine, (lines[bLine] ?? '').length));
        const once = escalateRange(doc, r);
        const twice = escalateRange(doc, once);
        return once.anchor.line === twice.anchor.line &&
          once.anchor.ch === twice.anchor.ch &&
          once.head.line === twice.head.line &&
          once.head.ch === twice.head.ch;
      }),
      { numRuns: 500 },
    );
  });

  it('orientation is always preserved when escalation actually changes the range', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, aPick, bPick) => {
        const text = encode(tree);
        const lines = text === '' ? [] : text.split('\n');
        const doc = parse(text);
        const candidates = resolvableLines(doc, lines.length);
        if (candidates.length < 2) return true;
        const aLine = candidates[aPick % candidates.length]!;
        const bLine = candidates[bPick % candidates.length]!;
        if (aLine === bLine) return true; // same line = same node, no escalation
        const r = range(pos(aLine, 0), pos(bLine, 0));
        const result = escalateRange(doc, r);
        const wasBackward = bLine < aLine;
        const isBackwardNow = result.head.line < result.anchor.line ||
          (result.head.line === result.anchor.line && result.head.ch < result.anchor.ch);
        // Escalation never collapses to a cursor, and never flips which end
        // (anchor vs head) sits earlier in the document.
        return wasBackward === isBackwardNow;
      }),
      { numRuns: 500 },
    );
  });

  it('a changed (escalated) range always starts at ch 0 and ends at a line\'s own length', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, aPick, bPick) => {
        const text = encode(tree);
        const lines = text === '' ? [] : text.split('\n');
        const doc = parse(text);
        const candidates = resolvableLines(doc, lines.length);
        if (candidates.length < 2) return true;
        const aLine = candidates[aPick % candidates.length]!;
        const bLine = candidates[bPick % candidates.length]!;
        const r = range(pos(aLine, 0), pos(bLine, (lines[bLine] ?? '').length));
        const result = escalateRange(doc, r);
        const changed =
          result.anchor.line !== r.anchor.line ||
          result.anchor.ch !== r.anchor.ch ||
          result.head.line !== r.head.line ||
          result.head.ch !== r.head.ch;
        if (!changed) return true;
        const lo = result.head.line < result.anchor.line ? result.head : result.anchor;
        const hi = result.head.line < result.anchor.line ? result.anchor : result.head;
        return lo.ch === 0 && hi.ch === (lines[hi.line] ?? '').length;
      }),
      { numRuns: 500 },
    );
  });

  it('an escalated range always contains the original range (expand-only)', () => {
    const notAfter = (a: LinePos, b: LinePos): boolean =>
      a.line < b.line || (a.line === b.line && a.ch <= b.ch);
    const sorted = (r: LineRange): [LinePos, LinePos] =>
      notAfter(r.anchor, r.head) ? [r.anchor, r.head] : [r.head, r.anchor];
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, aPick, bPick) => {
        const text = encode(tree);
        const lines = text === '' ? [] : text.split('\n');
        const doc = parse(text);
        const candidates = resolvableLines(doc, lines.length);
        if (candidates.length < 1) return true;
        const aLine = candidates[aPick % candidates.length]!;
        const bLine = candidates[bPick % candidates.length]!;
        const r = range(pos(aLine, 0), pos(bLine, (lines[bLine] ?? '').length));
        const result = escalateRange(doc, r);
        const [lo, hi] = sorted(r);
        const [resLo, resHi] = sorted(result);
        return notAfter(resLo, lo) && notAfter(hi, resHi);
      }),
      { numRuns: 500 },
    );
  });

  it('within-node and cursor inputs are always returned unchanged', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), (tree, pick) => {
        const text = encode(tree);
        const lines = text === '' ? [] : text.split('\n');
        const doc = parse(text);
        const candidates = resolvableLines(doc, lines.length);
        if (candidates.length === 0) return true;
        const line = candidates[pick % candidates.length]!;
        const cursor = range(pos(line, 0), pos(line, 0));
        const untouched = escalateRange(doc, cursor);
        return untouched.anchor.line === line && untouched.head.line === line;
      }),
      { numRuns: 300 },
    );
  });
});

describe('clampCursorToContent: marker-transparent cursor placement (design.md D13)', () => {
  it('a cursor before a list item\'s marker+space redirects to content start', () => {
    const doc = parse('- alpha\n');
    expect(clampCursorToContent(doc, pos(0, 0))).toEqual(pos(0, 2));
    expect(clampCursorToContent(doc, pos(0, 1))).toEqual(pos(0, 2));
  });

  it('a cursor already at or past content start is unchanged', () => {
    const doc = parse('- alpha\n');
    expect(clampCursorToContent(doc, pos(0, 2))).toEqual(pos(0, 2));
    expect(clampCursorToContent(doc, pos(0, 5))).toEqual(pos(0, 5));
  });

  it('an ordered marker (longer prefix) redirects correctly', () => {
    const doc = parse('12. item\n');
    expect(clampCursorToContent(doc, pos(0, 0))).toEqual(pos(0, 4));
    expect(clampCursorToContent(doc, pos(0, 3))).toEqual(pos(0, 4));
  });

  it('a continuation line\'s alignment whitespace also redirects', () => {
    const doc = parse('- alpha\n  more text\n');
    // Line 1 is the continuation line, indented to the content column (2).
    expect(clampCursorToContent(doc, pos(1, 0))).toEqual(pos(1, 2));
    expect(clampCursorToContent(doc, pos(1, 2))).toEqual(pos(1, 2));
  });

  it('a nested (indented) list item redirects past its own indent AND marker', () => {
    const doc = parse('- a\n\t- b\n');
    const bLine = 1;
    expect(clampCursorToContent(doc, pos(bLine, 0))).toEqual(pos(bLine, 3)); // '\t- '.length
    expect(clampCursorToContent(doc, pos(bLine, 1))).toEqual(pos(bLine, 3));
  });

  it('paragraphs and headings are untouched, even with marker-like leading text', () => {
    const doc = parse('# Heading\n\nPara.\n');
    expect(clampCursorToContent(doc, pos(0, 0))).toEqual(pos(0, 0));
    expect(clampCursorToContent(doc, pos(2, 0))).toEqual(pos(2, 0));
  });

  it('gap lines are untouched (deliberately deferred, docs/research/13)', () => {
    const doc = parse('First.\n\nSecond.\n');
    expect(clampCursorToContent(doc, pos(1, 0))).toEqual(pos(1, 0));
  });

  it('preamble/out-of-jurisdiction positions are untouched', () => {
    const doc = parse('---\nk: 1\n---\n\n- item\n');
    expect(clampCursorToContent(doc, pos(1, 0))).toEqual(pos(1, 0));
  });

  it('property: clamping is idempotent', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, linePick, chPick) => {
        const text = encode(tree);
        const doc = parse(text);
        const lines = text === '' ? [] : text.split('\n');
        if (lines.length === 0) return true;
        const line = linePick % lines.length;
        const ch = chPick % ((lines[line]?.length ?? 0) + 1);
        const once = clampCursorToContent(doc, pos(line, ch));
        const twice = clampCursorToContent(doc, once);
        return once.line === twice.line && once.ch === twice.ch;
      }),
      { numRuns: 300 },
    );
  });

  it('property: clamping never moves to a different line, and only ever increases ch', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, linePick, chPick) => {
        const text = encode(tree);
        const doc = parse(text);
        const lines = text === '' ? [] : text.split('\n');
        if (lines.length === 0) return true;
        const line = linePick % lines.length;
        const ch = chPick % ((lines[line]?.length ?? 0) + 1);
        const result = clampCursorToContent(doc, pos(line, ch));
        return result.line === line && result.ch >= ch;
      }),
      { numRuns: 300 },
    );
  });

  it('property: only list-item lines are ever changed', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), (tree, linePick) => {
        const text = encode(tree);
        const doc = parse(text);
        const lines = text === '' ? [] : text.split('\n');
        if (lines.length === 0) return true;
        const line = linePick % lines.length;
        const result = clampCursorToContent(doc, pos(line, 0));
        if (result.ch === 0) return true; // unchanged
        const node = nodeAtLine(doc, line);
        return node?.kind === 'list-item';
      }),
      { numRuns: 300 },
    );
  });

  it('property: clamping a list-item line at ch 0 matches contentColumnCh exactly', () => {
    fc.assert(
      fc.property(arbTree(), (tree) => {
        const text = encode(tree);
        const doc = parse(text);
        const lines = text === '' ? [] : text.split('\n');
        for (let line = 0; line < lines.length; line++) {
          const node = nodeAtLine(doc, line);
          if (node?.kind !== 'list-item') continue;
          const result = clampCursorToContent(doc, pos(line, 0));
          const expected = contentColumnCh(lines[line] ?? '');
          if (result.ch !== expected) return false;
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });
});

describe('coveredSubtreeRoots: escalated-selection-decoration query (docs/research/13)', () => {
  // H
  //  - Para one.       (leaf)
  //  - Para two.        -> item -> child   (nested: a naked list after a
  //                                          paragraph becomes its child)
  const md = '# H\n\nPara one.\n\nPara two.\n\n- item\n  - child\n';
  const doc = parse(md);
  const paraOne = nodeAtLine(doc, 2)!;
  const paraTwo = nodeAtLine(doc, 4)!;

  it('cursor (empty range) never matches', () => {
    expect(coveredSubtreeRoots(doc, range(pos(2, 3), pos(2, 3)))).toBeNull();
  });

  it('a partial within-node selection does not match', () => {
    expect(coveredSubtreeRoots(doc, range(pos(2, 0), pos(2, 5)))).toBeNull();
  });

  it('a content-only range short of the node\'s own gap does not match', () => {
    // paraOne owns a trailing gap (line 3); the cover now always includes
    // it, so a range that stops at the content end alone is not a match.
    const r = range(pos(2, 0), pos(2, 'Para one.'.length));
    expect(coveredSubtreeRoots(doc, r)).toBeNull();
  });

  it('an exact leaf match, content plus its own owned trailing gap', () => {
    const r = range(pos(2, 0), pos(3, 0));
    expect(coveredSubtreeRoots(doc, r)).toEqual([paraOne]);
  });

  it('a raw (pre-escalation) boundary-crossing range does not yet match', () => {
    // Same shape as the "drag from mid-paragraph into the next paragraph"
    // scenario, before the filter has escalated it — lo isn't at the cover's
    // start yet, so this must not be mistaken for an already-covering range.
    expect(coveredSubtreeRoots(doc, range(pos(2, 5), pos(4, 3)))).toBeNull();
  });

  it('the escalated result of that same drag matches both sibling subtrees', () => {
    const escalated = escalateRange(doc, range(pos(2, 5), pos(4, 3)));
    const result = coveredSubtreeRoots(doc, escalated);
    expect(result).toEqual([paraOne, paraTwo]);
  });

  it('preamble-jurisdiction ranges never match', () => {
    const withFm = parse('---\nk: 1\n---\n\n# H\n\nBody.\n');
    expect(coveredSubtreeRoots(withFm, range(pos(1, 0), pos(5, 2)))).toBeNull();
  });

  describe('the gap-line trigger shape (cover end is the node\'s own owned gap)', () => {
    const gapMd = 'First.\n\nSecond.\n';
    const gapDoc = parse(gapMd);
    // 0 'First.' / 1 gap / 2 'Second.' / 3 final gap
    const first = nodeAtLine(gapDoc, 0)!;
    const second = nodeAtLine(gapDoc, 2)!;

    it('a drag past a node\'s end onto its gap line still matches, once escalated', () => {
      const escalated = escalateRange(gapDoc, range(pos(0, 2), pos(1, 0)));
      // Sanity: this is exactly the shape escalateRange's own gap-trigger
      // test asserts (lo pinned to cover start, hi at the cover's gap-
      // inclusive end).
      expect(escalated).toEqual(range(pos(0, 0), pos(1, 0)));
      expect(coveredSubtreeRoots(gapDoc, escalated)).toEqual([first]);
    });

    it('Select All (multi-node, no frontmatter) matches the full top-level run', () => {
      const all = range(pos(0, 0), pos(3, 0));
      expect(rangesEqual(escalateRange(gapDoc, all), all)).toBe(true); // unchanged (expand-only)
      expect(coveredSubtreeRoots(gapDoc, all)).toEqual([first, second]);
    });

    it('a cursor placed on a gap line never matches', () => {
      expect(coveredSubtreeRoots(gapDoc, range(pos(1, 0), pos(1, 0)))).toBeNull();
    });
  });

  it('property: any range escalateRange actually changes is recognized as a cover once escalated', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, aPick, bPick) => {
        const text = encode(tree);
        const lines = text === '' ? [] : text.split('\n');
        const d = parse(text);
        const candidates: number[] = [];
        for (let i = 0; i < lines.length; i++) if (nodeAtLine(d, i)) candidates.push(i);
        if (candidates.length < 2) return true;
        const aLine = candidates[aPick % candidates.length]!;
        const bLine = candidates[bPick % candidates.length]!;
        const r = range(pos(aLine, 0), pos(bLine, (lines[bLine] ?? '').length));
        const escalated = escalateRange(d, r);
        if (rangesEqual(escalated, r)) return true; // not an escalation of interest here
        return coveredSubtreeRoots(d, escalated) !== null;
      }),
      { numRuns: 500 },
    );
  });

  it('property: escalating an already-covering range never changes it (idempotence via the query)', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, aPick, bPick) => {
        const text = encode(tree);
        const lines = text === '' ? [] : text.split('\n');
        const d = parse(text);
        const candidates: number[] = [];
        for (let i = 0; i < lines.length; i++) if (nodeAtLine(d, i)) candidates.push(i);
        if (candidates.length < 2) return true;
        const aLine = candidates[aPick % candidates.length]!;
        const bLine = candidates[bPick % candidates.length]!;
        const r = range(pos(aLine, 0), pos(bLine, (lines[bLine] ?? '').length));
        const escalated = escalateRange(d, r);
        const roots = coveredSubtreeRoots(d, escalated);
        if (roots === null) return true;
        // A recognized cover must itself be a fixed point of escalation.
        return rangesEqual(escalateRange(d, escalated), escalated);
      }),
      { numRuns: 500 },
    );
  });
});
