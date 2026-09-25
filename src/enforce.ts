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
import { childrenAt, findPath, nodeAt } from './model';
import { forEachNodeWithLine, isEmptyBodyLine, nodeAtLine, nodeStartLine } from './locate';
import { childBaseCol } from './reencode';
import { TAB_WIDTH } from './parse';
import { coveredForestOf } from './escalate';
import { coverGroupsOf, groupRootsByParent } from './operand';
import type { LinePos, LineRange } from './line-pos';
import { parse } from './parse';
import { encode, encodeLines } from './encode';
import {
  contentColumnCh,
  deleteSubtreeGroups,
  deleteSubtrees,
  finalize,
  insertSubtrees,
  isContentStartCh,
  mergeNodes,
  reencodeBlocksForDestination,
  setFinalGap,
  type OpOutput,
} from './ops';
import type { Edit, OpResult, RejectionReason } from './result';
import { diffLines } from './result';
import { isStructuralBlockSequence, type TransactionClass } from './classify';
import { planCaret, type CaretOp } from './caret-policy';

/** One change, in the OLD document's line/ch coordinates (`escalate.ts`'s
 * `LinePos`). `from === to` is a pure insertion; `insert === ''` is a pure
 * deletion. A single `EditFact` models one change range; a transaction with
 * several change ranges is evaluated by `computeVerdictForRanges`, one
 * `EditFact` per range (`fix-orphan-gap-on-node-deletion` D2 — lifted from
 * this module's original single-range restriction). */
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
  /**
   * The document this verdict's edits produce.
   *
   * The operation computed it on the way to `edits` and this interface used to
   * drop it. The zoom escape check (`outline-zoom`) has to judge the AFTER
   * state, and carrying the one already in hand is both cheaper and more honest
   * than re-deriving it by applying `edits` and parsing the result — two
   * derivations of one document are two chances to disagree.
   */
  readonly after: OutlineDoc;
}

export type Verdict =
  | { readonly kind: 'pass' }
  | RewriteVerdict
  | { readonly kind: 'veto'; readonly reason: RejectionReason };

const PASS: Verdict = { kind: 'pass' };

/**
 * A rewrite verdict, with its caret decided by `caret-policy.ts` — the same
 * procedure the keyboard grammar and the command palette use. This layer
 * states which of the policy's cases the operation falls into and supplies
 * the facts; it computes no caret of its own.
 *
 * Note the asymmetry this makes explicit: the verdict's CARET comes from the
 * policy, while `deleteAndSplice` locates the node it splices against from
 * the operation's ANCHOR. They were the same field until
 * `caret-placement-policy`, which is what made the deletion convention
 * unchangeable.
 */
function rewriteFrom(
  before: OutlineDoc,
  result: OpOutput,
  op: CaretOp,
  userEvent: string,
): Verdict {
  const { caret } = planCaret(op, {
    before,
    after: result.doc,
    anchor: result.anchor,
  });
  return { kind: 'rewrite', edits: result.edits, cursor: caret, userEvent, after: result.doc };
}

function vetoFrom(result: OpResult<OpOutput>): Verdict {
  if (result.ok) throw new Error('vetoFrom called with an accepted result');
  return { kind: 'veto', reason: result.rejection.reason };
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
    return deepestLastDescendant(childrenAt(doc, path.slice(0, -1))[index - 1]!);
  }
  if (path.length === 1) return undefined;
  return childrenAt(doc, path.slice(0, -2))[path[path.length - 2]!];
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

  // Marker-space deletion at a node's own marker column (classified
  // boundary-crossing by the chrome-deletion fact): merge the node into
  // its content-space predecessor.
  //
  // Headings are admitted with list items, and the kind test paired with
  // classify.ts's — the pairing is load-bearing rather than tidy. Widened
  // there alone, a heading's marker-space Backspace arrives here, is not
  // recognized as a merge, and falls through to `computeDeletionVerdict`,
  // where a one-character range reads as covering the heading's whole subtree:
  // measured, a section deletion, and a whole-document one on the first node.
  // A heading's merge is then vetoed by rules already written — `mergeNodes`
  // refuses to absorb a heading, and a first node takes the branch below.
  //
  // A TASK item has two such columns — after `- ` and after `- [ ] ` — and both
  // are places the caret really sits: the first is where Home lands, the second
  // is where the item's text begins. Only the first was recognised, so
  // Backspace where the text begins fell through to an ordinary character
  // deletion and left `- [ ]bar`: a broken checkbox instead of a join.
  //
  // A content start whose marker run is wider than one character (`-  a`) does
  // not arrive here at all: `classify.ts` keeps that Backspace a within-node
  // edit, so the surplus space is deleted natively and the marker keeps its
  // own. The rule lives in the classifier alone because a one-character range
  // that reached the deletion path below would be measured against the node's
  // whole subtree, which is the mis-reading recorded above for headings.
  if (edit.from.line === edit.to.line && edit.to.ch - edit.from.ch === 1) {
    const node = nodeAtLine(doc, edit.from.line);
    const line = node?.lines[0] ?? '';
    if (
      (node?.kind === 'list-item' || node?.kind === 'heading') &&
      nodeStartLine(doc, node.id) === edit.from.line &&
      isContentStartCh(line, edit.to.ch) &&
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
    after !== undefined && nodeStartLine(doc, after.id) === edit.to.line;
  if (afterIsNodeStart && posEq(edit.cursorBefore, edit.to)) {
    return before ? before.id : 'native'; // preamble above: D5 jurisdiction, stock
  }

  // Delete at a node's last content character, reaching through its own
  // trailing gap (or directly at a zero-gap boundary), cursor at content
  // end.
  if (before !== undefined && posEq(edit.cursorBefore, edit.from)) {
    const lastContentLine = nodeStartLine(doc, before.id) + before.lines.length - 1;
    if (edit.from.line === lastContentLine) return before.id;
  }

  // No cursor fact at all: fall back to the pre-amendment single-separator
  // shape — both sides content, zero gap — so cursor-less callers keep the
  // old, conservative behavior.
  if (edit.cursorBefore === undefined && before !== undefined && afterIsNodeStart) {
    const lastContentLine = nodeStartLine(doc, before.id) + before.lines.length - 1;
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
  return rewriteFrom(doc, result.value, { kind: 'exact' }, 'delete.structural.merge');
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
  const siblings = childrenAt(doc, parentPath);
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
  fallbackIndentUnit: string | undefined,
  displacedGap: readonly string[] | undefined,
): OpResult<OpOutput> {
  const parent = parentPath.length === 0 ? 'root' : nodeAt(doc, parentPath)!;
  const result = reencodeBlocksForDestination(doc, parent, [], [], parsedBlocks, fallbackIndentUnit);
  if (!result.ok) return result;
  // A replacement inherits the separation of what it replaced (D10), which the
  // deletion took with the nodes and the caller reads off the tree before it.
  // Left to the payload's own gap, a section copied out of a note carried that
  // note's blank line into a tight list.
  const value = result.value;
  const reencoded = displacedGap
    ? [...value.slice(0, -1), setFinalGap(value[value.length - 1]!, displacedGap)]
    : value;
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

/**
 * End position of the last node the PAYLOAD contributed, starting from
 * `firstBlockAnchor` (the FIRST block's own content-start —
 * `insertSubtrees`/`finalize`'s anchor convention) — the cursor spot that
 * makes continued typing (or a follow-up single-key type-over keystroke) land
 * AFTER the just-inserted content instead of before it. `doc` is the op's
 * returned tree, which `finalize` always FRESH-reparses (new node ids) — so
 * the inserted content is located by LINE and by COUNT from the first one,
 * never by id.
 *
 * Counting the payload's own NODES rather than taking its last top-level
 * block's subtree end, because after an insertion that block's subtree is not
 * the payload. A pasted heading opens a section that takes the anchor's
 * following siblings into it (design D3), and the attachment rule can put what
 * it absorbs BELOW the payload's own last node rather than beside it — so a
 * subtree end lands the caret on content the user never pasted. Measured:
 * `## Notes` / `Some prose.` pasted with the caret on `## First` left the
 * caret on `body`, the paragraph the new section had just absorbed.
 *
 * Counting is enough because anything absorbed FOLLOWED the anchor, so it
 * follows the payload in document order too; the payload's own nodes are the
 * first `payloadNodes` from the anchor. That the count is the payload's own is
 * what the payload-survival property pins (`tests/edit-ops.test.ts`).
 */
function endOfInsertedRun(
  doc: OutlineDoc,
  firstBlockAnchor: { line: number; ch: number },
  payloadNodes: number,
): { line: number; ch: number } {
  const firstNode = nodeAtLine(doc, firstBlockAnchor.line);
  if (!firstNode) return firstBlockAnchor; // defensive: shouldn't happen
  let seen = 0;
  let last: { node: OutlineNode; startLine: number } | undefined;
  let reached = false;
  forEachNodeWithLine(doc, (node, startLine) => {
    if (node.id === firstNode.id) reached = true;
    if (!reached) return true;
    seen += 1;
    last = { node, startLine };
    return seen < payloadNodes;
  });
  if (!last) return firstBlockAnchor;
  const lastLine = last.node.lines[last.node.lines.length - 1] ?? '';
  return { line: last.startLine + last.node.lines.length - 1, ch: lastLine.length };
}

/** How many nodes a parsed payload carries, its descendants included — the
 * unit `endOfInsertedRun` counts in. */
function payloadNodeCount(blocks: readonly OutlineNode[]): number {
  return blocks.reduce((total, block) => total + 1 + payloadNodeCount(block.children), 0);
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
function deleteAndSplice(
  doc: OutlineDoc,
  ids: readonly number[],
  parsedBlocks: readonly OutlineNode[],
  fallbackIndentUnit: string | undefined,
): Verdict {
  // With blocks to splice, the deletion is not the whole edit: the place the
  // run leaves is filled below, and the terminator it was carrying travels
  // with `displacedGap` rather than being restored onto the survivor.
  const deletion = deleteSubtrees(doc, ids, parsedBlocks.length > 0);
  if (!deletion.ok) return vetoFrom(deletion);

  if (parsedBlocks.length === 0) {
    return rewriteFrom(doc, deletion.value, { kind: 'deletion', removed: ids }, 'delete.structural');
  }

  const { parentPath, before, after } = survivorsOf(doc, ids);
  const doc2 = deletion.value.doc;
  // What the deleted run was separated from what follows it BY: the deletion
  // takes a node's owned gap with it, so this is read from the tree before it.
  const lastDeletedPath = findPath(doc, ids[ids.length - 1]!);
  const lastDeleted = lastDeletedPath ? nodeAt(doc, lastDeletedPath) : undefined;
  const displacedGap = lastDeleted ? deepestLastDescendant(lastDeleted).trailingGap : undefined;
  // `before`/`after` carry ids from the PRE-deletion `doc` — `deleteSubtrees`
  // (like every op) returns a tree from a FRESH `finalize` reparse, which
  // assigns all-new ids. The survivor's identity only survives the crossing
  // as a LINE position: the deletion's ANCHOR was placed exactly on it.
  //
  // Reading the anchor rather than the caret is what lets `caret-placement-
  // policy` change where the caret lands after a deletion without changing
  // which node this splices against. The two were the same field until that
  // change; they are now deliberately different values.
  const survivorInDoc2 = before || after ? nodeAtLine(doc2, deletion.value.anchor.line) : undefined;

  let inserted: OpResult<OpOutput>;
  if (after && survivorInDoc2) {
    inserted = insertSubtrees(
      doc2, survivorInDoc2.id, parsedBlocks, 'before', fallbackIndentUnit, displacedGap,
    );
  } else if (before && survivorInDoc2) {
    inserted = insertSubtrees(
      doc2, survivorInDoc2.id, parsedBlocks, 'after', fallbackIndentUnit, displacedGap,
    );
  } else {
    inserted = insertAsOnlyChildren(doc2, parentPath, parsedBlocks, fallbackIndentUnit, displacedGap);
  }
  if (!inserted.ok) return vetoFrom(inserted);

  const finalText = encode(inserted.value.doc);
  const finalLines = finalText === '' ? [] : finalText.split('\n');
  const finalEdits = diffLines(encodeLines(doc), finalLines);
  const runEnd = endOfInsertedRun(inserted.value.doc, inserted.value.anchor, payloadNodeCount(parsedBlocks));
  const { caret } = planCaret(
    { kind: 'exact' },
    { before: doc, after: inserted.value.doc, anchor: runEnd },
  );
  return {
    kind: 'rewrite',
    edits: finalEdits,
    cursor: caret,
    userEvent: 'input.paste.structural',
    after: inserted.value.doc,
  };
}

/**
 * The blocks a pasted payload parses to, with every blank line between them
 * written empty. A clipboard from another app or another vault carries its own
 * indentation on its blank lines as well, and a blank line's whitespace says
 * nothing: carried over, it leaves lines of stray spaces or tabs between the
 * pasted nodes, in a unit the note does not use, which the outline gives no
 * caret position to clean up. Only the gaps between nodes are blank lines; a
 * whitespace-only line inside a code block or another atom is one of the
 * atom's own lines, and is kept.
 */
function payloadBlocks(text: string): readonly OutlineNode[] {
  const blank = (node: OutlineNode): OutlineNode => ({
    ...node,
    trailingGap: node.trailingGap.map(() => ''),
    children: node.children.map(blank),
  });
  return parse(text).children.map(blank);
}

function composeTypeOver(
  doc: OutlineDoc,
  ids: readonly number[],
  insertText: string,
  fallbackIndentUnit: string | undefined,
): Verdict {
  return deleteAndSplice(doc, ids, payloadBlocks(insertText), fallbackIndentUnit);
}

/** A list item with no content of its own (just typed, e.g. via Enter) and
 * no children — the paste-anchor case where the anchor should be REPLACED
 * by the pasted content rather than left stranded next to it. */
function isEmptyAnchor(node: OutlineNode): boolean {
  if (node.kind !== 'list-item' || node.children.length > 0 || node.lines.length !== 1) return false;
  const line = node.lines[0]!;
  return line.slice(contentColumnCh(line)).trim() === '';
}

function computeDeletionVerdict(
  doc: OutlineDoc,
  edit: EditFact,
  fallbackIndentUnit: string | undefined,
): Verdict {
  const range: LineRange = { anchor: edit.from, head: edit.to };
  const groups = coverGroupsOf(doc, range);
  if (!groups) return PASS; // preamble jurisdiction

  if (edit.insert === '') {
    const deletion = deleteSubtreeGroups(doc, groups);
    if (!deletion.ok) return vetoFrom(deletion);
    return rewriteFrom(
      doc,
      deletion.value,
      { kind: 'deletion', removed: groups.flat() },
      'delete.structural',
    );
  }
  // A TYPE-OVER of a mixed-depth forest has no modeled answer for where the
  // typed text lands — `deleteAndSplice` splices into the single gap the
  // deletion left, and a forest leaves one gap per parent. Newly reachable
  // since `selection-as-subtree-set`; passing keeps the layer's stated
  // conservative default ("a wrong pass is editable text; a wrong rewrite is
  // surprising relocation") and is safe: the native replacement of a forest
  // span re-parses to a valid tree, it is simply not structural.
  if (groups.length > 1) return PASS;
  return composeTypeOver(doc, groups[0]!, edit.insert, fallbackIndentUnit);
}

/**
 * Structural-paste rule (design.md D5, corrected D15): a pure insertion
 * whose text parses as a structural block sequence (`isStructuralBlockSequence`
 * — more than one top-level block, OR a single top-level node that itself
 * has children), landing inside a node, splices at the nearest boundary
 * AFTER that node — UNLESS that node is an empty placeholder (a freshly-
 * split/created list item with no content and no children, D14), in which
 * case the paste REPLACES it rather than leaving it stranded next to the
 * pasted content.
 *
 * An inexpressible sequence is VETOED, with the cue naming the reason. This
 * path used to pass it through on the conservative default — "a wrong pass is
 * editable text; a wrong rewrite is surprising relocation" — which measurement
 * does not bear out here: what lands natively is the payload's first line
 * concatenated onto the anchor's, with the remainder at its source
 * indentation. That is not editable text, `structural-operations` already
 * requires such a sequence to be "rejected rather than inserted in corrupted
 * form", and the type-over path has always vetoed it. One answer on all three.
 */
/**
 * Where a paste ANCHORS, on which side, and whether the caret was in the
 * anchor's trailing GAP.
 *
 * `nodeAtLine` resolves a gap line to the node that PRECEDES it, and inserting
 * after that node means after its whole SUBTREE — for a note's own top heading,
 * the end of the note. That is not where any caret on or under that node's row
 * points. The boundary a paste wants is the next one after the anchor's own
 * lines, which is its first child's `before` whenever it has children.
 *
 * Measured, both readings of the old one were wrong in the same way: an `h2`
 * pasted on the blank line under a note's `h1` came out at the bottom of the
 * note, re-levelled to `h1` because root was the destination it reached; and a
 * paste with the caret ON a heading's own line landed past that heading's whole
 * section. Nothing appeared where the caret was, which is the whole of what the
 * user saw in either case.
 *
 * On a GAP line the caret's COLUMN can still ask for the shallower reading: at
 * or past the node's child column it stands for a child, and to the left of it
 * for a sibling, which is what `after` gives. On the node's OWN lines there is
 * no such choice to express — the column there is a position in the node's text
 * and says nothing about depth.
 *
 * `childBaseCol` answers in COLUMNS and `LinePos.ch` counts CHARACTERS, so the
 * caret is converted before the two are compared. A tab is one character and up
 * to `TAB_WIDTH` columns: in a tab-indented vault the child column of `\t- one`
 * is 6 while its gap line holds two characters, so comparing the two directly
 * put every reachable caret on the sibling side and the child reading became
 * unreachable. `indentPrefixCh` is the converter for the other direction and
 * clamps BELOW its column, which answers a different question than this one.
 *
 * `fillsGap` says whether the payload lands IN the gap the caret sat in — it
 * does for the child reading, and for the sibling reading only when the node
 * has no children to be placed past. That is what may be collapsed; a gap the
 * insertion jumps over belongs to the document.
 */
/** The display COLUMN a caret at character index `ch` sits at, tabs expanded —
 * the unit `childBaseCol` and every other depth in the mapping are stated in. */
function columnAtCh(line: string, ch: number): number {
  let width = 0;
  for (const c of line.slice(0, ch)) {
    width += c === '\t' ? TAB_WIDTH - (width % TAB_WIDTH) : 1;
  }
  return width;
}

function pasteAnchor(
  doc: OutlineDoc,
  node: OutlineNode,
  at: LinePos,
): {
  readonly anchor: OutlineNode;
  readonly position: 'before' | 'after';
  readonly fillsGap: boolean;
} {
  const start = nodeStartLine(doc, node.id);
  const gapIndex = start < 0 ? -1 : at.line - (start + node.lines.length);
  const inGap = gapIndex >= 0 && gapIndex < node.trailingGap.length;
  const first = node.children[0];
  if (!first || start < 0) return { anchor: node, position: 'after', fillsGap: inGap };
  const gapLine = node.trailingGap[gapIndex] ?? '';
  const wantsChild = !inGap || columnAtCh(gapLine, at.ch) >= childBaseCol(node);
  return wantsChild
    ? { anchor: first, position: 'before', fillsGap: inGap }
    : { anchor: node, position: 'after', fillsGap: false };
}

/**
 * `doc` with one node's trailing gap collapsed to a single blank line.
 *
 * A gap is one separation however wide it is, and a structural Enter widens the
 * one it opens a place in by two — a separator on each side, which is what
 * makes the place parse as a node of its own rather than a continuation line.
 * Measured: Enter at the end of a heading, then Ctrl+V, left three blank lines
 * above the pasted content, because nothing consumed the place the paste filled.
 *
 * Only a gap the caret was actually in, and only one already wider than a
 * single line — a gap of none or one is the separation the document already had
 * and the paste has no business rewriting it.
 */
function withGapCollapsed(doc: OutlineDoc, id: number): OutlineDoc {
  const map = (node: OutlineNode): OutlineNode => ({
    ...node,
    trailingGap: node.id === id && node.trailingGap.length > 1 ? [''] : node.trailingGap,
    children: node.children.map(map),
  });
  return { ...doc, children: doc.children.map(map) };
}

/**
 * A paste into a note with no node yet: the payload becomes the root's
 * children, re-encoded like any other insertion, so a clipboard's indentation
 * converges on the vault's unit from the first paste. The blank lines above
 * the caret stay above it, and those below it become the run's trailing gap,
 * which is where Obsidian's own paste leaves them.
 */
function pasteIntoEmptyBody(
  doc: OutlineDoc,
  line: number,
  parsedBlocks: readonly OutlineNode[],
  fallbackIndentUnit: string | undefined,
): Verdict {
  const written = reencodeBlocksForDestination(doc, 'root', [], [], parsedBlocks, fallbackIndentUnit);
  if (!written.ok) return vetoFrom(written);
  const blocks = written.value;
  const below = doc.preamble.slice(line + 1);
  const run = below.length > 0 ? [...blocks.slice(0, -1), setFinalGap(blocks.at(-1)!, below)] : blocks;
  const surgery: OutlineDoc = { preamble: doc.preamble.slice(0, line), children: run };
  const inserted = finalize(doc, surgery, run[0]!.id);
  if (!inserted.ok) return vetoFrom(inserted);
  const runEnd = endOfInsertedRun(inserted.value.doc, inserted.value.anchor, payloadNodeCount(parsedBlocks));
  const { caret } = planCaret({ kind: 'exact' }, { before: doc, after: inserted.value.doc, anchor: runEnd });
  return {
    kind: 'rewrite',
    edits: inserted.value.edits,
    cursor: caret,
    userEvent: 'input.paste.structural',
    after: inserted.value.doc,
  };
}

function computePasteVerdict(
  doc: OutlineDoc,
  edit: EditFact,
  fallbackIndentUnit: string | undefined,
): Verdict {
  const node = nodeAtLine(doc, edit.from.line);
  const parsedBlocks = payloadBlocks(edit.insert);
  if (!isStructuralBlockSequence(parsedBlocks)) return PASS;
  if (!node) {
    return isEmptyBodyLine(doc, edit.from.line)
      ? pasteIntoEmptyBody(doc, edit.from.line, parsedBlocks, fallbackIndentUnit)
      : PASS;
  }

  if (isEmptyAnchor(node)) {
    const verdict = deleteAndSplice(doc, [node.id], parsedBlocks, fallbackIndentUnit);
    if (verdict.kind === 'rewrite') return verdict;
    // Fall through to the plain splice-after path below if replacing the
    // empty anchor didn't work out for some reason (conservative bias).
  }

  const { anchor, position, fillsGap } = pasteAnchor(doc, node, edit.from);
  // The gap the caret sat in is the place the paste fills, so it collapses
  // with the insertion. `insertSubtrees` runs against that collapsed tree and
  // the edits are re-diffed against the real one below, the same crossing
  // `deleteAndSplice` makes.
  const source = fillsGap ? withGapCollapsed(doc, node.id) : doc;
  const inserted = insertSubtrees(source, anchor.id, parsedBlocks, position, fallbackIndentUnit);
  if (!inserted.ok) return vetoFrom(inserted);
  const runEnd = endOfInsertedRun(inserted.value.doc, inserted.value.anchor, payloadNodeCount(parsedBlocks));
  const { caret } = planCaret(
    { kind: 'exact' },
    { before: doc, after: inserted.value.doc, anchor: runEnd },
  );
  return {
    kind: 'rewrite',
    edits:
      source === doc
        ? inserted.value.edits
        : diffLines(encodeLines(doc), encodeLines(inserted.value.doc)),
    cursor: caret,
    userEvent: 'input.paste.structural',
    after: inserted.value.doc,
  };
}

/**
 * The verdict for one transaction. `edit` is `undefined` for shapes this
 * phase doesn't model (multi-range changes) — always `pass`, never a veto,
 * per the conservative-default-permit posture (D1).
 *
 * `fallbackIndentUnit` — the unit to materialize brand-new indentation with
 * when nothing in the document itself gives a unit to infer (see
 * `ops.ts`'s `destinationIndent`/`inferIndentUnit`) — is the caller's
 * (CM6 adapter's) live read of Obsidian's "Indent using tabs" setting via
 * the public `@codemirror/language` `indentUnit` facet. `undefined` here
 * keeps the existing space-inferring default, so every pure-function call
 * site in tests stays unaffected.
 */
export function computeVerdict(
  cls: TransactionClass,
  doc: OutlineDoc,
  edit: EditFact | undefined,
  fallbackIndentUnit?: string,
): Verdict {
  if (cls !== 'boundary-crossing-edit' || !edit) return PASS;

  const isPureInsertion = edit.from.line === edit.to.line && edit.from.ch === edit.to.ch;
  if (isPureInsertion) {
    return edit.insert === '' ? PASS : computePasteVerdict(doc, edit, fallbackIndentUnit);
  }
  // Merge shapes route first (D10): single-newline and marker-space
  // deletions are either merge intents, native chrome edits, or the
  // first-node veto — never subtree-cover deletions. Everything else falls
  // through to the deletion path.
  const intent = recognizeMergeIntent(doc, edit);
  if (intent === 'native') return PASS;
  if (intent !== undefined) return computeMergeVerdict(doc, intent);
  return computeDeletionVerdict(doc, edit, fallbackIndentUnit);
}

/**
 * Multi-range structural deletion (design.md D2): every range must be a pure
 * deletion (`insert === ''`) whose range exactly covers one or more whole
 * subtrees — the narrow shape this phase models for multi-cursor edits, per
 * D3 ("do not widen beyond exact covers"). Any range outside that shape falls
 * back to `PASS`, preserving today's conservative default for anything not
 * modeled.
 *
 * Delegates the actual removal to `deleteSubtreeGroups` (ops.ts) — one group
 * per range, resolved and removed together in a SINGLE structural pass, so
 * there is exactly one before/after diff for the whole transaction (never
 * one diff per range combined afterward; see that function's own comment
 * for why the combined approach is unsafe). `edits` is sorted by document
 * position first: `deleteSubtreeGroups` requires its first group to be the
 * topmost, for the cursor.
 */
function computeMultiRangeDeletionVerdict(doc: OutlineDoc, edits: readonly EditFact[]): Verdict {
  const order = edits.map((_, i) => i).sort((a, b) => edits[a]!.from.line - edits[b]!.from.line);
  const groups: (readonly number[])[] = [];
  for (const i of order) {
    const edit = edits[i]!;
    if (edit.insert !== '') return PASS;
    const forest = coveredForestOf(doc, { anchor: edit.from, head: edit.to });
    if (!forest) return PASS;
    // One group PER PARENT, not one per range. A range's cover can itself be
    // a mixed-depth forest whose roots sit under different parents; pushing
    // them as a single group made `resolveContiguousGroup` reject it and
    // VETOED the user's whole multi-range deletion.
    groups.push(...groupRootsByParent(forest.roots));
  }

  const deletion = deleteSubtreeGroups(doc, groups);
  if (!deletion.ok) return vetoFrom(deletion);
  return rewriteFrom(doc, deletion.value, { kind: 'deletion', removed: groups.flat() }, 'delete.structural');
}

/**
 * The verdict for a transaction's FULL set of change ranges (design.md D2):
 * a single range delegates to `computeVerdict` unchanged (every existing
 * shape — merges, pastes, single-range deletions — keeps its exact
 * behavior); several ranges are evaluated by `computeMultiRangeDeletionVerdict`,
 * which only recognizes the narrower all-exact-cover-deletions shape and
 * falls back to `pass` otherwise. Zero ranges (a selection-only transaction
 * reaching this by mistake) also passes, defensively.
 */
export function computeVerdictForRanges(
  cls: TransactionClass,
  doc: OutlineDoc,
  edits: readonly EditFact[],
  fallbackIndentUnit?: string,
): Verdict {
  if (cls !== 'boundary-crossing-edit' || edits.length === 0) return PASS;
  if (edits.length === 1) return computeVerdict(cls, doc, edits[0], fallbackIndentUnit);
  return computeMultiRangeDeletionVerdict(doc, edits);
}
