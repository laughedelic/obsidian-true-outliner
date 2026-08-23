/**
 * The DEPTH CONTRACT: where a non-heading subject ends up, measured on the tree
 * the caller actually receives.
 *
 * ## Why this is not covered by closure
 *
 * `closure.test.ts` checks `result.value.doc` against `parse(encode(result.value.doc))`.
 * `finalize` already returns `parse(encode(surgery))`, so that check asks whether
 * `parse ∘ encode` sits at a fixed point on a tree which is itself a parse
 * output — a real property, broken by an encode/parse instability, but never a
 * comparison against the SURGERY tree the algebra built. An operation whose
 * emitted markdown re-parses to a different tree than its own surgery produced
 * satisfies closure and is still wrong. Asserting what the operation PROMISES is
 * what closes the gap (docs/research/04-open-questions.md Q33).
 *
 * ## Why the subject is tracked by label
 *
 * Node ids do not survive `finalize`, and line coordinates are exactly what a
 * relocation destroys. `group-oracle.ts` generates documents whose every node
 * carries a unique `L<n>` token in its own text; structural operations rewrite
 * markers and never a node's text, so the token crosses the re-parse.
 *
 * ## Why a reorder gets a second, wider property
 *
 * The table below measures the SUBJECT, and for a reorder the subject is
 * exactly what stays put. A move up that leaves a list item stranded after a
 * paragraph absorbs that item — a node the caller never selected — while the
 * subject's own depth is untouched, so a subject-only measurement scores it
 * zero. §1.4 therefore compares EVERY label's depth across the call: a reorder
 * permutes two subtrees at one level and moves nothing between levels, so any
 * depth change anywhere is an encoding that re-parsed differently from the tree
 * the operation built.
 *
 * Headings are absent from the table for a different reason: their indent is a
 * level shift, and the resulting tree depth follows the surrounding heading
 * context rather than the operation, so a fixed delta is not their contract.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { walkNodes, type OutlineDoc } from '../src/model';
import { forestCoverOf } from '../src/escalate';
import { groupRootsByParent } from '../src/operand';
import { forEachNodeWithLine } from '../src/locate';
import {
  indent,
  indentGroups,
  moveDown,
  moveGroupsDown,
  moveGroupsUp,
  moveUp,
  outdent,
  outdentGroups,
  type OpOutput,
} from '../src/ops';
import type { OpResult } from '../src/result';
import { arbLabeledDoc, labelOf } from './group-oracle';

interface DepthContract {
  /** Change in the subject's depth the operation promises. */
  readonly delta: number;
  readonly single: (doc: OutlineDoc, nodeId: number) => OpResult<OpOutput>;
  readonly group: (
    doc: OutlineDoc,
    groups: readonly (readonly number[])[],
  ) => OpResult<OpOutput>;
  /**
   * Floors on how many cases the property actually got to assert. They sit far
   * below what the generator currently produces: they exist to catch a change
   * that guts the suite's reach — where every case is rejected and the property
   * passes having tested nothing — not to pin an acceptance rate.
   *
   * The two forms are counted separately because they accept at very different
   * rates: a group operand is rejected whenever any one of its roots is. A
   * shared counter would let one form's cases stand in for the other's.
   */
  readonly minSingle: number;
  readonly minGroup: number;
  readonly minMultiRoot: number;
}

const CONTRACTS: Record<string, DepthContract> = {
  indent: {
    delta: 1,
    single: indent,
    group: (doc, groups) => indentGroups(doc, groups),
    minSingle: 600,
    minGroup: 450,
    minMultiRoot: 300,
  },
  outdent: {
    delta: -1,
    single: outdent,
    group: (doc, groups) => outdentGroups(doc, groups),
    minSingle: 900,
    minGroup: 400,
    minMultiRoot: 250,
  },
  moveUp: {
    delta: 0,
    single: moveUp,
    group: moveGroupsUp,
    minSingle: 600,
    minGroup: 200,
    minMultiRoot: 90,
  },
  moveDown: {
    delta: 0,
    single: moveDown,
    group: moveGroupsDown,
    minSingle: 600,
    minGroup: 180,
    minMultiRoot: 80,
  },
};

const RUNS = 3000;

/** Every labelled node's depth, 0 at top level. */
function depthsByLabel(doc: OutlineDoc): Map<string, number> {
  const depths = new Map<string, number>();
  forEachNodeWithLine(doc, (node, _startLine, depth) => {
    const label = labelOf(node);
    if (label !== undefined && !depths.has(label)) depths.set(label, depth);
  });
  return depths;
}

describe('1.2 a single-node operation delivers the depth it promises', () => {
  for (const [name, contract] of Object.entries(CONTRACTS)) {
    it(`${name} moves a non-heading subject by ${contract.delta}`, () => {
      let accepted = 0;
      fc.assert(
        fc.property(arbLabeledDoc(), fc.nat(), (doc, n) => {
          const subjects = [...walkNodes(doc)].filter(
            (node) => node.kind !== 'heading' && labelOf(node) !== undefined,
          );
          if (subjects.length === 0) return true;
          const subject = subjects[n % subjects.length]!;
          const label = labelOf(subject)!;
          const before = depthsByLabel(doc).get(label)!;

          const result = contract.single(doc, subject.id);
          if (!result.ok) return true;
          accepted++;

          // An absent label is a failure, not a case to skip: operations never
          // rewrite a node's text, so a subject that cannot be found in the
          // result has been destroyed — a worse defect than a wrong depth.
          const after = depthsByLabel(result.value.doc).get(label);
          return after !== undefined && after - before === contract.delta;
        }),
        { numRuns: RUNS },
      );
      expect(accepted).toBeGreaterThan(contract.minSingle);
    });
  }
});

describe('1.3 a group operation delivers it for every covered root', () => {
  for (const [name, contract] of Object.entries(CONTRACTS)) {
    it(`${name} moves each covered root by ${contract.delta}, from where it was`, () => {
      let accepted = 0;
      let multiRoot = 0;
      fc.assert(
        fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), (doc, i, j) => {
          const all = [...walkNodes(doc)];
          if (all.length === 0) return true;
          const cover = forestCoverOf(doc, all[i % all.length]!, all[j % all.length]!);
          const roots = cover.roots.map((root) => root.node);
          if (roots.length === 0) return true;
          if (roots.some((root) => root.kind === 'heading')) return true;
          const labels = roots.map((root) => labelOf(root));
          if (labels.some((label) => label === undefined)) return true;

          const before = depthsByLabel(doc);
          const result = contract.group(doc, groupRootsByParent(cover.roots));
          if (!result.ok) return true;
          accepted++;
          if (roots.length > 1) multiRoot++;

          // Each root against ITS OWN prior depth. A cover whose roots sit at
          // several depths moves all of them by the delta; it does not bring
          // them to a common depth.
          const after = depthsByLabel(result.value.doc);
          return labels.every((label) => {
            const depth = after.get(label!);
            return depth !== undefined && depth - before.get(label!)! === contract.delta;
          });
        }),
        { numRuns: RUNS },
      );
      expect(accepted).toBeGreaterThan(contract.minGroup);
      // Without this the group property could degrade into the single-node one
      // and stay green. A one-root group takes the same `finalize` path and is
      // asserted to BE the single-node operation; what only several roots reach
      // is their surgeries composed before the one parse, where a root can be
      // absorbed by what another root left beside it.
      expect(multiRoot).toBeGreaterThan(contract.minMultiRoot);
    });
  }
});

/**
 * 1.4 — the wider statement, for reorders only.
 *
 * §1.2 and §1.3 watch the subject and the covered roots. A reorder's exposure
 * is not there: it swaps two subtrees, and the one that can land somewhere the
 * parse will not keep it is as often the sibling DISPLACED by the swap as the
 * subject itself. Measured before the refusal that closed it, move up violated
 * this at the same rate as move down while scoring zero against the subject.
 *
 * So the assertion is the whole document: a permutation at one level moves
 * nothing between levels, and any label whose depth changed is an encoding that
 * re-parsed into a different tree than the surgery built.
 */
describe('1.4 an accepted reorder moves no node between levels', () => {
  const REORDERS = {
    moveUp: { single: moveUp, group: moveGroupsUp, minSingle: 600, minGroup: 180 },
    moveDown: { single: moveDown, group: moveGroupsDown, minSingle: 600, minGroup: 180 },
  } as const;

  for (const [name, ops] of Object.entries(REORDERS)) {
    it(`${name} leaves every node's depth alone, subject and bystander alike`, () => {
      let accepted = 0;
      fc.assert(
        fc.property(arbLabeledDoc(), fc.nat(), (doc, n) => {
          const subjects = [...walkNodes(doc)].filter(
            (node) => node.kind !== 'heading' && labelOf(node) !== undefined,
          );
          if (subjects.length === 0) return true;
          const before = depthsByLabel(doc);
          const result = ops.single(doc, subjects[n % subjects.length]!.id);
          if (!result.ok) return true;
          accepted++;
          const after = depthsByLabel(result.value.doc);
          return [...before.keys()].every((label) => after.get(label) === before.get(label));
        }),
        { numRuns: RUNS },
      );
      expect(accepted).toBeGreaterThan(ops.minSingle);
    });

    it(`${name} in its group form leaves every node's depth alone`, () => {
      let accepted = 0;
      fc.assert(
        fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), (doc, i, j) => {
          const all = [...walkNodes(doc)];
          if (all.length === 0) return true;
          const cover = forestCoverOf(doc, all[i % all.length]!, all[j % all.length]!);
          const roots = cover.roots.map((root) => root.node);
          if (roots.length === 0) return true;
          if (roots.some((root) => root.kind === 'heading')) return true;

          const before = depthsByLabel(doc);
          const result = ops.group(doc, groupRootsByParent(cover.roots));
          if (!result.ok) return true;
          accepted++;
          const after = depthsByLabel(result.value.doc);
          return [...before.keys()].every((label) => after.get(label) === before.get(label));
        }),
        { numRuns: RUNS },
      );
      expect(accepted).toBeGreaterThan(ops.minGroup);
    });
  }
});
