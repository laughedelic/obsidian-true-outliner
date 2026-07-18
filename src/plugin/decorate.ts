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

import type { NodeKind, OutlineDoc, OutlineNode } from '../model';
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
  /**
   * The node's own kind — straight from `node.kind`, no extra tree walk.
   * Added for Experiment 5 (per-kind block markers, see
   * docs/research/07-decoration-experiments-plan.md): `isFirstLine` is
   * already exactly the right gate for "does this line get a marker,"
   * decorations.ts just also needs to know WHICH mark to paint.
   */
  readonly kind: NodeKind;
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
        kind: node.kind,
      });
    }
    current += node.lines.length + node.trailingGap.length;
    node.children.forEach((child) => walk(child, depth + 1, rootDepth));
  };

  doc.children.forEach((node) => walk(node, 0, null));
  return facts;
}

/**
 * One line's active guide-line ancestor depths (Experiment 2b, see
 * docs/research/07-decoration-experiments-plan.md) — the CSS
 * stacked-gradient alternative to Experiment 2a's pixel-measured overlay.
 *
 * A depth `d` is active on a line when some strict, non-list-item ancestor
 * at tree depth `d` sits above the line's own node — i.e. that ancestor
 * "owns" a guide, and every line inside its subtree (its own multi-line
 * continuations included, but never the ancestor's own lines themselves)
 * should render that guide. List-item ancestors never own a guide,
 * deliberately: same real-vault finding Experiment 2a made — Obsidian's
 * native indent guides already connect one bullet precisely to the next
 * within a list, and a guide of ours alongside them either doubles up or
 * reads as unevenly spaced against native per-level width.
 *
 * Unlike Experiment 2a's `computeGuides` (a per-NODE fact requiring a
 * two-pass walk to find each ancestor's subtree span), this is a per-LINE
 * fact computed in one pass: no subtree-span bookkeeping is needed because
 * a single `Decoration.line` only ever needs to know "which ancestor
 * guides pass through *this* line," not the full extent of any one guide.
 *
 * ALSO covers every blank trailingGap (separator) line, not just nodes' own
 * content lines — real-vault review found the guide visibly breaking at
 * every blank line between blocks (a plain screenshot glance away from
 * noticing it, since a 1-line gap reads as "close enough," but a real,
 * confirmed regression against Experiment 2a: its overlay is one continuous
 * rectangle per guide, spanning gaps between siblings for free, whereas this
 * per-line mechanism draws nothing on a line it has no fact for at all). A
 * LEAF node's own trailingGap is "the gap before the next sibling in
 * document order, at this node's own level" — it gets the SAME guideDepths
 * this leaf's own lines had. A node WITH children's trailingGap is "the gap
 * before its own first child" instead — already inside that node's own
 * subtree, so it gets `childGuideDepths` (the same depths its first child
 * gets), not `guideDepths`. An earlier version of this code left the
 * "before first child" case uncovered, reasoning it matched Experiment 2a's
 * own span (which starts at the first child's own line, not before it) —
 * true, but that's an incidental artifact of how 2a's span is computed, not
 * a deliberate design goal worth preserving, and it read as a real,
 * confirmed break on further real-vault review (the guide visibly stopped
 * short right after any heading/paragraph with children). Covering it here
 * is a genuine improvement over 2a's own behavior, not just parity with it.
 */
export interface LineGuideFact {
  /** 0-indexed absolute line number in the document. */
  readonly lineNumber: number;
  /**
   * Ascending tree depths of every strict, non-list-item ancestor whose
   * guide is active on this line. Empty for a top-level node's own lines
   * (no ancestors at all) and for any line whose every ancestor is itself
   * a list-item chain (deferred entirely to native indent guides, same as
   * Experiment 2a's `deep-nesting` fixture result).
   */
  readonly guideDepths: readonly number[];
  /**
   * The SUBSET of `guideDepths` whose owning ancestor is a `heading` —
   * needed by decorations.ts (Experiment 5b) to know which specific guide
   * columns must additionally clear Obsidian's native fold chevron: only
   * headings (and list items, which never own a guide at all — see above)
   * can fold in Obsidian's own UI, so a `paragraph`-owned guide (this
   * project's own tree lets a paragraph have children too) never needs
   * that extra reach. Always a subset of `guideDepths`, same ascending
   * order.
   */
  readonly headingGuideDepths: readonly number[];
  /**
   * True for a blank trailingGap line carrying a guide (see the doc
   * comment above) — these have no corresponding `decorate()` fact at
   * all (no depth, no kind), so decorations.ts can't zip this array with
   * `decorate()`'s by index anymore; it keys both by `lineNumber` instead
   * and additionally decorates any gap-only line found here.
   */
  readonly isGapLine: boolean;
}

/**
 * Walks the tree in the same document order as `decorate()` (own lines,
 * then children) plus blank trailingGap lines between siblings (see the
 * doc comment above) — decorations.ts keys this by `lineNumber`, not by
 * array index, since gap lines add entries `decorate()` doesn't have.
 */
export function computeLineGuides(doc: OutlineDoc): LineGuideFact[] {
  const facts: LineGuideFact[] = [];
  let current = doc.preamble.length;

  const walk = (
    node: OutlineNode,
    depth: number,
    guideDepths: readonly number[],
    headingGuideDepths: readonly number[],
  ): void => {
    for (let i = 0; i < node.lines.length; i++) {
      facts.push({ lineNumber: current + i, guideDepths, headingGuideDepths, isGapLine: false });
    }
    current += node.lines.length;

    // This node starts owning a guide for its own children from here on —
    // unless it's a list item, which never owns one (see doc comment above).
    const childGuideDepths = node.kind === 'list-item' ? guideDepths : [...guideDepths, depth];
    const childHeadingGuideDepths =
      node.kind === 'list-item'
        ? headingGuideDepths
        : node.kind === 'heading'
          ? [...headingGuideDepths, depth]
          : headingGuideDepths;

    // Every trailing gap gets a fact now, for full continuity (see the doc
    // comment above): a leaf's own gap uses its own guideDepths; a node
    // with children's gap is already "inside" its subtree, so it uses
    // childGuideDepths instead — the same depths its first child gets.
    const gapGuideDepths = node.children.length === 0 ? guideDepths : childGuideDepths;
    const gapHeadingGuideDepths =
      node.children.length === 0 ? headingGuideDepths : childHeadingGuideDepths;
    for (let i = 0; i < node.trailingGap.length; i++) {
      facts.push({
        lineNumber: current + i,
        guideDepths: gapGuideDepths,
        headingGuideDepths: gapHeadingGuideDepths,
        isGapLine: true,
      });
    }
    current += node.trailingGap.length;

    node.children.forEach((child) => walk(child, depth + 1, childGuideDepths, childHeadingGuideDepths));
  };

  doc.children.forEach((node) => walk(node, 0, [], []));
  return facts;
}
