/**
 * Pure per-line decoration facts for outline mode's additive-only indentation
 * (see docs/research/07-decoration-experiments-plan.md, Experiment 1).
 *
 * Headings, paragraphs, and atoms have no native indentation of their own —
 * decorations.ts sets `padding-left`/`margin-left` = `depth × unit` directly,
 * which is additive in effect because there is nothing native to add to.
 *
 * List items are different: Obsidian already hangs their native bullet/
 * number via its own `text-indent`/`padding-left` pair, per raw nesting
 * level. That pair is NEVER touched here — instead, `supplementalDepth`
 * captures only the contribution from non-list-item ancestors (e.g. a
 * heading a list sits under), and decorations.ts adds it as `margin-left`,
 * a box-model property native list rendering doesn't otherwise use. A list
 * with no non-list-item ancestors gets supplementalDepth 0 everywhere in it
 * — byte-identical to outline-mode-off, a permanent regression invariant.
 */

import type { OutlineDoc, OutlineNode } from '../model';
import { isAtom } from '../model';

export interface LineDecorationFact {
  /** 0-indexed absolute line number in the document. */
  readonly lineNumber: number;
  /** Distance from the document root; top-level nodes are depth 0. */
  readonly depth: number;
  /** True only for a node's own first line — carries the hang + marker. */
  readonly isFirstLine: boolean;
  /**
   * True for list-item first lines: they already have a native marker
   * glyph (bullet/number) that Experiment 1 leaves fully untouched — kept
   * for callers that need to identify it, not consumed by decorations.ts.
   */
  readonly hasNativeMarker: boolean;
  /**
   * True for atom nodes (code/table/quote/callout/html/hr). `padding-left`
   * only shifts an element's own *content*, never its own border/background
   * box — invisible for plain text, but atoms render a visible background/
   * border box whose edges stay put regardless of padding. Atoms need
   * `margin-left` instead, which actually moves the box; decorations.ts
   * uses this flag to pick the right CSS property.
   */
  readonly isAtom: boolean;
  /**
   * True for every line (first + continuation) of a list-item node. Native
   * `text-indent`/`padding-left` must never be touched for these lines —
   * decorations.ts applies `supplementalDepth` as `margin-left` instead,
   * on top of native rendering.
   */
  readonly isListItem: boolean;
  /**
   * Meaningful only when `isListItem` is true (0 and unused otherwise): the
   * depth, in the whole tree, of the nearest ancestor list-item that starts
   * an unbroken list-item chain (i.e. total tree depth minus depth-within-
   * that-chain) — equivalently, how many non-list-item ancestors sit above
   * the nearest list root. Constant across an entire nested list, so native
   * per-level spacing within the list is untouched; only the list's start
   * position shifts by its non-list ancestors' contribution.
   */
  readonly supplementalDepth: number;
}

/**
 * Walks the parsed tree in document order (a node's own lines, then its
 * children — the same layout `nodeAtLine`/`startLine` assume: trailingGap
 * lines sit between a node's own lines and its children, and carry no fact
 * of their own).
 */
export function decorate(doc: OutlineDoc): LineDecorationFact[] {
  const facts: LineDecorationFact[] = [];
  let current = doc.preamble.length;

  const walk = (node: OutlineNode, depth: number, listRootDepth: number | null): void => {
    const atom = isAtom(node);
    const isListItem = node.kind === 'list-item';
    // Entering a new list-item chain (this node's parent wasn't one) roots
    // it at this node's own depth; continuing a chain inherits the root.
    const rootDepth = isListItem ? (listRootDepth ?? depth) : null;
    for (let i = 0; i < node.lines.length; i++) {
      facts.push({
        lineNumber: current + i,
        depth,
        isFirstLine: i === 0,
        hasNativeMarker: isListItem && i === 0,
        isAtom: atom,
        isListItem,
        supplementalDepth: isListItem ? rootDepth! : 0,
      });
    }
    current += node.lines.length + node.trailingGap.length;
    node.children.forEach((child) => walk(child, depth + 1, rootDepth));
  };

  doc.children.forEach((node) => walk(node, 0, null));
  return facts;
}

/**
 * One vertical guide line: an ancestor node with children "hangs" a line
 * from its own first line down through the full extent of its subtree
 * (Experiment 2a, see docs/research/07-decoration-experiments-plan.md).
 *
 * Deliberately measurement-driven, not computed: decorations.ts positions
 * the guide's x by reading `anchorLine`'s *actual rendered* position via
 * `coordsAtPos` rather than recomputing depth × unit here. This sidesteps
 * needing any special-casing for list items (native marker position, the
 * supplementalDepth quirk) — whatever the ancestor's own line actually
 * renders at is, by construction, where its children's guide should hang.
 *
 * No guide is produced for a *list-item* ancestor, deliberately: Obsidian's
 * own native indent guides already connect one bullet precisely to the
 * next within a list, and a block-level guide of ours alongside them either
 * doubles up (both visible at once) or, alone, reads as unevenly spaced
 * (a list's own internal per-level width isn't the same as our fixed unit
 * — the same native-hang mismatch Experiment 1 deferred rather than fight).
 * We only add a bridging guide where native has *no* representation at
 * all: from a non-list ancestor (heading/paragraph/atom) down into a list,
 * or between non-list kinds — never for nesting *within* one list.
 */
export interface GuideFact {
  /** Tree depth of the owning (ancestor) node — informational, not consumed for positioning. */
  readonly depth: number;
  /** 0-indexed line: the ancestor's own first line — measure its rendered position for x. */
  readonly anchorLine: number;
  /** 0-indexed line: first line of the guide's vertical span (its first child's own first line). */
  readonly fromLine: number;
  /** 0-indexed line: last line of the guide's vertical span (its deepest last descendant's last line). */
  readonly toLine: number;
}

/**
 * Computes one GuideFact per node that has children AND is not itself a
 * list item. Mirrors decorate()'s own document-order walk (own lines, then
 * trailingGap, then children) so line numbers agree between the two; kept
 * as a separate walk rather than folded into decorate() since guides are a
 * per-node (not per-line) fact.
 */
export function computeGuides(doc: OutlineDoc): GuideFact[] {
  const guides: GuideFact[] = [];
  let current = doc.preamble.length;

  // Returns [node's own first line, last line of node's own subtree] (both
  // 0-indexed, inclusive) — the range a parent's guide needs from a child.
  const walk = (node: OutlineNode, depth: number): [number, number] => {
    const anchorLine = current;
    current += node.lines.length;
    const ownLastLine = current - 1;
    current += node.trailingGap.length;

    if (node.children.length === 0) return [anchorLine, ownLastLine];

    let subtreeFirstLine = Number.POSITIVE_INFINITY;
    let subtreeLastLine = Number.NEGATIVE_INFINITY;
    for (const child of node.children) {
      const [childFirst, childLast] = walk(child, depth + 1);
      subtreeFirstLine = Math.min(subtreeFirstLine, childFirst);
      subtreeLastLine = Math.max(subtreeLastLine, childLast);
    }
    if (node.kind !== 'list-item') {
      guides.push({ depth, anchorLine, fromLine: subtreeFirstLine, toLine: subtreeLastLine });
    }
    return [anchorLine, subtreeLastLine];
  };

  doc.children.forEach((node) => walk(node, 0));
  return guides;
}
