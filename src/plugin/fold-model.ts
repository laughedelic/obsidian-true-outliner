/**
 * What folds, and what a fold hides — as line geometry over the parsed tree,
 * with no CodeMirror in it.
 *
 * Pure so the questions the fold layer keeps asking can be answered in the unit
 * suite rather than through a real Obsidian: which nodes are foldable, where a
 * node's fold begins and ends, how much it hides, and which node a line's fold
 * gesture belongs to. Same division `footer-model.ts` makes for the same reason.
 *
 * Three kinds can hold children — a heading (its section), a list item (by
 * indentation, in any notation), and a paragraph (the attachment rule). An atom
 * is never a parent, so nothing here ever reports one as foldable; what
 * Obsidian's own folding still does inside an atom's notation is Obsidian's,
 * and `fold-service.ts` records why we leave it alone.
 */

import type { OutlineDoc, OutlineNode } from '../model';
import { ownSpan } from '../model';

/** A node paired with the line geometry the fold layer needs from it. */
export interface FoldEntry {
  readonly node: OutlineNode;
  /** 0-based absolute line where the node's own first line sits. */
  readonly startLine: number;
  /** 0 at the top level. */
  readonly depth: number;
}

/** A fold's extent, in 0-based absolute lines. */
export interface FoldLines {
  /**
   * The node's own LAST line — where the fold begins, at that line's end. A
   * setext heading owns two lines and a paragraph owns several; the fold starts
   * after all of them, because they are the node's own text and stay on screen.
   */
  readonly headLine: number;
  /**
   * The last CONTENT line the fold hides: the deepest last descendant's own
   * last line, never a blank line it owns.
   *
   * Trailing gaps stay visible on purpose (design D2). The blank line between
   * two siblings is what separates them on screen, and hiding it would make
   * folding one node change the spacing of the next.
   */
  readonly lastLine: number;
}

/** Every line a node occupies with its whole subtree, gaps included. */
export function subtreeSpan(node: OutlineNode): number {
  let span = ownSpan(node);
  for (const child of node.children) span += subtreeSpan(child);
  return span;
}

/** Whether this node is one the plugin offers a fold on. */
export function isFoldable(node: OutlineNode): boolean {
  return node.children.length > 0;
}

/** How many descendants a fold on this node hides — all of them, not just the
 * immediate children, because all of them are what the reader cannot see. */
export function hiddenDescendantCount(node: OutlineNode): number {
  let count = 0;
  for (const child of node.children) count += 1 + hiddenDescendantCount(child);
  return count;
}

/**
 * Where this node's fold begins and ends, or null when it has no children.
 *
 * `startLine` is the node's own start, which the caller already has from
 * whichever lookup found the node — this function does not re-walk to find it.
 */
export function foldLines(node: OutlineNode, startLine: number): FoldLines | null {
  if (!isFoldable(node)) return null;
  return {
    headLine: startLine + node.lines.length - 1,
    lastLine: lastContentLine(node, startLine),
  };
}

/**
 * The last line of actual content under `node`, following the last child down.
 *
 * Deliberately NOT `subtreeCoverOf`'s end (escalate.ts), which is gap-inclusive
 * because a SELECTION owns the gap it reaches over. A fold is the other
 * decision: see `FoldLines.lastLine`.
 */
function lastContentLine(node: OutlineNode, startLine: number): number {
  const last = node.children[node.children.length - 1];
  if (!last) return startLine + node.lines.length - 1;
  let line = startLine + ownSpan(node);
  for (let i = 0; i < node.children.length - 1; i++) line += subtreeSpan(node.children[i]!);
  return lastContentLine(last, line);
}

/**
 * The chain of nodes containing `line`, outermost first, or an empty array when
 * the line belongs to the preamble.
 *
 * Containment is over a node's WHOLE subtree, so an inner line reports its
 * ancestors too — which is what the escalating fold commands need and what a
 * plain node lookup cannot give them.
 */
export function ancestryAtLine(doc: OutlineDoc, line: number): FoldEntry[] {
  const chain: FoldEntry[] = [];
  const walk = (nodes: readonly OutlineNode[], from: number, depth: number): boolean => {
    let startLine = from;
    for (const node of nodes) {
      const span = subtreeSpan(node);
      if (line < startLine) return false;
      if (line < startLine + span) {
        chain.push({ node, startLine, depth });
        // Past the node's own lines and gap, the line is a descendant's.
        if (line >= startLine + ownSpan(node)) {
          walk(node.children, startLine + ownSpan(node), depth + 1);
        }
        return true;
      }
      startLine += span;
    }
    return false;
  };
  walk(doc.children, doc.preamble.length, 0);
  return chain;
}

/**
 * The node a fold gesture on `line` acts on: the innermost node containing the
 * line that HAS children, or the nearest such ancestor.
 *
 * The escalation is the point (design D3). A caret rests in a leaf far more
 * often than on a parent, and "collapse this branch" is what the gesture means
 * there; resolving to nothing would make the hotkey do nothing in the commonest
 * position a user presses it from.
 */
export function foldTargetAtLine(doc: OutlineDoc, line: number): FoldEntry | null {
  const chain = ancestryAtLine(doc, line);
  for (let i = chain.length - 1; i >= 0; i--) {
    const entry = chain[i]!;
    if (isFoldable(entry.node)) return entry;
  }
  return null;
}

/** The node whose own lines or trailing gap contain `line`, with its geometry —
 * no escalation, for callers that mean this line's node and not its branch. */
export function entryAtLine(doc: OutlineDoc, line: number): FoldEntry | null {
  const chain = ancestryAtLine(doc, line);
  return chain[chain.length - 1] ?? null;
}

/** Every foldable node in document order — what fold-all and level folding
 * walk, and what the fold service answers from. */
export function foldableEntries(doc: OutlineDoc): FoldEntry[] {
  const entries: FoldEntry[] = [];
  const walk = (nodes: readonly OutlineNode[], from: number, depth: number): number => {
    let startLine = from;
    for (const node of nodes) {
      if (isFoldable(node)) entries.push({ node, startLine, depth });
      walk(node.children, startLine + ownSpan(node), depth + 1);
      startLine += subtreeSpan(node);
    }
    return startLine;
  };
  walk(doc.children, doc.preamble.length, 0);
  return entries;
}
