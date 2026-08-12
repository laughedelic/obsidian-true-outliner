import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { extendSelection, extendSelections, type ExtendDirection } from '../src/select-extend';
import {
  coveredForestOf,
  escalateRange,
  subtreeCoverOf,
} from '../src/escalate';
import { nodeAtLine } from '../src/locate';
import { resolvedOutline } from '../src/plugin/decorate';
import { arbTree } from './generators';
import { rangesEqual, type LinePos, type LineRange } from '../src/line-pos';

const pos = (line: number, ch: number): LinePos => ({ line, ch });
const caret = (line: number, ch: number): LineRange => ({ anchor: pos(line, ch), head: pos(line, ch) });

/** A selection rendered as the inclusive line span it covers, plus its
 * orientation — the observable form every assertion below is stated in.
 * Covers are compared by span rather than by root identity on purpose
 * (design.md D1): different head nodes can produce the identical cover, so
 * head identity is not a sound basis for a test. */
function span(range: LineRange | null): string {
  if (!range) return 'null';
  const backward = range.head.line < range.anchor.line ||
    (range.head.line === range.anchor.line && range.head.ch < range.anchor.ch);
  const lo = backward ? range.head : range.anchor;
  const hi = backward ? range.anchor : range.head;
  return `${lo.line}..${hi.line} ${backward ? 'back' : 'fwd'}`;
}

/** Press `direction` `n` times from `range`, collecting each result. A press
 * with nowhere to go keeps the previous selection, matching what the CM6
 * adapter does when it declines the key. */
function press(
  doc: ReturnType<typeof parse>,
  range: LineRange,
  presses: ExtendDirection[],
): string[] {
  const out: string[] = [];
  let current = range;
  for (const direction of presses) {
    const next = extendSelection(doc, current, direction);
    if (next) current = next;
    out.push(span(next === null ? null : current));
  }
  return out;
}

describe('extendSelection: one node per press', () => {
  // - P        0
  //   - c1     1
  //   - c2     2
  // - Q        3
  const nested = parse(['- P', '\t- c1', '\t- c2', '- Q'].join('\n'));

  it('first press from a caret takes the anchor node alone, not a following sibling', () => {
    // Tight list: no blank line separates c1 from c2, which is exactly the
    // shape that grabbed TWO nodes per press before this change.
    expect(press(nested, caret(1, 4), ['down'])).toEqual(['1..1 fwd']);
  });

  it('first press on a parent takes its whole subtree', () => {
    expect(press(nested, caret(0, 2), ['down'])).toEqual(['0..2 fwd']);
  });

  it('extending out of a scope does not pull in the parent', () => {
    // c2 is P's LAST child; the second press leaves P's scope entirely and
    // must NOT add P — the failure `selection-as-subtree-set` removed.
    expect(press(nested, caret(2, 4), ['down', 'down'])).toEqual(['2..2 fwd', '2..3 fwd']);
  });

  it('a press that would not change the cover is skipped, not spent', () => {
    // From P's whole subtree the next press must reach Q, passing over c1
    // and c2 rather than costing two keypresses on already-covered children.
    expect(press(nested, caret(0, 2), ['down', 'down'])).toEqual(['0..2 fwd', '0..3 fwd']);
  });

  it('a heading extends by its whole section, the same as a parent list item', () => {
    const doc = parse(['# H', '', 'body.', '', '# Next'].join('\n'));
    expect(press(doc, caret(0, 2), ['down'])).toEqual(['0..3 fwd']);
  });

  it('the sequence bottoms out rather than running past the document', () => {
    expect(press(nested, caret(3, 3), ['down', 'down'])).toEqual(['3..3 fwd', 'null']);
  });
});

describe('extendSelection: symmetry and shrinking', () => {
  const flat = parse(['Alpha one.', '', 'Bravo two.', '', 'Charlie three.'].join('\n'));

  it('Shift+Up undoes Shift+Down (examples E5)', () => {
    expect(press(flat, caret(2, 3), ['down', 'down', 'up'])).toEqual([
      '2..3 fwd', // Bravo + its gap
      '2..4 fwd', // + Charlie
      '2..3 fwd', // back to Bravo
    ]);
  });

  it('reversing past the anchor grows the other way (examples E6)', () => {
    expect(press(flat, caret(2, 3), ['down', 'down', 'up', 'up'])).toEqual([
      '2..3 fwd',
      '2..4 fwd',
      '2..3 fwd',
      '0..3 back', // Alpha pulled in, oriented backward
    ]);
  });

  it('shrinking bottoms out at the anchor node, never at a caret or partial range', () => {
    // Every intermediate is a whole cover: the walk reduces to the anchor's
    // own subtree and then grows the other way, rather than ever collapsing
    // to a caret or to part of a node's content.
    let current: LineRange = caret(2, 3);
    const seen: string[] = [];
    for (const direction of ['down', 'down', 'up', 'up'] as ExtendDirection[]) {
      const next = extendSelection(flat, current, direction);
      expect(next).not.toBeNull();
      expect(coveredForestOf(flat, next!)).not.toBeNull();
      current = next!;
      seen.push(span(current));
    }
    expect(seen).toEqual(['2..3 fwd', '2..4 fwd', '2..3 fwd', '0..3 back']);

    // At the document's top edge the sequence is genuinely exhausted, and the
    // press declines rather than inventing a further cover.
    expect(extendSelection(flat, current, 'up')).toBeNull();
  });

  it('reversing after leaving a scope returns to the child, not to a new cover', () => {
    const nested = parse(['- P', '\t- c1', '\t- c2', '- Q'].join('\n'));
    expect(press(nested, caret(2, 4), ['down', 'down', 'up'])).toEqual([
      '2..2 fwd',
      '2..3 fwd',
      '2..2 fwd',
    ]);
  });
});

describe('extendSelection: the upward ancestor swallow (design.md D8)', () => {
  // The case D3 originally got wrong. Extending UP out of a non-last child
  // yields the parent's whole subtree, because downward closure admits no
  // smaller cover containing both; the child is then on neither edge and is
  // genuinely unrecoverable, so the anchor re-seats onto the parent.
  const nested = parse(['- P', '\t- c1', '\t- c2', '- Q'].join('\n'));

  it('up from a first child takes the parent whole, including the later child', () => {
    // Press one normalizes the caret onto the sequence (D6); the swallow is
    // press two, where the only cover containing both c1 and P is P's own
    // subtree — which reaches BELOW the anchor, down to c2.
    expect(press(nested, caret(1, 4), ['up', 'up'])).toEqual(['1..1 back', '0..2 back']);
  });

  it('the re-seat trace: [c1] -> up -> [P] -> down -> [P,Q] -> up -> [P]', () => {
    // The third press does NOT shrink: [P] is single-rooted, so it is the
    // base of P's own sequence and both directions grow from it. The
    // alternative — shrinking to whatever the end edge resolves to — would
    // land on [c2], a cover that never appeared on the way up.
    expect(press(nested, caret(1, 4), ['up', 'up', 'down', 'up'])).toEqual([
      '1..1 back', // c1 alone
      '0..2 back', // P's whole subtree — the swallow, anchor re-seats onto P
      '0..3 fwd', // grows to P's next sibling rather than shrinking
      '0..2 fwd', // and back off it again
    ]);
  });

  it('never lands on the parent\'s last child, the rejected third option', () => {
    const steps = press(nested, caret(1, 4), ['up', 'up', 'down']);
    expect(steps).not.toContain('2..2 fwd');
    expect(steps).not.toContain('2..2 back');
  });

  it('up from a LAST child keeps the anchor, since no ancestor is swallowed', () => {
    expect(press(nested, caret(2, 4), ['up', 'up'])).toEqual(['2..2 back', '1..2 back']);
  });
});

describe('extendSelection: input normalization (design.md D6)', () => {
  const nested = parse(['- P', '\t- c1', '\t- c2', '- Q'].join('\n'));

  it('normalizes the Mod-A ladder\'s first rung, which is not a cover', () => {
    // `1,3 -> 1,5` is c1's own content, starting after its `- ` marker.
    const rung1: LineRange = { anchor: pos(1, 3), head: pos(1, 5) };
    expect(coveredForestOf(nested, rung1)).toBeNull();
    // Reaching the cover IS the step: the result matches a press from a bare
    // caret in the same node, which is D10's how-did-we-get-here independence.
    expect(span(extendSelection(nested, rung1, 'down'))).toBe('1..1 fwd');
    expect(span(extendSelection(nested, caret(1, 4), 'down'))).toBe('1..1 fwd');
  });

  it('escalation cannot do this job, which is why D6 names subtreeCoverOf', () => {
    // The negative control for the rule's phrasing: an earlier draft said
    // "escalate to the nearest cover", and neither helper does that here.
    const rung1: LineRange = { anchor: pos(1, 3), head: pos(1, 5) };
    expect(rangesEqual(escalateRange(nested, rung1), rung1)).toBe(true);
    expect(coveredForestOf(nested, escalateRange(nested, rung1))).toBeNull();
  });

  it('is the identity on a range that is already a cover', () => {
    // If normalization moved an existing cover it would be changing the
    // normal path too, not just the restored one.
    const cover = subtreeCoverOf(nested, nodeAtLine(nested, 1)!);
    const asRange: LineRange = { anchor: cover.start, head: cover.end };
    // A press from here advances; it does not first re-seat somewhere else.
    expect(span(extendSelection(nested, asRange, 'down'))).toBe('1..2 fwd');
  });

  it('declines in the preamble, where no node has jurisdiction', () => {
    const doc = parse(['---', 'title: x', '---', 'Body.'].join('\n'));
    expect(extendSelection(doc, caret(1, 2), 'down')).toBeNull();
  });
});

describe('extendSelections: multi-range independence (design.md D4)', () => {
  const nested = parse(['- P', '\t- c1', '\t- c2', '- Q'].join('\n'));

  it('each range steps along its own sequence, with no forced common step', () => {
    const out = extendSelections(nested, [caret(1, 4), caret(3, 3)], 'down');
    expect(out.map(span)).toEqual(['1..1 fwd', '3..3 fwd']);
  });

  it('cursors at different depths do not drag each other along', () => {
    // a1 is nested one level; Q is top-level with children of its own. Each
    // takes its own subtree, neither jumping ahead because the other is
    // deeper or shallower.
    const doc = parse(['- P', '\t- a1', '\t- a2', '- Q', '\t- b1', '\t- b2'].join('\n'));
    const out = extendSelections(doc, [caret(1, 4), caret(3, 3)], 'down');
    expect(out.map(span)).toEqual(['1..1 fwd', '3..5 fwd']);
  });

  it('a range with nowhere to go reports null while others still advance', () => {
    const out = extendSelections(nested, [caret(1, 4), caret(3, 3)], 'down');
    expect(out[0]).not.toBeNull();
    const again = extendSelections(nested, [out[0]!, { anchor: pos(3, 0), head: pos(3, 3) }], 'down');
    expect(again[0]).not.toBeNull();
    expect(again[1]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

/** A generated tree as the document its own encoding parses back to — the
 * same round-trip `tests/escalate.test.ts`'s properties use, so line numbers
 * are the real ones rather than the generator's idea of them. */
function docOf(tree: Parameters<typeof encode>[0]): {
  doc: ReturnType<typeof parse>;
  totalLines: number;
} {
  const text = encode(tree);
  return { doc: parse(text), totalLines: text === '' ? 0 : text.split('\n').length };
}

/** Every line with node jurisdiction, as caret positions to start walks
 * from. Mirrors `resolvableLines` in `tests/escalate.test.ts`. */
function caretsIn(doc: ReturnType<typeof parse>, totalLines: number): LineRange[] {
  const out: LineRange[] = [];
  for (let line = 0; line < totalLines; line++) {
    if (nodeAtLine(doc, line)) out.push(caret(line, 0));
  }
  return out;
}

function bounds(range: LineRange): { lo: LinePos; hi: LinePos } {
  const backward = range.head.line < range.anchor.line ||
    (range.head.line === range.anchor.line && range.head.ch < range.anchor.ch);
  return backward ? { lo: range.head, hi: range.anchor } : { lo: range.anchor, hi: range.head };
}

function contains(outer: LineRange, inner: LineRange): boolean {
  const o = bounds(outer);
  const i = bounds(inner);
  const beforeOrEq = (a: LinePos, b: LinePos): boolean =>
    a.line < b.line || (a.line === b.line && a.ch <= b.ch);
  return beforeOrEq(o.lo, i.lo) && beforeOrEq(i.hi, o.hi);
}

describe('extendSelection: properties', () => {
  const DIRECTIONS: ExtendDirection[] = ['up', 'down'];

  it('every dispatched selection is an exact cover, so escalation leaves it alone', () => {
    fc.assert(
      fc.property(arbTree(), fc.constantFrom(...DIRECTIONS), (tree, direction) => {
        const { doc, totalLines } = docOf(tree);
        for (const from of caretsIn(doc, totalLines)) {
          let current: LineRange = from;
          for (let step = 0; step < 6; step++) {
            const next = extendSelection(doc, current, direction);
            if (!next) break;
            expect(coveredForestOf(doc, next)).not.toBeNull();
            // The filter is a fixpoint on it — the same check
            // `selection-as-subtree-set` task 2.4 makes for ladder rungs.
            expect(rangesEqual(escalateRange(doc, next), next)).toBe(true);
            current = next;
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it('consecutive covers are strictly nested while growing', () => {
    fc.assert(
      fc.property(arbTree(), fc.constantFrom(...DIRECTIONS), (tree, direction) => {
        const { doc, totalLines } = docOf(tree);
        for (const from of caretsIn(doc, totalLines)) {
          let current = extendSelection(doc, from, direction);
          if (!current) continue;
          for (let step = 0; step < 6; step++) {
            const next = extendSelection(doc, current, direction);
            if (!next) break;
            // Growing in one direction never shrinks: each cover contains the
            // last, and differs from it (no press is a visible no-op).
            expect(contains(next, current)).toBe(true);
            expect(rangesEqual(next, current)).toBe(false);
            current = next;
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it('opposite presses are mutual inverses OVER COVERS while the cover has >= 2 roots', () => {
    // D8 excludes the single-root base explicitly: it is the bottom of its
    // sequence, so both directions GROW from it and there is nothing to
    // invert. Stating the exclusion rather than filtering it out silently —
    // a filtered version passes vacuously on documents whose every cover is
    // single-rooted, which is most small generated trees.
    let multiRootCases = 0;
    fc.assert(
      fc.property(arbTree(), fc.constantFrom(...DIRECTIONS), (tree, direction) => {
        const { doc, totalLines } = docOf(tree);
        const opposite: ExtendDirection = direction === 'down' ? 'up' : 'down';
        for (const from of caretsIn(doc, totalLines)) {
          let current = extendSelection(doc, from, direction);
          if (!current) continue;
          for (let step = 0; step < 5; step++) {
            const grown = extendSelection(doc, current, direction);
            if (!grown) break;
            const forest = coveredForestOf(doc, grown);
            if (forest && forest.roots.length >= 2) {
              multiRootCases++;
              expect(span(extendSelection(doc, grown, opposite))).toBe(span(current));
            }
            current = grown;
          }
        }
      }),
      { numRuns: 80 },
    );
    // Coverage counter, per the vacuity control `selection-as-subtree-set`
    // task 3b.2 established: a property this conditional passes just as
    // happily when it never reaches its assertion.
    expect(multiRootCases).toBeGreaterThan(50);
  });

  it('NO FIXPOINT: a press with somewhere to go always changes the selection', () => {
    // The property that would have caught today's bug. The shipped
    // native-extend-then-escalate path is an outright fixpoint for a heading
    // section and for a loose list — see the negative control below.
    fc.assert(
      fc.property(arbTree(), fc.constantFrom(...DIRECTIONS), (tree, direction) => {
        const { doc, totalLines } = docOf(tree);
        for (const from of caretsIn(doc, totalLines)) {
          let current: LineRange = from;
          for (let step = 0; step < 8; step++) {
            const next = extendSelection(doc, current, direction);
            if (!next) break;
            expect(rangesEqual(next, current)).toBe(false);
            current = next;
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe('NEGATIVE CONTROL: the path this change replaces', () => {
  /** Today's behavior, modeled: native line-wise extension (head moves one
   * line, goal column preserved) followed by the escalation filter. Kept as a
   * test rather than prose so the fixpoint claim in design.md's Context stays
   * checkable, and so the no-fixpoint property above is demonstrably not
   * vacuous. */
  function legacyExtend(lines: string[], range: LineRange, direction: ExtendDirection, goal: number): LineRange {
    const doc = parse(lines.join('\n'));
    const line = Math.max(0, Math.min(lines.length - 1, range.head.line + (direction === 'down' ? 1 : -1)));
    const moved: LineRange = { anchor: range.anchor, head: pos(line, Math.min(goal, lines[line]!.length)) };
    return escalateRange(doc, moved);
  }

  it.each([
    ['heading section', ['# P', '', 'c1 text.', '', 'c2 text.', '', '# Q'], 2],
    ['loose list', ['- P', '', '\t- c1', '', '\t- c2', '', '- Q'], 2],
  ])('%s: the legacy path is a fixpoint after extending up', (_label, lines, anchorLine) => {
    let range: LineRange = caret(anchorLine, 3);
    range = legacyExtend(lines, range, 'up', 3);
    const afterUp = span(range);
    const afterDown = span(legacyExtend(lines, range, 'down', 3));
    expect(afterDown).toBe(afterUp); // stuck: the press changes nothing

    // The new walk is not stuck on the same shape.
    const doc = parse(lines.join('\n'));
    const up = extendSelection(doc, caret(anchorLine, 3), 'up')!;
    const down = extendSelection(doc, up, 'down')!;
    expect(span(down)).not.toBe(span(up));
  });
});

describe('a provisional position does not halve the node a press extends over', () => {
  // The pure function is correct given the right tree; what it must be GIVEN
  // while a position is open is `resolvedOutline`'s, not the buffer's raw parse
  // (keymap.ts's `outlineFor`). Measured in the change's Findings: where the
  // bisection makes the tail a SIBLING, the raw parse stops the cover at the
  // position — half a node, from a press whose promise is exactly one node.

  const span = (r: LineRange | null): [number, number] | null =>
    r ? [Math.min(r.anchor.line, r.head.line), Math.max(r.anchor.line, r.head.line)] : null;

  it('covers both halves of a bisected paragraph', () => {
    const plain = '# H\n\nalpha\nbeta\n\n# I\n';
    const open = '# H\n\nalpha\n\nbeta\n\n# I\n';
    const from = caret(2, 5);
    expect(span(extendSelection(parse(plain), from, 'down'))).toEqual([2, 4]);
    // The raw parse of the open document stops at the position…
    expect(span(extendSelection(parse(open), from, 'down'))).toEqual([2, 3]);
    // …and the outline the position stands for does not.
    expect(span(extendSelection(resolvedOutline(open, 3, 0)!, from, 'down'))).toEqual([2, 5]);
  });

  it('is unchanged where the bisection makes a CHILD, which a cover already spans', () => {
    const open = '- one\n- foo\n  \n  bar\n';
    const from = caret(1, 5);
    expect(span(extendSelection(parse(open), from, 'down'))).toEqual(
      span(extendSelection(resolvedOutline(open, 2, 2)!, from, 'down')),
    );
  });
});
