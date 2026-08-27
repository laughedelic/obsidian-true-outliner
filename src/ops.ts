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

import type { ListStyle, NodePath, OutlineDoc, OutlineNode } from './model';
import { childrenAt, findPath, isAtom, makeNode, nodeAt, updateSiblings } from './model';
import { forEachNodeWithLine, nodeAtLine, nodeStartLine } from './locate';
import { subtreeCoverOf, type Cover } from './escalate';
import { posBefore, type LinePos } from './line-pos';
import { encode, encodeLines } from './encode';
import { parse, indentWidth } from './parse';
import type { Edit, OpResult } from './result';
import { accept, diffLines, reject } from './result';
import { encodingKindAtDestination, listAttachesTo } from './rules';
import {
  childBaseCol,
  headingWithLevel,
  leadingWhitespace,
  markerWidth,
  reencodeForDestination,
  shiftBelowMarker,
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
  /**
   * The line range this operation's SUBJECTS and their subtrees occupy in the
   * result — from the first subject's own start line through the last
   * subject's whole-subtree cover end.
   *
   * Stated rather than derived because `finalize` re-parses: a caller holding
   * pre-operation ids cannot locate the moved nodes afterward. It is the
   * multi-node counterpart of `anchor` and does not replace it — the anchor
   * answers where a CARET would go, the span answers WHICH NODES the operation
   * acted on, which is what a block selection needs.
   *
   * Always an exact whole-subtree cover of the result tree, so a caller can
   * dispatch it as a selection with no further geometry
   * (`selection-structural-ops`).
   */
  readonly span: Cover;
}

/**
 * A tree edit before it is turned into a result: the new tree and which node
 * the operation acted on.
 *
 * Operations are split into a SURGERY and a `finalize` so the group forms can
 * compose the surgeries directly. Composing whole operations instead would
 * re-encode, diff and re-parse the document once per root — measured at 1.24 ms
 * per step on a 2000-line note, i.e. 12.45 ms for a ten-node run, past the
 * latency budget this path shares with enforcement. Composing surgeries pays
 * for one `finalize` however many roots there are.
 *
 * That this is EQUIVALENT to composing whole operations is not an assumption:
 * every operation guarantees closure (encoding its result re-parses to that
 * same tree), so the re-parse a whole-operation composition would perform
 * between steps is the identity. The property suite checks it against an oracle
 * that really does re-parse between steps.
 */
interface Surgery {
  readonly doc: OutlineDoc;
  readonly subjectId: number;
}

const isContent = (node: OutlineNode): boolean =>
  node.kind === 'paragraph' || node.kind === 'list-item';

/** Char offset where a line's content starts (after indent + marker). */
export function contentColumnCh(line: string): number {
  const match = /^[ \t]*(?:(?:[-+*]|\d{1,9}[.)])[ \t]+)?(?:#{1,6}[ \t]+)?/.exec(line);
  return match ? match[0].length : 0;
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
  /** Every subject, when the operation had more than one (the group forms).
   * Defaults to `subjectId` alone, which is what every single-node operation
   * means by it. */
  spanIds?: readonly number[],
): OpResult<OpOutput> {
  const normalized = normalizeBoundaries(surgery);
  const text = encode(normalized);
  const lines = text === '' ? [] : text.split('\n');
  // A subject that is not in `normalized` is a caller bug, not a position: it
  // used to degrade to line 0, which reads as a legitimate anchor and pointed
  // at whatever occupied that line (in a note with frontmatter, the preamble).
  // Degrade to the same scope start `subjectId === undefined` produces, so an
  // absent subject is never mistaken for a located one.
  const located = subjectId === undefined ? -1 : nodeStartLine(normalized, subjectId);
  const subjects = spanIds ?? (subjectId === undefined ? [] : [subjectId]);
  // The span describes the RESULT document, so it is computed against the
  // re-parsed tree rather than the surgery. The two can disagree: a re-parse
  // can re-attach a node the operation did not move (a list item landing after
  // a paragraph becomes its child), and the surgery's own view of a subject's
  // subtree is then not a cover of what the user actually gets.
  const parsed = parse(text);
  if (located === -1) {
    // No subject at all: the scope start. `preamble.length` is one PAST the
    // last line whenever the preamble has no trailing blank (frontmatter
    // written with no separator before the body), and `anchor` is a public
    // structural position, so a direct consumer would receive a coordinate
    // outside the document. Anchor at the end of what remains instead.
    const lastLine = Math.max(lines.length - 1, 0);
    const anchor = { line: lastLine, ch: (lines[lastLine] ?? '').length };
    return accept({
      doc: parsed,
      edits: diffLines(encodeLines(oldDoc), lines),
      anchor,
      span: subjectSpan(normalized, parsed, subjects, anchor),
    });
  }
  const anchor = { line: located, ch: contentColumnCh(lines[located] ?? '') };
  return accept({
    doc: parsed,
    edits: diffLines(encodeLines(oldDoc), lines),
    anchor,
    span: subjectSpan(normalized, parsed, subjects, anchor),
  });
}

/**
 * The cover spanning `ids` — first subject's start through the last subject's
 * whole-subtree cover end, in `doc`'s line space.
 *
 * One traversal collects every subject with its start line, rather than a
 * `nodeStartLine` per id, which was quadratic in the root count for exactly
 * the case this exists to serve: a cover with many roots.
 *
 * Subjects are sorted by start line rather than trusted in argument order,
 * because move down applies its roots in reverse and a caller may hand them
 * over in whatever order it composed them.
 */
function subjectSpan(
  surgery: OutlineDoc,
  parsed: OutlineDoc,
  ids: readonly number[],
  fallback: LinePos,
): Cover {
  if (ids.length === 0) return { start: fallback, end: fallback };
  // Subjects are located by LINE across the re-parse, the same way
  // `enforce.ts` locates a surviving neighbour: ids do not survive, and the two
  // trees share their text and therefore their line geometry.
  const wanted = new Set(ids);
  const lines: number[] = [];
  forEachNodeWithLine(surgery, (node, startLine) => {
    if (wanted.has(node.id)) lines.push(startLine);
  });
  if (lines.length === 0) return { start: fallback, end: fallback };

  // Several subjects can resolve to ONE node in the result — a re-parse can
  // make one of them a descendant of another — so the covers are unioned
  // rather than assumed disjoint.
  const covers = lines
    .map((line) => nodeAtLine(parsed, line))
    .filter((node): node is OutlineNode => node !== undefined)
    .map((node) => subtreeCoverOf(parsed, node));
  if (covers.length === 0) return { start: fallback, end: fallback };
  let span = covers[0]!;
  for (const cover of covers.slice(1)) {
    span = {
      start: posBefore(cover.start, span.start) ? cover.start : span.start,
      end: posBefore(span.end, cover.end) ? cover.end : span.end,
    };
  }
  return span;
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

function headingLevelSurgery(
  doc: OutlineDoc,
  path: readonly number[],
  node: OutlineNode,
  delta: number,
): OpResult<Surgery> {
  if (delta > 0 && maxHeadingLevel(node) >= 6) return reject('at-h6-bound');
  if (delta < 0 && (node.level ?? 1) <= 1) return reject('at-h1-bound');
  const surgery = updateSiblings(doc, path.slice(0, -1), (siblings) =>
    siblings.map((sibling, i) =>
      i === path[path.length - 1] ? shiftHeadingLevels(sibling, delta) : sibling,
    ),
  );
  return accept({ doc: surgery, subjectId: node.id });
}

// ------------------------------------------------------- separation repair

function subtreeFinalNode(node: OutlineNode): OutlineNode {
  const last = node.children[node.children.length - 1];
  return last ? subtreeFinalNode(last) : node;
}

function appendFinalGap(node: OutlineNode, line = ''): OutlineNode {
  const last = node.children[node.children.length - 1];
  if (!last) return { ...node, trailingGap: [...node.trailingGap, line] };
  return {
    ...node,
    children: [...node.children.slice(0, -1), appendFinalGap(last, line)],
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

const isOrderedItem = (n: OutlineNode): boolean =>
  n.kind === 'list-item' && n.listStyle?.type === 'ordered';

/** The maximal runs of consecutive ordered items, with where each begins. */
function orderedRuns(
  nodes: readonly OutlineNode[],
): { at: number; run: readonly OutlineNode[] }[] {
  const runs: { at: number; run: readonly OutlineNode[] }[] = [];
  let i = 0;
  while (i < nodes.length) {
    if (!isOrderedItem(nodes[i]!)) {
      i++;
      continue;
    }
    let end = i;
    while (end < nodes.length && isOrderedItem(nodes[end]!)) end++;
    runs.push({ at: i, run: nodes.slice(i, end) });
    i = end;
  }
  return runs;
}

/** A run's start number as the list itself carries it. */
const lowestNumber = (run: readonly OutlineNode[]): number =>
  Math.min(...run.map((n) => (n.listStyle as { number: number }).number));

/** Renumber each run consecutively from whatever `startOf` says it begins at. */
function renumberRuns(
  nodes: readonly OutlineNode[],
  startOf: (run: readonly OutlineNode[]) => number,
): readonly OutlineNode[] {
  const out = [...nodes];
  for (const { at, run } of orderedRuns(nodes)) {
    const startNumber = startOf(run);
    run.forEach((node, k) => {
      const number = startNumber + k;
      const style = node.listStyle as { type: 'ordered'; number: number; delimiter: '.' | ')' };
      if (style.number === number) return;
      const renumbered: OutlineNode = {
        ...node,
        listStyle: { ...style, number },
        lines: node.lines.map((line, li) =>
          li === 0 ? line.replace(ORDERED_MARKER_RE, `$1${number}$2`) : line,
        ),
      };
      // A renumbering that crosses a DIGIT BOUNDARY changes the marker's width,
      // which moves the item's content column without moving the line the
      // marker is on. Everything that column governs — continuation lines and
      // the whole subtree — moves with it, or the children stop reaching the
      // column and the re-parse hands them back as siblings.
      //
      // Measured off the two LINES, not off the two numbers: `listStyle.number`
      // is the parsed value with leading zeroes already discarded, so `09.` to
      // `10.` reads as a digit gained where the text width did not change at
      // all, and the subtree drifted a column deeper for an op that never
      // touched it.
      out[at + k] = shiftBelowMarker(renumbered, markerWidth(renumbered) - markerWidth(node));
    });
  }
  return out;
}

/**
 * Renumber the maximal runs of ordered items in a sibling list, reading each
 * run's start number off `before` — the same list as the operation found it.
 *
 * A run's start lives in the list, not in the run's own numbers. The start is
 * the start of the run that the resulting run's first member PRESENT IN
 * `before` belonged to, and that one rule answers every shape:
 *
 * - a REMOVAL can take the member that carried the start, so deleting the
 *   first two of `1. 2. 3.` must leave `1.`, not `3.`;
 * - an INSERTION can add a member that was never in this list — a node
 *   arriving from another level brings its old level's number, which must not
 *   become the destination run's start;
 * - a PERMUTATION can JOIN two runs by moving a non-ordered separator out from
 *   between them, and the joined run keeps the EARLIER run's start rather than
 *   the lower number of the run it swallowed.
 *
 * Reading the lowest number present instead is right only where every member
 * was already there and no two runs met — which is why one policy per shape
 * survived as long as it did, and why it was wrong at five call sites.
 *
 * "Present in `before`" rather than simply `run[0]`: a run can be headed by a
 * node that arrived from another level — a merge PREPENDS `second`'s own
 * children into the list it absorbed `second` from, an outdent's arrival lands
 * mid-list. Those carry their old level's numbers, so reading the start off one
 * of them falls back to the minimum and loses the run's start: `- p` / `5. a` /
 * (`10. kid`) / `6. b` produced `6. kid` / `7. b` instead of `5.` / `6.`.
 *
 * A run with NO member from `before` has no start to recover — an inserted
 * sequence landing where no run was — and keeps the lowest number its own
 * members carry. That fallback is deliberately the older policy, so a
 * mis-routed call degrades to what this file did before rather than to a third
 * rule.
 */
function renumberOrderedAgainst(
  before: readonly OutlineNode[],
  after: readonly OutlineNode[],
): readonly OutlineNode[] {
  const startByMember = new Map<number, number>();
  for (const { run } of orderedRuns(before)) {
    const start = lowestNumber(run);
    for (const node of run) startByMember.set(node.id, start);
  }
  return renumberRuns(after, (run) => {
    const known = run.find((node) => startByMember.has(node.id));
    return known ? startByMember.get(known.id)! : lowestNumber(run);
  });
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
  return reachContentColumn(
    chooseIndent(doc, parent, siblingsAtDestination, fallbackIndentUnit),
    parent,
  );
}

/**
 * Indentation that actually REACHES the destination parent's content column.
 *
 * Every source `chooseIndent` draws on — a sibling's whitespace, the
 * document's inferred unit, the caller's fallback — is evidence about WIDTH,
 * and none of it knows how wide the destination parent's own marker is.
 * Indenting `- b` under `1. a` (content column 3) with two spaces inferred
 * from elsewhere in the document emitted `  - b`, one column short: the
 * re-parse left the node a SIBLING of `1. a`, so the op reported success and
 * consumed an undo step while moving nothing structurally.
 *
 * The requirement's existing reasoning covers the other direction — an indent
 * too DEEP re-parents destination siblings under the new node — and this is
 * its mirror. Only a shortfall is repaired: an indent that already clears the
 * column keeps whatever the evidence chose (a tab stays a tab).
 *
 * A LIST ITEM only. Its content column is what the parse requires of a child,
 * so falling short of it is what un-nests the node. A paragraph's child list
 * attaches by ADJACENCY instead (`listAttachesTo`), and its column is free:
 * an indented paragraph can own a flush-left list, so `   Para.` owning `- x`
 * would clamp a new sibling of `- x` out to three columns and bury it
 * underneath `- x` rather than beside it. Measured — and `childBaseCol`'s
 * paragraph branch is the approximation it warns about, not a requirement.
 */
function reachContentColumn(indentText: string, parent: OutlineNode | 'root'): string {
  if (parent === 'root' || parent.kind !== 'list-item') return indentText;
  const shortfall = childBaseCol(parent) - indentWidth(indentText);
  // Spaces AFTER the chosen indentation, never before it: padding ahead of a
  // tab vanishes into the tab stop. `shiftLine` in reencode.ts makes the same
  // choice for the same reason.
  return shortfall > 0 ? indentText + ' '.repeat(shortfall) : indentText;
}

function chooseIndent(
  doc: OutlineDoc,
  parent: OutlineNode | 'root',
  siblingsAtDestination: readonly OutlineNode[],
  fallbackIndentUnit?: string,
): string {
  // A sibling at the destination, of ANY kind. Siblings share an indentation
  // level by construction, so their own whitespace is better evidence than an
  // inferred unit — and the inferred unit is what produced a measured
  // tree-shape bug: a new 2-space child landing beside a tab-indented atom
  // sibling left that atom DEEPER than the new node, which re-parsed it as the
  // new node's own child. The list-item preference is kept ahead of the general
  // case so nothing that already had a list-item donor changes.
  const sibling =
    siblingsAtDestination.find((n) => n.kind === 'list-item') ?? siblingsAtDestination[0];
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
  return fromSurgery(doc, indentSurgery(doc, nodeId, fallbackIndentUnit));
}

function indentSurgery(
  doc: OutlineDoc,
  nodeId: number,
  fallbackIndentUnit?: string,
): OpResult<Surgery> {
  const path = findPath(doc, nodeId);
  if (!path) return reject('node-not-found');
  const node = nodeAt(doc, path)!;

  if (node.kind === 'heading') return headingLevelSurgery(doc, path, node, +1);

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
    // Every sibling at the destination, not just those BEFORE the insertion
    // point: inserting ahead of a tab-indented sibling would otherwise take the
    // inferred unit and re-parent it, the same tree-shape defect the split path
    // had. Document order puts preceding siblings first, so the existing
    // preference is unchanged.
    destinationIndent(doc, target, target.children, fallbackIndentUnit),
  );

  let surgery = updateSiblings(doc, parentPath, (nodes) => {
    const rest = nodes.filter((_, i) => i !== index);
    // `nodes` is this level as the operation found it, and the node the run
    // keeps its start from may be the one leaving.
    return renumberOrderedAgainst(nodes, rest);
  });
  surgery = updateSiblings(surgery, [...parentPath, index - 1], (nodes) =>
    // The destination's own children, before `moved` joins them. `moved`
    // carries the number it had at the level it came from, which is not this
    // run's to inherit.
    renumberOrderedAgainst(nodes, [
      ...nodes.slice(0, insertIndex),
      moved,
      ...nodes.slice(insertIndex),
    ]),
  );
  return accept({ doc: surgery, subjectId: moved.id });
}

// ----------------------------------------------------------------- outdent

export function outdent(
  doc: OutlineDoc,
  nodeId: number,
  fallbackIndentUnit?: string,
): OpResult<OpOutput> {
  return fromSurgery(doc, outdentSurgery(doc, nodeId, fallbackIndentUnit));
}

function outdentSurgery(
  doc: OutlineDoc,
  nodeId: number,
  fallbackIndentUnit?: string,
): OpResult<Surgery> {
  const path = findPath(doc, nodeId);
  if (!path) return reject('node-not-found');
  const node = nodeAt(doc, path)!;

  if (node.kind === 'heading') return headingLevelSurgery(doc, path, node, -1);

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
    const ownChildren = moved.children;
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
    // The node's own children, before the adopted siblings join them: those
    // arrive from the level above carrying its numbers.
    moved = { ...moved, children: renumberOrderedAgainst(ownChildren, children) };
  }

  let surgery = updateSiblings(doc, parentPath, (nodes) =>
    // The former parent's children, before the node and everything after it is
    // cut away.
    renumberOrderedAgainst(nodes, nodes.slice(0, index)),
  );
  surgery = updateSiblings(surgery, grandPath, (nodes) =>
    // The grandparent's children, before `moved` lands among them. Untouched by
    // the departure above, which edited a different level.
    renumberOrderedAgainst(nodes, [
      ...nodes.slice(0, parentIndex + 1),
      moved,
      ...nodes.slice(parentIndex + 1),
    ]),
  );
  return accept({ doc: surgery, subjectId: moved.id });
}

// -------------------------------------------------------------- reordering

/**
 * Would this swap leave a list item where the parse will not keep it?
 *
 * At SECTION level — the children of the root, or of a heading — a list item
 * whose preceding sibling is a paragraph is read as that paragraph's CHILD.
 * The question here is `listAttachesTo`, the one `parse` itself asks, so the
 * two cannot drift apart. A reorder recomputes no node's encoding, which
 * leaves it no way to say "sibling" at that boundary: the markdown it emits
 * re-parses with the item a level deeper than the tree this surgery builds.
 *
 * Both relocated roots are asked, because a swap moves two subtrees. The
 * subject comes to rest at the far slot, and the sibling it displaces comes to
 * rest at the slot the subject left, behind whatever sits one further back —
 * so a move up can absorb a node the caller never selected.
 *
 * Inside a list item's own children the enclosing item owns the list stack, a
 * paragraph there adopts nothing, and this asks nothing.
 *
 * Expected to be DELETED rather than maintained. Whether a list following a
 * paragraph should be that paragraph's child at all is an open question — Q34
 * in docs/research/04-open-questions.md, explored in
 * docs/research/17-list-paragraph-mapping.md. Two of the four candidate
 * readings make a flush list after a paragraph an ordinary sibling, and under
 * either of them this branch is unreachable.
 */
function swapAbsorbsAListItem(doc: OutlineDoc, parentPath: NodePath, a: number): boolean {
  const parent = parentPath.length === 0 ? undefined : nodeAt(doc, parentPath);
  if (parent && parent.kind !== 'heading') return false;
  const siblings = childrenAt(doc, parentPath);
  const x = siblings[a]!;
  const y = siblings[a + 1]!;
  // The swap leaves `..., siblings[a - 1], y, x, ...`.
  return (
    (y.kind === 'list-item' && listAttachesTo(siblings[a - 1])) ||
    (x.kind === 'list-item' && listAttachesTo(y))
  );
}

function moveSurgery(doc: OutlineDoc, nodeId: number, delta: -1 | 1): OpResult<Surgery> {
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

  const a = Math.min(index, index + delta);
  if (swapAbsorbsAListItem(doc, parentPath, a)) return reject('reorder-not-expressible');

  const surgery = updateSiblings(doc, parentPath, (nodes) => {
    const out = [...nodes];
    // Separator gaps are positional, not node-owned: the gap that followed
    // slot a stays at slot a (else the final-newline gap migrates mid-doc).
    const gapA = subtreeFinalNode(out[a]!).trailingGap;
    const gapB = subtreeFinalNode(out[a + 1]!).trailingGap;
    [out[a], out[a + 1]] = [setFinalGap(out[a + 1]!, gapA), setFinalGap(out[a]!, gapB)];
    // `nodes` is the order before the swap. Every member is still present, but
    // a swap can move a non-ordered separator out from between two runs and
    // JOIN them, and the joined run keeps the earlier run's start.
    return renumberOrderedAgainst(nodes, out);
  });
  return accept({ doc: surgery, subjectId: node.id });
}

export const moveUp = (doc: OutlineDoc, nodeId: number): OpResult<OpOutput> =>
  fromSurgery(doc, moveSurgery(doc, nodeId, -1));
export const moveDown = (doc: OutlineDoc, nodeId: number): OpResult<OpOutput> =>
  fromSurgery(doc, moveSurgery(doc, nodeId, 1));

/** One surgery, finalized against the document it started from. */
function fromSurgery(doc: OutlineDoc, result: OpResult<Surgery>): OpResult<OpOutput> {
  return result.ok ? finalize(doc, result.value.doc, result.value.subjectId) : result;
}

// ----------------------------------------------------------- group forms

/**
 * The group form of a structural operation: apply the single-node surgery to
 * each covered root in turn, then finalize once.
 *
 * This IS the specified semantics rather than an implementation of them
 * (`selection-aware-structural-ops` D1) — the group result is defined as what
 * applying the single-node form to each root produces. Defining it that way
 * keeps the two-regime per-kind algebra in exactly one place: a run mixing a
 * paragraph and a heading needs no rule of its own, because each root already
 * has one.
 *
 * Rejection is ATOMIC. The first failing step returns immediately and no
 * surgery is kept, so a group never applies to a subset of its roots — the
 * user made one gesture over one selection, and a half-applied result is
 * neither what they asked for nor something they could undo by name.
 *
 * `reverse` is for move down alone. In document order its first root would swap
 * past the second — a member of its own operand — instead of past the run's own
 * neighbour.
 *
 * COST, knowingly accepted: one surgery per root, each with a linear `findPath`
 * and a sibling-spine rebuild, so this is Θ(k·n). Measured on a ~2000-line note
 * — k=10 2.3 ms, k=50 7.0 ms, k=200 15.4 ms — which is fine for the selections
 * real editing produces and past the 8 ms p95 for very large ones. Reuse of the
 * single-node algebra was preferred over a second, faster implementation of it.
 * `selection-aware-structural-ops` design D12 records what fixing it takes, the
 * two traps waiting there, and why the property suite makes it safe to try.
 */
function applyGroups(
  doc: OutlineDoc,
  groups: readonly (readonly number[])[],
  step: (current: OutlineDoc, nodeId: number) => OpResult<Surgery>,
  reverse = false,
): OpResult<OpOutput> {
  const ids = groups.flat();
  if (ids.length === 0) return reject('empty-selection');
  let surgery = doc;
  for (const id of reverse ? [...ids].reverse() : ids) {
    const result = step(surgery, id);
    if (!result.ok) return result;
    surgery = result.value.doc;
  }
  // Node ids survive a surgery — every re-encoding path rebuilds nodes by
  // spread — so the roots are still addressable here, and the anchor is the
  // first of them in document order.
  return finalize(doc, surgery, ids[0], ids);
}

/**
 * Reorders take a SINGLE contiguous sibling run (D8). Across several parents
 * each group would move within its own scope, which scatters the roots instead
 * of moving them: measured, every accepted multi-parent move up left its roots
 * separated by content that was never selected.
 *
 * Checked from the group count before any surgery runs, so the rejection costs
 * nothing and is a property of the operand rather than of the result.
 */
function rejectAcrossScopes(groups: readonly (readonly number[])[]): boolean {
  return groups.length > 1;
}

export function indentGroups(
  doc: OutlineDoc,
  groups: readonly (readonly number[])[],
  fallbackIndentUnit?: string,
): OpResult<OpOutput> {
  return applyGroups(doc, groups, (current, id) =>
    indentSurgery(current, id, fallbackIndentUnit),
  );
}

export function outdentGroups(
  doc: OutlineDoc,
  groups: readonly (readonly number[])[],
  fallbackIndentUnit?: string,
): OpResult<OpOutput> {
  return applyGroups(doc, groups, (current, id) =>
    outdentSurgery(current, id, fallbackIndentUnit),
  );
}

export function moveGroupsUp(
  doc: OutlineDoc,
  groups: readonly (readonly number[])[],
): OpResult<OpOutput> {
  if (rejectAcrossScopes(groups)) return reject('cannot-reorder-across-scopes');
  return applyGroups(doc, groups, (current, id) => moveSurgery(current, id, -1));
}

export function moveGroupsDown(
  doc: OutlineDoc,
  groups: readonly (readonly number[])[],
): OpResult<OpOutput> {
  if (rejectAcrossScopes(groups)) return reject('cannot-reorder-across-scopes');
  return applyGroups(doc, groups, (current, id) => moveSurgery(current, id, 1), true);
}

// ------------------------------------------------------------------- split

const LIST_MARKER_SPLIT_RE = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]*)/;

/** An unchecked task marker, and the shape that identifies one on a line. */
const TASK_MARKER_RE = /^\[[ xX]\][ \t]+/;
const EMPTY_TASK_MARKER = '[ ] ';

/**
 * `- ` (or `1. `, or `- [ ] `) for a new EMPTY item alongside `node` — the
 * item's own indentation and marker style, with a task marker carried over
 * UNCHECKED whatever the original's state.
 *
 * Carrying the task marker in BOTH directions is deliberate: an item created
 * above and one created below are the same "a new empty item next to this one",
 * and having Enter-at-start produce `- ` while Enter-at-end produces `- [ ] `
 * would be exactly the shape-dependence this change removes. It does NOT make
 * `[ ]` chrome anywhere else — the caret still reaches it, Home still lands
 * before it (design D5).
 */
function emptyItemPrefix(node: OutlineNode): string {
  const indent = LIST_MARKER_SPLIT_RE.exec(node.lines[0] ?? '')?.[1] ?? '';
  return `${indent}${itemMarkerText(node)}${itemTaskMarker(node)}`;
}

/**
 * `- ` or `1. ` — the marker a new item alongside `donor` takes, WITHOUT the
 * donor's own indentation, for a caller that computes its own (a new first
 * child, whose indentation comes from the destination rather than from the
 * donor's line). Also the width a continuation line pads to, which is why the
 * task marker is not part of it: `[ ]` is content, and a continuation of
 * `- [ ] text` aligns after `- `.
 */
function itemMarkerText(donor: OutlineNode | undefined): string {
  const match = LIST_MARKER_SPLIT_RE.exec(donor?.lines[0] ?? '');
  return match ? `${match[2]} ` : '- ';
}

/** `[ ] ` when a new item alongside `donor` carries a task marker, else ''. */
function itemTaskMarker(donor: OutlineNode | undefined): string {
  const first = donor?.lines[0] ?? '';
  const content = first.slice(LIST_MARKER_SPLIT_RE.exec(first)?.[0].length ?? 0);
  return TASK_MARKER_RE.test(content) ? EMPTY_TASK_MARKER : '';
}

/** The style a new item alongside `donor` takes; a bare bullet with no donor. */
function itemStyleFrom(donor: OutlineNode | undefined): ListStyle {
  return donor?.listStyle ?? { type: 'bullet', marker: '-' };
}

/**
 * The end of a line's full MARKER PREFIX: its indentation, its list marker, and
 * a task marker following that. Where the line's own content begins, for the
 * structural gestures that treat every marker on the line as chrome.
 *
 * `contentColumnCh` stops after `- `, which is right for the questions it
 * answers and wrong for these. A task item's `[ ] ` is not text a line break
 * divides or a join absorbs: in front of it, behind it, or in the middle of it
 * all mean the same thing about the item as a whole. Measured before this
 * existed, on `- [ ] bar`:
 *
 * - SPLIT at the position its text begins took the interior path. With a child
 *   below, that produced `- [ ] ` with `bar` demoted to a CHILD and its task
 *   marker dropped — the defect the 2026-08-07 amendment to "Node split" was
 *   written to remove, surviving where the amendment could not see because
 *   `contentColumnCh` does not count `[ ] `. Inside `[ ]` it divided the marker.
 * - The BACKSPACE gate (`recognizeMergeIntent`, enforce.ts) did not fire at all
 *   there, so the keypress fell through to an ordinary character deletion and
 *   left `- [ ]bar` — a broken checkbox rather than a join.
 *
 * These gestures only. `[ ]` stays content to the caret, to `contentColumnCh`'s
 * other callers, and to the selection ladder — the question
 * `enter-and-shift-enter-grammar` D5 holds out of scope stays out of it. A hard
 * continuation line still pads to the list marker alone (`itemMarkerText`),
 * which is markdown's own rule about what continues a list item and not this
 * question.
 */
export function markerPrefixCh(line: string): number {
  const afterMarker = contentColumnCh(line);
  const task = TASK_MARKER_RE.exec(line.slice(afterMarker));
  return afterMarker + (task?.[0].length ?? 0);
}

/**
 * Whether `ch` is a column at which this line's own content begins.
 *
 * A task item has TWO, and both are places a caret really sits: after `- `,
 * where Home lands, and after `- [ ] `, where the item's text begins. Every
 * other kind has one, so the pair collapses.
 *
 * One predicate because two gates must agree about it — `classify.ts` decides
 * that a marker-space deletion crosses a boundary, and `enforce.ts` decides what
 * that crossing means. If they disagreed the keypress would either fall through
 * to a native edit or reach the enforcement layer with nothing to do.
 */
export function isContentStartCh(line: string, ch: number): boolean {
  return ch === contentColumnCh(line) || ch === markerPrefixCh(line);
}

/**
 * The content-start outcome of `splitNode`: an empty node of the SAME KIND
 * immediately BEFORE `node`, which keeps its own lines, children and depth
 * verbatim. The node's own kind IS its sibling scope's kind, so no destination
 * lookup is needed here — unlike the end-of-node case, which places into the
 * CHILD scope whenever the node has children.
 *
 * A paragraph has no empty encoding, so its case widens the gap ABOVE instead
 * and anchors on a blank-separated line, exactly as the end-of-node case does
 * below it. `normalizeBoundaries` cannot add a third line there: every rule it
 * has bails out when the boundary already carries a gap, which this one now
 * does.
 */
function insertEmptyBefore(
  doc: OutlineDoc,
  path: NodePath,
  node: OutlineNode,
): OpResult<OpOutput> {
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;

  if (node.kind === 'list-item' || node.kind === 'heading') {
    const empty =
      node.kind === 'list-item'
        ? makeNode({
            kind: 'list-item',
            ...(node.listStyle ? { listStyle: node.listStyle } : {}),
            lines: [emptyItemPrefix(node)],
          })
        : // ATX whatever the original's form: an empty setext heading has no
          // encoding at all (design D3).
          makeNode({
            kind: 'heading',
            level: node.level ?? 1,
            // The trailing space is what makes this an empty heading rather
            // than a bare marker: `contentColumnCh` reads the content start
            // from `#{1,6}[ \t]+`, so without it the anchor lands at column 0,
            // before the marker, instead of where a title would be typed.
            lines: [`${'#'.repeat(node.level ?? 1)} `],
          });
    const surgery = updateSiblings(doc, parentPath, (nodes) =>
      renumberOrderedAgainst(nodes, [...nodes.slice(0, index), empty, ...nodes.slice(index)]),
    );
    return finalize(doc, surgery, empty.id);
  }

  // Paragraph: widen the gap above by two and anchor on the first of them.
  // Which node OWNS that gap depends on where this one sits — a preceding
  // sibling's own trailing gap, the parent's (when this is a first child), or
  // the document preamble (when it is the first node of all).
  //
  // The position's own line — the FIRST of the two — carries this node's own
  // indentation, since a position above is a SIBLING position and siblings share
  // a level. Same reason as the end-of-node branch below: at column 0 a position
  // whose scope lies inside a list item materializes outside it. Empty for a
  // top-level node, so nothing changes there.
  const positionIndent = leadingWhitespace(node.lines[0] ?? '');
  let surgery: OutlineDoc;
  if (index > 0) {
    surgery = updateSiblings(doc, parentPath, (nodes) =>
      nodes.map((n, i) => (i === index - 1 ? appendFinalGap(appendFinalGap(n, positionIndent)) : n)),
    );
  } else if (parentPath.length > 0) {
    const parentIndex = parentPath[parentPath.length - 1]!;
    surgery = updateSiblings(doc, parentPath.slice(0, -1), (nodes) =>
      nodes.map((n, i) =>
        i === parentIndex ? { ...n, trailingGap: [...n.trailingGap, positionIndent, ''] } : n,
      ),
    );
  } else {
    surgery = { ...doc, preamble: [...doc.preamble, positionIndent, ''] };
  }
  const result = finalize(doc, surgery, node.id);
  if (!result.ok) return result;
  // `finalize` anchored on the node itself, whose start line has moved down by
  // exactly the two lines inserted directly above it.
  return accept({
    ...result.value,
    anchor: { line: result.value.anchor.line - 2, ch: positionIndent.length },
  });
}

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

  const startLine = nodeStartLine(doc, nodeId);
  const lineIndex = position.line - startLine;
  if (lineIndex < 0 || lineIndex >= node.lines.length) return reject('cannot-split');
  // A setext heading's second line is its underline, not text — no split point.
  if (node.kind === 'heading' && node.setext && lineIndex !== 0) return reject('cannot-split');
  const line = node.lines[lineIndex]!;
  const contentStart = markerPrefixCh(line);
  // Never split inside indentation or a marker.
  const ch = Math.min(Math.max(position.ch, contentStart), line.length);

  // CONTENT START: insert before, divide nothing (structural-operations' "Node
  // split", 2026-08-07 amendment). The clamp above is what makes a caret inside
  // a marker reach this test as a content-start position, so the marker-interior
  // case needs no rule of its own.
  if (lineIndex === 0 && ch === contentStart) {
    return insertEmptyBefore(doc, path, node);
  }

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
  // A split at (or before the content of) a CONTINUATION line leaves the upper
  // half with a blank last line, which is not a line of the node at all: it
  // re-parses as a gap. Splitting the line a Shift+Enter had just created
  // therefore left an extra blank between the node and what followed, where
  // pressing Enter from the original position produced none. Drop any such
  // trailing line — never the setext underline, which is chrome and never
  // blank, and never the node's only line.
  if (!isSetextHeading) {
    while (upperLines.length > 1 && (upperLines[upperLines.length - 1] ?? '').trim() === '') {
      upperLines.pop();
    }
  }
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
    // whose child scope demands a paragraph can't materialize a first child.
    // It falls to the gap-widening branch below — NOT to the sibling path,
    // which placed the new position after the entire subtree (the shape this
    // amendment exists to prevent, and the one the fall-through left open for
    // any node whose first child is an indented paragraph).
    if (!(emptyRemainder && childKind === 'paragraph')) {
      const indentText = destinationIndent(doc, node, node.children, fallbackIndentUnit);
      let lower: OutlineNode;
      if (childKind === 'list-item') {
        // The new FIRST CHILD joins a list that is already there — the kind
        // came from a donor among the existing children, so the MARKER must
        // come from the same donor rather than being a fresh bullet. Inventing
        // `- ` above an ordered run turned `1. 2. 3.` into a bullet followed by
        // the run, which is the shape-dependence the empty-position rule exists
        // to remove: the same key produced `1. ` beside the item and `- ` above
        // it. The ordered numbers are settled by the renumbering below.
        const donor = node.children.find((child) => child.kind === 'list-item');
        const marker = itemMarkerText(donor);
        const prefix = `${indentText}${marker}${itemTaskMarker(donor)}`;
        const firstLine = emptyRemainder ? prefix : `${prefix}${remainderFirst.trimStart()}`;
        const contPad = `${indentText}${' '.repeat(marker.length)}`;
        lower = makeNode({
          kind: 'list-item',
          listStyle: itemStyleFrom(donor),
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
      // A heading and a paragraph child it did not have before are separated by
      // a blank line — required by CONVENTION, not by the parse (`# Head` then
      // `line` re-parses correctly either way).
      //
      // Applied HERE, where the boundary is created, and deliberately not in
      // `normalizeBoundaries`: that runs on every operation's result, and a
      // heading with a gap-0 paragraph child is ordinary parsed markdown, so a
      // global rule would rewrite heading boundaries the user wrote anywhere in
      // the file on any unrelated edit. The list-item version of the same rule
      // IS global and IS safe, because without the blank line its indented text
      // is a continuation line and there is no child at all.
      const ownGap = node.children.length === 0 ? [] : node.trailingGap;
      const separateFromHeading =
        node.kind === 'heading' && childKind === 'paragraph' && ownGap.length === 0;
      const upper: OutlineNode = {
        ...node,
        lines: upperLines,
        trailingGap: separateFromHeading ? [''] : ownGap,
        // The existing children hold the run's start; the new first child takes
        // it and pushes the rest down.
        children: renumberOrderedAgainst(node.children, [lower, ...node.children]),
      };
      const surgery = updateSiblings(doc, parentPath, (nodes) =>
        nodes.map((n, i) => (i === index ? upper : n)),
      );
      return finalize(doc, surgery, lower.id);
    }
  }

  if (emptyRemainder && (node.kind !== 'list-item' || node.children.length > 0)) {
    // END of a node whose destination scope's kind has no empty encoding: no
    // empty-paragraph encoding exists, so widen the gap and put the cursor on
    // a line that is blank-separated on BOTH sides — typing there materializes
    // the node instead of rejoining a neighbor.
    //
    // ONE gap serves both scopes, which is why this branch needs no split of
    // its own: for a childless node its trailing gap is what separates it from
    // its next SIBLING, and for a node with children the same gap separates it
    // from its first CHILD. Either way the position lands content-adjacent,
    // directly below the node's own last line.
    //
    // The condition reads as "everything except a childless list item" because
    // that is the only end-of-node case whose destination kind IS encodable
    // empty (`- `), and it is handled by the sibling path below.
    //
    // The position's own line carries the DESTINATION's indentation, not column
    // 0. Without it a position whose scope lies inside a list item materializes
    // outside it: a column-0 line after an item starts a new top-level block, so
    // typing there placed the node at the top level AND left the item's existing
    // children following a top-level sibling instead of the item — the subtree
    // flattened. Measured, not theorised: `- item` with a paragraph child, Enter
    // at its end, then one character.
    //
    // Which scope, by the same split this branch's own comment already makes:
    // the child scope for a node with children (and for a heading, which always
    // takes the child branch above and falls through to here only when its child
    // scope is a paragraph); the node's own level otherwise. At the top level and
    // under a heading the required indentation is '' and the output is
    // byte-identical to what this branch produced before.
    //
    // Only the position's own line is indented. The blank lines around it are
    // SEPARATION — they are what makes the position blank-separated on both
    // sides — and whitespace on them would be invisible debris with no reader.
    const positionIndent =
      node.children.length > 0 || node.kind === 'heading'
        ? destinationIndent(doc, node, node.children, fallbackIndentUnit)
        : leadingWhitespace(node.lines[0] ?? '');
    const surgery = updateSiblings(doc, parentPath, (nodes) =>
      nodes.map((n, i) =>
        i === index ? { ...n, trailingGap: ['', positionIndent, ...n.trailingGap] } : n,
      ),
    );
    const result = finalize(doc, surgery, nodeId);
    if (!result.ok) return result;
    return accept({
      ...result.value,
      anchor: { line: startLine + node.lines.length + 1, ch: positionIndent.length },
    });
  }

  let lower: OutlineNode;
  if (node.kind === 'list-item') {
    // Task-aware: a new SIBLING of a task item is itself a task, unchecked.
    // The child-scope path above deliberately does not do this — a child is a
    // different scope with its own encoding rule, and it already ignores the
    // parent's marker style entirely.
    const markerPrefix = emptyItemPrefix(node);
    const firstLine = emptyRemainder
      ? markerPrefix
      : `${markerPrefix}${remainderFirst.trimStart()}`;
    lower = makeNode({
      kind: 'list-item',
      ...(node.listStyle ? { listStyle: node.listStyle } : {}),
      lines: [firstLine, ...lowerRest],
    });
  } else {
    // `trimStart` here is what makes the whitespace rule uniform: the child
    // path above and the list-item path beside it already dropped the run at
    // the split point, and a paragraph keeping it left an invisible leading
    // space with the cursor behind it. Only the FIRST line is trimmed — a
    // continuation line's own indentation is content of the paragraph.
    lower = makeNode({
      kind: 'paragraph',
      lines: [remainderFirst.trimStart(), ...lowerRest],
    });
  }

  // The gap that separated the node's SUBTREE from what follows moves to the
  // lower half — it is now what precedes the next sibling.
  let upper: OutlineNode = { ...node, lines: upperLines };
  const finalGap = subtreeFinalNode(upper).trailingGap;
  upper = stripFinalGap(upper);
  lower = { ...lower, trailingGap: [...finalGap] };

  const surgery = updateSiblings(doc, parentPath, (nodes) =>
    renumberOrderedAgainst(nodes, [
      ...nodes.slice(0, index),
      upper,
      lower,
      ...nodes.slice(index + 1),
    ]),
  );
  return finalize(doc, surgery, lower.id);
}

/**
 * True when a list item carries no content of its own — the shape the keyboard
 * grammar's empty-item ladder acts on.
 *
 * An unchecked OR checked task marker alone counts as empty. That is a
 * deliberate carve-out and not a claim that `[ ]` is chrome: this grammar's own
 * continuation rule writes that marker when it creates an item, so requiring
 * the user to delete it before the ladder works would punish them for our
 * output. Nothing else in the codebase reads task-ness (design D5).
 */
export function itemContentIsEmpty(node: OutlineNode): boolean {
  if (node.kind !== 'list-item' || node.lines.length !== 1) return false;
  const line = node.lines[0] ?? '';
  const content = line.slice(contentColumnCh(line)).trim();
  // UNCHECKED only. A checked box is something the user ticked — content, not
  // the marker this grammar's own continuation rule writes — so an empty
  // COMPLETED task must not be silently outdented away by the ladder.
  return content === '' || content === '[ ]';
}

/**
 * Removes an empty list item's marker, leaving the position it occupied
 * available to ordinary prose (`structural-operations`' "List item unwrap").
 *
 * The result is a POSITION, not a node: an empty paragraph has no markdown
 * encoding, so the item's line becomes a blank line owned as a gap by whatever
 * precedes it, and the node count drops by one. Typing at the anchor produces a
 * paragraph distinct from both neighbours — a column-0 line after a list item
 * already starts a new block, so no extra separation is needed for that side.
 *
 * Exists for the one place the grammar must LEAVE a list rather than restructure
 * it: an empty item that cannot outdent, at the top level or directly under a
 * heading where markdown has no sibling spot for it.
 */
export function unwrapListItem(doc: OutlineDoc, nodeId: number): OpResult<OpOutput> {
  const path = findPath(doc, nodeId);
  if (!path) return reject('node-not-found');
  const node = nodeAt(doc, path)!;
  if (node.children.length > 0) return reject('would-orphan-children');
  if (!itemContentIsEmpty(node)) return reject('cannot-unwrap');

  // Captured before the surgery: everything above this line is untouched, so
  // the blank line that replaces the item sits exactly where the item was.
  const anchorLine = nodeStartLine(doc, nodeId);
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  // One blank line in the item's place, plus whatever gap the item itself owned.
  const replacement = ['', ...node.trailingGap];

  const withoutNode = updateSiblings(doc, parentPath, (nodes) =>
    renumberOrderedAgainst(nodes, nodes.filter((_, i) => i !== index)),
  );
  let surgery: OutlineDoc;
  if (index > 0) {
    surgery = updateSiblings(withoutNode, parentPath, (nodes) =>
      nodes.map((n, i) =>
        i === index - 1 ? setFinalGap(n, [...subtreeFinalNode(n).trailingGap, ...replacement]) : n,
      ),
    );
  } else if (parentPath.length > 0) {
    const parentIndex = parentPath[parentPath.length - 1]!;
    surgery = updateSiblings(withoutNode, parentPath.slice(0, -1), (nodes) =>
      nodes.map((n, i) =>
        i === parentIndex ? { ...n, trailingGap: [...n.trailingGap, ...replacement] } : n,
      ),
    );
  } else {
    surgery = { ...withoutNode, preamble: [...withoutNode.preamble, ...replacement] };
  }

  // The subject is gone, so `finalize`'s own anchor is meaningless here and is
  // replaced — the same shape the end-of-node split uses for its gap position.
  const result = finalize(doc, surgery, undefined);
  if (!result.ok) return result;
  return accept({ ...result.value, anchor: { line: anchorLine, ch: 0 } });
}

/**
 * Inserts a heading at the SAME LEVEL as an existing one, directly after it,
 * carrying `remainder` as its title — the operation behind Shift+Enter on a
 * heading, and the only path by which a heading gains a sibling from a
 * keystroke (`structural-operations`' "Sibling heading creation").
 *
 * `remainder` is the text after the cursor, so the original's title is
 * truncated by exactly its length. The original's CHILDREN stay with it:
 * heading scope is positional, so content already under it belongs to it, and
 * `encode` therefore writes the new sibling after that content rather than
 * between the heading and its own section.
 */
export function insertSiblingHeading(
  doc: OutlineDoc,
  nodeId: number,
  remainder: string,
): OpResult<OpOutput> {
  const path = findPath(doc, nodeId);
  if (!path) return reject('node-not-found');
  const node = nodeAt(doc, path)!;
  if (node.kind !== 'heading') return reject('cannot-split');

  const level = node.level ?? 1;
  const marker = '#'.repeat(level);
  // ATX whatever the original's form: an empty setext heading has no encoding
  // at all, so a setext original cannot yield a setext sibling in the common
  // case, and one rule beats two that differ by the author's underline (D3).
  const title = remainder.trimStart();
  const sibling = makeNode({
    kind: 'heading',
    level,
    lines: [title === '' ? `${marker} ` : `${marker} ${title}`],
  });

  const titleLine = node.lines[0] ?? '';
  const upperLines = [
    titleLine.slice(0, Math.max(0, titleLine.length - remainder.length)),
    ...node.lines.slice(1),
  ];
  // The gap that separated this heading's SUBTREE from what follows now
  // precedes the next sibling instead — the same handover the sibling split
  // does, for the same reason.
  let upper: OutlineNode = { ...node, lines: upperLines };
  const finalGap = subtreeFinalNode(upper).trailingGap;
  upper = stripFinalGap(upper);
  const lower = { ...sibling, trailingGap: [...finalGap] };

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const surgery = updateSiblings(doc, parentPath, (nodes) => [
    ...nodes.slice(0, index),
    upper,
    lower,
    ...nodes.slice(index + 1),
  ]);
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
      // `nodes` is this parent's list as it entered the ONE filtering pass, so
      // it is the pre-removal list for every range at once — not per range.
      renumberOrderedAgainst(
        nodes,
        nodes.filter((_, i) => !ranges.some((r) => i >= r.lo && i <= r.hi)),
      ),
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
 * `second`'s content as bare text lines: first line stripped of its list marker
 * and any task marker, continuation lines stripped of their leading whitespace — the
 * kind-free content the merge appends, re-clothed in `first`'s own encoding.
 *
 * A TASK marker goes with the list marker it follows. It states something about
 * the item being absorbed, and that item is about to stop existing; carrying it
 * into the survivor's text made `- [x] foo` + `- [ ] bar` read `- [x] foo[ ] bar`
 * — a literal `[ ]` in the middle of a line, which is neither a checkbox nor
 * anything the user typed. The survivor keeps its OWN marker, task marker
 * included, exactly as it keeps its own kind.
 */
function bareContentLines(node: OutlineNode): string[] {
  const first = node.lines[0] ?? '';
  // `LIST_MARKER_SPLIT_RE`, not `markerPrefixCh`: that one is built on
  // `contentColumnCh`, which also swallows an ATX prefix (`- # title` would
  // lose its `#`) and requires whitespace after the marker (a bare `-` would
  // keep it). Neither is right for stripping an absorbed item's own encoding.
  const match = node.kind === 'list-item' ? LIST_MARKER_SPLIT_RE.exec(first) : null;
  const afterMarker = match ? first.slice(match[0].length) : first.trimStart();
  const task = match ? TASK_MARKER_RE.exec(afterMarker) : null;
  const head = task ? afterMarker.slice(task[0].length) : afterMarker;
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
    // Absorbing `first`'s own first child REMOVES it from that child list, so
    // an ordered run among the children loses its head and must renumber from
    // the start it had BEFORE the absorption. `adopted` are `second`'s own
    // children arriving from another level, so they are not in `before` and
    // take the fallback.
    children: secondIsFirstChild
      ? renumberOrderedAgainst(first.children, [...adopted, ...first.children.slice(1)])
      : adopted,
  };

  let surgery: OutlineDoc;
  if (secondIsFirstChild) {
    surgery = updateSiblings(doc, firstParentPath, (nodes) =>
      nodes.map((n, i) => (i === firstIndex ? merged : n)),
    );
  } else if (arraysEqual(firstParentPath, secondParentPath)) {
    // A REMOVAL as well as a replacement: `second` and anything between it and
    // `first` leave this level. Keeping `first`'s index does NOT keep the run's
    // head — `merged` keeps `first`'s id, so the lookup finds the run `first`
    // was in, which is what a joined-across-a-separator run must resume from.
    surgery = updateSiblings(doc, firstParentPath, (nodes) =>
      renumberOrderedAgainst(nodes, [
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
    //
    // `second` always has a PREDECESSOR at its own level, but that predecessor
    // need not be part of its run — `- p` / `1. a` / `2. b` merges the nested
    // `- kid` with `1. a`, whose predecessor is the bullet — so this removes a
    // run head like any other.
    surgery = updateSiblings(doc, secondParentPath, (nodes) =>
      renumberOrderedAgainst(nodes, [
        ...nodes.slice(0, secondIndex),
        ...nodes.slice(secondIndex + 1),
      ]),
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
  // Both sides, for the reason `encodingKindAtDestination` below already uses
  // both: a payload landing BEFORE a tab-indented sibling has no preceding one
  // to copy from, and the inferred unit can leave that sibling deeper than the
  // block now above it — which re-parses it as that block's child.
  const indentText = destinationIndent(
    doc,
    parent,
    [...precedingSiblings, ...followingSiblings],
    fallbackIndentUnit,
  );
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
    // `nodes` is the destination list before the paste. The pasted blocks come
    // from parsed markdown with numbering of their own, which does not become
    // the start of a run that was already here.
    return renumberOrderedAgainst(nodes, [
      ...withAnchor.slice(0, insertIndex),
      ...finalReencoded,
      ...withAnchor.slice(insertIndex),
    ]);
  });
  return finalize(doc, surgery, finalReencoded[0]!.id);
}
