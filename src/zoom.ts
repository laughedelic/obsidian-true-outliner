/**
 * The zoom SCOPE: everything derivable from "which line the zoom root starts
 * on" plus the current parse (`outline-zoom` design D1).
 *
 * Pure — no CodeMirror, no DOM, no Obsidian. The plugin layer holds the one
 * piece of mapped state (an anchor position) and calls in here for the rest;
 * nothing below is stored, so a stale scope is impossible by construction.
 *
 * No new tree geometry. The visible range IS `escalate.ts`'s subtree cover
 * (D3), so scope and cover are the same kind of object everywhere a clamp
 * compares them, and the re-based rendering IS `project.ts`'s subtree document
 * (D9), so the decoration layer needs no zoom-shaped parameter.
 */

import type { NodePath, OutlineDoc, OutlineNode } from './model';
import { findPath, nodeAt } from './model';
import { encodeLines } from './encode';
import { documentLineCount, forEachNodeWithLine, nodeAtLine } from './locate';
import { subtreeCoverOf, type Cover } from './escalate';
import { subtreeDocument } from './project';
import { posBefore, type LinePos, type LineRange } from './line-pos';

/** A contiguous run of whole lines: `toLine` EXCLUSIVE, matching `Edit`'s
 * `[fromLine, toLine)` convention in `result.ts` rather than inventing a
 * second one. */
export interface LineSpan {
  readonly fromLine: number;
  readonly toLine: number;
}

export interface ZoomScope {
  /** The node the view is rooted at. */
  readonly root: OutlineNode;
  /** The root's own first line in the SOURCE document. Also the constant
   * offset that maps a `document` line back to a source line (D9). */
  readonly startLine: number;
  /** The root's depth in the source document — 0 for a top-level node. */
  readonly depth: number;
  /** The root's position in the tree, as child indices from the document's own
   * top level. The one identity that survives a re-parse: node ids do not
   * (see `reresolveZoom`), and `startLine` names a place rather than a node —
   * after an unwrap a DIFFERENT node begins on the same line (D2). */
  readonly path: NodePath;
  /** The visible range: the root's whole subtree cover, trailing gap included
   * (D3). */
  readonly cover: Cover;
  /** The ancestor chain, OUTERMOST FIRST. Empty for a top-level root. The
   * breadcrumb trail is this list; the root itself is not in it. */
  readonly trail: readonly OutlineNode[];
  /** The lines outside the cover — at most two spans, in document order, and
   * neither ever empty. A top-level first node has only the trailing one. */
  readonly hidden: readonly LineSpan[];
  /** The root's subtree as a document, re-rooted at depth 0 (D9). */
  readonly document: OutlineDoc;
}

/**
 * The scope for an anchor LINE, or null when that line resolves to no node —
 * the preamble, or a document with no nodes.
 *
 * Resolution is `nodeAtLine`, so gap ownership is inherited rather than
 * re-implemented: an anchor on a node's trailing gap resolves to that node,
 * exactly as it does for every structural command.
 */
export function resolveZoom(doc: OutlineDoc, anchorLine: number): ZoomScope | null {
  const root = nodeAtLine(doc, anchorLine);
  if (!root) return null;

  let startLine = -1;
  let depth = 0;
  forEachNodeWithLine(doc, (node, line, nodeDepth) => {
    if (node.id !== root.id) return;
    startLine = line;
    depth = nodeDepth;
    return false;
  });
  if (startLine < 0) return null;

  const path = findPath(doc, root.id);
  if (!path) return null;

  const cover = subtreeCoverOf(doc, root);
  const total = documentLineCount(doc);
  const hidden: LineSpan[] = [];
  if (cover.start.line > 0) hidden.push({ fromLine: 0, toLine: cover.start.line });
  if (cover.end.line + 1 < total) {
    hidden.push({ fromLine: cover.end.line + 1, toLine: total });
  }

  return {
    root,
    startLine,
    depth,
    path,
    cover,
    trail: ancestorsOf(doc, root),
    hidden,
    document: subtreeDocument(root),
  };
}

/**
 * Re-resolves a scope against a DIFFERENT parse of (presumptively) the same
 * document — what `operandEscapes`/`splitEscapes` need before comparing ids
 * across a parse boundary, which they must never do directly.
 *
 * Every `parse()` call allocates fresh node ids regardless of content
 * (`model.ts`'s `nextId` is a single global counter, never reset and never
 * keyed by text), so two parses of BYTE-IDENTICAL text produce structurally
 * identical trees whose ids share no values at all. A scope built from one
 * parse and compared by id against nodes from another therefore never
 * matches — not "rarely", never — silently disabling whatever refusal the
 * comparison was supposed to make. `grammar.ts`'s `planKey` hits this on
 * every call: it takes a scope from its caller (resolved against the LIVE
 * editor's cached parse) but always re-parses `text` itself, fresh, to plan
 * against.
 *
 * `scope.startLine` is the one line-shaped, parse-independent fact a
 * `ZoomScope` carries, which is what makes re-resolution possible without an
 * anchor position of the caller's own. Resolved the same tolerant way
 * `resolveZoom` always has — by which node OWNS that line, not by requiring
 * an exact match — so this can retarget to a different node if the edit
 * between the two parses changed what sits on that line (a deletion just
 * above the root shifting a sibling onto it, say). That is an accepted,
 * narrow imprecision: the escape checks this feeds are advisory for the
 * transaction being planned RIGHT NOW, and a root that has genuinely stopped
 * existing is caught by the state-level exit trigger on the very next
 * dispatch regardless of what this returns here.
 */
export function reresolveZoom(doc: OutlineDoc, scope: ZoomScope): ZoomScope | null {
  return resolveZoom(doc, scope.startLine);
}

/**
 * A node's ancestors, outermost first.
 *
 * Read off `findPath` rather than by a second walk: the path IS the ancestor
 * chain expressed as indices, and deriving it twice is how two answers to one
 * question start disagreeing.
 */
function ancestorsOf(doc: OutlineDoc, node: OutlineNode): OutlineNode[] {
  const path = findPath(doc, node.id);
  if (!path) return [];
  const out: OutlineNode[] = [];
  for (let i = 1; i < path.length; i++) {
    const ancestor = nodeAt(doc, path.slice(0, i));
    if (ancestor) out.push(ancestor);
  }
  return out;
}

/** The parent of a scope's root — the destination of one zoom-out step. Null
 * at the top level, where stepping out clears the zoom instead. */
export function parentOf(scope: ZoomScope): OutlineNode | null {
  return scope.trail[scope.trail.length - 1] ?? null;
}

// ---- Scope predicates ----------------------------------------------------
//
// One definition each, here rather than at the four call sites that consume
// them. The same predicate copied per site is exactly how `LinePos` ended up
// declared in three modules (see `line-pos.ts`'s own module comment), and a
// clamp that disagrees with the hiding by one line is a view that lies.

/** Is `pos` inside the visible range, inclusive of both edges? */
export function containsPos(cover: Cover, pos: LinePos): boolean {
  return !posBefore(pos, cover.start) && !posBefore(cover.end, pos);
}

/** Is every end of `range` inside the visible range? Orientation-independent:
 * a backward range is judged by its endpoints, not by which is which. */
export function containsRange(cover: Cover, range: LineRange): boolean {
  return containsPos(cover, range.anchor) && containsPos(cover, range.head);
}

/**
 * `cover` narrowed to `scope`, preserving orientation.
 *
 * The one site that truncates (D7). Safe because the scope is ITSELF a subtree
 * cover: the intersection of a cover with an enclosing cover is a cover, so a
 * clamped selection still covers whole nodes exactly. A caller that clamps
 * against something which is not a cover breaks that guarantee, which is why
 * this takes a `Cover` rather than two loose positions.
 */
export function clampRange(scope: Cover, range: LineRange): LineRange {
  return { anchor: clampPos(scope, range.anchor), head: clampPos(scope, range.head) };
}

export function clampPos(scope: Cover, pos: LinePos): LinePos {
  if (posBefore(pos, scope.start)) return scope.start;
  if (posBefore(scope.end, pos)) return scope.end;
  return pos;
}

/**
 * Is `node` inside the scope's subtree — the root itself included?
 *
 * By identity through the tree rather than by line arithmetic, because the
 * callers that ask (the operand guard, D8) hold nodes and not positions, and
 * converting them to lines only to compare ranges would be a longer way to the
 * same answer with one more chance to be off by one.
 */
export function containsNode(scope: ZoomScope, node: OutlineNode): boolean {
  if (node.id === scope.root.id) return true;
  const seen = (n: OutlineNode): boolean =>
    n.children.some((child) => child.id === node.id || seen(child));
  return seen(scope.root);
}

/** Is `node` a DIRECT child of the scope's root? The shape an outdent has to
 * refuse, since outdenting one makes it a sibling of the root (D8). */
export function isDirectChild(scope: ZoomScope, node: OutlineNode): boolean {
  return scope.root.children.some((child) => child.id === node.id);
}

/**
 * Would this operand's operation place a node outside the scope? (design D8)
 *
 * Judged over the whole operand — every covered root, not a single subject —
 * because a multi-root selection whose FIRST root is safe and whose last one
 * escapes must be refused as a whole rather than applied to the roots that
 * happen to be safe. `selection-structural-ops` made the operand a forest; a
 * check written over one node would pass exactly that case wrongly.
 *
 * Two shapes escape, and only two. An operation ON the zoom root moves the root
 * itself, which is the view's own anchor. An OUTDENT of a direct child makes it
 * a sibling of the root, which is outside the visible range. Everything else —
 * indent, moves among siblings, and any operation deeper in the subtree — lands
 * inside the scope by construction.
 */
export function operandEscapes(
  scope: ZoomScope,
  groups: readonly (readonly number[])[],
  isOutdent: boolean,
): boolean {
  const directChildren = new Set(scope.root.children.map((child) => child.id));
  for (const group of groups) {
    for (const id of group) {
      if (id === scope.root.id) return true;
      if (isOutdent && directChildren.has(id)) return true;
    }
  }
  return false;
}

/**
 * Would a SPLIT of `node` at `position` place its result outside the scope?
 * (design D8, and the `outline-keyboard-grammar` delta)
 *
 * Judged by DESTINATION SCOPE, not by node identity. Splitting the zoom root is
 * not by itself out of scope: `structural-operations` sends the remainder to the
 * root's CHILD scope whenever the node has children, and always for a heading —
 * a plain-text split has no heading-sibling encoding to produce. Those
 * destinations are inside the subtree and must be allowed. A blanket
 * `node === zoomRoot` refusal was this rule's first draft and rejected every one
 * of them.
 *
 * The three shapes that DO resolve to the root's sibling scope:
 *
 * - a split at the node's content START, which inserts an empty node before it;
 * - a split of a childless non-heading node, whose remainder becomes its next
 *   sibling;
 * - Enter on an empty list item, which this grammar outdents or unwraps rather
 *   than splitting — either way moving the root itself.
 *
 * The conditions are read through `ops.ts`'s own exported predicates rather than
 * restated, so the two cannot drift: a rule about where a split lands that
 * disagrees with the code that lands it is worse than no rule.
 */
export function splitEscapes(
  scope: ZoomScope,
  node: OutlineNode,
  position: { line: number; ch: number },
  contentStartOf: (line: string) => number,
  isEmptyItem: (node: OutlineNode) => boolean,
): boolean {
  if (node.id !== scope.root.id) return false;
  if (node.kind === 'list-item' && isEmptyItem(node)) return true;

  const lineIndex = position.line - scope.startLine;
  const line = node.lines[lineIndex] ?? '';
  const contentStart = contentStartOf(line);
  const ch = Math.min(Math.max(position.ch, contentStart), line.length);
  if (lineIndex === 0 && ch === contentStart) return true;

  return node.children.length === 0 && node.kind !== 'heading';
}

/**
 * What a change did, in the only terms the escape check needs (design D1).
 *
 * Both facts are CM-shaped — they come from mapping positions through a
 * `ChangeDesc` — so they are computed by the callers and passed in, keeping
 * this module free of CodeMirror. `zoom-state.ts` derives both and shares the
 * derivation with `transaction-filter.ts`, so the refusal and the automatic
 * exit cannot disagree about whether the root survived.
 */
export interface EditFootprint {
  /** The zoom root's own first line, mapped forward into the AFTER document. */
  readonly anchorLine: number;
  /**
   * Did the change remove every line of the root's subtree cover AND touch
   * nothing else?
   *
   * The "and nothing else" is load-bearing. This fact exists to say "the other
   * clauses cannot be asked, because there is no root to find them from", and a
   * transaction that removed the cover but ALSO deleted a hidden subtree still
   * has an escape in it that nobody would ever look at. Multi-range deletions
   * are the shape that reaches it: one range takes the root, another takes
   * something the zoom hides, and `node-edit-enforcement` requires the pair to
   * be refused as a whole.
   */
  readonly onlyCoverRemoved: boolean;
}

/**
 * Would this change place content outside the zoom scope? (design D1)
 *
 * The three questions are asked in this order because the later two cannot be
 * asked at all until the earlier ones have answered.
 *
 * **0. Was the whole subtree removed, and nothing else touched?** Then this is
 * not an escape. Deleting
 * the zoom root deliberately is allowed and the automatic exit takes it from
 * here (D7). This is asked first, and asked about the CHANGE rather than the
 * after-state, because the other two begin by locating the root on its own
 * first line — and once the root is deleted that line belongs to something
 * else, which they would then mistake for the root. Measured both ways: a
 * following sibling slides up into the line, and at the end of a document the
 * node ABOVE owns the trailing blank line.
 *
 * **1. Is the root still the root?** The node OWNING that line must hold the
 * position in the tree the root held. Ownership rather than "begins there":
 * a Backspace that empties the root's own line leaves nothing beginning on it
 * while the node above owns it, and that edit moves the root, so it must be
 * refused rather than waved through.
 *
 * **2. Did anything outside the subtree change?** Compared as text, against the
 * root's cover as it stands AFTER the change. That is what makes an append at
 * the very end of the scope come out inside while a paste of a top-level
 * sibling at the same offset comes out outside: the two produce different
 * covers, and no comparison of offsets in the before-state can separate them.
 *
 * A clause for "everything inserted landed inside the subtree" is deliberately
 * absent: content inserted outside the subtree necessarily changes the text
 * outside it, so such a clause could never be the one to fail.
 */
export function editEscapes(
  before: OutlineDoc,
  scope: ZoomScope,
  after: OutlineDoc,
  footprint: EditFootprint,
): boolean {
  if (footprint.onlyCoverRemoved) return false;

  const afterScope = resolveZoom(after, footprint.anchorLine);
  // No node owns the line the root began on — it has become preamble, or the
  // document has no nodes left, and neither happened by removing the cover or
  // clause 0 would have answered. The root is gone some other way.
  if (!afterScope) return true;
  if (!samePath(scope.path, afterScope.path)) return true;

  return !sameOutsideText(before, scope.cover, after, afterScope.cover);
}

function samePath(a: NodePath, b: NodePath): boolean {
  return a.length === b.length && a.every((index, i) => index === b[i]);
}

/**
 * Is everything outside the cover unchanged?
 *
 * Both sides are read through `encodeLines`, so the comparison is between two
 * encodings rather than between an encoding and a buffer — it needs the
 * encoding to be deterministic, not to round-trip.
 */
function sameOutsideText(
  before: OutlineDoc,
  beforeCover: Cover,
  after: OutlineDoc,
  afterCover: Cover,
): boolean {
  const b = encodeLines(before);
  const a = encodeLines(after);
  return (
    b.slice(0, beforeCover.start.line).join('\n') === a.slice(0, afterCover.start.line).join('\n') &&
    b.slice(beforeCover.end.line + 1).join('\n') === a.slice(afterCover.end.line + 1).join('\n')
  );
}
