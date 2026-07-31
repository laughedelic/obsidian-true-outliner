import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { nextRung, nextRungs } from '../src/select-all-ladder';
import { coveredSubtreeRoots, escalateRange, rangesEqual } from '../src/escalate';
import type { LinePos, LineRange } from '../src/escalate';
import { nodeAtLine } from '../src/locate';
import { arbTree } from './generators';

const pos = (line: number, ch: number): LinePos => ({ line, ch });
const range = (anchor: LinePos, head: LinePos): LineRange => ({ anchor, head });
const cursor = (p: LinePos): LineRange => ({ anchor: p, head: p });

// # H1
//
// Para one.
//
// - item
//   - child
//     - grandchild
//
// # H2
//
// Para two.
//
// Nesting (list items nest under the preceding paragraph, headings nest
// their own section): H1 > Para one > item > child > grandchild; H2 > Para
// two. Two top-level siblings (H1, H2), a 5-deep chain under H1 — enough to
// exercise every rung kind: content, subtree, several ancestor subtrees,
// whole outline body, and the native-Select-All fallthrough.
//
// Subtree covers are gap-inclusive (escalate-include-owned-gap, merged from
// main): every node's own trailing blank line(s) come along with its
// subtree cover, so e.g. grandchild's subtree reaches line 7 (its own
// blank-line gap), H1's reaches line 7 too (Para one -> item -> child ->
// grandchild all share that same last gap), and the whole outline body
// reaches line 11 (Para two's own trailing/EOF gap).
const md = '# H1\n\nPara one.\n\n- item\n  - child\n    - grandchild\n\n# H2\n\nPara two.\n';
const doc = parse(md);

function climb(start: LineRange, maxSteps = 20): LineRange[] {
  return climbIn(doc, start, maxSteps);
}

function climbIn(targetDoc: ReturnType<typeof parse>, start: LineRange, maxSteps = 20): LineRange[] {
  const steps: LineRange[] = [];
  let current: LineRange | null = start;
  for (let i = 0; i < maxSteps; i++) {
    const next = nextRung(targetDoc, current);
    if (next === null) return steps;
    steps.push(next);
    current = next;
  }
  throw new Error('ladder did not terminate within maxSteps');
}

describe('nextRung: the ladder for this fixture (progressive-select-all)', () => {
  it('a deeply nested leaf list item climbs content -> own line (+gap) -> each ancestor -> outline body -> native', () => {
    const steps = climb(cursor(pos(6, 10)));
    expect(steps).toEqual([
      range(pos(6, 6), pos(6, 16)), // own content: "grandchild" (marker excluded, no gap)
      range(pos(6, 0), pos(7, 0)), // own whole line + its blank-line gap (marker AND gap included)
      range(pos(5, 0), pos(7, 0)), // child's subtree
      range(pos(4, 0), pos(7, 0)), // item's subtree
      range(pos(2, 0), pos(7, 0)), // Para one's subtree
      range(pos(0, 0), pos(7, 0)), // H1's subtree
      range(pos(0, 0), pos(11, 0)), // whole outline body (H1 + H2, through Para two's own gap)
    ]);
    // One further press has no more node-shaped rung: caller falls through
    // to native Select All.
    expect(nextRung(doc, steps[steps.length - 1]!)).toBeNull();
  });

  it('a list item with children climbs content -> own subtree (already including descendants + gap) -> ancestors -> outline body', () => {
    const steps = climb(cursor(pos(4, 4))); // cursor inside "item"
    expect(steps).toEqual([
      range(pos(4, 2), pos(4, 6)), // own content: "item" (marker excluded)
      range(pos(4, 0), pos(7, 0)), // own subtree: through grandchild and its gap
      range(pos(2, 0), pos(7, 0)), // Para one's subtree
      range(pos(0, 0), pos(7, 0)), // H1's subtree
      range(pos(0, 0), pos(11, 0)), // whole outline body
    ]);
    expect(nextRung(doc, steps[steps.length - 1]!)).toBeNull();
  });

  it('a heading climbs content (full line, marker included) -> subtree -> outline body', () => {
    const steps = climb(cursor(pos(0, 2))); // cursor inside "H1" text
    expect(steps).toEqual([
      range(pos(0, 0), pos(0, 4)), // own content: "# H1" — headings have no marker to exclude
      range(pos(0, 0), pos(7, 0)), // H1's whole subtree
      range(pos(0, 0), pos(11, 0)), // whole outline body
    ]);
    expect(nextRung(doc, steps[steps.length - 1]!)).toBeNull();
  });

  it('a top-level heading with no descendants and no siblings has the shortest ladder', () => {
    const soloDoc = parse('# Solo\n\nBody.\n');
    const steps: LineRange[] = [];
    let current: LineRange | null = cursor(pos(0, 3));
    for (let i = 0; i < 10 && current; i++) {
      const next = nextRung(soloDoc, current);
      if (next === null) break;
      steps.push(next);
      current = next;
    }
    // content ("# Solo") -> subtree (Body. plus its own trailing/EOF gap,
    // gap-inclusive) -> outline body (equals the subtree here, since
    // there's only one top-level node — collapsed away) -> null.
    expect(steps).toEqual([range(pos(0, 0), pos(0, 6)), range(pos(0, 0), pos(3, 0))]);
    expect(nextRung(soloDoc, steps[steps.length - 1]!)).toBeNull();
  });

  it('a cursor already sitting on a rung advances past it, not back onto it', () => {
    const already = range(pos(6, 6), pos(6, 16)); // exactly grandchild's content cover
    expect(nextRung(doc, already)).toEqual(range(pos(6, 0), pos(7, 0)));
  });

  it('a hand-made selection advances to the smallest rung that contains it', () => {
    // Spans part of "child" and part of "grandchild" — strictly inside
    // child's subtree cover, but matches no rung exactly.
    const handMade = range(pos(5, 4), pos(6, 8));
    expect(nextRung(doc, handMade)).toEqual(range(pos(5, 0), pos(7, 0)));
  });

  it('a backward range (head before anchor) keeps head before anchor after climbing', () => {
    const backwardRange: LineRange = { anchor: pos(6, 16), head: pos(6, 6) }; // exactly the content cover, reversed
    expect(nextRung(doc, backwardRange)).toEqual({ anchor: pos(7, 0), head: pos(6, 0) });
  });

  it('a cursor outside any node (preamble) has no rung: fall through to native', () => {
    const withFm = parse('---\nk: 1\n---\n\n# H\n\nBody.\n');
    expect(nextRung(withFm, cursor(pos(1, 0)))).toBeNull();
  });
});

describe('nextRung: the siblings-run rung (real-vault experiment)', () => {
  // # Head
  //
  // Body one.
  //
  // Body two.
  //
  // Body one and Body two are SIBLINGS under Head (both are its children);
  // Head is the sole top-level node. Exercises the new rung that sits
  // between "this node's own subtree" and "the parent's whole subtree":
  // this node plus all its siblings, the parent's own line NOT included.
  const md = '# Head\n\nBody one.\n\nBody two.\n';
  const doc = parse(md);

  it('climbs content -> own subtree (+gap) -> siblings run -> parent subtree, in that order', () => {
    const steps = climbIn(doc, cursor(pos(2, 3))); // inside "Body one."
    expect(steps).toEqual([
      range(pos(2, 0), pos(2, 9)), // own content: "Body one." only
      range(pos(2, 0), pos(3, 0)), // own subtree: content + its own blank-line gap (no longer collapsed with content — gap-inclusive cover makes this a genuinely distinct rung even for a marker-less leaf)
      range(pos(2, 0), pos(5, 0)), // siblings run: Body one + Body two (+ Body two's own gap), NOT Head's own line
      range(pos(0, 0), pos(5, 0)), // Head's whole subtree, now including Head's own line
    ]);
    // Head is the sole top-level node, so Head's OWN siblings run coincides
    // exactly with the whole outline body — no separate rung, straight to
    // native on the next press.
    expect(nextRung(doc, steps[steps.length - 1]!)).toBeNull();
  });

  it('the second sibling climbs the same way, independently', () => {
    const steps = climbIn(doc, cursor(pos(4, 3))); // inside "Body two."
    expect(steps).toEqual([
      range(pos(4, 0), pos(4, 9)),
      range(pos(4, 0), pos(5, 0)),
      range(pos(2, 0), pos(5, 0)), // same siblings run either way
      range(pos(0, 0), pos(5, 0)),
    ]);
  });

  it('a lone-child level (no real siblings) skips the rung — no redundant zero-growth step', () => {
    // grandchild/child/item/Para one are each an only-child at their own
    // level (see the main fixture above) — their siblings-run cover is
    // identical to their own subtree cover and collapses away, same as
    // any other zero-growth step. Only a level with an ACTUAL sibling
    // group produces a visible rung.
    const soloDoc = parse('# Solo\n\nBody.\n'); // Solo's only child is Body; Solo has no siblings
    const steps = climbIn(soloDoc, cursor(pos(0, 3)));
    expect(steps).toEqual([
      range(pos(0, 0), pos(0, 6)), // content
      range(pos(0, 0), pos(3, 0)), // subtree == this level's siblings run == outline body, all collapsed
    ]);
  });
});

describe('gap-inclusive subtree covers (main@escalate-include-owned-gap) fix a leaf-paragraph chrome inconsistency', () => {
  // Before escalate-include-owned-gap merged, a leaf paragraph/atom's own
  // content cover and its whole-subtree cover were byte-identical (no
  // marker to offset the start, no children to extend the end), so the
  // FIRST Cmd-A press already exactly matched the block-cover chrome
  // trigger (coveredSubtreeRoots) — "goes straight to block mode" instead
  // of a plain content selection first. Gap-inclusion means the subtree
  // cover now extends past content end into the node's own trailing gap
  // whenever it has one — which is true for essentially every node except
  // a tightly-packed one with literally zero blank line before what
  // follows — so content and subtree now differ for ordinary paragraphs
  // too, not just list items/multi-child nodes.
  it('a leaf paragraph followed by a blank line: press 1 has no chrome, press 2 does', () => {
    const twoParas = parse('Alpha.\n\nBeta.\n');
    const r1 = nextRung(twoParas, cursor(pos(0, 0)))!;
    expect(r1).toEqual(range(pos(0, 0), pos(0, 6)));
    expect(coveredSubtreeRoots(twoParas, r1)).toBeNull();

    const r2 = nextRung(twoParas, r1)!;
    expect(r2).toEqual(range(pos(0, 0), pos(1, 0)));
    expect(coveredSubtreeRoots(twoParas, r2)).not.toBeNull();
  });

  it('even the LAST node in the doc gets the same two-step behavior (the phantom trailing-newline gap counts too)', () => {
    const twoParas = parse('Alpha.\n\nBeta.\n');
    const r1 = nextRung(twoParas, cursor(pos(2, 0)))!;
    expect(r1).toEqual(range(pos(2, 0), pos(2, 5)));
    expect(coveredSubtreeRoots(twoParas, r1)).toBeNull();

    const r2 = nextRung(twoParas, r1)!;
    expect(r2).toEqual(range(pos(2, 0), pos(3, 0)));
    expect(coveredSubtreeRoots(twoParas, r2)).not.toBeNull();
  });

  it('known remaining edge case: a tightly-packed atom with ZERO blank line before the next block still collapses', () => {
    // A code fence immediately followed by a paragraph, no blank line
    // between them — `trailingGap` is empty, so there's nothing for the
    // gap-inclusive cover to extend into; content and subtree collapse to
    // the same bounds, same as before escalate-include-owned-gap. Rare in
    // practice (most markdown has blank-line separation), not fixed by
    // either change, and not attempted here — see the design discussion.
    const tight = parse('```\ncode\n```\nRight after.\n');
    const r1 = nextRung(tight, cursor(pos(1, 0)))!;
    expect(coveredSubtreeRoots(tight, r1)).not.toBeNull();
  });
});

describe('nextRungs: independent per-range climbing (design.md D5)', () => {
  it('two ranges in different nodes at different depths advance independently', () => {
    const ranges = [cursor(pos(2, 3)), cursor(pos(6, 10))]; // Para one; grandchild
    const [a, b] = nextRungs(doc, ranges);
    expect(a).toEqual(range(pos(2, 0), pos(2, 9))); // Para one's own content
    expect(b).toEqual(range(pos(6, 6), pos(6, 16))); // grandchild's own content — NOT forced to Para one's depth
  });

  it('a range already at the ladder top (null) does not affect a sibling range still climbing', () => {
    const atTop = range(pos(0, 0), pos(11, 0)); // whole outline body already (gap-inclusive)
    const stillClimbing = cursor(pos(0, 2)); // H1 heading cursor
    const [a, b] = nextRungs(doc, [atTop, stillClimbing]);
    expect(a).toBeNull();
    expect(b).toEqual(range(pos(0, 0), pos(0, 4)));
  });
});

describe('property: the ladder always terminates and never shrinks', () => {
  it('repeated nextRung calls monotonically grow the covered bounds and terminate', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.nat(), (tree, linePick, chPick) => {
        const text = encode(tree);
        const lines = text === '' ? [] : text.split('\n');
        if (lines.length === 0) return true;
        const line = linePick % lines.length;
        const ch = chPick % ((lines[line]?.length ?? 0) + 1);
        const parsed = parse(text);

        let current: LineRange | null = cursor(pos(line, ch));
        let prevLo = current.anchor;
        let prevHi = current.anchor;
        for (let i = 0; i < 200; i++) {
          const next: LineRange | null = nextRung(parsed, current);
          if (next === null) return true; // terminated
          const lo = next.anchor.line < next.head.line || (next.anchor.line === next.head.line && next.anchor.ch < next.head.ch) ? next.anchor : next.head;
          const hi = lo === next.anchor ? next.head : next.anchor;
          const grew =
            (lo.line < prevLo.line || (lo.line === prevLo.line && lo.ch <= prevLo.ch)) &&
            (hi.line > prevHi.line || (hi.line === prevHi.line && hi.ch >= prevHi.ch));
          if (!grew) return false; // shrank or moved sideways — violates the never-shrink invariant
          prevLo = lo;
          prevHi = hi;
          current = next;
        }
        return false; // did not terminate within 200 steps — treat as a failure
      }),
      { numRuns: 300 },
    );
  });
});

describe('ladder rungs are fixpoints of escalation (selection-as-subtree-set task 2.4)', () => {
  // The ladder is the one shipped feature that DISPATCHES covers back through
  // the transaction filter, and `select-all-ladder.ts` imports none of the
  // functions `selection-as-subtree-set` rewrote — so if the forest span
  // disagreed with a rung, the ladder would silently jump a rung (or refuse
  // to climb) with nothing in either suite failing. Every rung is
  // downward-closed and contiguous, so escalating one must return it
  // unchanged. Asserted, not assumed.
  //
  // Rung 1 (a node's own content) is deliberately NOT a subtree cover — it
  // excludes descendants and the list marker. It is a fixpoint for the other
  // reason: both its ends rest on one node's own content lines, which
  // escalation passes through untouched.
  const climb = (d: ReturnType<typeof parse>, start: LineRange): LineRange[] => {
    const rungs: LineRange[] = [];
    let current: LineRange | null = start;
    // Bounded: the ladder is finite and `nextRung` returns null at the top.
    for (let i = 0; i < 20 && current; i++) {
      current = nextRung(d, current);
      if (current) rungs.push(current);
    }
    return rungs;
  };

  it('every rung of the fixture document survives escalateRange unchanged', () => {
    const seen: LineRange[] = [];
    for (let line = 0; line < 12; line++) {
      if (!nodeAtLine(doc, line)) continue;
      seen.push(...climb(doc, cursor(pos(line, 0))));
    }
    expect(seen.length).toBeGreaterThan(10); // the loop actually exercised rungs
    for (const rung of seen) {
      expect(escalateRange(doc, rung)).toEqual(rung);
    }
  });

  it('property: no rung of any generated document is altered by escalation', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), (tree, pick) => {
        const text = encode(tree);
        const lines = text === '' ? [] : text.split('\n');
        const d = parse(text);
        const candidates: number[] = [];
        for (let i = 0; i < lines.length; i++) if (nodeAtLine(d, i)) candidates.push(i);
        if (candidates.length === 0) return true;
        const line = candidates[pick % candidates.length]!;
        return climb(d, cursor(pos(line, 0))).every((rung) =>
          rangesEqual(escalateRange(d, rung), rung),
        );
      }),
      { numRuns: 300 },
    );
  });
});
