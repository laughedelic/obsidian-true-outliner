/**
 * Test support for the GROUP forms of the structural operations: documents
 * whose nodes carry a stable label, and the sequential-composition ORACLE the
 * group ops are specified against (`selection-aware-structural-ops` design D1).
 *
 * ## Why labels
 *
 * `finalize` re-parses, so node ids do not survive an operation. The oracle has
 * to apply a single-node op to each covered root IN TURN, which means locating
 * roots it has not reached yet in a tree that has been rebuilt under it. Ids
 * cannot do that and line mapping is exactly what a relocation destroys — a
 * moved node's old coordinates are occupied by whatever took its place.
 *
 * So the generator writes a unique `L<n>` token into every node's own text and
 * the oracle tracks roots by that. Structural operations rewrite MARKERS
 * (indentation, `#` runs, ordered digits) and never a node's text, so the token
 * survives every operation under test — which is itself worth knowing, and is
 * asserted directly in `group-oracle.test.ts`.
 *
 * ## Why generated as TEXT
 *
 * `arbTree()` builds trees directly and has to encode the parser's attachment
 * and gap invariants in the builder to stay valid. Generating markdown and
 * parsing it makes validity automatic — whatever the parser says the tree is,
 * it is — which matters more here than the adversarial line shapes `arbTree`
 * reaches for, since these properties are about tree surgery rather than
 * segmentation.
 */

import fc from 'fast-check';
import { parse } from '../src/parse';
import { walkNodes, type OutlineDoc, type OutlineNode } from '../src/model';
import { indent, moveDown, moveUp, outdent } from '../src/ops';

const OPS = { indent, outdent, moveUp, moveDown } as const;
export type GroupOpName = keyof typeof OPS;

export const arbGroupOp: fc.Arbitrary<GroupOpName> = fc.constantFrom(
  'indent',
  'outdent',
  'moveUp',
  'moveDown',
);

const LABEL_RE = /\bL\d+\b/;

/** A node's label, or `undefined` for a node the generator did not label. */
export function labelOf(node: OutlineNode): string | undefined {
  return LABEL_RE.exec(node.lines[0] ?? '')?.[0];
}

export function nodeByLabel(doc: OutlineDoc, label: string): OutlineNode | undefined {
  for (const node of walkNodes(doc)) if (labelOf(node) === label) return node;
  return undefined;
}

export function labelsOf(doc: OutlineDoc): string[] {
  return [...walkNodes(doc)].map(labelOf).filter((l): l is string => l !== undefined);
}

// ------------------------------------------------------------------ shapes

interface ItemShape {
  readonly ordered: boolean;
  readonly kids: readonly ItemShape[];
}

type Block =
  | { readonly t: 'heading'; readonly level: number }
  | { readonly t: 'para'; readonly kids: readonly ItemShape[] }
  | { readonly t: 'list'; readonly items: readonly ItemShape[] };

const arbItem = (depth: number): fc.Arbitrary<ItemShape> =>
  fc.record({
    ordered: fc.boolean(),
    kids:
      depth > 0
        ? fc.array(arbItem(depth - 1), { maxLength: 3 })
        : fc.constant([] as ItemShape[]),
  });

const arbBlock: fc.Arbitrary<Block> = fc.oneof(
  { weight: 2, arbitrary: fc.record({ t: fc.constant('heading' as const), level: fc.integer({ min: 1, max: 3 }) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('para' as const), kids: fc.array(arbItem(1), { maxLength: 2 }) }) },
  { weight: 3, arbitrary: fc.record({ t: fc.constant('list' as const), items: fc.array(arbItem(2), { minLength: 1, maxLength: 4 }) }) },
);

/**
 * A list item directly after a paragraph with no blank line between them is
 * the paragraph's CHILD, never its sibling — the attachment rule. The
 * generator uses that deliberately (a `para` block's `kids` are rendered
 * tight beneath it) and separates every block from the next with a blank
 * line so nothing attaches across a block boundary.
 */
function render(blocks: readonly Block[]): string {
  let n = 0;
  const label = (): string => `L${n++}`;
  const lines: string[] = [];

  const renderItems = (items: readonly ItemShape[], indentCols: number): void => {
    items.forEach((item, i) => {
      const marker = item.ordered ? `${i + 1}. ` : '- ';
      lines.push(`${' '.repeat(indentCols)}${marker}${label()}`);
      // Children indent to the parent's own CONTENT column, not by a fixed
      // unit. An ordered marker is three characters wide, so a fixed two-space
      // step renders a "child" the parser reads as a sibling — documents whose
      // shape on screen is not the shape in the tree, which would make every
      // property below reason about a structure that is not there.
      renderItems(item.kids, indentCols + marker.length);
    });
  };

  for (const block of blocks) {
    switch (block.t) {
      case 'heading':
        lines.push(`${'#'.repeat(block.level)} ${label()}`);
        break;
      case 'para':
        lines.push(label());
        renderItems(block.kids, 0);
        break;
      case 'list':
        renderItems(block.items, 0);
        break;
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Documents whose every node carries a unique `L<n>` label. */
export function arbLabeledDoc(): fc.Arbitrary<OutlineDoc> {
  return fc.array(arbBlock, { minLength: 1, maxLength: 5 }).map((blocks) => parse(render(blocks)));
}

// ------------------------------------------------------------------ oracle

export type Composed =
  | { readonly ok: true; readonly doc: OutlineDoc }
  | { readonly ok: false; readonly reason: string };

/**
 * The RAW composition: apply the single-node form to each covered root in turn,
 * each step against the tree the previous step produced.
 *
 * Move down applies its roots in REVERSE document order. In forward order the
 * first root swaps past the second — a member of its own operand — instead of
 * past the run's own neighbour. Every other operation is correct in document
 * order.
 *
 * Rejection is atomic: the first failing step's reason is the whole
 * operation's, and no partial result is returned.
 *
 * This is the composition as mathematics, WITHOUT the reorder restriction. The
 * group operation is `composeGroupOp` below; the two are separate because the
 * property that justifies the restriction has to be able to ask what an
 * unrestricted multi-scope reorder would actually do.
 */
export function composeSequential(
  doc: OutlineDoc,
  labels: readonly string[],
  op: GroupOpName,
): Composed {
  const order = op === 'moveDown' ? [...labels].reverse() : labels;
  let current = doc;
  for (const label of order) {
    const node = nodeByLabel(current, label);
    if (!node) return { ok: false, reason: 'label-lost' };
    const result = OPS[op](current, node.id);
    if (!result.ok) return { ok: false, reason: result.rejection.reason };
    current = result.value.doc;
  }
  return { ok: true, doc: current };
}

/**
 * The group operation's DEFINITION: the raw composition above, plus the operand
 * restriction the reorders carry (`selection-aware-structural-ops` D8).
 *
 * Move up and move down accept only a SINGLE contiguous sibling run. Across
 * several parents each group would move within its own scope, which scatters
 * the roots rather than moving them — measured, and the reason the restriction
 * exists rather than a precaution. Indent and outdent take any forest shape.
 */
export function composeGroupOp(
  doc: OutlineDoc,
  labels: readonly string[],
  op: GroupOpName,
  groupCount: number,
): Composed {
  if (isReorder(op) && groupCount > 1) {
    return { ok: false, reason: 'cannot-reorder-across-scopes' };
  }
  return composeSequential(doc, labels, op);
}

export function isReorder(op: GroupOpName): boolean {
  return op === 'moveUp' || op === 'moveDown';
}
