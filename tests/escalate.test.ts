import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import {
  coveredSubtreeRoots,
  escalateRange,
  escalateRanges,
  forestCoverOf,
  rangesEqual,
  type LinePos,
  type LineRange,
} from '../src/escalate';
import { nodeAtLine } from '../src/locate';
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
    // Whole node from its first char through its own trailing gap
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

describe('escalateRange: forest span across scopes (selection-as-subtree-set D2)', () => {
  const md = '# One\n\nBody one.\n\n# Two\n\nBody two.\n\n# Three\n\nBody three.\n';
  const doc = parse(md);
  // 0 '# One' / 1 gap / 2 'Body one.' / 3 gap
  // 4 '# Two' / 5 gap / 6 'Body two.' / 7 gap
  // 8 '# Three' / 9 gap / 10 'Body three.'

  it('crossing out of a section does NOT pull that section\'s heading in', () => {
    const r = range(pos(2, 3), pos(6, 2)); // Body one → Body two
    const result = escalateRange(doc, r);
    // Starts at Body one's OWN line, not at '# One'. Under the replaced
    // sibling-run rule this was pos(0, 0): both ends resolved to the root
    // scope, dragging sections One AND Two in whole. '# One' sits ABOVE the
    // span, so downward closure has no claim on it.
    expect(result.anchor).toEqual(pos(2, 0));
    // Ends at section Two's subtree end (Body two's own gap, line 7) — NOT
    // at Body two's own end. '# Two' (line 4) falls INSIDE the span, so its
    // whole subtree comes along. This is the case the two candidate wordings
    // for the end bound disagree on.
    expect(result.head).toEqual(pos(7, 0));
  });

  it('the covered roots are Body one and section Two — at different depths', () => {
    const escalated = escalateRange(doc, range(pos(2, 3), pos(6, 2)));
    const roots = coveredSubtreeRoots(doc, escalated);
    expect(roots?.map((n) => n.lines[0])).toEqual(['Body one.', '# Two']);
  });
});

describe('forestCoverOf: the geometry (selection-as-subtree-set D2)', () => {
  // The worked example from design D2 and the spec's own scenarios.
  //   0 '- P' / 1 '  - c1' / 2 '  - c2'
  //   3 '- S' / 4 '  - t1' / 5 '  - t2'
  const md = '- P\n  - c1\n  - c2\n- S\n  - t1\n  - t2\n';
  const doc = parse(md);
  const at = (line: number) => nodeAtLine(doc, line)!;
  const firstLines = (cover: { roots: readonly { lines: readonly string[] }[] }) =>
    cover.roots.map((n) => n.lines[0]);

  it('an ancestor swallowed mid-span brings its later children with it', () => {
    // c2 → t1. `S`'s own line is inside the span, so `t2` comes too.
    // Stating the end as "t1's own subtree end" would select `S` whole while
    // leaving `t2` out — the downward-closure violation D2 exists to forbid.
    const cover = forestCoverOf(doc, at(2), at(4));
    expect(firstLines(cover)).toEqual(['  - c2', '- S']);
    expect(cover.cover.start).toEqual(pos(2, 0));
    expect(cover.cover.end).toEqual(pos(6, 0)); // through t2's own trailing gap
  });

  it('crossing between two siblings does not reach their later siblings', () => {
    // c1 → c2, with no ancestor of c2 beginning inside the span. `P` starts
    // above it, so `P` is excluded and the span stops at c2.
    const cover = forestCoverOf(doc, at(1), at(2));
    expect(firstLines(cover)).toEqual(['  - c1', '  - c2']);
    expect(cover.cover).toEqual({ start: pos(1, 0), end: pos(2, 6) });
  });

  it('one end inside the other\'s subtree covers the ancestor whole', () => {
    const cover = forestCoverOf(doc, at(0), at(2)); // P → c2
    expect(firstLines(cover)).toEqual(['- P']);
    expect(cover.cover).toEqual({ start: pos(0, 0), end: pos(2, 6) });
  });

  it('is orientation-independent: the roots are the same either way round', () => {
    expect(forestCoverOf(doc, at(4), at(2))).toEqual(forestCoverOf(doc, at(2), at(4)));
    expect(forestCoverOf(doc, at(2), at(0))).toEqual(forestCoverOf(doc, at(0), at(2)));
  });

  it('roots may sit at different depths and are not made siblings', () => {
    // c2 (depth 2) → S (depth 1): no common ancestor is added.
    const cover = forestCoverOf(doc, at(2), at(3));
    expect(firstLines(cover)).toEqual(['  - c2', '- S']);
  });

  it('a deeper end reaches back up: c1 → t2 takes c1, c2 and all of S', () => {
    const cover = forestCoverOf(doc, at(1), at(5));
    expect(firstLines(cover)).toEqual(['  - c1', '  - c2', '- S']);
    expect(cover.cover).toEqual({ start: pos(1, 0), end: pos(6, 0) });
  });

  it('every root\'s whole subtree is inside the cover (downward closure, by hand)', () => {
    const cover = forestCoverOf(doc, at(2), at(4));
    // `S` is a root, so `t1` and `t2` — its descendants — must both be
    // within the span, not merely `t1` which the drag actually reached.
    expect(cover.cover.end.line).toBe(6); // t2's gap, past t1 (line 4)
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

describe('escalateRange: downward closure and contiguity (selection-as-subtree-set)', () => {
  /** All lines that resolve to a node, i.e. every candidate cursor line. */
  function resolvableLines(doc: ReturnType<typeof parse>, totalLines: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < totalLines; i++) if (nodeAtLine(doc, i)) out.push(i);
    return out;
  }

  /** Every node with its own line bounds — own lines only, gap excluded, so
   * "inside the cover" means the node's own text was selected. */
  function nodeExtents(
    doc: ReturnType<typeof parse>,
  ): { node: ReturnType<typeof nodeAtLine>; start: number; ownEnd: number; depth: number }[] {
    const out: { node: ReturnType<typeof nodeAtLine>; start: number; ownEnd: number; depth: number }[] = [];
    let line = doc.preamble.length;
    const walk = (node: NonNullable<ReturnType<typeof nodeAtLine>>, depth: number): void => {
      out.push({ node, start: line, ownEnd: line + node.lines.length - 1, depth });
      line += node.lines.length + node.trailingGap.length;
      node.children.forEach((child) => walk(child, depth + 1));
    };
    doc.children.forEach((child) => walk(child, 0));
    return out;
  }

  /** An escalated range's line span, orientation-normalized. */
  function span(r: LineRange): { lo: number; hi: number } {
    return r.head.line < r.anchor.line
      ? { lo: r.head.line, hi: r.anchor.line }
      : { lo: r.anchor.line, hi: r.head.line };
  }

  /** A sample that ESCALATION ACTUALLY CHANGED. The invariant governs covers
   * the filter produced, not every range it returns: a within-node selection
   * passes through untouched and is not a cover at all — `- A\n  - a` with a
   * range inside `- A`'s own text was the first counterexample this property
   * reported, and it is correct behavior, not a violation. Guarding on
   * `changed` rather than on `coveredSubtreeRoots` keeps the property
   * independent of the query it is meant to backstop. */
  const escalatedSamples = (tree: Parameters<typeof encode>[0], aPick: number, bPick: number) => {
    const text = encode(tree);
    const lines = text === '' ? [] : text.split('\n');
    const doc = parse(text);
    const candidates = resolvableLines(doc, lines.length);
    if (candidates.length < 2) return undefined;
    const aLine = candidates[aPick % candidates.length]!;
    const bLine = candidates[bPick % candidates.length]!;
    const r = range(pos(aLine, 0), pos(bLine, (lines[bLine] ?? '').length));
    const escalated = escalateRange(doc, r);
    if (rangesEqual(escalated, r)) return undefined;
    return { doc, escalated };
  };

  // THE property this change turns on. The first draft of design D2 stated
  // the cover's end as "lastNode's own subtree end", which selects an
  // ancestor's whole line while leaving its later children out whenever that
  // ancestor begins inside the span. Nothing else in this suite fails under
  // that rule — expand-only, orientation, idempotence and the ch-boundary
  // property all hold for it. This is the one that does.
  it('property: no node is covered without its whole subtree (downward closure)', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, aPick, bPick) => {
        const sample = escalatedSamples(tree, aPick, bPick);
        if (!sample) return true;
        const { doc, escalated } = sample;
        const { lo, hi } = span(escalated);
        const extents = nodeExtents(doc);
        const inside = (e: (typeof extents)[number]): boolean => e.start >= lo && e.ownEnd <= hi;

        // For every node whose OWN lines are fully inside the cover, every
        // descendant's own lines must be inside too. Descendants of a node
        // are the following entries with a strictly greater depth, up to the
        // next entry at or above the node's own depth.
        for (let i = 0; i < extents.length; i++) {
          const parent = extents[i]!;
          if (!inside(parent)) continue;
          for (let j = i + 1; j < extents.length && extents[j]!.depth > parent.depth; j++) {
            if (!inside(extents[j]!)) return false;
          }
        }
        return true;
      }),
      { numRuns: 500 },
    );
  });

  it('property: an escalated cover is a single contiguous span with no interior gaps', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, aPick, bPick) => {
        const sample = escalatedSamples(tree, aPick, bPick);
        if (!sample) return true;
        const { doc, escalated } = sample;
        // A range escalation changed is always an exact cover — asserted,
        // not assumed, so this property fails loudly rather than vacuously
        // skipping if that ever stops being true.
        const roots = coveredSubtreeRoots(doc, escalated);
        if (!roots) return false;
        const { lo, hi } = span(escalated);
        const extents = nodeExtents(doc);
        const byNode = new Map(extents.map((e) => [e.node, e]));

        // Consecutive roots must abut: each root's subtree (its own lines,
        // its gap, and every descendant's) ends exactly where the next root
        // begins. That is what makes the forest ONE range rather than
        // several, which is what keeps block selection distinguishable from
        // multi-cursor by shape alone.
        let cursor = lo;
        for (const root of roots) {
          const e = byNode.get(root)!;
          if (e.start !== cursor) return false;
          // Advance past the whole subtree: the next entry at or above this
          // root's depth, or the document's end.
          const index = extents.indexOf(e);
          let next = index + 1;
          while (next < extents.length && extents[next]!.depth > e.depth) next++;
          cursor = next < extents.length ? extents[next]!.start : hi + 1;
        }
        return cursor === hi + 1 || cursor > hi;
      }),
      { numRuns: 500 },
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

  it('an exact leaf match, content plus its own trailing gap', () => {
    const r = range(pos(2, 0), pos(3, 0));
    expect(coveredSubtreeRoots(doc, r)).toEqual([paraOne]);
  });

  it('a whitespace-only gap line matches at ch 0, not the stored line\'s length', () => {
    // parse.ts's isBlank treats a whitespace-only line as blank, but stores
    // it verbatim in trailingGap. The cover end must resolve to ch 0
    // regardless, so a range ending right at the gap line's start still
    // matches — it must not require reaching past the incidental whitespace.
    const whitespaceGap = parse('First.\n  \nSecond.\n');
    const first = nodeAtLine(whitespaceGap, 0)!;
    const r = range(pos(0, 0), pos(1, 0));
    expect(coveredSubtreeRoots(whitespaceGap, r)).toEqual([first]);
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

  describe('the gap-line trigger shape (cover end is the node\'s own gap)', () => {
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
