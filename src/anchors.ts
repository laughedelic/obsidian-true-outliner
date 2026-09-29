/**
 * The headings and block ids of a parsed document, each with the node it
 * belongs to and the line Obsidian's metadata gives it (`backlink-filtering`,
 * "An anchor belongs to the node where what it names begins";
 * `docs/research/zoom-scoped-backlinks`).
 *
 * Pure: the plugin layer hands these anchors to Obsidian's own
 * `resolveSubpath`, which decides where a subpath lands. This module decides
 * only where each anchor is and whose it is, and then which part of a zoom a
 * landing belongs to.
 *
 * It reads the tree `parse.ts` builds: an attached id is part of its node
 * (`OutlineNode.blockId`), and a lone id the parser cannot attach is a
 * paragraph `misplacedBlockIds` reads. Three rules are our own, each measured:
 * an id held inside a list item by anything but an item names the nearest
 * item; the last of a run of lone ids is read as if the others were absent;
 * and outside a list item a node holding several ids is named by the last.
 */

import { misplacedBlockIds, type MisplacedBlockId } from './block-ids';
import type { Cover } from './escalate';
import { ownSpan, type OutlineDoc, type OutlineNode } from './model';
import { isLoneBlockIdNode } from './rules';

export interface HeadingAnchor {
  readonly kind: 'heading';
  /** As Obsidian's `HeadingCache.heading` holds it. */
  readonly text: string;
  readonly level: number;
  /** The line Obsidian's metadata says the heading begins on. */
  readonly line: number;
  /** The line the heading is written on — always `line`. */
  readonly at: number;
  readonly nodeId: number;
}

export interface BlockAnchor {
  readonly kind: 'block';
  /** The id as written, without its `^`. */
  readonly id: string;
  /** The key Obsidian's `CachedMetadata.blocks` files it under. */
  readonly key: string;
  /** The line Obsidian's metadata says the named block begins on: the first
   * line of the node it belongs to. */
  readonly line: number;
  /** The line the id is written on. */
  readonly at: number;
  readonly nodeId: number;
}

export type Anchor = HeadingAnchor | BlockAnchor;

interface Placed {
  readonly node: OutlineNode;
  readonly start: number;
  readonly ancestors: readonly OutlineNode[];
  readonly siblings: readonly OutlineNode[];
}

function placeNodes(doc: OutlineDoc): Placed[] {
  const out: Placed[] = [];
  let line = doc.preamble.length;
  const visit = (nodes: readonly OutlineNode[], ancestors: readonly OutlineNode[]): void => {
    for (const node of nodes) {
      out.push({ node, start: line, ancestors, siblings: nodes });
      line += ownSpan(node);
      visit(node.children, [...ancestors, node]);
    }
  };
  visit(doc.children, []);
  return out;
}

const INLINE_ID_RE = /\s\^([A-Za-z0-9-]+)$/;
const LONE_ID_RE = /^[ \t]*\^([A-Za-z0-9-]+)$/;
const ATX_RE = /^ {0,3}#{1,6}(?:[ \t]+|$)/;
const CLOSING_HASHES_RE = /(?:^|[ \t]+)#+[ \t]*$/;

/** The text Obsidian gives a heading: the line after its marker, closing
 * hashes removed, trimmed; or the first line of a setext heading. Inline
 * markup, and an id the line ends in, stay as written. */
export function headingText(node: OutlineNode): string {
  const first = node.lines[0] ?? '';
  if (node.setext) return first.trim();
  return first.replace(ATX_RE, '').replace(CLOSING_HASHES_RE, '').trim();
}

/**
 * The ids a node holds, in the order they are written, each with the offset
 * of its line in the node's own span. Obsidian reads an id at the end of a
 * block's last line only — any row of a table, the text line of a setext
 * heading, and no line of a code block — and an attached id after it.
 */
function idsHeld(node: OutlineNode): Array<{ id: string; offset: number }> {
  const ids: Array<{ id: string; offset: number }> = [];
  const lines = node.lines;
  const candidates =
    node.kind === 'code'
      ? []
      : node.kind === 'table'
        ? lines.map((_, i) => i)
        : node.kind === 'heading' && node.setext
          ? [0]
          : [lines.length - 1];
  for (const i of candidates) {
    const line = lines[i] ?? '';
    const match = INLINE_ID_RE.exec(line) ?? LONE_ID_RE.exec(line);
    if (match) ids.push({ id: match[1]!, offset: i });
  }
  const attached = node.blockId && LONE_ID_RE.exec(node.blockId.line);
  if (attached) {
    ids.push({ id: attached[1]!, offset: lines.length + node.blockId.gap.length });
  }
  return ids;
}

function nearestItem(p: Placed): OutlineNode | undefined {
  for (let i = p.ancestors.length - 1; i >= 0; i--) {
    if (p.ancestors[i]!.kind === 'list-item') return p.ancestors[i];
  }
  return undefined;
}

/** The first item of the list `last` ends: up through its item ancestors, then
 * back along the outermost item's run of sibling items. */
function firstItemOfList(byNode: ReadonlyMap<OutlineNode, Placed>, last: Placed): OutlineNode {
  let outer = last;
  for (let i = last.ancestors.length - 1; i >= 0 && last.ancestors[i]!.kind === 'list-item'; i--) {
    outer = byNode.get(last.ancestors[i]!)!;
  }
  const siblings = outer.siblings;
  let at = siblings.indexOf(outer.node);
  while (at > 0 && siblings[at - 1]!.kind === 'list-item') at--;
  return siblings[at]!;
}

/** The node a held id names, or null where Obsidian registers no block for it. */
function ownerOf(
  placed: readonly Placed[],
  byNode: ReadonlyMap<OutlineNode, Placed>,
  index: number,
  marked: MisplacedBlockId | undefined,
): OutlineNode | null {
  const p = placed[index]!;
  if (marked) {
    const reading = marked.reading;
    if (reading.kind === 'item') return nearestItem(p) ?? null;
    if (reading.kind === 'whole-list') {
      const above = placed[index - 1];
      return above ? firstItemOfList(byNode, above) : null;
    }
    // An id with a block directly under it names its own line: its own paragraph.
    if (reading.kind === 'nothing' && reading.because === 'block-below') return p.node;
    return null;
  }
  if (isLoneBlockIdNode(p.node)) {
    // The last of a run of lone ids: read as if the ids before it were absent.
    let k = index - 1;
    while (k >= 0 && isLoneBlockIdNode(placed[k]!.node)) k--;
    return k >= 0 ? placed[k]!.node : null;
  }
  if (p.node.kind !== 'list-item') return nearestItem(p) ?? p.node;
  return p.node;
}

/** Every heading and block id of `doc` that Obsidian registers, in the order
 * they are written. */
export function anchorsOf(doc: OutlineDoc): Anchor[] {
  const placed = placeNodes(doc);
  const byNode = new Map(placed.map((p) => [p.node, p]));
  const misplaced = new Map(misplacedBlockIds(doc).map((m) => [m.line, m]));
  const out: Anchor[] = [];
  placed.forEach((p, index) => {
    const { node, start } = p;
    if (node.kind === 'heading') {
      out.push({
        kind: 'heading',
        text: headingText(node),
        level: node.level ?? 1,
        line: start,
        at: start,
        nodeId: node.id,
      });
    }
    const held = idsHeld(node);
    // Outside a list item a block keeps one id, the last written; Obsidian
    // registers no other.
    const kept = node.kind !== 'list-item' && !nearestItem(p) ? held.slice(-1) : held;
    for (const { id, offset } of kept) {
      const owner = ownerOf(placed, byNode, index, misplaced.get(start));
      if (!owner) continue;
      out.push({
        kind: 'block',
        id,
        key: id.toLowerCase(),
        line: byNode.get(owner)!.start,
        at: start + offset,
        nodeId: owner.id,
      });
    }
  });
  return out;
}

// ---- The zoom's answers ---------------------------------------------------

/** Where a landing stands relative to a zoom: on its root, below it, or
 * anywhere else, nothing included. */
export type Membership = 'node' | 'below' | 'outside';

export interface ZoomClassification {
  /** This node is available: an anchor belongs to the root. */
  readonly node: boolean;
  /** This branch is available: an anchor belongs to the root or below it. */
  readonly branch: boolean;
  /** Every anchor with its membership, in the order written. */
  readonly anchors: ReadonlyArray<{ readonly anchor: Anchor; readonly membership: Membership }>;
  classify(subpath: string): Membership;
}

/**
 * Classifies a zoom's anchors and the subpaths that land on them.
 *
 * Membership is by owning node — the root, or a node whose first line lies in
 * the root's cover — never by the line an id is written on: an id after a
 * zoomed table lies outside the cover and still names the table.
 * `resolve` gives the line a subpath lands on, or null for nothing.
 */
export function classifyZoom(
  anchors: readonly Anchor[],
  rootId: number,
  cover: Cover,
  resolve: (subpath: string) => number | null,
): ZoomClassification {
  const membershipOf = (anchor: Anchor): Membership => {
    if (anchor.nodeId === rootId) return 'node';
    return anchor.line >= cover.start.line && anchor.line <= cover.end.line ? 'below' : 'outside';
  };
  const classified = anchors.map((anchor) => ({ anchor, membership: membershipOf(anchor) }));
  const byLine = new Map<number, Membership>();
  for (const { anchor, membership } of classified) byLine.set(anchor.line, membership);
  return {
    node: classified.some((c) => c.membership === 'node'),
    branch: classified.some((c) => c.membership !== 'outside'),
    anchors: classified,
    classify(subpath) {
      const line = resolve(subpath);
      return line === null ? 'outside' : (byLine.get(line) ?? 'outside');
    },
  };
}
