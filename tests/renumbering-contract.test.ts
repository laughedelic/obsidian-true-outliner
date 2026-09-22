/**
 * What a structural operation LEAVES ALONE, on the axis a depth measurement
 * cannot see.
 *
 * `depth-contract.test.ts` asserts where a node lands. A renumbering defect
 * moves nothing: it rewrites a marker's digits, in a run the operation was
 * never asked to touch, above the line the caller selected. Closure does not
 * see it either — the emitted markdown is valid, re-parses to itself, and says
 * a different list than the source did.
 *
 * So the assertion here is textual: every labelled node ABOVE what the
 * operation relocates keeps its own first line, byte for byte.
 *
 * ## Why the source has to be consecutive already
 *
 * A renumbering NORMALIZES. On `1. a` / `1. b` / `2. c` — which the generator
 * emits, and which markdown itself renders as 1, 2, 3 — any operation touching
 * that run correctly rewrites `1. b` to `2. b`, a line above the operand. That
 * is the requirement working, not failing. Restricting the property to
 * documents whose every run already reads head, head+1, … separates the two
 * without the test having to re-implement the rule it is checking. Measured, the
 * filter keeps ~2650 of 3000 generated documents.
 *
 * ## Why "above" is fenced at the relocated node, not the subject
 *
 * A reorder swaps two subtrees, and the sibling it swaps past sits above the
 * subject and legitimately renumbers. Fencing at the subject would report that
 * as a violation and make the property useless for the two operations whose
 * defect it was written to catch — the same lesson `reorder-absorption`
 * measured from the other side, where a subject-only property scored zero on
 * two thirds of a real defect.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { parse } from '../src/parse';
import { forEachNodeWithLine } from '../src/locate';
import { indent, insertSubtrees, moveDown, moveUp, outdent, type OpOutput } from '../src/ops';
import type { OpResult } from '../src/result';
import { arbLabeledDoc, labelOf } from './group-oracle';

const RUNS = 3000;

interface Contract {
  readonly op: (doc: OutlineDoc, nodeId: number) => OpResult<OpOutput>;
  /** For a reorder, the sibling offset the swap also relocates. */
  readonly swapsWith?: -1 | 1;
  /**
   * Floors on what the property actually got to assert. `minAccepted` catches a
   * suite that degrades to "everything was rejected, therefore green".
   * `minWithMarkerAbove` catches the subtler version: accepted cases that
   * carried no ordered marker above the fence at all, where there was nothing
   * for a renumbering to have got wrong. Both sit well below what the generator
   * currently produces.
   */
  readonly minAccepted: number;
  readonly minWithMarkerAbove: number;
}

const CONTRACTS: Record<string, Contract> = {
  indent: { op: indent, minAccepted: 700, minWithMarkerAbove: 600 },
  outdent: { op: outdent, minAccepted: 1200, minWithMarkerAbove: 1000 },
  moveUp: { op: moveUp, swapsWith: -1, minAccepted: 700, minWithMarkerAbove: 500 },
  moveDown: { op: moveDown, swapsWith: 1, minAccepted: 700, minWithMarkerAbove: 500 },
};

interface Placed {
  readonly line: number;
  readonly text: string;
}

/** Every labelled node's start line and own first line. */
function byLabel(doc: OutlineDoc): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  forEachNodeWithLine(doc, (node, startLine) => {
    const label = labelOf(node);
    if (label !== undefined && !placed.has(label)) {
      placed.set(label, { line: startLine, text: node.lines[0] ?? '' });
    }
  });
  return placed;
}

const orderedNumber = (node: OutlineNode): number | undefined =>
  node.kind === 'list-item' && node.listStyle?.type === 'ordered'
    ? node.listStyle.number
    : undefined;

/** True while every maximal ordered run reads head, head+1, head+2, … */
function alreadyConsecutive(nodes: readonly OutlineNode[]): boolean {
  let i = 0;
  while (i < nodes.length) {
    const start = orderedNumber(nodes[i]!);
    if (start === undefined) {
      i++;
      continue;
    }
    let k = 0;
    while (i + k < nodes.length && orderedNumber(nodes[i + k]!) !== undefined) {
      if (orderedNumber(nodes[i + k]!) !== start + k) return false;
      k++;
    }
    i += k;
  }
  return nodes.every((node) => alreadyConsecutive(node.children));
}

/**
 * The line above which nothing may be rewritten: the topmost node the operation
 * relocates. For indent and outdent that is the subject; for a reorder the
 * sibling it swaps with can sit above it.
 */
function fenceLine(
  doc: OutlineDoc,
  subject: OutlineNode,
  swapsWith: -1 | 1 | undefined,
  before: Map<string, Placed>,
): number {
  const own = before.get(labelOf(subject)!)!.line;
  if (swapsWith === undefined) return own;
  let sibling: OutlineNode | undefined;
  const findSibling = (nodes: readonly OutlineNode[]): boolean => {
    const at = nodes.findIndex((node) => node.id === subject.id);
    if (at !== -1) {
      sibling = nodes[at + swapsWith];
      return true;
    }
    return nodes.some((node) => findSibling(node.children));
  };
  findSibling(doc.children);
  const label = sibling === undefined ? undefined : labelOf(sibling);
  const siblingLine = label === undefined ? undefined : before.get(label)?.line;
  return siblingLine === undefined ? own : Math.min(own, siblingLine);
}

describe('nothing above what an operation relocates is rewritten', () => {
  for (const [name, contract] of Object.entries(CONTRACTS)) {
    it(`${name} leaves every line above its operand byte-identical`, () => {
      let accepted = 0;
      let withMarkerAbove = 0;
      fc.assert(
        fc.property(arbLabeledDoc(), fc.nat(), (doc, n) => {
          if (!alreadyConsecutive(doc.children)) return true;
          const subjects = [...walkNodes(doc)].filter(
            (node) => node.kind !== 'heading' && labelOf(node) !== undefined,
          );
          if (subjects.length === 0) return true;
          const subject = subjects[n % subjects.length]!;

          const before = byLabel(doc);
          const fence = fenceLine(doc, subject, contract.swapsWith, before);
          const result = contract.op(doc, subject.id);
          if (!result.ok) return true;
          accepted++;
          if (
            [...walkNodes(doc)].some((node) => {
              const label = labelOf(node);
              return (
                orderedNumber(node) !== undefined &&
                label !== undefined &&
                before.get(label)!.line < fence
              );
            })
          ) {
            withMarkerAbove++;
          }

          // A label that VANISHED fails too. `byLabel` scans the whole result,
          // so relocation cannot hide a node from this comparison: absent means
          // gone from the document, or swallowed into another node's
          // continuation lines where `lines[0]` no longer carries it. Either is
          // a worse defect than a rewritten marker, and skipping it would let
          // an operation destroy an untouched node and still pass a property
          // that claims the node keeps its own first line. Measured at zero for
          // all four operations, so this costs no reach.
          const after = byLabel(result.value.doc);
          for (const [label, was] of before) {
            if (was.line >= fence) continue;
            const now = after.get(label);
            if (now === undefined || now.text !== was.text) return false;
          }
          return true;
        }),
        { numRuns: RUNS },
      );
      expect(accepted).toBeGreaterThan(contract.minAccepted);
      expect(withMarkerAbove).toBeGreaterThan(contract.minWithMarkerAbove);
    });
  }
});

/**
 * The other half of the same contract, for the operation a fence line cannot
 * express.
 *
 * The property above asks what stays put ABOVE the operand. A paste has no
 * operand to fence at — it inserts where it is pointed, and the markers at
 * risk are the ones BELOW the insertion, which is exactly where the reported
 * defect landed (#159: `10. ten` rewritten to `8. ten`). So the fence is the
 * insertion point and the direction is reversed.
 *
 * The payload carries no ordered item, which is what makes the assertion total
 * rather than conditional: nothing arrives that belongs to any run, so no run's
 * membership changes and no marker in the document has any reason to move. A
 * payload that DID carry one would legitimately push the items below it, and
 * the property would have to become a calculation instead of an invariant.
 *
 * Restricted to already-consecutive sources for the same reason the property
 * above is: a renumbering normalizes, and normalizing a run that reads 8, 9, 9
 * is the requirement working rather than failing.
 */
describe('a paste that carries no ordered item rewrites no ordered marker', () => {
  const PAYLOADS = ['- x\n', '- x\n  - y\n', '## H\nbody\n', '> quote\n'];

  it('leaves every ordered marker in the document byte-identical', () => {
    let accepted = 0;
    let withMarkerBelow = 0;
    fc.assert(
      fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), (doc, n, p) => {
        if (!alreadyConsecutive(doc.children)) return true;
        const anchors = [...walkNodes(doc)].filter((node) => labelOf(node) !== undefined);
        if (anchors.length === 0) return true;
        const anchor = anchors[n % anchors.length]!;

        const before = byLabel(doc);
        const anchorLine = before.get(labelOf(anchor)!)!.line;
        const payload = parse(PAYLOADS[p % PAYLOADS.length]!).children;
        const result = insertSubtrees(doc, anchor.id, payload, 'after');
        if (!result.ok) return true;
        accepted++;
        if (
          [...walkNodes(doc)].some((node) => {
            const label = labelOf(node);
            return (
              orderedNumber(node) !== undefined &&
              label !== undefined &&
              before.get(label)!.line > anchorLine
            );
          })
        ) {
          withMarkerBelow++;
        }

        // Every labelled node, above and below alike: the payload belongs to no
        // run, so nothing in the destination has a reason to change. A node that
        // VANISHED fails too, for the reason the property above states.
        const after = byLabel(result.value.doc);
        for (const [label, was] of before) {
          const now = after.get(label);
          if (now === undefined || now.text !== was.text) return false;
        }
        return true;
      }),
      { numRuns: RUNS },
    );
    // Floors on what the property got to assert, as above: a suite that
    // degrades to "everything was rejected" and the subtler version where no
    // accepted case carried an ordered marker below the anchor at all.
    expect(accepted).toBeGreaterThan(1500);
    expect(withMarkerBelow).toBeGreaterThan(700);
  });
});
