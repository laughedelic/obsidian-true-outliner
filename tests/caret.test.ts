import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { nodeAtLine, nodeStartLine } from '../src/locate';
import {
  contentBoundaryCh,
  isAddressable,
  nodeContentEnd,
  nodeContentStart,
  nextNodeInOrder,
  planHorizontal,
  previousNodeInOrder,
  resolvePlacement,
  resolveMarkerPlacement,
} from '../src/caret';
import { arbTree } from './generators';
import { type LinePos } from '../src/line-pos';

const pos = (line: number, ch: number): LinePos => ({ line, ch });

describe('isAddressable', () => {
  it('a gap line is not addressable', () => {
    const doc = parse('First.\n\nSecond.\n');
    expect(isAddressable(doc, pos(1, 0))).toBe(false);
  });

  it("a list item's marker prefix is not addressable", () => {
    const doc = parse('- alpha\n');
    expect(isAddressable(doc, pos(0, 0))).toBe(false);
    expect(isAddressable(doc, pos(0, 1))).toBe(false);
    expect(isAddressable(doc, pos(0, 2))).toBe(true);
  });

  it("a continuation line's alignment whitespace is not addressable", () => {
    const doc = parse('- alpha\n  more text\n');
    expect(isAddressable(doc, pos(1, 0))).toBe(false);
    expect(isAddressable(doc, pos(1, 2))).toBe(true);
  });

  it("a heading's # prefix IS addressable (D7)", () => {
    const doc = parse('## Heading\n');
    expect(isAddressable(doc, pos(0, 0))).toBe(true);
  });

  it("an atom's interior lines are addressable at column 0 (D8)", () => {
    const doc = parse('```\ncode line\n```\n');
    expect(isAddressable(doc, pos(1, 0))).toBe(true);
  });

  it('every preamble position is addressable', () => {
    const doc = parse('---\nk: 1\n---\n\n- item\n');
    expect(isAddressable(doc, pos(1, 0))).toBe(true);
    expect(isAddressable(doc, pos(3, 0))).toBe(true);
  });

  it('property: every position resolvePlacement returns is addressable', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, linePick, chPick) => {
        const text = encode(tree);
        const doc = parse(text);
        const lines = text === '' ? [] : text.split('\n');
        if (lines.length === 0) return true;
        const line = linePick % lines.length;
        const ch = chPick % ((lines[line]?.length ?? 0) + 1);
        const resolved = resolvePlacement(doc, pos(line, ch));
        return isAddressable(doc, resolved);
      }),
      { numRuns: 500 },
    );
  });
});

describe('planHorizontal grapheme stepping (PR #31 review)', () => {
  // `ch` is a UTF-16 offset, so `ch ± 1` is a code UNIT. Native arrow motion
  // moves by grapheme cluster, and this planner replaced native motion.
  it('steps over an astral emoji rather than into its surrogate pair', () => {
    const doc = parse('a\u{1F600}b\n');
    expect(planHorizontal(doc, pos(0, 1), 'right')).toEqual(pos(0, 3)); // naive: 2
    expect(planHorizontal(doc, pos(0, 3), 'left')).toEqual(pos(0, 1)); // naive: 2
  });

  it('steps over a combining sequence as one character', () => {
    const doc = parse('xe\u0301y\n'); // "xéy" with a combining acute
    expect(planHorizontal(doc, pos(0, 1), 'right')).toEqual(pos(0, 3)); // naive: 2
    expect(planHorizontal(doc, pos(0, 3), 'left')).toEqual(pos(0, 1));
  });

  it('never steps left past a list item\'s content boundary', () => {
    const doc = parse('- a\u{1F600}\n');
    expect(planHorizontal(doc, pos(0, 4), 'left')).toEqual(pos(0, 3));
    expect(planHorizontal(doc, pos(0, 3), 'left')).toEqual(pos(0, 2)); // the boundary
  });
});

describe('contentBoundaryCh (PR #31 review: list prefix only, no heading)', () => {
  const boundaryOf = (src: string, line = 0): number => {
    const doc = parse(src);
    const node = nodeAtLine(doc, line)!;
    const start = nodeStartLine(doc, node.id);
    return contentBoundaryCh(node, node.lines[line - start]!);
  };

  it('does NOT treat an ATX prefix inside a list item as chrome', () => {
    // `contentColumnCh` swallows a heading prefix too; reusing it made `# `
    // non-addressable here, contradicting "a heading's # stays addressable".
    expect(boundaryOf('- # title\n')).toBe(2);
    expect(boundaryOf('  - # h\n')).toBe(4);
  });

  it('does NOT eat punctuation at the start of a CONTINUATION line', () => {
    // Making the post-marker whitespace optional everywhere (to cover a bare
    // `-`) swallowed ordinary content: `  *emphasis*` measured a boundary of 3,
    // so the `*` was non-addressable, and `  -foo` the same. A marker needs a
    // space after it or nothing at all.
    expect(boundaryOf('- item\n  *emphasis*\n', 1)).toBe(2);
    expect(boundaryOf('- item\n  -foo\n', 1)).toBe(2);
    expect(boundaryOf('- item\n  1.5 litres\n', 1)).toBe(2);
  });

  it('covers a marker with no trailing space, so the marker is never addressable', () => {
    // An empty item mid-edit. Requiring whitespace left the boundary at 0,
    // putting a hole in the invariant exactly where the marker is all there is.
    expect(boundaryOf('-\n')).toBe(1);
  });

  it('leaves a nested ordered marker as content, matching the outer-marker-only rule', () => {
    expect(boundaryOf('- 1. x\n')).toBe(2);
  });

  it('still measures a continuation line\'s alignment whitespace', () => {
    expect(boundaryOf('- a\n  second line\n', 1)).toBe(2);
  });

  it('is zero for every non-list kind', () => {
    expect(boundaryOf('# Heading\n')).toBe(0);
    expect(boundaryOf('> quote\n')).toBe(0);
    expect(boundaryOf('plain\n')).toBe(0);
  });
});

describe('resolveMarkerPlacement (Q25: the marker half alone)', () => {
  it('clamps a marker prefix to content start, exactly like resolvePlacement', () => {
    const doc = parse('- alpha\n');
    expect(resolveMarkerPlacement(doc, pos(0, 0))).toEqual(pos(0, 2));
    expect(resolveMarkerPlacement(doc, pos(0, 1))).toEqual(pos(0, 2));
  });

  it('clamps inside a checkbox item\'s marker — the case Obsidian\'s own widget mount lands on', () => {
    const doc = parse('- [ ] alpha\n');
    expect(resolveMarkerPlacement(doc, pos(0, 0))).toEqual(pos(0, 2));
  });

  it('leaves a gap line ALONE, unlike resolvePlacement (D2 scopes gaps to user gestures)', () => {
    const doc = parse('First.\n\nSecond.\n');
    expect(resolvePlacement(doc, pos(1, 0))).toEqual(pos(0, 'First.'.length));
    expect(resolveMarkerPlacement(doc, pos(1, 0))).toEqual(pos(1, 0));
  });

  it('leaves already-addressable and preamble positions unchanged', () => {
    const doc = parse('- alpha\n');
    expect(resolveMarkerPlacement(doc, pos(0, 5))).toEqual(pos(0, 5));
    const withPreamble = parse('---\nk: 1\n---\n\n- item\n');
    expect(resolveMarkerPlacement(withPreamble, pos(1, 0))).toEqual(pos(1, 0));
  });

  it('is idempotent — the property the filter relies on to self-terminate', () => {
    const doc = parse('- [x] done\n');
    const once = resolveMarkerPlacement(doc, pos(0, 0));
    expect(resolveMarkerPlacement(doc, once)).toEqual(once);
  });
});

describe('resolvePlacement (D2)', () => {
  it('a gap line resolves to the owning (preceding) node\'s content end', () => {
    const doc = parse('First.\n\nSecond.\n');
    expect(resolvePlacement(doc, pos(1, 0))).toEqual(pos(0, 'First.'.length));
  });

  it('a marker prefix resolves to content start', () => {
    const doc = parse('- alpha\n');
    expect(resolvePlacement(doc, pos(0, 0))).toEqual(pos(0, 2));
    expect(resolvePlacement(doc, pos(0, 1))).toEqual(pos(0, 2));
  });

  it('an already-addressable position is unchanged', () => {
    const doc = parse('- alpha\n');
    expect(resolvePlacement(doc, pos(0, 2))).toEqual(pos(0, 2));
    expect(resolvePlacement(doc, pos(0, 5))).toEqual(pos(0, 5));
  });

  it('preamble positions are unchanged', () => {
    const doc = parse('---\nk: 1\n---\n\n- item\n');
    expect(resolvePlacement(doc, pos(1, 0))).toEqual(pos(1, 0));
  });

  it('a whole-blank-line gap of several lines resolves to content end regardless of which gap line', () => {
    const doc = parse('First.\n\n\nSecond.\n');
    expect(resolvePlacement(doc, pos(1, 0))).toEqual(pos(0, 'First.'.length));
    expect(resolvePlacement(doc, pos(2, 0))).toEqual(pos(0, 'First.'.length));
  });

  it('property: idempotent', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, linePick, chPick) => {
        const text = encode(tree);
        const doc = parse(text);
        const lines = text === '' ? [] : text.split('\n');
        if (lines.length === 0) return true;
        const line = linePick % lines.length;
        const ch = chPick % ((lines[line]?.length ?? 0) + 1);
        const once = resolvePlacement(doc, pos(line, ch));
        const twice = resolvePlacement(doc, once);
        return once.line === twice.line && once.ch === twice.ch;
      }),
      { numRuns: 500 },
    );
  });
});

describe('previousNodeInOrder / nextNodeInOrder', () => {
  it("a child's predecessor is its parent", () => {
    const doc = parse('- parent\n  - child\n');
    const parent = nodeAtLine(doc, 0)!;
    const child = nodeAtLine(doc, 1)!;
    expect(previousNodeInOrder(doc, child)).toBe(parent);
  });

  it("a parent's successor is its first child, not its own trailing gap", () => {
    const doc = parse('- parent\n  - child\n');
    const parent = nodeAtLine(doc, 0)!;
    const child = nodeAtLine(doc, 1)!;
    expect(nextNodeInOrder(doc, parent)).toBe(child);
  });

  it('the first node in the document has no predecessor', () => {
    const doc = parse('First.\n\nSecond.\n');
    const first = nodeAtLine(doc, 0)!;
    expect(previousNodeInOrder(doc, first)).toBeUndefined();
  });

  it('a document with no preamble: the first node still has no predecessor', () => {
    const doc = parse('- only\n');
    const only = nodeAtLine(doc, 0)!;
    expect(previousNodeInOrder(doc, only)).toBeUndefined();
  });

  it('the last node in the document has no successor', () => {
    const doc = parse('First.\n\nSecond.\n');
    const second = nodeAtLine(doc, 2)!;
    expect(nextNodeInOrder(doc, second)).toBeUndefined();
  });
});

describe('planHorizontal (D4)', () => {
  it("left escapes a list item backwards to the previous node's content end", () => {
    const doc = parse('- alpha\n- bravo\n');
    expect(planHorizontal(doc, pos(1, 2), 'left')).toEqual(pos(0, '- alpha'.length));
  });

  it("right skips the next item's marker", () => {
    const doc = parse('- alpha\n- bravo\n');
    expect(planHorizontal(doc, pos(0, '- alpha'.length), 'right')).toEqual(pos(1, 2));
  });

  it('left at a paragraph start crosses the gap above', () => {
    const doc = parse('Alpha one.\n\nBravo two.\n');
    expect(planHorizontal(doc, pos(2, 0), 'left')).toEqual(pos(0, 'Alpha one.'.length));
  });

  it('right at a paragraph end crosses the gap below', () => {
    const doc = parse('Alpha one.\n\nBravo two.\n');
    expect(planHorizontal(doc, pos(0, 'Alpha one.'.length), 'right')).toEqual(pos(2, 0));
  });

  // 'noop' rather than null at a document edge: null DECLINES the key, and native
  // motion at an edge is not the no-op it looks like — at the last node it steps
  // onto the trailing gap line and only the placement filter brings it back,
  // which is the post-hoc correction bound motion exists to avoid. 'noop' lets
  // the handler consume the key and move nothing.
  it("left at the document's first node is a consumable no-op", () => {
    const doc = parse('- alpha\n- bravo\n');
    expect(planHorizontal(doc, pos(0, 2), 'left')).toBe('noop');
  });

  it("right at the document's last node is a consumable no-op", () => {
    const doc = parse('- alpha\n- bravo\n');
    expect(planHorizontal(doc, pos(1, '- bravo'.length), 'right')).toBe('noop');
  });

  it('a caret left on a gap line plans DIRECTIONALLY instead of declining', () => {
    // Reachable: D2 leaves a programmatic gap-line placement alone. Declining
    // sent the key to native motion, which on the FIRST line of a multi-line gap
    // advanced to the next blank line — and the filter then resolved that back to
    // the preceding node's content end, moving the caret opposite the direction
    // requested.
    const doc = parse('First.\n\n\nSecond.\n');
    expect(planHorizontal(doc, pos(1, 0), 'left')).toEqual(pos(0, 'First.'.length));
    expect(planHorizontal(doc, pos(1, 0), 'right')).toEqual(pos(3, 0));
    expect(planHorizontal(doc, pos(2, 0), 'right')).toEqual(pos(3, 0)); // second gap line, same answer
  });

  it('left at the first node WITH a preamble declines (null), so stock CM6 can enter it', () => {
    // The distinction 'noop' must not flatten: with nothing above in node space
    // but a preamble present, the preamble is reachable and out of jurisdiction
    // (D10), so the key has to fall through. Only a document with no preamble is
    // a true edge. A first version of this returned 'noop' either way and broke
    // exactly that case.
    const doc = parse('---\nk: 1\n---\n\n- item\n');
    expect(planHorizontal(doc, pos(4, 2), 'left')).toBeNull();
    const noPreamble = parse('- item\n');
    expect(planHorizontal(noPreamble, pos(0, 2), 'left')).toBe('noop');
  });

  it('left in the preamble is out of jurisdiction (null)', () => {
    const doc = parse('---\nk: 1\n---\n\n- item\n');
    expect(planHorizontal(doc, pos(1, 1), 'left')).toBeNull();
  });

  it('ordinary within-line motion moves one character, never past the boundary', () => {
    const doc = parse('- alpha\n');
    expect(planHorizontal(doc, pos(0, 5), 'left')).toEqual(pos(0, 4));
    expect(planHorizontal(doc, pos(0, 5), 'right')).toEqual(pos(0, 6));
  });

  it("left from a continuation line's content start crosses to the previous line's own end, within the same node", () => {
    const doc = parse('- alpha\n  more text\n');
    // Line 1 is the continuation line; its content starts at ch 2.
    expect(planHorizontal(doc, pos(1, 2), 'left')).toEqual(pos(0, '- alpha'.length));
  });

  it("right from a line's end crosses into the next continuation line's content start, skipping its alignment whitespace", () => {
    const doc = parse('- alpha\n  more text\n');
    expect(planHorizontal(doc, pos(0, '- alpha'.length), 'right')).toEqual(pos(1, 2));
  });

  it("a parent's content end crosses right into its first child's content start", () => {
    const doc = parse('- parent\n  - child\n');
    expect(planHorizontal(doc, pos(0, '- parent'.length), 'right')).toEqual(pos(1, 4));
  });

  it('property: every non-null result is addressable', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), fc.boolean(), (tree, linePick, chPick, left) => {
        const text = encode(tree);
        const doc = parse(text);
        const lines = text === '' ? [] : text.split('\n');
        if (lines.length === 0) return true;
        const line = linePick % lines.length;
        const ch = chPick % ((lines[line]?.length ?? 0) + 1);
        if (!isAddressable(doc, pos(line, ch))) return true; // planner assumes addressable input
        const result = planHorizontal(doc, pos(line, ch), left ? 'left' : 'right');
        // `null` = out of jurisdiction, `'noop'` = document edge; neither names a
        // position, so neither has an addressability claim to check.
        return result === null || result === 'noop' || isAddressable(doc, result);
      }),
      { numRuns: 500 },
    );
  });

  it('property: left then right from the same addressable position round-trips (no document-boundary case)', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, linePick, chPick) => {
        const text = encode(tree);
        const doc = parse(text);
        const lines = text === '' ? [] : text.split('\n');
        if (lines.length === 0) return true;
        const line = linePick % lines.length;
        const ch = chPick % ((lines[line]?.length ?? 0) + 1);
        const start = pos(line, ch);
        if (!isAddressable(doc, start)) return true;
        const left = planHorizontal(doc, start, 'left');
        if (left === null || left === 'noop') return true; // document start; nothing to round-trip
        const back = planHorizontal(doc, left, 'right');
        return back !== null && back !== 'noop' && back.line === start.line && back.ch === start.ch;
      }),
      { numRuns: 500 },
    );
  });
});

describe('nodeContentStart / nodeContentEnd', () => {
  it("a list item's content start skips its marker", () => {
    const doc = parse('- alpha\n');
    const node = nodeAtLine(doc, 0)!;
    expect(nodeContentStart(doc, node)).toEqual(pos(0, 2));
  });

  it("a heading's content start is column 0", () => {
    const doc = parse('## Heading\n');
    const node = nodeAtLine(doc, 0)!;
    expect(nodeContentStart(doc, node)).toEqual(pos(0, 0));
  });

  it('content end is the last own line, never the trailing gap', () => {
    const doc = parse('- alpha\n  more text\n\nnext\n');
    const node = nodeAtLine(doc, 0)!;
    expect(nodeContentEnd(doc, node)).toEqual(pos(1, '  more text'.length));
  });
});

describe('contentBoundaryCh', () => {
  it("is 0 for non-list-item kinds regardless of marker-like leading text", () => {
    const doc = parse('# Heading\n\nPara.\n');
    const heading = nodeAtLine(doc, 0)!;
    const para = nodeAtLine(doc, 2)!;
    expect(contentBoundaryCh(heading, heading.lines[0]!)).toBe(0);
    expect(contentBoundaryCh(para, para.lines[0]!)).toBe(0);
  });
});

/**
 * Provisional positions (`content-space-caret`, as amended by
 * `enter-and-shift-enter-grammar`). No code changed for these: the split
 * operation has parked the caret on a gap line since it shipped, and the
 * requirement previously read as forbidding it. These pin both halves of the
 * exception so the specs and the behavior agree.
 */
describe('provisional positions', () => {
  it('the position an accepted Enter leaves the caret on is a gap line', () => {
    // Not addressable by the general rule — which is exactly why the
    // requirement needed a named exception rather than silence.
    const doc = parse('thought\n\n\n\nnext\n');
    expect(isAddressable(doc, { line: 2, ch: 0 })).toBe(false);
  });

  it('a later gesture onto that same line resolves it like any other gap line', () => {
    // The exception is scoped to the transaction that CREATES the position:
    // it does not persist with the line.
    const doc = parse('thought\n\n\n\nnext\n');
    expect(resolvePlacement(doc, { line: 2, ch: 0 })).toEqual({ line: 0, ch: 'thought'.length });
  });
});
