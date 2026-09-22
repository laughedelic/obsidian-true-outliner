/**
 * Where a dragged run can land: the seams of a document and the depths each
 * one offers (`node-dragging`, design D6).
 *
 * Core rather than plugin, and therefore blind to pixels on purpose. A seam is
 * a boundary between two NODES, so the document decides where the seams are
 * and what each one offers; the view decides only which seam the pointer is
 * nearest and which of that seam's columns its x is nearest, through the one
 * partition this module exports. Boundaries taken from rendered rows would
 * invent seams inside a table, inside a fenced block and on both sides of
 * every blank line.
 *
 * Folds are passed IN rather than read here, as the ids whose children are
 * currently hidden: a folded node's descendants are not on screen, so the walk
 * stops at it and the seam after it is the one that names its last child.
 *
 * A zoom is applied by the CALLER, which passes the scope's own re-rooted
 * document. Then no seam outside the scope exists to be offered, rather than
 * every seam being offered and the ones outside filtered out afterwards.
 */

import { isAtom, type NodeKind, type OutlineDoc, type OutlineNode } from './model';
import { ownSpan } from './model';
import { reencodeBlocksForDestination } from './ops';
import { parse } from './parse';

/** A place at a seam: a parent, a position among its children, and the depth a
 * node placed there takes. What a seam offers before any run is asked about. */
export interface SeamPlace {
  readonly parentId: number | 'root';
  readonly index: number;
  readonly depth: number;
  /** Set where the place is SHALLOWER than the parent's children: the node is
   * written at this same text position at a heading level of its own, and on
   * re-parse closes the parent's section and takes what follows. Only a
   * heading can be placed so. */
  readonly level?: number;
  /** The node the run is a child of AFTER the drop, where that differs from
   * `parentId`: a levelled place is written at its parent's text position and
   * lands, on re-parse, under that parent's ancestor at one level out. */
  readonly landsUnder?: number | 'root';
}

/** A place a run can land, with what the run becomes there. */
export interface DropDestination extends SeamPlace {
  /** The run's first line as it will be written at this destination — the
   * mark the preview draws, taken from the same re-encoding the release
   * applies rather than from the run's current kind. */
  readonly firstLine: string;
  /** The kind the run's first root will HAVE where it lands, and its level
   * for a heading — read off the re-encoded node itself, not off its first
   * line: a table's first line alone is a paragraph, a code fence's is a
   * fence, and the mark the preview draws has to be the node's. */
  readonly mark: {
    readonly kind: NodeKind;
    readonly level?: number;
    /** A list item's task state or ordered delimiter, as written there. */
    readonly list?: { readonly task?: boolean; readonly ordered?: '.' | ')' };
  };
  /** The lines a drop here would take INTO the run: a heading written among
   * siblings opens a section over the ones that follow it, up to the next
   * heading that can stand beside it or the scope's end. Those rows change
   * parent without moving, so nothing at the seam says they are involved
   * (design D8). `[from, to)` in the tree's own line space; absent where
   * nothing is absorbed. */
  readonly absorbs?: {
    readonly from: number;
    readonly to: number;
    /** Each absorbed node whose parent was outside the span, with its whole
     * subtree's lines and how many levels it moves: it becomes the run's
     * child, one past the destination's depth, whatever depth it had — in
     * under a deeper heading, level under one written beside its old parent,
     * out under one written shallower still. */
    readonly shifts: readonly { readonly from: number; readonly to: number; readonly by: number }[];
  };
}

/** The boundary between two nodes, and every place it offers. */
export interface Seam {
  /** The line the seam sits above: the first line of the node below it, or the
   * document's line count where there is none. */
  readonly line: number;
  readonly aboveId: number | undefined;
  readonly belowId: number | undefined;
  /** Shallowest first. Never empty. */
  readonly places: readonly SeamPlace[];
}

/** A seam with what a particular run becomes at each of its places. */
export interface DropSeam {
  readonly line: number;
  readonly aboveId: number | undefined;
  readonly belowId: number | undefined;
  /** Shallowest first. EMPTY at a seam where the run can land nowhere: such a
   * seam is kept so a pointer near it resolves to nothing, rather than to the
   * nearest seam that does offer something — the run's own bottom is the
   * common case, and snapping past it would move the run the reader was
   * putting back. */
  readonly candidates: readonly DropDestination[];
}

/** What every seam-taking function accepts about the view. */
export interface SeamOptions {
  readonly folded?: ReadonlySet<number>;
  /** True when `doc` is a zoom scope's re-rooted document rather than a
   * file's own. Such a document's top level is the zoom ROOT's level, so a
   * destination parented at `'root'` is a sibling of the root — reachable in
   * the source and outside the scope, which `node-dragging` refuses. The
   * caller says so, because nothing in a document says which it is. */
  readonly scoped?: boolean;
}

interface Step {
  readonly node: OutlineNode;
  /** The node's own position among its parent's children. */
  readonly index: number;
}

interface Visible {
  readonly node: OutlineNode;
  readonly startLine: number;
  readonly depth: number;
  /** Root-first, this node last, so `chain[d]` is the ancestor at depth `d`. */
  readonly chain: readonly Step[];
}

/**
 * Every visible node in document order, with the ancestry each seam's parents
 * are read from. A folded node is visited; its children are not.
 */
function visibleNodes(doc: OutlineDoc, folded: ReadonlySet<number>): Visible[] {
  const out: Visible[] = [];
  let line = doc.preamble.length;
  const walk = (nodes: readonly OutlineNode[], chain: readonly Step[]): void => {
    nodes.forEach((node, index) => {
      const here = [...chain, { node, index }];
      out.push({ node, startLine: line, depth: chain.length, chain: here });
      line += ownSpan(node);
      if (!folded.has(node.id)) walk(node.children, here);
      else line += hiddenSpan(node);
    });
  };
  walk(doc.children, []);
  return out;
}

/** The lines a fold hides: everything under the node, its own lines aside. */
function hiddenSpan(node: OutlineNode): number {
  let total = 0;
  const walk = (nodes: readonly OutlineNode[]): void => {
    for (const child of nodes) {
      total += ownSpan(child);
      walk(child.children);
    }
  };
  walk(node.children);
  return total;
}

/** Every id in these subtrees — what a destination may not lie inside. */
function subtreeIds(roots: readonly OutlineNode[]): Set<number> {
  const ids = new Set<number>();
  const visit = (node: OutlineNode): void => {
    ids.add(node.id);
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return ids;
}

/**
 * The seams of a document, each with the destinations it offers, for a run
 * whose roots are `operandRoots`.
 *
 * The legal interval of a seam runs from the depth of the node BELOW it to one
 * level inside the node above — or, where that node is a leaf, to the level of
 * the nearest trailing ancestor that can hold children, which is the leaf's own
 * depth. Every depth in between names a parent: the ancestor of the node above
 * at one level shallower, taken at the position the seam sits in among its
 * children.
 *
 * Each candidate is then put to the shared re-encode step, and only what it
 * accepts is returned — the refusal that depends on the destination's own
 * DEPTH rather than its kind is why the filter asks the operation instead of
 * re-stating its conditions, and it is why one seam can offer its shallower
 * columns and refuse its deeper ones.
 */
export function seams(
  doc: OutlineDoc,
  options: SeamOptions & {
    /** Subtrees no place may lie inside — a run's own, for a drag. */
    readonly outside?: ReadonlySet<number>;
    /** The kind of node that would be placed, where no run is in hand: what
     * decides whether a place after a heading is one at all. */
    readonly kind?: NodeKind;
  } = {},
): Seam[] {
  const folded = options.folded ?? new Set<number>();
  const outside = options.outside ?? new Set<number>();
  const kind = options.kind ?? 'paragraph';
  // The run's own rows are not in the tree the drop lands in, so the seams are
  // read with them skipped: the boundary above the run and the one below it
  // are ONE seam between its neighbours, whose places include the run's own
  // (dropped where it is, which writes nothing) and every other reading of that
  // position — re-levelled in place among them. Their indices still count the
  // run, since the operation resolves them against the tree before removal.
  const all = visibleNodes(doc, folded);
  const visible = all.filter((v) => !outside.has(v.node.id));
  if (visible.length === 0) return [];
  const skipped = (index: number): Visible | undefined => {
    // The first row the run occupies between `visible[index - 1]` and
    // `visible[index]`, where the run sits between them.
    const upper = index > 0 ? all.indexOf(visible[index - 1]!) + 1 : 0;
    const candidate = all[upper];
    return candidate && outside.has(candidate.node.id) ? candidate : undefined;
  };

  const out: Seam[] = [];
  for (let s = 0; s <= visible.length; s++) {
    const above = s > 0 ? visible[s - 1]! : undefined;
    const below = s < visible.length ? visible[s]! : undefined;
    const shallow = below ? below.depth : 0;
    const deep = above ? (isAtom(above.node) ? above.depth : above.depth + 1) : shallow;

    const places: SeamPlace[] = [];
    for (let depth = shallow; depth <= deep; depth++) {
      if (followsAHeading(depth, above, kind)) continue;
      const placed = placeAt(depth, above, below);
      if (!placed) continue;
      if (placed.parentId === 'root' && options.scoped === true) continue;
      if (placed.parentId !== 'root' && outside.has(placed.parentId)) continue;
      places.push({ ...placed, depth });
    }
    // A heading can be written shallower than the node below it: at this same
    // position, at a level that closes the sections above it and takes what
    // follows into its own — between a heading and its first child at that
    // heading's own level, or in place one level out. Every depth down to the
    // root, hung off the shallowest place the seam has, since the text position
    // is the same for all of them; refused under a zoom for the root's own
    // level, as any place there is.
    if (kind === 'heading' && places.length > 0) {
      const anchor = places[0]!;
      for (let depth = anchor.depth - 1; depth >= 0; depth--) {
        if (depth === 0 && options.scoped === true) continue;
        // The ancestor one level out from this depth is what the run lands
        // under: headings nest only under headings, and the node above's own
        // chain is the one the re-parse reads.
        const under = depth === 0 ? undefined : above?.chain[depth - 1];
        places.unshift({
          parentId: anchor.parentId,
          index: anchor.index,
          depth,
          level: depth + 1,
          landsUnder: under ? under.node.id : 'root',
        });
      }
    }
    if (places.length === 0) continue;
    const run = skipped(s);
    out.push({
      line: run ? run.startLine : below ? below.startLine : documentEnd(doc),
      aboveId: above?.node.id,
      belowId: below?.node.id,
      places,
    });
  }
  return out;
}

/**
 * The seams of a document, each with the destinations it offers, for a run
 * whose roots are `operandRoots`.
 *
 * `seams` above finds the places; this asks what the run becomes at each and
 * keeps the ones the shared re-encode step accepts — the refusal that depends
 * on the destination's own depth, which no kind check can see. A seam left
 * with no accepted place is not a seam this returns.
 */
export function dropSeams(
  doc: OutlineDoc,
  operandRoots: readonly OutlineNode[],
  options: SeamOptions & { readonly fallbackIndentUnit?: string } = {},
): DropSeam[] {
  if (operandRoots.length === 0) return [];
  const operandIds = subtreeIds(operandRoots);
  const operandRootIds = new Set(operandRoots.map((root) => root.id));
  const all = visibleNodes(doc, new Set());

  const first = operandRoots[0]!;
  const home = placeOf(doc, first.id);
  // The seams are read with the run taken out, but the algebra's indices count
  // it: a place inside the run's own parent lands on the run wherever it
  // names the run's own index or the one just past its last root there.
  const siblings = home
    ? operandRoots.filter((root) => placeOf(doc, root.id)?.parentId === home.parentId).length
    : 0;
  const out: DropSeam[] = [];
  for (const seam of seams(doc, {
    ...options,
    outside: operandIds,
    kind: first.kind,
  })) {
    const candidates: DropDestination[] = [];
    for (const place of seam.places) {
      // Dropped where it already is, as it already is. Offered, as the way
      // out of a drag the reader thinks better of, and named by the run's own
      // index so the algebra reads it as the no-op it is.
      const own =
        home !== undefined &&
        place.level === undefined &&
        place.parentId === home.parentId &&
        place.index >= home.index &&
        place.index <= home.index + siblings;
      const placed = own ? { ...place, index: home.index } : place;
      const written = writtenFirst(doc, placed, operandRoots, operandRootIds, options);
      if (written === undefined) continue;
      const absorbs = absorbedSpan(doc, seam, written.firstLine, operandIds, all, placed.depth);
      candidates.push(absorbs ? { ...placed, ...written, absorbs } : { ...placed, ...written });
    }
    out.push({ line: seam.line, aboveId: seam.aboveId, belowId: seam.belowId, candidates });
  }
  // The run's lower boundary. The seam walk merged it into the run's top,
  // which keeps the run's own place; without a dead seam of its own here the
  // band under the run would resolve to the seam below it, and a run set down
  // where it was would move.
  const roots = all.filter((v) => operandRootIds.has(v.node.id));
  const lastRoot = roots[roots.length - 1];
  if (lastRoot) {
    const after = all.find((v) => v.startLine > lastRoot.startLine && !operandIds.has(v.node.id));
    const line = after ? after.startLine : documentEnd(doc);
    if (!out.some((seam) => seam.line === line)) {
      const at = out.findIndex((seam) => seam.line > line);
      const bottom: DropSeam = { line, aboveId: lastRoot.node.id, belowId: after?.node.id, candidates: [] };
      if (at === -1) out.push(bottom);
      else out.splice(at, 0, bottom);
    }
  }
  return out;
}

/** A node's own first line, or `undefined` for an id the document lacks. */
export function startLineOf(doc: OutlineDoc, id: number): number | undefined {
  for (const v of visibleNodes(doc, new Set())) {
    if (v.node.id === id) return v.startLine;
  }
  return undefined;
}

/** A node's parent and its index among that parent's children. */
function placeOf(doc: OutlineDoc, id: number): { parentId: number | 'root'; index: number } | undefined {
  for (const v of visibleNodes(doc, new Set())) {
    if (v.node.id !== id) continue;
    const own = v.chain[v.chain.length - 1]!;
    const parent = v.chain[v.chain.length - 2];
    return { parentId: parent ? parent.node.id : 'root', index: own.index };
  }
  return undefined;
}

/** A subtree's whole extent in lines, trailing gaps included. */
function subtreeSpan(node: OutlineNode): number {
  return ownSpan(node) + hiddenSpan(node);
}

/**
 * The lines a drop would take into the run: what follows the seam, in document
 * order, until the first heading that can stand beside the WRITTEN one — its
 * level or shallower — or the document's end. Read from the line the
 * destination writes, so a heading that arrives as a list item absorbs
 * nothing, exactly as the release will have it; and a heading written
 * shallower than its neighbours takes everything up to the next of its own
 * level, however deep the seam sat. The run's own rows are not in that order.
 */
function absorbedSpan(
  doc: OutlineDoc,
  seam: Seam,
  written: string,
  operandIds: ReadonlySet<number>,
  all: readonly Visible[],
  depth: number,
): DropDestination['absorbs'] {
  const head = parse(written).children[0];
  if (head === undefined || head.kind !== 'heading' || head.level === undefined) return undefined;
  const level = head.level;
  const belowAt = seam.belowId === undefined ? -1 : all.findIndex((v) => v.node.id === seam.belowId);
  if (belowAt < 0) return undefined;
  void doc;
  const shifts: { from: number; to: number; by: number }[] = [];
  let deepest = Infinity;
  for (let i = belowAt; i < all.length; i++) {
    const v = all[i]!;
    if (operandIds.has(v.node.id)) continue;
    if (v.depth > deepest) continue; // inside a node already counted whole
    deepest = Infinity;
    if (v.node.kind === 'heading' && (v.node.level ?? 0) <= level) break;
    // Counted here, its parent is outside the span, so the run takes it.
    shifts.push({ from: v.startLine, to: v.startLine + subtreeSpan(v.node), by: depth + 1 - v.depth });
    deepest = v.depth;
  }
  if (shifts.length === 0) return undefined;
  return { from: shifts[0]!.from, to: shifts[shifts.length - 1]!.to, shifts };
}

/**
 * Whether a non-heading run placed at `depth` would land right after a heading
 * as its SIBLING — which markdown cannot write. A heading's section runs to the
 * next heading that can stand beside it, so a paragraph or a list written after
 * one is inside it, whatever the tree said: a paragraph dragged out of an H3
 * section to the note's end was offered the H1's and H2's columns, and every
 * one of those drops wrote the same document as the H3's own. The sibling the
 * run would follow is the node above's ancestor at that depth, and headings
 * nest only under headings, so that one node is the whole test. A heading run
 * is re-levelled by the destination instead, which the re-encode step decides.
 */
function followsAHeading(depth: number, above: Visible | undefined, kind: NodeKind): boolean {
  if (!above || kind === 'heading') return false;
  const sibling = above.chain[depth];
  return sibling !== undefined && sibling.node.kind === 'heading';
}

/** The parent and index a depth names at one seam. */
function placeAt(
  depth: number,
  above: Visible | undefined,
  below: Visible | undefined,
): { readonly parentId: number | 'root'; readonly index: number } | undefined {
  if (!above) {
    // The document's first seam: nothing is above it, so the only place is
    // before the first node, among whatever holds it.
    if (!below) return undefined;
    const own = below.chain[below.chain.length - 1]!;
    const parent = below.chain[below.chain.length - 2];
    return { parentId: parent ? parent.node.id : 'root', index: own.index };
  }
  // One level inside the node above. Where the node below is that node's own
  // child, the seam sits BEFORE it — between a heading and its first paragraph,
  // the run becomes the first child, not the last. Only where the node above
  // shows no children (a leaf, or folded so they are hidden) does the seam sit
  // after everything it holds, and the run lands last among them. Measured
  // before this distinction existed: a subtree dropped between a heading and
  // its first child landed at the end of the section.
  if (depth === above.depth + 1) {
    const inside = below?.chain[above.depth];
    if (inside && inside.node.id === above.node.id) {
      return { parentId: above.node.id, index: below.chain[above.depth + 1]!.index };
    }
    return { parentId: above.node.id, index: above.node.children.length };
  }
  // Otherwise the parent is an ancestor of the node above, and the seam sits
  // just past the child of it that the node above is inside.
  const step = above.chain[depth];
  if (!step) return undefined;
  const parent = above.chain[depth - 1];
  return { parentId: parent ? parent.node.id : 'root', index: step.index + 1 };
}

/**
 * The run's first line as this destination would write it, or `undefined`
 * where the destination refuses the run.
 *
 * A run that does not leave its own scope is not re-encoded — the operation
 * takes that case as a reorder — so it is asked for nothing and keeps the line
 * it has.
 */
function writtenFirst(
  doc: OutlineDoc,
  placed: SeamPlace,
  operandRoots: readonly OutlineNode[],
  operandRootIds: ReadonlySet<number>,
  options: { readonly fallbackIndentUnit?: string },
): { readonly firstLine: string; readonly mark: DropDestination['mark'] } | undefined {
  const parent = placed.parentId === 'root' ? 'root' : nodeById(doc, placed.parentId);
  if (parent === undefined) return undefined;
  const siblings = parent === 'root' ? doc.children : parent.children;
  const written = (node: OutlineNode) => {
    const firstLine = node.lines[0]!;
    const list = node.kind === 'list-item' ? listMarkOf(firstLine) : undefined;
    return {
      firstLine,
      mark:
        node.level !== undefined
          ? { kind: node.kind, level: node.level }
          : list
            ? { kind: node.kind, list }
            : { kind: node.kind },
    };
  };
  if (placed.level === undefined && siblings.some((sibling) => operandRootIds.has(sibling.id))) {
    return written(operandRoots[0]!);
  }
  const result = reencodeBlocksForDestination(
    doc,
    parent,
    siblings.slice(0, placed.index),
    siblings.slice(placed.index),
    operandRoots,
    options.fallbackIndentUnit,
    placed.level,
  );
  return result.ok ? written(result.value[0]!) : undefined;
}

/** A list item's task state and ordered delimiter, read off its marker. */
function listMarkOf(line: string): { task?: boolean; ordered?: '.' | ')' } | undefined {
  const match = /^[ \t]*(?:[-*+]|\d+([.)]))[ \t]+(?:\[([ xX])\](?:[ \t]|$))?/.exec(line);
  if (!match) return undefined;
  const ordered = match[1] as '.' | ')' | undefined;
  const box = match[2];
  if (ordered === undefined && box === undefined) return undefined;
  return {
    ...(box === undefined ? {} : { task: box !== ' ' }),
    ...(ordered === undefined ? {} : { ordered }),
  };
}

function nodeById(doc: OutlineDoc, id: number): OutlineNode | undefined {
  let found: OutlineNode | undefined;
  const walk = (nodes: readonly OutlineNode[]): void => {
    for (const node of nodes) {
      if (found) return;
      if (node.id === id) {
        found = node;
        return;
      }
      walk(node.children);
    }
  };
  walk(doc.children);
  return found;
}

function documentEnd(doc: OutlineDoc): number {
  let total = doc.preamble.length;
  const walk = (nodes: readonly OutlineNode[]): void => {
    for (const node of nodes) {
      total += ownSpan(node);
      walk(node.children);
    }
  };
  walk(doc.children);
  return total;
}

/** What the view knows that this module does not: where each seam sits, and
 * where a depth's column is. Injected so the resolution stays pure and the
 * geometry stays in one place. */
export interface PointerGeometry {
  /** One vertical position per seam, in the order `dropSeams` returned them. */
  readonly seamY: readonly number[];
  /** The horizontal position a depth's own column is drawn at. */
  readonly columnX: (depth: number) => number;
}

/**
 * The destination a pointer position names: the seam it is nearest, and the
 * column of that seam it is nearest.
 *
 * The ONE resolution, called by the preview and by the release alike (design
 * D7), so the two cannot disagree about where the run lands or what it becomes.
 * `undefined` where there is no seam to name at all, which is a drag that
 * continues with no preview and cancels on release.
 */
export function resolveDestination(
  seams: readonly DropSeam[],
  geometry: PointerGeometry,
  pointer: { readonly x: number; readonly y: number },
): { readonly seam: DropSeam; readonly destination: DropDestination } | undefined {
  if (seams.length === 0) return undefined;
  const seam = seams[nearestIndex(pointer.y, geometry.seamY)]!;
  if (seam.candidates.length === 0) return undefined;
  const columns = seam.candidates.map((candidate) => geometry.columnX(candidate.depth));
  return { seam, destination: seam.candidates[nearestIndex(pointer.x, columns)]! };
}

/**
 * Which of these positions a coordinate is nearest, clamped at both ends.
 *
 * A PARTITION and not a hit test: every coordinate resolves to exactly one
 * entry, with everything before the first resolving to the first and
 * everything after the last to the last. `guideHit`'s band is the hit test,
 * and borrowing it here would leave 7.33px between every pair of columns
 * resolving to nothing at the default indent unit, and nothing at all right of
 * a line's own text — where most of a drag happens. A release that resolves
 * nothing cancels the drag, so a dead band throws the gesture away.
 */
export function nearestIndex(value: number, positions: readonly number[]): number {
  if (positions.length === 0) return -1;
  let best = 0;
  let bestDistance = Math.abs(value - positions[0]!);
  for (let i = 1; i < positions.length; i++) {
    const distance = Math.abs(value - positions[i]!);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}
