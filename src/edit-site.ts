/**
 * An operation's EDIT SITE: the seams next to what it wrote
 * (`structural-operations`, "A seam at an operation's edit site is separated").
 *
 * A seam is named by its LOWER block — the node whose own lines open directly
 * below it — since every block but the first has exactly one seam above it.
 *
 * Blocks are matched by node id against the document the surgery was built
 * from. Ids come from one counter and are never reused, so a block from
 * anywhere else can only read as new. What a block IS is judged on its outline
 * view rather than its text: an operation rewrites text it derives from
 * position — ordinals, heading levels, indentation, where a block id sits —
 * and none of that writes a block.
 */

import type { OutlineDoc, OutlineNode } from './model';
import { kindAsWritten, parseListMarker } from './parse';
import { isLoneBlockIdLine } from './rules';

/** Where a block sits in the note the re-parse will read. */
interface Placement {
  readonly node: OutlineNode;
  readonly parent: number;
  readonly previous: number;
  /** The column the block's own lines are measured from. */
  readonly margin: number;
  /** Position in document order. */
  readonly order: number;
}

/** The root's id in `Placement.parent`, and "none" in `Placement.previous`. */
const NONE = 0;

const LIST_MARKER_RE = /^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/;
const ATX_MARKER_RE = /^[ \t]*#{1,6}(?:[ \t]+|$)/;
const TRAILING_ID_RE = /\s\^[A-Za-z0-9-]+[ \t]*$/;

/**
 * What the outline shows of a block: its kind as the re-parse will read it at
 * `margin`, and its content with indentation, list marker, ordinal, heading
 * level and block id set aside. The id is set aside wherever it is written —
 * attached, trailing the text, or as a line of the block's own.
 */
export function outlineView(node: OutlineNode, margin: number): string {
  const kind = kindAsWritten(node, margin);
  const own =
    node.kind === 'heading' && node.setext === true ? node.lines.slice(0, -1) : node.lines;
  const content = own
    .filter((line) => !isLoneBlockIdLine(line))
    .map((line, i) => {
      let text = line;
      if (i === 0 && node.kind === 'list-item') text = text.replace(LIST_MARKER_RE, '');
      if (i === 0 && node.kind === 'heading' && node.setext !== true) {
        text = text.replace(ATX_MARKER_RE, '');
      }
      return text.replace(/^[ \t]+/, '');
    });
  const last = content.length - 1;
  if (last >= 0) content[last] = content[last]!.replace(TRAILING_ID_RE, '');
  return `${kind}\n${content.join('\n')}`;
}

/**
 * A PLACE rather than a block: an empty list item or heading a key opens, or
 * the empty line an operation leaves where it dissolved an item. The edit-site
 * rule writes nothing beside one and judges no seam across one.
 */
export function isPlace(node: OutlineNode): boolean {
  if (node.kind === 'list-item' || node.kind === 'heading' || node.kind === 'paragraph') {
    const view = outlineView(node, 0);
    return view.slice(view.indexOf('\n') + 1).trim() === '' && node.blockId === undefined;
  }
  return false;
}

/**
 * Every root-level heading's section, read off the levels the way the re-parse
 * reads it. A heading operation rewrites levels only and leaves the hierarchy
 * to the re-parse, so its surgery can still hold `### B` under `# A`.
 */
function renestHeadings(nodes: readonly OutlineNode[]): readonly OutlineNode[] {
  if (!nodes.some((n) => n.kind === 'heading')) return nodes;
  const flat: OutlineNode[] = [];
  const flatten = (node: OutlineNode): void => {
    if (node.kind !== 'heading') {
      flat.push(node);
      return;
    }
    flat.push({ ...node, children: [] });
    node.children.forEach(flatten);
  };
  nodes.forEach(flatten);
  const root: OutlineNode[] = [];
  const stack: { level: number; children: OutlineNode[] }[] = [];
  for (const node of flat) {
    if (node.kind === 'heading') {
      const level = node.level ?? 1;
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
      const children: OutlineNode[] = [];
      const placed = { ...node, children };
      (stack[stack.length - 1]?.children ?? root).push(placed);
      stack.push({ level, children });
    } else {
      (stack[stack.length - 1]?.children ?? root).push(node);
    }
  }
  return root;
}

function childMargin(node: OutlineNode, margin: number): number {
  if (node.kind !== 'list-item') return margin;
  return parseListMarker(node.lines[0] ?? '')?.contentCol ?? margin;
}

/** Every block's placement, keyed by id, in document order. */
function placements(doc: OutlineDoc): Map<number, Placement> {
  const out = new Map<number, Placement>();
  let order = 0;
  const walk = (nodes: readonly OutlineNode[], parent: number, margin: number): void => {
    let previous = NONE;
    for (const node of nodes) {
      out.set(node.id, { node, parent, previous, margin, order: order++ });
      walk(node.children, node.id, childMargin(node, margin));
      previous = node.id;
    }
  };
  walk(renestHeadings(doc.children), NONE, 0);
  return out;
}

/**
 * The ids of the blocks whose seam above them is at the edit site of the
 * operation that turned `before` into `after`. A seam is at the edit site when:
 *
 * - its lower block is new, its view changed, its previous sibling changed, or
 *   it has no previous sibling and its parent changed;
 * - its upper block is new or its view changed; or
 * - its two blocks were not consecutive in `before`.
 *
 * A seam beside a place is never at the edit site.
 */
export function editSite(before: OutlineDoc, after: OutlineDoc): ReadonlySet<number> {
  const old = placements(before);
  const now = [...placements(after).values()];
  const written = (p: Placement): boolean => {
    const was = old.get(p.node.id);
    return was === undefined || outlineView(was.node, was.margin) !== outlineView(p.node, p.margin);
  };
  const site = new Set<number>();
  for (let i = 1; i < now.length; i++) {
    const upper = now[i - 1]!;
    const lower = now[i]!;
    if (isPlace(upper.node) || isPlace(lower.node)) continue;
    const wasUpper = old.get(upper.node.id);
    const wasLower = old.get(lower.node.id);
    const atSite =
      written(lower) ||
      wasLower!.previous !== lower.previous ||
      (lower.previous === NONE && wasLower!.parent !== lower.parent) ||
      written(upper) ||
      wasUpper!.order + 1 !== wasLower!.order;
    if (atSite) site.add(lower.node.id);
  }
  return site;
}
