import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { clampCursorToContent, escalateRange, escalateRanges, type LinePos, type LineRange } from '../src/escalate';
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
    expect(result).toEqual(range(pos(2, 0), pos(7, '  - child'.length)));
  });

  it('backward drag stays backward: head lands at the start side', () => {
    const r = range(pos(4, 3), pos(2, 5)); // anchor lower, head upper: backward
    const result = escalateRange(doc, r);
    expect(result).toEqual(range(pos(7, '  - child'.length), pos(2, 0)));
  });

  it('selection leaving a parent covers the heading\'s entire subtree', () => {
    const r = range(pos(0, 2), pos(2, 3)); // starts in heading text, ends in Para one
    const result = escalateRange(doc, r);
    expect(result).toEqual(range(pos(0, 0), pos(7, '  - child'.length)));
  });

  it('keyboard selection crossing a boundary (Shift+ArrowDown-style range) escalates', () => {
    // From end of "Para one." to start of "Para two." — still crosses.
    const r = range(pos(2, 'Para one.'.length), pos(4, 0));
    const result = escalateRange(doc, r);
    expect(result).toEqual(range(pos(2, 0), pos(7, '  - child'.length)));
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
    // Whole node from its first char, head retained where the user dragged
    // (expand-only: the gap position is beyond the content cover and kept).
    expect(result).toEqual(range(pos(0, 0), pos(1, 0)));
  });

  it('dragging back into the node\'s own content stays character-level', () => {
    const r = range(pos(0, 2), pos(0, 5));
    expect(escalateRange(doc, r)).toEqual(r);
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
    expect(result).toEqual(range(pos(0, 0), pos(4, 'Body two.'.length)));
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
    expect(result[0]).toEqual(range(pos(0, 0), pos(0, 'One.'.length)));
    expect(result[1]).toEqual(range(pos(4, 0), pos(6, 'Four.'.length)));
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
    // 0-2 frontmatter / 3 gap / 4 'Alpha.' / 5 gap / 6 'Beta.'
    const inPreamble = range(pos(1, 0), pos(1, 3));
    const result = escalateRanges(withFm, [inPreamble, range(pos(4, 2), pos(6, 2))]);
    expect(result[0]).toEqual(inPreamble);
    expect(result[1]).toEqual(range(pos(4, 0), pos(6, 'Beta.'.length)));
  });

  it('orientation of a force-escalated range is preserved', () => {
    const backward = range(pos(0, 3), pos(0, 1)); // backward within "One."
    const result = escalateRanges(doc, [backward, range(pos(4, 2), pos(6, 2))]);
    expect(result[0]).toEqual(range(pos(0, 'One.'.length), pos(0, 0)));
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
    // Must cover from section One's own start through section Two's end —
    // section Two's own subtree end (its last line), not section Three's.
    expect(result.anchor).toEqual(pos(0, 0));
    expect(result.head).toEqual(pos(6, 'Body two.'.length));
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
