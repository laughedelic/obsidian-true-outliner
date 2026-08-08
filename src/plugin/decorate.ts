/**
 * Pure per-line decoration facts for outline mode's additive-only indentation
 * (see docs/research/08-experiment-1-additive-indentation.md).
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
   * The node's own kind (Experiment 5, see
   * docs/research/10-experiment-5-block-markers.md) — populated straight
   * from `node.kind`, constant across all of a node's own lines (first +
   * continuation). Used to pick a per-kind block marker; not consumed by
   * Experiment 1/2b's own indentation/guide logic.
   */
  readonly kind: NodeKind;
  /**
   * True when the node has at least one child (`node.children.length > 0`),
   * constant across all of a node's own lines. Atom kinds are leaves by
   * construction (`ATOM_KINDS` never parse internals as nodes) so this is
   * always `false` for them; list items are excluded from markers entirely
   * regardless. Used by the marker-visibility setting (Experiment 5a
   * follow-up) to optionally hide markers on leaf nodes.
   */
  readonly hasChildren: boolean;
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
        hasChildren: node.children.length > 0,
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
 * docs/research/09-experiment-2-guide-lines.md) — the CSS
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

  const walk = (node: OutlineNode, depth: number, guideDepths: readonly number[]): void => {
    for (let i = 0; i < node.lines.length; i++) {
      facts.push({ lineNumber: current + i, guideDepths, isGapLine: false });
    }
    current += node.lines.length;

    // This node starts owning a guide for its own children from here on —
    // unless it's a list item, which never owns one (see doc comment above).
    const childGuideDepths = node.kind === 'list-item' ? guideDepths : [...guideDepths, depth];

    // Every trailing gap gets a fact now, for full continuity (see the doc
    // comment above): a leaf's own gap uses its own guideDepths; a node
    // with children's gap is already "inside" its subtree, so it uses
    // childGuideDepths instead — the same depths its first child gets.
    const gapGuideDepths = node.children.length === 0 ? guideDepths : childGuideDepths;
    for (let i = 0; i < node.trailingGap.length; i++) {
      facts.push({ lineNumber: current + i, guideDepths: gapGuideDepths, isGapLine: true });
    }
    current += node.trailingGap.length;

    node.children.forEach((child) => walk(child, depth + 1, childGuideDepths));
  };

  doc.children.forEach((node) => walk(node, 0, []));
  return facts;
}

/**
 * Which ancestor-trail rendering the position-indicator layer draws (see the
 * hierarchy-position-indicators change).
 *
 * - `'guides'` accents each strict ancestor's guide along its WHOLE extent —
 *   "everything you are inside of", including the sibling subtrees below the
 *   caret, since those are inside those ancestors too.
 * - `'path'` accents only the part of each ancestor's guide that leads TO the
 *   caret (from that ancestor's own row down to where the next level starts),
 *   and accents every ancestor's own marker.
 *
 * `'path'` began as a port of Logseq's bullet-threading, with a horizontal
 * elbow drawn at each level change. Those elbows were removed after seeing
 * them in a real note: a marker is centered ON its own guide column, so an
 * elbow arriving at the next level ran straight through that marker's icon,
 * and the segment ends picked up visible offsets. Accenting the ancestor's
 * marker instead makes the marker itself the junction — the shape reads as
 * connected without drawing anything horizontal, and it reuses two mechanisms
 * that already work rather than adding a third that fights them.
 *
 * One three-state setting rather than two toggles, so the two styles can never
 * double up on the same level.
 */
export type AncestorTrail = 'off' | 'guides' | 'path';

/**
 * How much of a line's height an accent covers at one depth. `'full'` is the
 * whole row (a `guides` accent, or a `path` segment passing straight through);
 * `'bottom'` is the lower half — a `path` segment leaving an ancestor's own
 * marker downward, drawn on the ancestor's own row, where that ancestor's own
 * guide deliberately does not exist; `'top'` is the upper half, a segment
 * arriving at the row where the next level starts.
 */
export type TrailExtent = 'full' | 'top' | 'bottom';

export interface TrailAccent {
  /** Tree depth whose guide column this accent sits on. */
  readonly depth: number;
  readonly extent: TrailExtent;
}

export interface PositionTrailFact {
  /** 0-indexed absolute line number in the document. */
  readonly lineNumber: number;
  /** Ascending by depth; at most one accent per depth, never two. */
  readonly accents: readonly TrailAccent[];
}

export interface PositionTrail {
  /**
   * The current node's own FIRST line (0-indexed), or null when the caret
   * resolves to no node at all (an empty document, or a caret in the inert
   * preamble). Drives the current-marker accent; independent of the trail
   * style, which may well be `'off'`.
   */
  readonly currentLine: number | null;
  /**
   * True when the current node is a list item, whose marker is Obsidian's
   * own native bullet/number rather than one of our synthetic ones — the two
   * need different CSS to accent, so the consumer has to know which.
   */
  readonly currentIsListItem: boolean;
  /**
   * Every strict ancestor's own first line, mapped to whether that ancestor is
   * a list item (same native-vs-synthetic marker split as `currentIsListItem`).
   * Populated by the `'path'` style only — it is what replaced the elbows, and
   * the reason `'path'` says something in a pure list, where no ancestor owns a
   * guide column this layer can draw on at all.
   */
  readonly ancestorLines: ReadonlyMap<number, boolean>;
  /** Keyed by line number, like `computeLineGuides`'s own output. */
  readonly byLine: ReadonlyMap<number, PositionTrailFact>;
}

const EMPTY_TRAIL: PositionTrail = {
  currentLine: null,
  currentIsListItem: false,
  ancestorLines: new Map(),
  byLine: new Map(),
};

/** One node on the path from the document root down to the current node. */
interface ChainEntry {
  readonly depth: number;
  /** The node's own first line. */
  readonly firstLine: number;
  /** The node's own last line (its continuation lines included). */
  readonly ownEnd: number;
  /** Last line of the node's whole subtree, trailing gaps included. */
  subtreeEnd: number;
  readonly isListItem: boolean;
}

/**
 * The chain of nodes from the document root down to, and including, the node
 * the caret sits in — or null when the caret resolves to no node.
 *
 * A caret on a blank trailing-gap line resolves to the node that gap belongs
 * to (blank-line ownership is already "a gap follows its node", per the
 * model's own doc comment), so the trail stays put while the caret crosses the
 * blank line between two blocks rather than blinking off for a row. That works
 * out for free here: a node's own gap lines precede every one of its children's
 * lines, so claiming the caret on the way DOWN — before descending — gives the
 * gap to its owner and every child line to the child.
 *
 * `subtreeEnd` is the one field not known on the way down; it is filled in on
 * the way back out, through the same entry objects the returned chain holds.
 */
function chainAtLine(doc: OutlineDoc, cursorLine: number): ChainEntry[] | null {
  let current = doc.preamble.length;
  if (cursorLine < current) return null; // the inert preamble owns no node

  let found: ChainEntry[] | null = null;
  const path: ChainEntry[] = [];

  const walk = (node: OutlineNode, depth: number): void => {
    const firstLine = current;
    const ownEnd = firstLine + node.lines.length - 1;
    current += node.lines.length;
    const gapEnd = current + node.trailingGap.length - 1;
    current += node.trailingGap.length;

    const entry: ChainEntry = {
      depth,
      firstLine,
      ownEnd,
      subtreeEnd: Math.max(ownEnd, gapEnd),
      isListItem: node.kind === 'list-item',
    };
    path.push(entry);
    if (!found && cursorLine >= firstLine && cursorLine <= entry.subtreeEnd) found = [...path];
    node.children.forEach((child) => walk(child, depth + 1));
    entry.subtreeEnd = current - 1;
    path.pop();
  };

  doc.children.forEach((node) => walk(node, 0));
  return found;
}

function push(byLine: Map<number, PositionTrailFact>, lineNumber: number, accent: TrailAccent): void {
  const existing = byLine.get(lineNumber);
  if (!existing) {
    byLine.set(lineNumber, { lineNumber, accents: [accent] });
    return;
  }
  byLine.set(lineNumber, { ...existing, accents: [...existing.accents, accent] });
}

/**
 * Per-line accents describing where the caret sits in the tree, plus the
 * current node's own line and (in the `'path'` style) every ancestor's — the
 * pure half of the position-indicator layer (hierarchy-position-indicators).
 * Depends on the caret as a plain line number, so the whole "which levels are
 * accented on which lines, and over how much of each row" question is testable
 * without CM6 or Obsidian, the same split that made `computeLineGuides` cheap
 * to get right.
 *
 * List-item ancestors never contribute a SEGMENT, for exactly the reason they
 * never own a guide (`computeLineGuides`): their columns are Obsidian's own
 * native list metrics, not our `depth × unit` ones, so an accent placed at our
 * column for a list level would land beside the list rather than on it. In the
 * `guides` style that costs nothing — a list ancestor owns no guide to accent.
 * In the `path` style a segment spans from one non-list ancestor to the next,
 * passing THROUGH any list levels between them at the shallower column.
 *
 * Their MARKERS are a different matter, and are accented like any other
 * ancestor's: a bullet is a real element at the real native column, so
 * accenting it needs none of the geometry we cannot address. That is what lets
 * `'path'` say something useful inside a deep list — the levels show up as a
 * run of accented bullets even though no line can be drawn between them.
 * Drawing those lines is still a deliberate gap, recorded in docs/research/14.
 */
export function computePositionTrail(
  doc: OutlineDoc,
  cursorLine: number,
  style: AncestorTrail,
): PositionTrail {
  const chain = chainAtLine(doc, cursorLine);
  if (!chain || chain.length === 0) return EMPTY_TRAIL;

  const currentNode = chain[chain.length - 1]!;
  const base = {
    currentLine: currentNode.firstLine,
    currentIsListItem: currentNode.isListItem,
  };
  const empty = { ...base, ancestorLines: new Map<number, boolean>(), byLine: new Map() };
  if (style === 'off') return empty;

  const byLine = new Map<number, PositionTrailFact>();
  const ancestors = chain.slice(0, -1);

  if (style === 'guides') {
    // A strict ancestor's guide is active on every line after that
    // ancestor's own lines through the end of its subtree — the exact span
    // `computeLineGuides` gives that depth, including the gap lines it
    // deliberately covers for continuity.
    for (const a of ancestors) {
      if (a.isListItem) continue;
      for (let line = a.ownEnd + 1; line <= a.subtreeEnd; line++) {
        push(byLine, line, { depth: a.depth, extent: 'full' });
      }
    }
    return { ...empty, byLine };
  }

  // 'path': only the part of each ancestor's guide that leads to the caret,
  // plus every ancestor's own marker (which is what makes the levels connect,
  // now that nothing horizontal is drawn — see `AncestorTrail`).
  const ancestorLines = new Map(ancestors.map((a) => [a.firstLine, a.isListItem]));

  // Only non-list ancestors own a column to draw a segment on; the current
  // node is always the terminal, whatever its kind.
  const rungs = [...ancestors.filter((a) => !a.isListItem), currentNode];
  for (let i = 0; i < rungs.length - 1; i++) {
    const from = rungs[i]!; // never a list item: only the terminal can be one
    const to = rungs[i + 1]!;
    // The segment leaves `from`'s own marker (lower half of its own row), runs
    // full-height through everything between, and stops at the row where the
    // next level starts (upper half) — where that level's own accented marker
    // picks the path back up.
    push(byLine, from.firstLine, { depth: from.depth, extent: 'bottom' });
    for (let line = from.firstLine + 1; line < to.firstLine; line++) {
      push(byLine, line, { depth: from.depth, extent: 'full' });
    }
    push(byLine, to.firstLine, { depth: from.depth, extent: 'top' });
  }
  return { ...base, ancestorLines, byLine };
}
