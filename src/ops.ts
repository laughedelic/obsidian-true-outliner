/**
 * Structural operations under the two-regime algebra
 * (docs/research/04-open-questions.md):
 *
 *   HEADINGS         indent/outdent = level ± 1, whole subtree shifts,
 *                    hierarchy re-derives from levels; reject at h1/h6.
 *   EVERYTHING ELSE  indent = child of previous sibling, outdent =
 *                    brother→uncle; encoding recomputed from context.
 *
 * Implementation strategy: each op performs line surgery on the tree, then
 * the canonical result is parse(encode(surgery)) — closure with the mapping
 * holds by construction, and the inverse-law tests guard semantics.
 *
 * Markdown-imposed rejections beyond the bounds:
 * - content cannot become a *sibling of a heading section it is inside*
 *   (heading scope is positional), so outdent out of a heading is rejected;
 * - only list items can nest under a paragraph, and nothing nests under an
 *   atom;
 * - reordering across the heading/content divide (or between heading
 *   levels) has no positional encoding and is rejected.
 */

import type { NodePath, OutlineDoc, OutlineNode } from './model';
import { findPath, isAtom, makeNode, nodeAt, updateSiblings } from './model';
import { encode, encodeLines } from './encode';
import { parse, indentWidth } from './parse';
import type { Edit, OpResult } from './result';
import { accept, diffLines, reject } from './result';
import { encodingKindAtDestination } from './rules';
import {
  childBaseCol,
  headingWithLevel,
  leadingWhitespace,
  markerWidth,
  reencodeForDestination,
  shiftSubtree,
} from './reencode';

export interface OpOutput {
  readonly doc: OutlineDoc;
  readonly edits: readonly Edit[];
  /**
   * Where this operation's SUBJECT landed — its first line (0-based, in the
   * new text) and the character offset of its content start (after
   * indentation and any list/heading marker) — or, for the operations with an
   * interior landing, that exact position: a merge's join point, a split
   * point, an insertion's first block. For a deletion it is the surviving
   * neighbour the operation selects.
   *
   * A structural FACT, not the caret. Where the caret goes is decided by
   * `caret-policy.ts` from this and the surrounding document; the two need not
   * coincide, and after a deletion they deliberately do not.
   *
   * The distinction is load-bearing beyond caret placement. `finalize`
   * re-parses, so node ids do not survive an operation, and composing code
   * that has to locate a node across that boundary — `enforce.ts`'s
   * `deleteAndSplice`, which needs the surviving neighbour in the
   * post-deletion tree — locates it by this line. Reading the caret for that
   * purpose is what made the deletion convention unchangeable: altering it
   * would have silently changed which node a paste or type-over splices
   * against.
   */
  readonly anchor: { readonly line: number; readonly ch: number };
}

const isContent = (node: OutlineNode): boolean =>
  node.kind === 'paragraph' || node.kind === 'list-item';

function childrenAt(doc: OutlineDoc, path: readonly number[]): readonly OutlineNode[] {
  return path.length === 0 ? doc.children : (nodeAt(doc, path)?.children ?? []);
}

/** Char offset where a line's content starts (after indent + marker). */
export function contentColumnCh(line: string): number {
  const match = /^[ \t]*(?:(?:[-+*]|\d{1,9}[.)])[ \t]+)?(?:#{1,6}[ \t]+)?/.exec(line);
  return match ? match[0].length : 0;
}

/** Start line of a node in a doc's encoding (ids preserved from surgery). */
function startLineOf(doc: OutlineDoc, id: number): number {
  let line = doc.preamble.length;
  let found = -1;
  const walk = (node: OutlineNode): void => {
    if (found !== -1) return;
    if (node.id === id) {
      found = line;
      return;
    }
    line += node.lines.length + node.trailingGap.length;
    node.children.forEach(walk);
  };
  doc.children.forEach(walk);
  return found; // -1 when absent; callers decide, rather than a silent line 0
}

/**
 * `subjectId` is `undefined` only when a delete op consumes every node in
 * scope (deleteSubtrees's empty-document / empty-scope edge case) — the
 * anchor then lands at the scope's own start rather than on any node.
 */
export function finalize(
  oldDoc: OutlineDoc,
  surgery: OutlineDoc,
  subjectId: number | undefined,
): OpResult<OpOutput> {
  const normalized = normalizeBoundaries(surgery);
  const text = encode(normalized);
  const lines = text === '' ? [] : text.split('\n');
  // A subject that is not in `normalized` is a caller bug, not a position: it
  // used to degrade to line 0, which reads as a legitimate anchor and pointed
  // at whatever occupied that line (in a note with frontmatter, the preamble).
  // Degrade to the same scope start `subjectId === undefined` produces, so an
  // absent subject is never mistaken for a located one.
  const located = subjectId === undefined ? -1 : startLineOf(normalized, subjectId);
  if (located === -1) {
    // No subject at all: the scope start. `preamble.length` is one PAST the
    // last line whenever the preamble has no trailing blank (frontmatter
    // written with no separator before the body), and `anchor` is a public
    // structural position, so a direct consumer would receive a coordinate
    // outside the document. Anchor at the end of what remains instead.
    const lastLine = Math.max(lines.length - 1, 0);
    return accept({
      doc: parse(text),
      edits: diffLines(encodeLines(oldDoc), lines),
      anchor: { line: lastLine, ch: (lines[lastLine] ?? '').length },
    });
  }
  return accept({
    doc: parse(text),
    edits: diffLines(encodeLines(oldDoc), lines),
    anchor: { line: located, ch: contentColumnCh(lines[located] ?? '') },
  });
}

// ---------------------------------------------------------------- headings

function shiftHeadingLevels(node: OutlineNode, delta: number): OutlineNode {
  const self =
    node.kind === 'heading' ? headingWithLevel(node, (node.level ?? 1) + delta) : node;
  return { ...self, children: self.children.map((child) => shiftHeadingLevels(child, delta)) };
}

function maxHeadingLevel(node: OutlineNode): number {
  let max = node.kind === 'heading' ? (node.level ?? 1) : 0;
  for (const child of node.children) max = Math.max(max, maxHeadingLevel(child));
  return max;
}

function headingLevelOp(
  doc: OutlineDoc,
  path: readonly number[],
  node: OutlineNode,
  delta: number,
): OpResult<OpOutput> {
  if (delta > 0 && maxHeadingLevel(node) >= 6) return reject('at-h6-bound');
  if (delta < 0 && (node.level ?? 1) <= 1) return reject('at-h1-bound');
  const surgery = updateSiblings(doc, path.slice(0, -1), (siblings) =>
    siblings.map((sibling, i) =>
      i === path[path.length - 1] ? shiftHeadingLevels(sibling, delta) : sibling,
    ),
  );
  return finalize(doc, surgery, node.id);
}

// ------------------------------------------------------- separation repair

function subtreeFinalNode(node: OutlineNode): OutlineNode {
  const last = node.children[node.children.length - 1];
  return last ? subtreeFinalNode(last) : node;
}

function appendFinalGap(node: OutlineNode): OutlineNode {
  const last = node.children[node.children.length - 1];
  if (!last) return { ...node, trailingGap: [...node.trailingGap, ''] };
  return {
    ...node,
    children: [...node.children.slice(0, -1), appendFinalGap(last)],
  };
}

function stripFinalGap(node: OutlineNode): OutlineNode {
  const last = node.children[node.children.length - 1];
  if (!last) return { ...node, trailingGap: [] };
  return { ...node, children: [...node.children.slice(0, -1), stripFinalGap(last)] };
}

function setFinalGap(node: OutlineNode, gap: readonly string[]): OutlineNode {
  const last = node.children[node.children.length - 1];
  if (!last) return { ...node, trailingGap: [...gap] };
  return { ...node, children: [...node.children.slice(0, -1), setFinalGap(last, gap)] };
}

function needsBlankBetween(prev: OutlineNode, next: OutlineNode): boolean {
  const leaf = subtreeFinalNode(prev);
  if (leaf.trailingGap.length > 0) return false;
  if (leaf.kind === 'paragraph') {
    return (
      next.kind === 'paragraph' ||
      next.kind === 'html' ||
      (next.kind === 'heading' && next.setext === true) ||
      (next.kind === 'hr' && (next.lines[0] ?? '').includes('-'))
    );
  }
  if (leaf.kind === 'list-item') {
    const contentCol = indentWidth(leaf.lines[0] ?? '') + markerWidth(leaf);
    return (
      (next.kind === 'paragraph' || next.kind === 'html') &&
      indentWidth(next.lines[0] ?? '') >= contentCol
    );
  }
  return false;
}

/**
 * Insert the blank lines that keep adjacent blocks from merging on reparse.
 * On any tree that came out of `parse` this is a no-op — such boundaries
 * cannot exist there — so it only ever touches op-created seams.
 */
function normalizeBoundaries(doc: OutlineDoc): OutlineDoc {
  const fixList = (nodes: readonly OutlineNode[]): readonly OutlineNode[] => {
    const out = nodes.map((node) => {
      let fixed: OutlineNode = { ...node, children: fixList(node.children) };
      const firstChild = fixed.children[0];
      if (
        firstChild &&
        fixed.kind === 'list-item' &&
        fixed.trailingGap.length === 0 &&
        (firstChild.kind === 'paragraph' || firstChild.kind === 'html')
      ) {
        fixed = { ...fixed, trailingGap: [''] };
      }
      return fixed;
    });
    return out.map((node, i) =>
      i < out.length - 1 && needsBlankBetween(node, out[i + 1]!) ? appendFinalGap(node) : node,
    );
  };
  return { ...doc, children: fixList(doc.children) };
}

// ------------------------------------------------------ ordered renumbering

const ORDERED_MARKER_RE = /^([ \t]*)\d{1,9}([.)])/;

/**
 * Renumber maximal runs of ordered items. A run keeps its start number
 * (taken as the minimum present, so a swap doesn't inherit the moved item's
 * number while `5. 6. 7.`-style lists keep starting at 5).
 */
function renumberOrdered(nodes: readonly OutlineNode[]): readonly OutlineNode[] {
  const isOrdered = (n: OutlineNode): boolean =>
    n.kind === 'list-item' && n.listStyle?.type === 'ordered';

  const out = [...nodes];
  let i = 0;
  while (i < out.length) {
    if (!isOrdered(out[i]!)) {
      i++;
      continue;
    }
    let end = i;
    while (end < out.length && isOrdered(out[end]!)) end++;
    const run = out.slice(i, end);
    const startNumber = Math.min(
      ...run.map((n) => (n.listStyle as { number: number }).number),
    );
    run.forEach((node, k) => {
      const number = startNumber + k;
      const style = node.listStyle as { type: 'ordered'; number: number; delimiter: '.' | ')' };
      if (style.number === number) return;
      out[i + k] = {
        ...node,
        listStyle: { ...style, number },
        lines: node.lines.map((line, li) =>
          li === 0 ? line.replace(ORDERED_MARKER_RE, `$1${number}$2`) : line,
        ),
      };
    });
    i = end;
  }
  return out;
}

/**
 * The indentation STRING a node adopts at its destination — taken verbatim
 * from context (so tab-indented vaults stay tab-indented):
 * 1. an existing list-item at the landing site (sibling-to-be),
 * 2. else the parent's own indentation plus one inferred unit (list-item
 *    parents) or exactly the parent's indentation (paragraph parents),
 * 3. else '' under headings/root.
 *
 * `fallbackIndentUnit` only matters for step 2 when the document itself has
 * no existing indented list item to infer a unit from (a brand-new note, or
 * the first indent in one) — see `inferIndentUnit`.
 */
export function destinationIndent(
  doc: OutlineDoc,
  parent: OutlineNode | 'root',
  siblingsAtDestination: readonly OutlineNode[],
  fallbackIndentUnit?: string,
): string {
  const sibling = siblingsAtDestination.find((n) => n.kind === 'list-item');
  if (sibling) return leadingWhitespace(sibling.lines[0] ?? '');
  if (parent === 'root' || parent.kind === 'heading') return '';
  const parentIndent = leadingWhitespace(parent.lines[0] ?? '');
  if (parent.kind === 'paragraph') return parentIndent;
  return parentIndent + inferIndentUnit(doc, fallbackIndentUnit);
}

/**
 * The document's list indent unit: tab if any indented list line uses one,
 * else the first indented item's spaces, else `fallback` — which lets
 * callers with a live editor (Obsidian's own "Indent using tabs" setting,
 * read from CodeMirror's public `indentUnit` facet) supply the vault's
 * preferred unit instead of a hardcoded default. Only reached when the
 * document has no existing indented list item to infer from at all.
 */
function inferIndentUnit(doc: OutlineDoc, fallback = '  '): string {
  for (const node of walkDoc(doc)) {
    if (node.kind !== 'list-item') continue;
    const ws = leadingWhitespace(node.lines[0] ?? '');
    if (ws.includes('\t')) return '\t';
    if (ws.length > 0) return ws.length >= 4 ? '    ' : ws;
  }
  return fallback;
}

function* walkDoc(doc: OutlineDoc): Generator<OutlineNode> {
  function* walk(nodes: readonly OutlineNode[]): Generator<OutlineNode> {
    for (const node of nodes) {
      yield node;
      yield* walk(node.children);
    }
  }
  yield* walk(doc.children);
}

// ------------------------------------------------------------------ indent

export function indent(
  doc: OutlineDoc,
  nodeId: number,
  fallbackIndentUnit?: string,
): OpResult<OpOutput> {
  const path = findPath(doc, nodeId);
  if (!path) return reject('node-not-found');
  const node = nodeAt(doc, path)!;

  if (node.kind === 'heading') return headingLevelOp(doc, path, node, +1);

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const siblings = childrenAt(doc, parentPath);
  if (index === 0) return reject('no-previous-sibling');
  const target = siblings[index - 1]!;

  if (isAtom(target)) return reject('not-expressible-under-target');
  if (target.kind === 'paragraph' && !isContent(node)) {
    // Only list items can follow a paragraph as its children.
    return reject('not-expressible-under-target');
  }

  // Under a heading, direct content ends at the first sub-heading — insert
  // there so the node lands in the target's own section, not a child's.
  const firstSubheading = target.children.findIndex((child) => child.kind === 'heading');
  const insertIndex =
    target.kind === 'heading' && firstSubheading !== -1
      ? firstSubheading
      : target.children.length;

  const newKind = isContent(node)
    ? encodingKindAtDestination({
        parentKind: target.kind,
        precedingSiblings: target.children.slice(0, insertIndex),
        followingSiblings: target.children.slice(insertIndex),
      })
    : undefined;
  const moved = reencodeForDestination(
    node,
    newKind,
    destinationIndent(doc, target, target.children.slice(0, insertIndex), fallbackIndentUnit),
  );

  let surgery = updateSiblings(doc, parentPath, (nodes) => {
    const rest = nodes.filter((_, i) => i !== index);
    return renumberOrdered(rest);
  });
  surgery = updateSiblings(surgery, [...parentPath, index - 1], (nodes) =>
    renumberOrdered([...nodes.slice(0, insertIndex), moved, ...nodes.slice(insertIndex)]),
  );
  return finalize(doc, surgery, moved.id);
}

// ----------------------------------------------------------------- outdent

export function outdent(
  doc: OutlineDoc,
  nodeId: number,
  fallbackIndentUnit?: string,
): OpResult<OpOutput> {
  const path = findPath(doc, nodeId);
  if (!path) return reject('node-not-found');
  const node = nodeAt(doc, path)!;

  if (node.kind === 'heading') return headingLevelOp(doc, path, node, -1);

  if (path.length === 1) return reject('at-top-level');
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const parent = nodeAt(doc, parentPath)!;

  if (parent.kind === 'heading') {
    // Heading scope is positional: content placed after a section's body is
    // still inside the section — there is no "sibling of my heading" spot.
    return reject('not-expressible-under-target');
  }

  const grandPath = parentPath.slice(0, -1);
  const parentIndex = parentPath[parentPath.length - 1]!;
  const grandParent = grandPath.length === 0 ? undefined : nodeAt(doc, grandPath)!;
  if (grandPath.length > 0 && grandParent!.kind === 'heading' && node.kind !== 'paragraph' && node.kind !== 'list-item' && !isAtom(node)) {
    return reject('not-expressible-under-target');
  }
  const grandSiblings = childrenAt(doc, grandPath);

  const newKind = isContent(node)
    ? encodingKindAtDestination({
        parentKind: grandParent ? grandParent.kind : 'root',
        precedingSiblings: grandSiblings.slice(0, parentIndex + 1),
        followingSiblings: grandSiblings.slice(parentIndex + 1),
      })
    : undefined;
  let moved = reencodeForDestination(
    node,
    newKind,
    // Brother→uncle: the node lands at its former parent's level, so it
    // adopts the parent's own indentation string.
    node.kind === 'list-item' || newKind === 'list-item'
      ? leadingWhitespace(parent.lines[0] ?? '')
      : destinationIndent(doc, grandParent ?? 'root', [], fallbackIndentUnit),
  );

  // Outdent-in-place (Logseq semantics): the node's own former following
  // siblings under `parent` re-parent as ITS trailing children — they stay
  // attached to the node they used to sit beside, rather than being left
  // behind under `parent` (which would silently drop them out of the
  // subtree the user just moved).
  const followingSiblings = childrenAt(doc, parentPath).slice(index + 1);
  if (followingSiblings.length > 0) {
    let children = moved.children;
    for (const [i, sibling] of followingSiblings.entries()) {
      const newSiblingKind = isContent(sibling)
        ? encodingKindAtDestination({
            parentKind: moved.kind,
            precedingSiblings: children,
            followingSiblings: followingSiblings.slice(i + 1),
          })
        : undefined;
      const reencoded = reencodeForDestination(
        sibling,
        newSiblingKind,
        destinationIndent(doc, moved, children),
      );
      children = [...children, reencoded];
    }
    moved = { ...moved, children: renumberOrdered(children) };
  }

  let surgery = updateSiblings(doc, parentPath, (nodes) =>
    renumberOrdered(nodes.slice(0, index)),
  );
  surgery = updateSiblings(surgery, grandPath, (nodes) =>
    renumberOrdered([
      ...nodes.slice(0, parentIndex + 1),
      moved,
      ...nodes.slice(parentIndex + 1),
    ]),
  );
  return finalize(doc, surgery, moved.id);
}

// -------------------------------------------------------------- reordering

function move(doc: OutlineDoc, nodeId: number, delta: -1 | 1): OpResult<OpOutput> {
  const path = findPath(doc, nodeId);
  if (!path) return reject('node-not-found');
  const node = nodeAt(doc, path)!;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const siblings = childrenAt(doc, parentPath);
  const other = siblings[index + delta];
  if (!other) return reject(delta < 0 ? 'no-sibling-above' : 'no-sibling-below');

  const bothHeadings = node.kind === 'heading' && other.kind === 'heading';
  if (node.kind === 'heading' || other.kind === 'heading') {
    // Positional encoding only supports swapping same-level sections.
    if (!bothHeadings || node.level !== other.level) {
      return reject('cannot-reorder-across-heading-boundary');
    }
  }

  const surgery = updateSiblings(doc, parentPath, (nodes) => {
    const out = [...nodes];
    const a = Math.min(index, index + delta);
    // Separator gaps are positional, not node-owned: the gap that followed
    // slot a stays at slot a (else the final-newline gap migrates mid-doc).
    const gapA = subtreeFinalNode(out[a]!).trailingGap;
    const gapB = subtreeFinalNode(out[a + 1]!).trailingGap;
    [out[a], out[a + 1]] = [setFinalGap(out[a + 1]!, gapA), setFinalGap(out[a]!, gapB)];
    return renumberOrdered(out);
  });
  return finalize(doc, surgery, node.id);
}

export const moveUp = (doc: OutlineDoc, nodeId: number): OpResult<OpOutput> =>
  move(doc, nodeId, -1);
export const moveDown = (doc: OutlineDoc, nodeId: number): OpResult<OpOutput> =>
  move(doc, nodeId, 1);

// ------------------------------------------------------------------- split

const LIST_MARKER_SPLIT_RE = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]*)/;

/**
 * Split a paragraph/list-item node at a document position into two adjacent
 * same-kind siblings; children stay with the original (upper) node.
 *
 * Markdown nuance: an empty PARAGRAPH has no encoding (a blank line is a
 * gap), so an end-of-paragraph split yields no new node — just the blank
 * separation with the cursor on it; the sibling materializes when text is
 * typed. An empty list item ("-") is a real node.
 */
export function splitNode(
  doc: OutlineDoc,
  nodeId: number,
  position: { line: number; ch: number },
  fallbackIndentUnit?: string,
): OpResult<OpOutput> {
  const path = findPath(doc, nodeId);
  if (!path) return reject('node-not-found');
  const node = nodeAt(doc, path)!;
  if (node.kind !== 'paragraph' && node.kind !== 'list-item' && node.kind !== 'heading') {
    return reject('cannot-split');
  }

  const startLine = startLineOf(doc, nodeId);
  const lineIndex = position.line - startLine;
  if (lineIndex < 0 || lineIndex >= node.lines.length) return reject('cannot-split');
  // A setext heading's second line is its underline, not text — no split point.
  if (node.kind === 'heading' && node.setext && lineIndex !== 0) return reject('cannot-split');
  const line = node.lines[lineIndex]!;
  // Never split inside indentation or a list marker.
  const ch = Math.min(Math.max(position.ch, contentColumnCh(line)), line.length);

  // A setext heading's underline (its own line 1) is structural chrome, not a
  // continuation line of the title — it must stay attached to the truncated
  // heading (upper), never travel with the split-off remainder (lower). A
  // plain `node.lines.slice(lineIndex + 1)` would otherwise sweep it into
  // `lower`'s own lines, and re-parsing "<title-head>\n<title-tail>\n===="
  // (no longer separated by a dedicated underline of its own) reinterprets
  // the whole thing as ONE multi-line setext heading, silently undoing the
  // split.
  const isSetextHeading = node.kind === 'heading' && node.setext === true;
  const upperLines = isSetextHeading
    ? [line.slice(0, ch), node.lines[1]!]
    : [...node.lines.slice(0, lineIndex), line.slice(0, ch)];
  const remainderFirst = line.slice(ch);
  const lowerRest = isSetextHeading ? [] : node.lines.slice(lineIndex + 1);
  const emptyRemainder = remainderFirst.trim() === '' && lowerRest.length === 0;

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;

  // Content-adjacent split (structural-operations amendment 2026-07-21): a
  // node WITH children puts the remainder where the split point actually is
  // — directly above the existing children, as the new FIRST CHILD, encoded
  // per the child scope's kind rules — instead of a sibling that visually
  // jumps over the whole subtree. Falls through to the sibling path for the
  // one child-kind shape with no empty encoding (see below).
  // Headings always take this branch, even with no children: a heading's only
  // possible SIBLING is another heading, so a plain-text split has no sibling
  // encoding to fall back to — the remainder can only ever be a child.
  if (node.children.length > 0 || node.kind === 'heading') {
    const childKind = encodingKindAtDestination({
      parentKind: node.kind,
      precedingSiblings: [],
      followingSiblings: node.children,
    });
    // An empty paragraph has no markdown encoding, so an end-of-node split
    // whose child scope demands a paragraph can't materialize a first child
    // — fall through to the childless sibling behavior for that edge.
    if (!(emptyRemainder && childKind === 'paragraph')) {
      const indentText = destinationIndent(doc, node, node.children, fallbackIndentUnit);
      let lower: OutlineNode;
      if (childKind === 'list-item') {
        const firstLine = emptyRemainder
          ? `${indentText}- `
          : `${indentText}- ${remainderFirst.trimStart()}`;
        const contPad = `${indentText}  `;
        lower = makeNode({
          kind: 'list-item',
          listStyle: { type: 'bullet', marker: '-' },
          lines: [firstLine, ...lowerRest.map((l) => `${contPad}${l.trimStart()}`)],
        });
      } else {
        // If the next existing child is ALSO a paragraph, a blank separator
        // is required — two adjacent non-blank lines re-parse as ONE
        // paragraph (CommonMark), silently merging the split. List-item
        // children self-delimit via their marker and need no separator; this
        // shape is unreachable for non-heading parents today (their
        // encoding rule never produces a paragraph-kind child next to
        // another paragraph-kind child), but is the common case for headings.
        const needsSeparator = node.children[0]?.kind === 'paragraph';
        lower = makeNode({
          kind: 'paragraph',
          lines: [
            `${indentText}${remainderFirst.trimStart()}`,
            ...lowerRest.map((l) => `${indentText}${l.trimStart()}`),
          ],
          ...(needsSeparator ? { trailingGap: [''] } : {}),
        });
      }
      // A childless split node (only reachable for headings — the
      // paragraph/list-item branch above requires children.length > 0) may
      // have owned a trailing gap that was really the FILE's own terminal
      // blank lines, not an interior gap before a child. `lower` is now the
      // terminal node in `node`'s place, so that gap moves with it — mirrors
      // the sibling-split path's subtreeFinalNode/stripFinalGap handling
      // below for the same reason.
      if (node.children.length === 0 && node.trailingGap.length > 0) {
        lower = { ...lower, trailingGap: [...lower.trailingGap, ...node.trailingGap] };
      }
      const upper: OutlineNode = {
        ...node,
        lines: upperLines,
        trailingGap: node.children.length === 0 ? [] : node.trailingGap,
        children: [lower, ...node.children],
      };
      const surgery = updateSiblings(doc, parentPath, (nodes) =>
        nodes.map((n, i) => (i === index ? upper : n)),
      );
      return finalize(doc, surgery, lower.id);
    }
  }

  if ((node.kind === 'paragraph' || node.kind === 'heading') && emptyRemainder) {
    // End-of-paragraph (or end-of-heading) split: no empty-paragraph encoding
    // exists, so widen the gap and put the cursor on a line that is
    // blank-separated on BOTH sides — typing there materializes the sibling
    // (or, for a heading, the first child) instead of rejoining a neighbor.
    const surgery = updateSiblings(doc, parentPath, (nodes) =>
      nodes.map((n, i) => (i === index ? { ...n, trailingGap: ['', '', ...n.trailingGap] } : n)),
    );
    const result = finalize(doc, surgery, nodeId);
    if (!result.ok) return result;
    return accept({
      ...result.value,
      anchor: { line: startLine + node.lines.length + 1, ch: 0 },
    });
  }

  let lower: OutlineNode;
  if (node.kind === 'list-item') {
    const match = LIST_MARKER_SPLIT_RE.exec(node.lines[0] ?? '')!;
    const markerPrefix = `${match[1]}${match[2]} `;
    const firstLine = emptyRemainder
      ? markerPrefix
      : `${markerPrefix}${remainderFirst.trimStart()}`;
    lower = makeNode({
      kind: 'list-item',
      ...(node.listStyle ? { listStyle: node.listStyle } : {}),
      lines: [firstLine, ...lowerRest],
    });
  } else {
    lower = makeNode({
      kind: 'paragraph',
      lines: [remainderFirst, ...lowerRest],
    });
  }

  // The gap that separated the node's SUBTREE from what follows moves to the
  // lower half — it is now what precedes the next sibling.
  let upper: OutlineNode = { ...node, lines: upperLines };
  const finalGap = subtreeFinalNode(upper).trailingGap;
  upper = stripFinalGap(upper);
  lower = { ...lower, trailingGap: [...finalGap] };

  const surgery = updateSiblings(doc, parentPath, (nodes) =>
    renumberOrdered([...nodes.slice(0, index), upper, lower, ...nodes.slice(index + 1)]),
  );
  return finalize(doc, surgery, lower.id);
}

// ---------------------------------------------------------- edit-enforcement
//
// The three operations node-edit-enforcement's verdict layer (src/enforce.ts)
// rewrites boundary-crossing user edits into (design.md D2). Same discipline
// as the ops above: total (accept or typed reject, never throw), closure
// (accepted results re-parse to themselves), minimal edits.

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

interface ResolvedGroup {
  readonly parentPath: NodePath;
  readonly lo: number;
  readonly hi: number;
}

/** Resolves `nodeIds` to one contiguous sibling run under one parent — the
 * shared validation `deleteSubtrees` and `deleteSubtreeGroups` both need.
 * `nodeIds` order doesn't matter; anything else (a missing id, siblings
 * under different parents, a gap in the run) is rejected, no partial
 * application. */
function resolveContiguousGroup(doc: OutlineDoc, nodeIds: readonly number[]): OpResult<ResolvedGroup> {
  if (nodeIds.length === 0) return reject('empty-selection');
  const paths: NodePath[] = [];
  for (const id of nodeIds) {
    const path = findPath(doc, id);
    if (!path) return reject('node-not-found');
    paths.push(path);
  }
  const parentPath = paths[0]!.slice(0, -1);
  if (!paths.every((p) => arraysEqual(p.slice(0, -1), parentPath))) {
    return reject('non-contiguous-subtrees');
  }
  const indices = paths.map((p) => p[p.length - 1]!).sort((a, b) => a - b);
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1]! + 1) return reject('non-contiguous-subtrees');
  }
  return accept({ parentPath, lo: indices[0]!, hi: indices[indices.length - 1]! });
}

/**
 * Subtree deletion (structural-operations delta): removes a contiguous run
 * of whole sibling subtrees, trailing gaps included — each removed node's
 * own `trailingGap` (and, for a subtree with children, its deepest last
 * descendant's) leaves with it, so the surviving neighbors' own lines and
 * gaps are untouched verbatim. `nodeIds` order doesn't matter; the set must
 * be exactly one contiguous run of siblings under one parent, or the whole
 * call is rejected (no partial application). The single-group case of
 * `deleteSubtreeGroups`.
 */
export function deleteSubtrees(doc: OutlineDoc, nodeIds: readonly number[]): OpResult<OpOutput> {
  return deleteSubtreeGroups(doc, [nodeIds]);
}

/**
 * Multi-group subtree deletion (`fix-orphan-gap-on-node-deletion` D2): the
 * general form `deleteSubtrees` delegates to — removes SEVERAL contiguous
 * sibling runs (each independently subject to `resolveContiguousGroup`'s own
 * contiguity rule) in one structural pass. Groups may sit under different
 * parents, or be non-adjacent runs under the SAME parent; either way, all
 * are resolved against the pristine `doc` and removed together, then
 * `finalize`d ONCE — a single before/after diff, never one diff per group
 * combined afterward. Combining independently-diffed single-group deletions
 * was tried and measured unsafe (2026-07-25, this change's own property
 * test): two such diffs can land on COINCIDENTALLY-OVERLAPPING regions when
 * the deleted text shares lines with content that survives elsewhere (two
 * code blocks with identical fence lines, for instance) — `diffLines`'s
 * prefix/suffix trim has no way to know which matching line is the "real"
 * boundary between two independently-computed diffs. One diff over the
 * true combined result has no such ambiguity.
 *
 * `groups[0]` MUST be the topmost group in document order — its own
 * before/after survivor becomes the op's ANCHOR, the one group whose
 * position is guaranteed unaffected by every OTHER (necessarily later)
 * group's removal. The PREFERENCE ORDER is unchanged by `caret-placement-policy`
 * — following sibling, then preceding, then ancestor — and it is still what
 * `enforce.ts` splices against rather than where the caret goes. What changed is
 * that each candidate must actually survive the combined removal: the naive
 * `survivorAfter` is exactly what an adjacent later group deletes, and the
 * anchor then pointed at line 0.
 */
export function deleteSubtreeGroups(
  doc: OutlineDoc,
  groups: readonly (readonly number[])[],
): OpResult<OpOutput> {
  if (groups.length === 0) return reject('empty-selection');
  const resolved: ResolvedGroup[] = [];
  for (const ids of groups) {
    const result = resolveContiguousGroup(doc, ids);
    if (!result.ok) return result;
    resolved.push(result.value);
  }

  // Same-parent groups must be removed in ONE filtering pass — a second
  // `updateSiblings` call at the same path would see indices already
  // shifted by the first.
  const byParent = new Map<string, { parentPath: NodePath; ranges: { lo: number; hi: number }[] }>();
  for (const g of resolved) {
    const key = g.parentPath.join('/');
    const entry = byParent.get(key) ?? { parentPath: g.parentPath, ranges: [] };
    entry.ranges.push({ lo: g.lo, hi: g.hi });
    byParent.set(key, entry);
  }

  let surgery = doc;
  for (const { parentPath, ranges } of byParent.values()) {
    surgery = updateSiblings(surgery, parentPath, (nodes) =>
      renumberOrdered(nodes.filter((_, i) => !ranges.some((r) => i >= r.lo && i <= r.hi))),
    );
  }

  // The anchor must name a node that SURVIVES the combined removal, which the
  // naive `firstSiblings[hi + 1]` does not: with two adjacent groups under one
  // parent, group 0's following sibling is exactly what a later group removes.
  // `startLineOf` then could not find it and silently reported line 0 — a
  // position pointing at whatever happens to be there, or into the preamble.
  // Asking `surgery` (the post-removal tree) is exact and needs no bookkeeping
  // of which ranges took what.
  const survives = (node: OutlineNode | undefined): boolean =>
    node !== undefined && findPath(surgery, node.id) !== undefined;

  const first = resolved[0]!;
  const firstSiblings = childrenAt(doc, first.parentPath);
  let subject: OutlineNode | undefined;
  for (let i = first.hi + 1; i < firstSiblings.length && !subject; i++) {
    if (survives(firstSiblings[i])) subject = firstSiblings[i];
  }
  for (let i = first.lo - 1; i >= 0 && !subject; i--) {
    if (survives(firstSiblings[i])) subject = firstSiblings[i];
  }
  // Then the nearest surviving ancestor — a group at a higher level can remove
  // the immediate parent too.
  for (let path = first.parentPath; path.length > 0 && !subject; path = path.slice(0, -1)) {
    const ancestor = nodeAt(doc, path);
    if (survives(ancestor)) subject = ancestor;
  }

  // `undefined` is the honest answer when nothing in scope survived: `finalize`
  // anchors at the scope's own start rather than inventing a node.
  return finalize(doc, surgery, subject?.id);
}

/**
 * The node immediately following `path` in full document order (preorder
 * traversal successor): descends into `path`'s own first child when it has
 * children (the raw-next-line owner — what Delete-at-end actually abuts),
 * else the next sibling, else walks up to the nearest ancestor with one.
 */
function rawSuccessorPath(doc: OutlineDoc, path: NodePath): NodePath | undefined {
  const node = nodeAt(doc, path)!;
  if (node.children.length > 0) return [...path, 0];
  let p: NodePath = path;
  while (p.length > 0) {
    const parentPath = p.slice(0, -1);
    const index = p[p.length - 1]!;
    const siblings = childrenAt(doc, parentPath);
    if (index + 1 < siblings.length) return [...parentPath, index + 1];
    p = parentPath;
  }
  return undefined;
}

/**
 * `second`'s content as bare text lines: first line stripped of any list
 * marker, continuation lines stripped of their leading whitespace — the
 * kind-free content the merge appends, re-clothed in `first`'s own encoding.
 */
function bareContentLines(node: OutlineNode): string[] {
  const first = node.lines[0] ?? '';
  const match = node.kind === 'list-item' ? LIST_MARKER_SPLIT_RE.exec(first) : null;
  const head = match ? first.slice(match[0].length) : first.trimStart();
  return [head, ...node.lines.slice(1).map((line) => line.trimStart())];
}

/**
 * Per-kind merge table (structural-operations delta, as amended 2026-07-21 —
 * pinned here): content kinds (paragraph/list-item) join ACROSS kinds, the
 * survivor keeping its own kind and marker, `second`'s content appended
 * directly at `first`'s content end and its children re-parented under the
 * merged node; a heading `first` absorbs single-line content only (a
 * markdown heading has no continuation lines); absorbing a heading, or an
 * atom on either side, rejects. `first`'s trailing gap is consumed
 * (chrome-transparency: the merge behaves as if the gap did not exist).
 */
export function mergeNodes(doc: OutlineDoc, firstId: number): OpResult<OpOutput> {
  const path = findPath(doc, firstId);
  if (!path) return reject('node-not-found');
  const first = nodeAt(doc, path)!;
  const nextPath = rawSuccessorPath(doc, path);
  if (!nextPath) return reject('no-following-neighbor');
  const second = nodeAt(doc, nextPath)!;

  if (isAtom(first) || isAtom(second)) return reject('merge-not-expressible');
  if (second.kind === 'heading') return reject('merge-not-expressible');

  const content = bareContentLines(second);
  let mergedLines: readonly string[];
  if (first.kind === 'heading') {
    if (content.length > 1) return reject('merge-not-expressible');
    // Append to the heading's TEXT line — for setext that's line 0 (the
    // underline's length is not significant to the parser), for ATX the
    // single line.
    const textIdx = first.setext ? 0 : first.lines.length - 1;
    mergedLines = first.lines.map((line, i) => (i === textIdx ? line + (content[0] ?? '') : line));
  } else {
    // Continuations re-clothe in first's own encoding: aligned to its
    // content column (list items) or its own indent (paragraphs).
    const contPad =
      first.kind === 'list-item'
        ? leadingWhitespace(first.lines[0] ?? '') + ' '.repeat(markerWidth(first))
        : leadingWhitespace(first.lines[0] ?? '');
    mergedLines = [
      ...first.lines.slice(0, -1),
      (first.lines[first.lines.length - 1] ?? '') + (content[0] ?? ''),
      ...content.slice(1).map((line) => contPad + line),
    ];
  }

  const firstParentPath = path.slice(0, -1);
  const firstIndex = path[path.length - 1]!;
  const secondParentPath = nextPath.slice(0, -1);
  const secondIndex = nextPath[nextPath.length - 1]!;
  const secondIsFirstChild =
    arraysEqual(secondParentPath, path) && secondIndex === 0;

  // second's children re-parent under the merged node: shift from second's
  // child column to first's, preserving internal structure; when second was
  // first's own first child they precede first's remaining children (they
  // take second's structural position), else first is childless (its raw
  // successor was reached by walking up or sideways) and they become its
  // only children. The shift is measured against each side's ACTUAL
  // existing child indentation (a real sibling child, when one survives to
  // sample) rather than the assumed marker-width formula — many documents
  // (tab-indented ones especially) indent children a full tab past their
  // marker rather than exactly `markerWidth` columns past it, and shifting
  // by the wrong delta leaves a fractional remainder that gets converted to
  // spaces mid-tab (see structural-operations' own note on this exact
  // failure mode for a flat numeric-width delta).
  const referenceChild = (node: OutlineNode, skipFirst: boolean): OutlineNode | undefined =>
    skipFirst ? node.children[1] : node.children[0];
  const actualChildCol = (node: OutlineNode | 'root', sample: OutlineNode | undefined): number =>
    sample ? indentWidth(sample.lines[0] ?? '') : childBaseCol(node);
  const childShift =
    actualChildCol(first, referenceChild(first, secondIsFirstChild)) -
    actualChildCol(second, referenceChild(second, false));
  const adopted = second.children.map((child) => shiftSubtree(child, childShift));

  // The merged node's trailing gap is normally `second`'s (the boundary that
  // survives is whatever followed the absorbed node — `first` and `second`
  // are now one node, so "the gap between them" is genuinely gone). For a
  // heading absorbing content, that reasoning breaks down: the gap AFTER a
  // heading is the heading's own established separation from its content, not
  // a property of whichever node happened to be first in line — losing it
  // makes whatever now follows (a re-parented sibling, or a later Enter split
  // back out) stick directly to the heading with no separator. Keep whichever
  // side has MORE blank lines: this preserves the heading's own gap when it
  // had one (the fix), while still preserving `second`'s gap when `second`
  // was the document's own terminal node and `first` had none (no regression
  // — `second`'s gap already wins in that case since it's the longer one).
  const trailingGap =
    first.kind === 'heading' && first.trailingGap.length > second.trailingGap.length
      ? first.trailingGap
      : second.trailingGap;

  const merged: OutlineNode = {
    ...first,
    lines: [...mergedLines],
    trailingGap,
    children: secondIsFirstChild
      ? [...adopted, ...first.children.slice(1)]
      : adopted,
  };

  let surgery: OutlineDoc;
  if (secondIsFirstChild) {
    surgery = updateSiblings(doc, firstParentPath, (nodes) =>
      nodes.map((n, i) => (i === firstIndex ? merged : n)),
    );
  } else if (arraysEqual(firstParentPath, secondParentPath)) {
    surgery = updateSiblings(doc, firstParentPath, (nodes) =>
      renumberOrdered([
        ...nodes.slice(0, firstIndex),
        merged,
        ...nodes.slice(firstIndex + 1, secondIndex),
        ...nodes.slice(secondIndex + 1),
      ]),
    );
  } else {
    // `second` sits at a different scope, reached by walking up past `first`
    // (which is childless in this branch — a node with children always has
    // its own first child as successor): remove `second` from its own level
    // first, then replace `first` in place at its own level.
    surgery = updateSiblings(doc, secondParentPath, (nodes) =>
      renumberOrdered([...nodes.slice(0, secondIndex), ...nodes.slice(secondIndex + 1)]),
    );
    surgery = updateSiblings(surgery, firstParentPath, (nodes) =>
      nodes.map((n, i) => (i === firstIndex ? merged : n)),
    );
  }

  const result = finalize(doc, surgery, merged.id);
  if (!result.ok) return result;
  // Anchor at the JOIN point, not the merged node's start (finalize's
  // generic convention, right for indent/outdent/split but not a merge):
  // the join line is `first`'s own last (or, for a setext heading, first)
  // line — still findable post-reparse since it's a fixed offset from the
  // already-correct start-of-node line `finalize` computed. This is one of
  // the interior landings `OpOutput.anchor` documents: its `ch` is meaningful
  // and the caret policy uses it verbatim rather than re-deriving a column.
  const joinLineOffset = first.kind === 'heading' && first.setext ? 0 : first.lines.length - 1;
  const joinLine = result.value.anchor.line + joinLineOffset;
  const joinCh = (first.lines[joinLineOffset] ?? '').length;
  return accept({ ...result.value, anchor: { line: joinLine, ch: joinCh } });
}

/**
 * Splices a parsed sequence of whole subtrees into the tree immediately
 * before/after `anchorId`, re-encoded (kind and indentation) for the
 * anchor's own sibling scope per the same mapping algebra `indent`/`outdent`
 * use. Rejects sequences inexpressible at that scope: a heading anywhere in
 * the sequence when the scope isn't root/heading-section level (headings
 * are positional/global — parse.ts never nests one under a list or
 * paragraph), or an atom when the scope is a paragraph's children (atoms
 * cannot nest under a paragraph, mirroring `indent`'s own rule).
 */
/**
 * Re-indents a whole subtree for a new destination by swapping its OWN
 * leading-whitespace PREFIX for `indentText` on every line, top to bottom —
 * preserving each descendant's ORIGINAL relative indent string beyond the
 * top node's own prefix verbatim, rather than adding a flat column delta.
 * Fixes a real bug `shiftSubtree`'s delta approach has for a pasted
 * subtree specifically (unlike indent/outdent's own single-level moves,
 * which keep using `reencodeForDestination`/`shiftSubtree` unchanged): a
 * numeric delta gets inserted as spaces regardless of the destination's own
 * unit, so a multi-level tab-indented subtree pasted somewhere landed with
 * descendants mixing the original tabs with newly-added spaces — same
 * WIDTH, wrong characters, and visibly inconsistent (design.md D15, third
 * manual pass finding). A string-prefix swap can't mismatch: whatever unit
 * the copied subtree's OWN internal nesting already used carries over
 * exactly, just re-rooted at the new depth.
 */
export function reindentSubtreeVerbatim(node: OutlineNode, indentText: string): OutlineNode {
  const topWs = leadingWhitespace(node.lines[0] ?? '');
  const swapLine = (line: string): string => {
    if (line.trim() === '') return line;
    const ws = leadingWhitespace(line);
    return ws.startsWith(topWs) ? indentText + line.slice(topWs.length) : line;
  };
  const recur = (n: OutlineNode): OutlineNode => ({
    ...n,
    lines: n.lines.map(swapLine),
    children: n.children.map(recur),
  });
  return recur(node);
}

/**
 * The shared re-encode step `insertSubtrees` and enforce.ts's own
 * no-surviving-anchor fallback (a paste replacing the only content in some
 * scope, D16) both need: given the destination scope's context (parent plus
 * whatever siblings will flank the inserted run — empty arrays when there
 * are none), re-encode each parsed block for that depth/kind, exactly once,
 * so the two call sites can never drift apart on the rule (the exact
 * failure D16 was: a second, ad hoc call site that forgot to re-indent at
 * all).
 */
export function reencodeBlocksForDestination(
  doc: OutlineDoc,
  parent: OutlineNode | 'root',
  precedingSiblings: readonly OutlineNode[],
  followingSiblings: readonly OutlineNode[],
  parsedBlocks: readonly OutlineNode[],
  fallbackIndentUnit?: string,
): readonly OutlineNode[] {
  const indentText = destinationIndent(doc, parent, precedingSiblings, fallbackIndentUnit);
  const newContentKind = encodingKindAtDestination({
    parentKind: parent === 'root' ? 'root' : parent.kind,
    precedingSiblings,
    followingSiblings,
  });
  return parsedBlocks.map((block) => {
    const isContentBlock = block.kind === 'paragraph' || block.kind === 'list-item';
    if (!isContentBlock || newContentKind === block.kind) {
      // No kind conversion needed: a verbatim whole-subtree re-indent keeps
      // every descendant's original indent unit intact (see
      // reindentSubtreeVerbatim's own comment for why this differs from
      // reencodeForDestination's numeric-delta approach here).
      return reindentSubtreeVerbatim(block, indentText);
    }
    return reencodeForDestination(block, newContentKind, indentText);
  });
}

export function insertSubtrees(
  doc: OutlineDoc,
  anchorId: number,
  parsedBlocks: readonly OutlineNode[],
  position: 'before' | 'after',
  fallbackIndentUnit?: string,
): OpResult<OpOutput> {
  if (parsedBlocks.length === 0) return reject('empty-selection');
  const anchorPath = findPath(doc, anchorId);
  if (!anchorPath) return reject('node-not-found');
  const parentPath = anchorPath.slice(0, -1);
  const anchorIndex = anchorPath[anchorPath.length - 1]!;
  const parent = parentPath.length === 0 ? 'root' : nodeAt(doc, parentPath)!;
  const siblings = childrenAt(doc, parentPath);

  const containsHeading = (node: OutlineNode): boolean =>
    node.kind === 'heading' || node.children.some(containsHeading);
  if (parsedBlocks.some(containsHeading) && parent !== 'root' && parent.kind !== 'heading') {
    return reject('insertion-not-expressible');
  }
  if (parsedBlocks.some((b) => isAtom(b)) && parent !== 'root' && parent.kind === 'paragraph') {
    return reject('insertion-not-expressible');
  }

  const insertIndex = position === 'before' ? anchorIndex : anchorIndex + 1;
  const precedingSiblings = siblings.slice(0, insertIndex);
  const followingSiblings = siblings.slice(insertIndex);
  const reencoded = reencodeBlocksForDestination(
    doc,
    parent,
    precedingSiblings,
    followingSiblings,
    parsedBlocks,
    fallbackIndentUnit,
  );

  // Gap ownership (design.md D2, mirroring splitNode's own gap-repair):
  // the anchor's trailing gap represents its separation from whatever
  // FOLLOWED it, which is only still true when inserting BEFORE it. When
  // inserting AFTER, that gap now belongs between the pasted run and
  // whatever followed — it moves onto the last inserted block, and the
  // anchor's own gap is stripped so it doesn't leave a spurious blank line
  // before the pasted content. Either way, the block that newly lands
  // adjacent to the anchor (the last one, for both directions) carries no
  // gap of its own — any gap the destination genuinely needs is added by
  // `normalizeBoundaries` in `finalize`, same as for a fresh adjacency.
  const anchor = siblings[anchorIndex]!;
  const lastIdx = reencoded.length - 1;
  let finalReencoded = reencoded;
  let finalAnchor = anchor;
  if (position === 'after') {
    const carriedGap = subtreeFinalNode(anchor).trailingGap;
    finalAnchor = stripFinalGap(anchor);
    finalReencoded = [
      ...reencoded.slice(0, lastIdx),
      setFinalGap(reencoded[lastIdx]!, carriedGap),
    ];
  } else {
    finalReencoded = [...reencoded.slice(0, lastIdx), stripFinalGap(reencoded[lastIdx]!)];
  }

  const surgery = updateSiblings(doc, parentPath, (nodes) => {
    const withAnchor = nodes.map((n, i) => (i === anchorIndex ? finalAnchor : n));
    return renumberOrdered([
      ...withAnchor.slice(0, insertIndex),
      ...finalReencoded,
      ...withAnchor.slice(insertIndex),
    ]);
  });
  return finalize(doc, surgery, finalReencoded[0]!.id);
}
