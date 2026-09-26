/**
 * Block ids the outline cannot attach to a node of its own: where Obsidian
 * reads a lone `^id` as naming something no node stands for — a whole list,
 * the item around a block — or reads it as naming nothing, or not as an id at
 * all. Each comes with the reading and the edits that make it an id the
 * outline and Obsidian agree on (`misplaced-block-ids`,
 * `docs/research/lone-block-id`).
 *
 * Read from the parsed tree alone: an attached id is part of its node
 * (`parse.ts`), so every id this finds is a paragraph node, or the first line
 * of one.
 */

import { encodeLines } from './encode';
import type { LinePos } from './line-pos';
import { ownSpan, type OutlineDoc, type OutlineNode } from './model';
import { nodeContent } from './node-text';
import type { Edit } from './result';
import { isLoneBlockIdLine, isLoneBlockIdNode } from './rules';

/** What Obsidian reads a misplaced id as. */
export type BlockIdReading =
  | { readonly kind: 'whole-list' }
  | { readonly kind: 'item'; readonly itemText: string }
  | { readonly kind: 'nothing'; readonly because: 'next-id' | 'nothing-above' | 'block-below' }
  | { readonly kind: 'not-an-id'; readonly because: 'trailing-space' | 'joined' };

export interface BlockIdCorrection {
  readonly kind: 'attach' | 'trim' | 'separate' | 'remove';
  /** The start of the target's text, for an `attach`. */
  readonly targetText?: string;
  readonly edits: readonly Edit[];
  /** Where the caret lands, in the document the edits produce. */
  readonly caret: LinePos;
}

export interface MisplacedBlockId {
  readonly line: number;
  /** The id's characters on its line, `^` through its last character. */
  readonly from: number;
  readonly to: number;
  /** The id as written, `^` included. */
  readonly id: string;
  readonly reading: BlockIdReading;
  /** In the order the menu offers them, the removal last. */
  readonly corrections: readonly BlockIdCorrection[];
}

interface Placed {
  readonly node: OutlineNode;
  readonly start: number;
  readonly ancestors: readonly OutlineNode[];
}

const ID_WITH_TRAILING_SPACE_RE = /^[ \t]*\^[A-Za-z0-9-]+[ \t]+$/;
const INLINE_ID_RE = /\s\^[A-Za-z0-9-]+$/;

/** Every misplaced block id in `doc`, in document order. */
export function misplacedBlockIds(doc: OutlineDoc): MisplacedBlockId[] {
  const lines = encodeLines(doc);
  const placed = placeNodes(doc);
  const out: MisplacedBlockId[] = [];
  placed.forEach((_, index) => {
    const found = misplacedAt(lines, placed, index);
    if (found) out.push(found);
  });
  return out;
}

function misplacedAt(
  lines: readonly string[],
  placed: readonly Placed[],
  index: number,
): MisplacedBlockId | undefined {
  const { node, start, ancestors } = placed[index]!;
  if (node.kind !== 'paragraph') return undefined;
  const first = node.lines[0] ?? '';
  const lone = isLoneBlockIdNode(node);
  if (!lone && !isLoneBlockIdLine(first) && !ID_WITH_TRAILING_SPACE_RE.test(first)) return undefined;

  const from = first.indexOf('^');
  const id = first.trim();
  const at = { line: start, from, to: from + id.length, id };
  // What sits right under the id is its own when the paragraph has further
  // lines or children; taking the blank lines above too would join that onto
  // the line above the id.
  const holdsBelow = node.lines.length > 1 || node.children.length > 0;
  const remove = removal(lines, start, holdsBelow);

  if (!lone) {
    if (node.lines.length > 1) {
      const separate: BlockIdCorrection = {
        kind: 'separate',
        edits: [{ fromLine: start + 1, toLine: start + 1, insert: [''] }],
        caret: { line: start, ch: first.length },
      };
      return { ...at, reading: { kind: 'not-an-id', because: 'joined' }, corrections: [separate, remove] };
    }
    const trimmed = first.trimEnd();
    const trim: BlockIdCorrection = {
      kind: 'trim',
      edits: [{ fromLine: start, toLine: start + 1, insert: [trimmed] }],
      caret: { line: start, ch: trimmed.length },
    };
    return { ...at, reading: { kind: 'not-an-id', because: 'trailing-space' }, corrections: [trim, remove] };
  }

  const previous = placed[index - 1];
  if (!previous) {
    return { ...at, reading: { kind: 'nothing', because: 'nothing-above' }, corrections: [remove] };
  }
  const next = placed[index + 1];
  if (next && node.children.length === 0 && isLoneBlockIdNode(next.node)) {
    return { ...at, reading: { kind: 'nothing', because: 'next-id' }, corrections: [remove] };
  }

  const item = [...ancestors].reverse().find((ancestor) => ancestor.kind === 'list-item');
  if (item) {
    const corrections: BlockIdCorrection[] = [];
    const itemAttach = attach(lines, placed, item, id, start, holdsBelow);
    if (itemAttach) corrections.push(itemAttach);
    if (previous.node.kind === 'list-item' && previous.node !== item) {
      const last = attach(lines, placed, previous.node, id, start, holdsBelow);
      if (last) corrections.push(last);
    }
    return { ...at, reading: { kind: 'item', itemText: textOf(item) }, corrections: [...corrections, remove] };
  }

  const followedDirectly = node.trailingGap.length === 0 && (lines[start + 1] ?? '') !== '';
  if (followedDirectly) {
    const separate: BlockIdCorrection = {
      kind: 'separate',
      edits: [{ fromLine: start + 1, toLine: start + 1, insert: [''] }],
      caret: { line: start, ch: first.length },
    };
    return { ...at, reading: { kind: 'nothing', because: 'block-below' }, corrections: [separate, remove] };
  }

  if (previous.node.kind === 'list-item') {
    const corrections: BlockIdCorrection[] = [];
    const lead = leadOf(previous);
    if (lead) {
      const toLead = attach(lines, placed, lead, id, start, holdsBelow);
      if (toLead) corrections.push(toLead);
    }
    const toLast = attach(lines, placed, previous.node, id, start, holdsBelow);
    if (toLast) corrections.push(toLast);
    return { ...at, reading: { kind: 'whole-list' }, corrections: [...corrections, remove] };
  }

  return undefined;
}

/**
 * The paragraph a list is written under, when the list that `last` ends is one:
 * the first ancestor above `last`'s chain of items.
 */
function leadOf(last: Placed): OutlineNode | undefined {
  const chain = [...last.ancestors].reverse();
  const above = chain.find((ancestor) => ancestor.kind !== 'list-item');
  return above?.kind === 'paragraph' ? above : undefined;
}

/**
 * Append ` ^id` to `target`'s last own line and take the id's line away. None
 * when the target already carries an id of its own, attached or inline.
 */
function attach(
  lines: readonly string[],
  placed: readonly Placed[],
  target: OutlineNode,
  id: string,
  idLine: number,
  holdsBelow: boolean,
): BlockIdCorrection | undefined {
  if (target.blockId) return undefined;
  const textIndex = target.kind === 'heading' && target.setext ? 0 : target.lines.length - 1;
  const own = target.lines[textIndex] ?? '';
  if (INLINE_ID_RE.test(own) || (textIndex > 0 && isLoneBlockIdLine(own))) return undefined;
  const start = placed.find((entry) => entry.node === target)!.start;
  const line = start + textIndex;
  const written = `${own} ${id}`;
  return {
    kind: 'attach',
    targetText: textOf(target),
    edits: [
      { fromLine: line, toLine: line + 1, insert: [written] },
      lineRemoval(lines, idLine, holdsBelow),
    ],
    caret: { line, ch: written.length },
  };
}

function removal(lines: readonly string[], idLine: number, holdsBelow: boolean): BlockIdCorrection {
  const edit = lineRemoval(lines, idLine, holdsBelow);
  if (edit.fromLine === 0) return { kind: 'remove', edits: [edit], caret: { line: 0, ch: 0 } };
  const above = edit.fromLine - 1;
  return { kind: 'remove', edits: [edit], caret: { line: above, ch: (lines[above] ?? '').length } };
}

/**
 * The id's line, with the blank lines that would otherwise be left doubled
 * around it: the ones above, or the ones below when nothing comes above. With
 * `holdsBelow` the blank lines above stay, as the separator of what the id's
 * paragraph held under it.
 */
function lineRemoval(lines: readonly string[], idLine: number, holdsBelow: boolean): Edit {
  let fromLine = idLine;
  while (fromLine > 0 && lines[fromLine - 1]!.trim() === '') fromLine--;
  let toLine = idLine + 1;
  if (fromLine === 0) {
    while (toLine < lines.length - 1 && lines[toLine]!.trim() === '') toLine++;
    return { fromLine: 0, toLine, insert: [] };
  }
  return { fromLine: holdsBelow ? idLine : fromLine, toLine, insert: [] };
}

function textOf(node: OutlineNode): string {
  return nodeContent(node, undefined, { firstLineOnly: true }).markdown;
}

function placeNodes(doc: OutlineDoc): Placed[] {
  const out: Placed[] = [];
  let line = doc.preamble.length;
  const visit = (nodes: readonly OutlineNode[], ancestors: readonly OutlineNode[]): void => {
    for (const node of nodes) {
      out.push({ node, start: line, ancestors });
      line += ownSpan(node);
      visit(node.children, [...ancestors, node]);
    }
  };
  visit(doc.children, []);
  return out;
}

