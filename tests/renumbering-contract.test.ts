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
import { forEachNodeWithLine } from '../src/locate';
import { indent, moveDown, moveUp, outdent, type OpOutput } from '../src/ops';
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
