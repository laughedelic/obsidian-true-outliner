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
import { indentWidth, kindAsWritten, parseListMarker } from './parse';
import { isLoneBlockIdLine, isLoneBlockIdNode } from './rules';

/** Where a block sits in the note the re-parse will read. */
interface Placement {
  readonly node: OutlineNode;
  readonly parent: number;
  readonly previous: number;
  /** The column the block's own lines are measured from. */
  readonly margin: number;
  /** Position in document order. */
  readonly order: number;
  /** The lists this block is an item of or lies inside, each named by its first item. */
  readonly lists: ReadonlySet<number>;
}

/** The root's id in `Placement.parent`, and "none" in `Placement.previous`. */
const NONE = 0;

const LIST_MARKER_RE = /^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/;
const ATX_MARKER_RE = /^[ \t]*#{1,6}(?:[ \t]+|$)/;
const EMPTY_ITEM_RE = /^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]+\[ \])?[ \t]*$/;
const EMPTY_HEADING_RE = /^[ \t]*#{1,6}[ \t]*$/;
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

/** Blank-line runs compare by length as well as content: `[]` and `['']` differ. */
export function sameGap(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

/**
 * A PLACE rather than a block: an empty list item or heading a key opens, or
 * the empty line an operation leaves where it dissolved an item. The edit-site
 * rule writes nothing beside one and judges no seam across one.
 */
export function isPlace(node: OutlineNode): boolean {
  if (node.blockId !== undefined) return false;
  if (node.kind === 'paragraph') return node.lines.every((line) => line.trim() === '');
  if (node.kind === 'list-item') {
    return (
      node.lines.length === 1 && node.children.length === 0 && EMPTY_ITEM_RE.test(node.lines[0]!)
    );
  }
  if (node.kind === 'heading' && node.setext !== true) {
    return node.lines.length === 1 && EMPTY_HEADING_RE.test(node.lines[0]!);
  }
  return false;
}

/**
 * Every root-level heading's section, read off the levels the way the re-parse
 * reads it. A heading operation rewrites levels only and leaves the hierarchy
 * to the re-parse, so its surgery can still hold `### B` under `# A`.
 */
function renestHeadings(nodes: readonly OutlineNode[]): readonly OutlineNode[] {
  if (nestedByLevel(nodes, 0)) return nodes;
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

/**
 * Whether every heading already sits where its level puts it: under a heading
 * of a lower level, after no sibling heading of a lower level, and followed in
 * its parent's list by headings alone. A parsed tree always is, and most surgeries are.
 */
function nestedByLevel(nodes: readonly OutlineNode[], parentLevel: number): boolean {
  let lastHeading = 0;
  for (const node of nodes) {
    if (node.kind === 'heading') {
      const level = node.level ?? 1;
      if (level <= parentLevel || (lastHeading > 0 && level > lastHeading)) return false;
      lastHeading = level;
      if (!nestedByLevel(node.children, level)) return false;
    } else if (lastHeading > 0) {
      return false;
    }
  }
  return true;
}

function childMargin(node: OutlineNode, margin: number): number {
  if (node.kind !== 'list-item') return margin;
  return parseListMarker(node.lines[0] ?? '')?.contentCol ?? margin;
}

/** Every block's placement, keyed by id, in document order. */
function placements(doc: OutlineDoc): Map<number, Placement> {
  const out = new Map<number, Placement>();
  let order = 0;
  const walk = (
    nodes: readonly OutlineNode[],
    parent: number,
    margin: number,
    inherited: ReadonlySet<number>,
  ): void => {
    let previous = NONE;
    let head: number | undefined;
    for (const node of nodes) {
      const item = node.kind === 'list-item' && kindAsWritten(node, margin) === 'list-item';
      head = item ? (head ?? node.id) : undefined;
      const lists = item ? new Set([...inherited, head!]) : inherited;
      out.set(node.id, { node, parent, previous, margin, order: order++, lists });
      walk(node.children, node.id, childMargin(node, margin), lists);
      previous = node.id;
    }
  };
  walk(renestHeadings(doc.children), NONE, 0, new Set());
  return out;
}

interface JudgedSeam {
  readonly upper: Placement;
  readonly lower: Placement;
  /** The upper block's placement before the operation, when the seam is away from the edit site. */
  readonly away: Placement | undefined;
}

/**
 * Every seam of `after` that lies beside no place, judged against `before`. A
 * seam is at the edit site when:
 *
 * - its lower block is new, its view changed, its previous sibling changed, or
 *   it has no previous sibling and its parent changed;
 * - its upper block is new or its view changed; or
 * - its two blocks were not consecutive in `before`.
 */
function judgeSeams(before: OutlineDoc, after: OutlineDoc): JudgedSeam[] {
  const old = placements(before);
  const now = [...placements(after).values()];
  const written = (p: Placement): boolean => {
    const was = old.get(p.node.id);
    if (was === undefined) return true;
    // A block the surgery did not rewrite keeps its own lines by reference.
    if (was.node.lines === p.node.lines && was.node.kind === p.node.kind && was.margin === p.margin) return false;
    return outlineView(was.node, was.margin) !== outlineView(p.node, p.margin);
  };
  const seams: JudgedSeam[] = [];
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
    seams.push({ upper, lower, away: atSite ? undefined : wasUpper });
  }
  return seams;
}

/** The ids of the blocks whose seam above them is at the edit site of the
 * operation that turned `before` into `after`. */
export function editSite(before: OutlineDoc, after: OutlineDoc): ReadonlySet<number> {
  return new Set(judgeSeams(before, after).filter((s) => !s.away).map((s) => s.lower.node.id));
}

/**
 * `surgery` with every empty seam at the edit site outside a list separated by
 * one blank line, and every seam away from it written with the blank lines it
 * had in `before`. A seam beside a place is left as the operation wrote it.
 *
 * Three seams at the edit site stay as they are, because a blank line there
 * would change what a block is: one inside a list, which it would loosen; one
 * below a lone block-id line, which it would attach to the block above; and one
 * above a block four columns past its margin, which CommonMark would read as
 * indented code. The parse's own separators are added afterwards, by
 * `finalize`'s boundary normalization.
 */
export function separateEditSite(
  before: OutlineDoc,
  surgery: OutlineDoc,
  /** False for an operation that opens a place in a gap: the seam holding it is
   * away from the edit site, and its lines are the place's. */
  restore = true,
): OutlineDoc {
  const gaps = new Map<number, readonly string[]>();
  for (const { upper, lower, away } of judgeSeams(before, surgery)) {
    const gap = upper.node.trailingGap;
    if (away) {
      if (restore && !sameGap(away.node.trailingGap, gap)) {
        gaps.set(upper.node.id, away.node.trailingGap);
      }
      continue;
    }
    if (gap.length > 0) continue;
    if ([...upper.lists].some((list) => lower.lists.has(list))) continue;
    if (isLoneBlockIdNode(upper.node)) continue;
    if (indentWidth(lower.node.lines[0] ?? '') - lower.margin >= 4) continue;
    gaps.set(upper.node.id, ['']);
  }
  if (gaps.size === 0) return surgery;
  const rewrite = (nodes: readonly OutlineNode[]): readonly OutlineNode[] =>
    nodes.map((node) => {
      const gap = gaps.get(node.id);
      return { ...node, ...(gap ? { trailingGap: gap } : {}), children: rewrite(node.children) };
    });
  return { ...surgery, children: rewrite(surgery.children) };
}
