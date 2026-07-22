/**
 * The verdict layer (design.md D1/D3/D4/D5): a pure function mapping
 * `(class, edit facts, tree)` to `pass` | `rewrite` | `veto` for a single
 * user edit transaction. Evaluated only for `boundary-crossing-edit` — every
 * other class always passes, defensively enforced here too (not just by the
 * caller only invoking this for that one class), matching the
 * node-edit-enforcement spec's "never receive a verdict" guarantee.
 *
 * No CodeMirror imports: the CM6 adapter (src/plugin/transaction-filter.ts)
 * extracts one `EditFact` per transaction (LinePos-based, old-document
 * coordinates) and translates the returned `Verdict` into CM6 specs.
 */

import type { OutlineDoc, OutlineNode } from './model';
import { findPath, nodeAt } from './model';
import { nodeAtLine } from './locate';
import { escalateRange, type LinePos, type LineRange } from './escalate';
import { parse } from './parse';
import { encode, encodeLines } from './encode';
import {
  contentColumnCh,
  deleteSubtrees,
  finalize,
  insertSubtrees,
  mergeNodes,
  reencodeBlocksForDestination,
  type OpOutput,
} from './ops';
import type { Edit, OpResult, RejectionReason } from './result';
import { diffLines } from './result';
import { isStructuralBlockSequence, type TransactionClass } from './classify';

/** One change, in the OLD document's line/ch coordinates (`escalate.ts`'s
 * `LinePos`). `from === to` is a pure insertion; `insert === ''` is a pure
 * deletion. Transactions with more than one change range are not modeled
 * here — the caller passes `undefined` and gets `pass` (D1's conservative
 * bias: this phase enforces the single-range shapes the spec scenarios
 * describe, not multi-cursor edits). */
export interface EditFact {
  readonly from: LinePos;
  readonly to: LinePos;
  readonly insert: string;
  /**
   * The PRE-edit main-selection head — the chrome-transparency amendment's
   * disambiguator (D10): Backspace at a node's content start and Delete at
   * the end of the gap line above it produce byte-identical transactions;
   * only the cursor tells merge intent from deliberate gap editing.
   * Optional: when absent, only the zero-gap both-sides-content shape is
   * recognized as a merge (the pre-amendment behavior — conservative).
   */
  readonly cursorBefore?: LinePos;
}

export interface RewriteVerdict {
  readonly kind: 'rewrite';
  readonly edits: readonly Edit[];
  readonly cursor: { readonly line: number; readonly ch: number };
  readonly userEvent: string;
}

export type Verdict =
  | { readonly kind: 'pass' }
  | RewriteVerdict
  | { readonly kind: 'veto'; readonly reason: RejectionReason };

const PASS: Verdict = { kind: 'pass' };

function rewriteFrom(result: OpOutput, userEvent: string): Verdict {
  return { kind: 'rewrite', edits: result.edits, cursor: result.cursor, userEvent };
}

function vetoFrom(result: OpResult<OpOutput>): Verdict {
  if (result.ok) throw new Error('vetoFrom called with an accepted result');
  return { kind: 'veto', reason: result.rejection.reason };
}

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
  return found;
}

function childrenAtScope(doc: OutlineDoc, scopePath: readonly number[]): readonly OutlineNode[] {
  let list: readonly OutlineNode[] = doc.children;
  for (const index of scopePath) list = list[index]!.children;
  return list;
}

/** Sibling ids spanning `startNode`..`endNode` (inclusive) at their deepest
 * common scope — escalate.ts's own scope resolution, INCLUDING its
 * one-node-is-the-other's-ancestor case: when one path is a prefix of the
 * other (a heading and a node inside its own section — the single-subtree
 * selection shape), the scope is one level ABOVE the shallower node, and
 * both endpoints resolve to that node's own sibling index. Without that
 * fallback `startPath[k]` is undefined here and the cover silently came
 * back empty — a selected heading+subtree "deleted" to a no-op veto. */
function siblingCoverIds(doc: OutlineDoc, startNode: OutlineNode, endNode: OutlineNode): readonly number[] {
  if (startNode.id === endNode.id) return [startNode.id];
  const startPath = findPath(doc, startNode.id)!;
  const endPath = findPath(doc, endNode.id)!;
  let k = 0;
  while (k < startPath.length && k < endPath.length && startPath[k] === endPath[k]) k++;
  const scopeLen = k < startPath.length && k < endPath.length ? k : k - 1;
  const scopeChildren = childrenAtScope(doc, startPath.slice(0, scopeLen));
  const loIndex = Math.min(startPath[scopeLen]!, endPath[scopeLen]!);
  const hiIndex = Math.max(startPath[scopeLen]!, endPath[scopeLen]!);
  return scopeChildren.slice(loIndex, hiIndex + 1).map((n) => n.id);
}

/** The deletion's OLD-document range removes NOTHING but the single line
 * break ending `from.line` — i.e. `from` sits at that line's own end and
 * `to` at the very start of the next. Distinct from "ends at a line start"
 * in general: a whole-line-or-more deletion (e.g. removing an entire node)
 * can ALSO end at ch 0 of a later line without this being true. */
function isPureNewlineDeletion(doc: OutlineDoc, edit: EditFact): boolean {
  if (edit.insert !== '') return false;
  if (edit.to.line !== edit.from.line + 1 || edit.to.ch !== 0) return false;
  const lineLen = (encodeLines(doc)[edit.from.line] ?? '').length;
  return edit.from.ch === lineLen;
}

function posEq(a: LinePos | undefined, b: LinePos): boolean {
  return a !== undefined && a.line === b.line && a.ch === b.ch;
}

/** The node whose content ends nearest above `path`'s node — the previous
 * sibling's deepest last descendant, else the parent; `undefined` for the
 * document's very first node. (The mirror of ops.ts's `rawSuccessorPath`:
 * `rawSuccessor(contentSpacePredecessor(n)) === n` whenever one exists.) */
function contentSpacePredecessor(doc: OutlineDoc, nodeId: number): OutlineNode | undefined {
  const path = findPath(doc, nodeId);
  if (!path) return undefined;
  const index = path[path.length - 1]!;
  if (index > 0) {
    return deepestLastDescendant(childrenAtScope(doc, path.slice(0, -1))[index - 1]!);
  }
  if (path.length === 1) return undefined;
  return childrenAtScope(doc, path.slice(0, -2))[path[path.length - 2]!];
}

/**
 * Content-adjacent merge recognition (D10, chrome-transparent — replaces
 * the original single-separator rule). Returns the `mergeNodes` first-id
 * for a recognized merge intent, `'native'` for a chrome edit that stays
 * stock (cursor on/inside the gap), `'veto-no-predecessor'` for a
 * first-node Backspace-merge, or `undefined` when the edit is not a merge
 * shape at all (route to the deletion path).
 */
function recognizeMergeIntent(
  doc: OutlineDoc,
  edit: EditFact,
): number | 'native' | 'veto-no-predecessor' | undefined {
  if (edit.insert !== '') return undefined;

  // Marker-space deletion at a list item's content start (classified
  // boundary-crossing by the chrome-deletion fact): merge the item into
  // its content-space predecessor.
  if (edit.from.line === edit.to.line && edit.to.ch - edit.from.ch === 1) {
    const node = nodeAtLine(doc, edit.from.line);
    if (
      node?.kind === 'list-item' &&
      startLineOf(doc, node.id) === edit.from.line &&
      edit.to.ch === contentColumnCh(node.lines[0] ?? '') &&
      posEq(edit.cursorBefore, edit.to)
    ) {
      const predecessor = contentSpacePredecessor(doc, node.id);
      return predecessor ? predecessor.id : 'veto-no-predecessor';
    }
    return undefined;
  }

  if (!isPureNewlineDeletion(doc, edit)) return undefined;

  const after = nodeAtLine(doc, edit.to.line);
  const before = nodeAtLine(doc, edit.from.line);

  // Backspace at a node's first character: the deleted newline's tail sits
  // exactly at that node's own start, cursor there. The node above the
  // boundary (gap owner or content node — same node either way) is the
  // content-space predecessor whose successor this is.
  const afterIsNodeStart =
    after !== undefined && startLineOf(doc, after.id) === edit.to.line;
  if (afterIsNodeStart && posEq(edit.cursorBefore, edit.to)) {
    return before ? before.id : 'native'; // preamble above: D5 jurisdiction, stock
  }

  // Delete at a node's last content character, reaching through its own
  // trailing gap (or directly at a zero-gap boundary), cursor at content
  // end.
  if (before !== undefined && posEq(edit.cursorBefore, edit.from)) {
    const lastContentLine = startLineOf(doc, before.id) + before.lines.length - 1;
    if (edit.from.line === lastContentLine) return before.id;
  }

  // No cursor fact at all: fall back to the pre-amendment single-separator
  // shape — both sides content, zero gap — so cursor-less callers keep the
  // old, conservative behavior.
  if (edit.cursorBefore === undefined && before !== undefined && afterIsNodeStart) {
    const lastContentLine = startLineOf(doc, before.id) + before.lines.length - 1;
    if (edit.from.line === lastContentLine && before.trailingGap.length === 0) {
      return before.id;
    }
  }

  // Any other single-newline deletion is gap-interior chrome editing.
  return 'native';
}

function computeMergeVerdict(
  doc: OutlineDoc,
  intent: number | 'veto-no-predecessor',
): Verdict {
  if (intent === 'veto-no-predecessor') {
    return { kind: 'veto', reason: 'no-following-neighbor' };
  }
  const result = mergeNodes(doc, intent);
  if (!result.ok) {
    // Delete at the document's very last content character: nothing below
    // to join — trailing-whitespace editing, stays native (spec: "when no
    // successor exists, the edit passes natively").
    if (result.rejection.reason === 'no-following-neighbor') return PASS;
    return vetoFrom(result);
  }
  return rewriteFrom(result.value, 'delete.structural.merge');
}

/** The whole-subtree cover of a (possibly stale, never-escalated) range —
 * the SAME rule for an already-escalated selection and a mid-node one
 * (design.md D3: "one rule for both paths"). Returns `undefined` when
 * either end is out of jurisdiction (preamble). */
function coverIdsOf(doc: OutlineDoc, range: LineRange): readonly number[] | undefined {
  const covered = escalateRange(doc, range);
  const loLine = Math.min(covered.anchor.line, covered.head.line);
  const hiLine = Math.max(covered.anchor.line, covered.head.line);
  const startNode = nodeAtLine(doc, loLine);
  const endNode = nodeAtLine(doc, hiLine);
  if (!startNode || !endNode) return undefined;
  return siblingCoverIds(doc, startNode, endNode);
}

interface Survivors {
  readonly parentPath: readonly number[];
  readonly before: OutlineNode | undefined;
  readonly after: OutlineNode | undefined;
}

function survivorsOf(doc: OutlineDoc, ids: readonly number[]): Survivors {
  const paths = ids.map((id) => findPath(doc, id)!);
  const parentPath = paths[0]!.slice(0, -1);
  const indices = paths.map((p) => p[p.length - 1]!).sort((a, b) => a - b);
  const lo = indices[0]!;
  const hi = indices[indices.length - 1]!;
  const siblings = childrenAtScope(doc, parentPath);
  return { parentPath, before: lo > 0 ? siblings[lo - 1] : undefined, after: siblings[hi + 1] };
}

/**
 * Re-encodes `parsedBlocks` as the ONLY children at `parentPath` — the
 * fallback when a type-over/empty-anchor replacement consumed every node in
 * some scope, so no sibling anchor survives for `insertSubtrees` to splice
 * against. Uses the SAME `reencodeBlocksForDestination` re-indent/re-kind
 * step `insertSubtrees` itself uses (empty preceding/following-sibling
 * arrays — there are none — still correctly resolve the parent's own depth
 * via `destinationIndent`'s parent-based fallback). Design.md D16 (fourth
 * manual pass): this fallback used to splice blocks in completely
 * un-reindented, so a paste replacing the sole/only child at some depth
 * landed at the pasted text's OWN original depth instead of the
 * destination's — visually popping out to whatever shallower level (often
 * top-level) that original text happened to be written at.
 */
function insertAsOnlyChildren(
  doc: OutlineDoc,
  parentPath: readonly number[],
  parsedBlocks: readonly OutlineNode[],
): OpResult<OpOutput> {
  const parent = parentPath.length === 0 ? 'root' : nodeAt(doc, parentPath)!;
  const reencoded = reencodeBlocksForDestination(doc, parent, [], [], parsedBlocks);
  const rebuild = (nodes: readonly OutlineNode[], depth: number): readonly OutlineNode[] => {
    if (depth === parentPath.length) return reencoded;
    const index = parentPath[depth]!;
    return nodes.map((node, i) =>
      i === index ? { ...node, children: rebuild(node.children, depth + 1) } : node,
    );
  };
  const surgery: OutlineDoc = { ...doc, children: rebuild(doc.children, 0) };
  return finalize(doc, surgery, reencoded[0]?.id);
}

function deepestLastDescendant(node: OutlineNode): OutlineNode {
  const last = node.children[node.children.length - 1];
  return last ? deepestLastDescendant(last) : node;
}

function endOfSubtree(doc: OutlineDoc, node: OutlineNode): { line: number; ch: number } {
  const leaf = deepestLastDescendant(node);
  const leafStart = startLineOf(doc, leaf.id);
  const lastLine = leaf.lines[leaf.lines.length - 1] ?? '';
  return { line: leafStart + leaf.lines.length - 1, ch: lastLine.length };
}

/**
 * End position of the LAST of `blockCount` contiguous top-level blocks that
 * were just inserted starting at `firstBlockCursor` (the FIRST block's own
 * content-start — `insertSubtrees`/`finalize`'s cursor convention) — the
 * cursor spot that makes continued typing (or a follow-up single-key
 * type-over keystroke) land AFTER the just-inserted content instead of
 * before it. `doc` is the op's returned tree, which `finalize` always
 * FRESH-reparses (new node ids) — so the inserted blocks are located by
 * LINE and sibling OFFSET from the first one, never by id.
 */
function endOfInsertedRun(
  doc: OutlineDoc,
  firstBlockCursor: { line: number; ch: number },
  blockCount: number,
): { line: number; ch: number } {
  const firstNode = nodeAtLine(doc, firstBlockCursor.line);
  if (!firstNode) return firstBlockCursor; // defensive: shouldn't happen
  const path = findPath(doc, firstNode.id)!;
  const siblings = childrenAtScope(doc, path.slice(0, -1));
  const lastNode = siblings[path[path.length - 1]! + blockCount - 1] ?? firstNode;
  return endOfSubtree(doc, lastNode);
}

/**
 * Deletes `ids` (a contiguous whole-subtree run) and splices `parsedBlocks`
 * into exactly the gap that deletion left — the shared shape behind both a
 * type-over (D3: delete the covered range, insert the typed replacement)
 * and a paste landing on an EMPTY anchor node (below: delete the empty
 * placeholder, insert the pasted content in its place, rather than leaving
 * the placeholder stranded next to it). `parsedBlocks.length === 0` is a
 * pure deletion (no replacement text/content).
 */
function deleteAndSplice(doc: OutlineDoc, ids: readonly number[], parsedBlocks: readonly OutlineNode[]): Verdict {
  const deletion = deleteSubtrees(doc, ids);
  if (!deletion.ok) return vetoFrom(deletion);

  if (parsedBlocks.length === 0) {
    return rewriteFrom(deletion.value, 'delete.structural');
  }

  const { parentPath, before, after } = survivorsOf(doc, ids);
  const doc2 = deletion.value.doc;
  // `before`/`after` carry ids from the PRE-deletion `doc` — `deleteSubtrees`
  // (like every op) returns a tree from a FRESH `finalize` reparse, which
  // assigns all-new ids. The survivor's identity only survives the crossing
  // as a LINE position: `deletion.value.cursor` was placed exactly on it.
  const survivorInDoc2 = before || after ? nodeAtLine(doc2, deletion.value.cursor.line) : undefined;

  let inserted: OpResult<OpOutput>;
  if (after && survivorInDoc2) {
    inserted = insertSubtrees(doc2, survivorInDoc2.id, parsedBlocks, 'before');
  } else if (before && survivorInDoc2) {
    inserted = insertSubtrees(doc2, survivorInDoc2.id, parsedBlocks, 'after');
  } else {
    inserted = insertAsOnlyChildren(doc2, parentPath, parsedBlocks);
  }
  if (!inserted.ok) return vetoFrom(inserted);

  const finalText = encode(inserted.value.doc);
  const finalLines = finalText === '' ? [] : finalText.split('\n');
  const finalEdits = diffLines(encodeLines(doc), finalLines);
  const cursor = endOfInsertedRun(inserted.value.doc, inserted.value.cursor, parsedBlocks.length);
  return { kind: 'rewrite', edits: finalEdits, cursor, userEvent: 'input.paste.structural' };
}

function composeTypeOver(doc: OutlineDoc, ids: readonly number[], insertText: string): Verdict {
  return deleteAndSplice(doc, ids, parse(insertText).children);
}

/** A list item with no content of its own (just typed, e.g. via Enter) and
 * no children — the paste-anchor case where the anchor should be REPLACED
 * by the pasted content rather than left stranded next to it. */
function isEmptyAnchor(node: OutlineNode): boolean {
  if (node.kind !== 'list-item' || node.children.length > 0 || node.lines.length !== 1) return false;
  const line = node.lines[0]!;
  return line.slice(contentColumnCh(line)).trim() === '';
}

function computeDeletionVerdict(doc: OutlineDoc, edit: EditFact): Verdict {
  const range: LineRange = { anchor: edit.from, head: edit.to };
  const ids = coverIdsOf(doc, range);
  if (!ids) return PASS; // preamble jurisdiction

  if (edit.insert === '') {
    const deletion = deleteSubtrees(doc, ids);
    if (!deletion.ok) return vetoFrom(deletion);
    return rewriteFrom(deletion.value, 'delete.structural');
  }
  return composeTypeOver(doc, ids, edit.insert);
}

/**
 * Structural-paste rule (design.md D5, corrected D15): a pure insertion
 * whose text parses as a structural block sequence (`isStructuralBlockSequence`
 * — more than one top-level block, OR a single top-level node that itself
 * has children), landing inside a node, splices at the nearest boundary
 * AFTER that node — UNLESS that node is an empty placeholder (a freshly-
 * split/created list item with no content and no children, D14), in which
 * case the paste REPLACES it rather than leaving it stranded next to the
 * pasted content. Conservative on failure: an inexpressible sequence (or
 * ambiguous shape) stays native rather than surprising the user with a
 * veto — "a wrong pass is editable text; a wrong rewrite is surprising
 * relocation."
 */
function computePasteVerdict(doc: OutlineDoc, edit: EditFact): Verdict {
  const node = nodeAtLine(doc, edit.from.line);
  if (!node) return PASS;
  const parsedBlocks = parse(edit.insert).children;
  if (!isStructuralBlockSequence(parsedBlocks)) return PASS;

  if (isEmptyAnchor(node)) {
    const verdict = deleteAndSplice(doc, [node.id], parsedBlocks);
    if (verdict.kind === 'rewrite') return verdict;
    // Fall through to the plain splice-after path below if replacing the
    // empty anchor didn't work out for some reason (conservative bias).
  }

  const inserted = insertSubtrees(doc, node.id, parsedBlocks, 'after');
  if (!inserted.ok) return PASS;
  const cursor = endOfInsertedRun(inserted.value.doc, inserted.value.cursor, parsedBlocks.length);
  return { kind: 'rewrite', edits: inserted.value.edits, cursor, userEvent: 'input.paste.structural' };
}

/** The verdict for one transaction. `edit` is `undefined` for shapes this
 * phase doesn't model (multi-range changes) — always `pass`, never a veto,
 * per the conservative-default-permit posture (D1). */
export function computeVerdict(
  cls: TransactionClass,
  doc: OutlineDoc,
  edit: EditFact | undefined,
): Verdict {
  if (cls !== 'boundary-crossing-edit' || !edit) return PASS;

  const isPureInsertion = edit.from.line === edit.to.line && edit.from.ch === edit.to.ch;
  if (isPureInsertion) {
    return edit.insert === '' ? PASS : computePasteVerdict(doc, edit);
  }
  // Merge shapes route first (D10): single-newline and marker-space
  // deletions are either merge intents, native chrome edits, or the
  // first-node veto — never subtree-cover deletions. Everything else falls
  // through to the deletion path.
  const intent = recognizeMergeIntent(doc, edit);
  if (intent === 'native') return PASS;
  if (intent !== undefined) return computeMergeVerdict(doc, intent);
  return computeDeletionVerdict(doc, edit);
}
