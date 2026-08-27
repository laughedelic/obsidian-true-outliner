/**
 * Where the caret goes after a structural operation — the single decision
 * procedure (`caret-placement-policy`, design.md D1).
 *
 * Pure module in the `escalate.ts`/`caret.ts` style: no CodeMirror imports.
 * The CM6 adapters convert between these line/column positions and character
 * offsets, and supply the one fact this module cannot compute (the
 * pre-operation selection head mapped forward through the change set). They
 * add no rules of their own.
 *
 * Before this existed the answer was spread across seven places that
 * disagreed — `ops.ts`'s survivor convention, `enforce.ts`'s rewrite cursors,
 * `grammar.ts` and `main.ts` each implementing the mapped-with-fallback rule,
 * and `history-caret.ts` keying recording off a hand-maintained operation
 * list. Every recent review round found an inconsistency BETWEEN two of them
 * rather than a wrong decision inside any one.
 *
 * Two questions this module deliberately does NOT answer:
 * - Which positions are addressable. `caret.ts` owns that; this module
 *   consumes `isAddressable` and never redefines it.
 * - Where an operation's subject landed. `ops.ts`'s `OpOutput.anchor` is a
 *   structural fact, and `enforce.ts` reads it to locate nodes across a
 *   re-parse. This module takes it as an input and may decide otherwise.
 */

import type { OutlineDoc, OutlineNode } from './model';
import { nodeAtLine, nodeStartLine } from './locate';
import { taskMarkerLength } from './ops';
import {
  contentBoundaryCh,
  isAddressable,
  nodeContentEnd,
  nodeContentStart,
  nextNodeInOrder,
  previousNodeInOrder,
} from './caret';
import type { LinePos } from './line-pos';

/**
 * Which case an operation's caret falls into. The dispatch site knows which
 * operation it invoked, so this is an argument rather than something inferred
 * from a `userEvent` string — inferring it from strings is the mechanism this
 * change removes from `history-caret.ts`.
 */
export type CaretOp =
  /** indent, outdent — the pre-op position mapped forward. */
  | { readonly kind: 'derived' }
  /**
   * move up/down — the subject node's content start; also the fallback for a
   * `derived` dispatch whose mapped position is not addressable.
   *
   * NOT heading level shifts, despite the obvious reading: a heading's Tab and
   * Shift+Tab go through `indent`/`outdent`, and both adapters classify those
   * as `derived` unconditionally, so the heading keeps its column like any
   * other indent. Listing it here (as an earlier draft did) advertised
   * behaviour no dispatch site produces.
   */
  | { readonly kind: 'subject' }
  /** split, merge, structural paste — an interior position only the op knows. */
  | { readonly kind: 'exact' }
  /** structural delete — the seam convention below. */
  | { readonly kind: 'deletion'; readonly removed: readonly number[] };

export interface PlacementFacts {
  /** The pre-operation tree. */
  readonly before: OutlineDoc;
  /** The operation's result tree. Freshly re-parsed: ids do NOT match `before`. */
  readonly after: OutlineDoc;
  /** `OpOutput.anchor`, in `after` coordinates. */
  readonly anchor: LinePos;
  /** The pre-op selection head mapped forward, when the adapter computed one.
   * Explicitly `| undefined` so an adapter can pass a conditionally-computed
   * value directly under `exactOptionalPropertyTypes`. */
  readonly mapped?: LinePos | undefined;
}

export interface CaretPlan {
  readonly caret: LinePos;
}

/*
 * `CaretPlan` deliberately does NOT carry a `record` flag.
 *
 * An earlier version did, stating "the caret differs from the mapped position"
 * as the pure form of the recording rule. It was not equivalent to the live
 * decision and could not be: `record-decision.ts` compares whole SELECTIONS
 * (the pre-op selection mapped forward against the dispatched one), while this
 * module only ever sees a single caret and the single position it was mapped
 * from. For a non-empty pre-operation selection — Tab with a block cover
 * active — the recorder correctly records because a mapped range differs from a
 * collapsed cursor, while a caret-only comparison could answer "no". Two
 * answers to one question is the exact failure this change exists to remove, so
 * the question has one owner: the transaction.
 */

/**
 * Node kinds whose interior the host renders as a widget carrying its OWN
 * editor instance and its own undo history.
 *
 * Measured across all six atom kinds on Obsidian 1.12.7 (docs/research/13,
 * 2026-07-29): only a table mounts a nested `EditorView` or takes focus —
 * `code`, `callout`, `quote`, `html` and `hr` mount no `.cm-embed-block` at
 * all. `nested-editor.ts`'s "the only case found so far" holds under a
 * deliberate sweep.
 *
 * Stated as data rather than inferred from atomicity: an atom's interior is
 * addressable by spec and landing in a code block after an operation is
 * correct. The problem is the nested editor, not atomicity. Adding a kind
 * here wants the same measurement.
 */
export const FOCUS_CAPTURING_KINDS: ReadonlySet<string> = new Set(['table']);

function isCapturing(doc: OutlineDoc, pos: LinePos): boolean {
  const node = nodeAtLine(doc, pos.line);
  return node !== undefined && FOCUS_CAPTURING_KINDS.has(node.kind);
}

/** Every node in document order — the walk the atom ladder searches. */
function nodesInOrder(doc: OutlineDoc): OutlineNode[] {
  const out: OutlineNode[] = [];
  const walk = (node: OutlineNode): void => {
    out.push(node);
    node.children.forEach(walk);
  };
  doc.children.forEach(walk);
  return out;
}

/**
 * The atom guard (design.md D5): a caret placed on a node the user did NOT
 * act on must not land inside a focus-capturing node, because that moves
 * focus into an editor with its own empty undo history while the host's
 * history event still points back inside — the measured "deleting after a
 * table strands undo" defect.
 *
 * Candidate order, stated rather than emergent: the following node's content
 * start, then the nearest non-capturing node walking BACKWARD in document
 * order, then the nearest walking forward. When every candidate is capturing
 * the computed position stands — a documented residual, not a silent fix.
 */
function avoidCapturing(doc: OutlineDoc, pos: LinePos): LinePos {
  if (!isCapturing(doc, pos)) return pos;

  const owner = nodeAtLine(doc, pos.line);
  if (!owner) return pos;

  const following = nextNodeInOrder(doc, owner);
  if (following && !FOCUS_CAPTURING_KINDS.has(following.kind)) {
    return nodeContentStart(doc, following);
  }

  const order = nodesInOrder(doc);
  const index = order.findIndex((n) => n.id === owner.id);
  if (index !== -1) {
    for (let i = index - 1; i >= 0; i--) {
      const candidate = order[i]!;
      if (!FOCUS_CAPTURING_KINDS.has(candidate.kind)) return nodeContentEnd(doc, candidate);
    }
    for (let i = index + 1; i < order.length; i++) {
      const candidate = order[i]!;
      if (!FOCUS_CAPTURING_KINDS.has(candidate.kind)) return nodeContentStart(doc, candidate);
    }
  }
  return pos; // every candidate captures — residual, documented
}

/**
 * The subject placement: the anchor's LINE, with the column re-derived from
 * `caret.ts`'s content boundary rather than `ops.ts`'s marker boundary
 * (design.md D4).
 *
 * The two disagree on headings — `contentColumnCh` swallows an ATX prefix,
 * while `content-space-caret` states that a heading's `#` is ordinary
 * content — so this is what moves a moved heading's caret from `ch 3` to
 * column 0, where Home on the same line already put it.
 */
function subjectCaret(doc: OutlineDoc, anchor: LinePos): LinePos {
  const node = nodeAtLine(doc, anchor.line);
  if (!node) return anchor; // preamble or empty document: out of jurisdiction
  // The anchor names the subject's own START line; a multi-line node's later
  // lines are not a subject landing.
  if (nodeStartLine(doc, node.id) !== anchor.line) return anchor;
  return nodeContentStart(doc, node);
}

/**
 * The deletion convention (design.md D3): the content end of the node
 * immediately preceding the deleted region in document order — descending
 * into the previous sibling's deepest last descendant, which is the node that
 * OWNS the gap at the seam.
 *
 * This is the position three existing rules already agree on:
 * `resolvePlacement` resolves the seam's gap line to it, `node-edit-
 * enforcement` places a merge's caret at it ("immediately after the surviving
 * node's own original last line of content"), and it is where a user resumes
 * typing. It replaces `survivorAfter ?? survivorBefore ?? parent`, under which
 * the caret alternated between the following and preceding node depending on
 * whether anything survived below.
 *
 * Computed in the BEFORE document and used as an AFTER coordinate, which is
 * sound rather than approximate: the predecessor lies entirely above the
 * topmost deleted group (`deleteSubtreeGroups` requires `groups[0]` to be
 * topmost), so its own lines and its start line are byte-identical in both.
 * Property-tested rather than left as reasoning.
 */
function deletionCaret(facts: PlacementFacts, removed: readonly number[]): LinePos {
  const topmost = topmostRemoved(facts.before, removed);
  if (topmost) {
    const previous = previousNodeInOrder(facts.before, topmost);
    if (previous) return nodeContentEnd(facts.before, previous);
  }
  // Nothing precedes the deleted region, so the deletion started at the very
  // beginning of node space and what follows it is simply the first node of the
  // result.
  //
  // Deliberately NOT read off `facts.anchor`: the anchor names a surviving
  // neighbour, and with several removal groups the node it named can itself
  // have been removed by a later group. Measured before this was fixed — on a
  // note with frontmatter, removing the first two nodes as separate groups left
  // the anchor at line 0 (inside the preamble), and resolving from it put the
  // caret at a list item's column 0, inside its marker.
  const following = facts.after.children[0];
  if (following) return nodeContentStart(facts.after, following);

  // Neither exists — the deletion consumed every node, leaving an empty or
  // preamble-only document. The honest position is the very END of what
  // remains, which for the usual frontmatter (its own trailing blank line) is
  // that blank line at column 0, and for frontmatter written with no blank
  // separator is the end of the closing `---`.
  //
  // Both halves were wrong before: the line was `preamble.length`, one PAST the
  // last line when the preamble has no trailing blank, and the column was a
  // flat 0, which put the caret at the START of the closing delimiter where
  // typing would corrupt it. Found by review after an earlier fix clamped the
  // line but left the column (docs/research/13); the generator could not catch
  // it because it only ever produced frontmatter WITH a trailing blank.
  const pre = facts.after.preamble;
  if (pre.length === 0) return { line: 0, ch: 0 };
  return { line: pre.length - 1, ch: (pre[pre.length - 1] ?? '').length };
}

/** The removed node that comes first in document order. */
function topmostRemoved(doc: OutlineDoc, removed: readonly number[]): OutlineNode | undefined {
  let best: OutlineNode | undefined;
  let bestLine = Number.POSITIVE_INFINITY;
  for (const id of removed) {
    const line = nodeStartLine(doc, id);
    if (line === -1) continue;
    if (line < bestLine) {
      bestLine = line;
      best = findById(doc, id);
    }
  }
  return best;
}

function findById(doc: OutlineDoc, id: number): OutlineNode | undefined {
  const walk = (nodes: readonly OutlineNode[]): OutlineNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = walk(node.children);
      if (found) return found;
    }
    return undefined;
  };
  return walk(doc.children);
}

/**
 * The decision procedure. Every dispatch site calls this and none re-derives
 * it: the keyboard grammar, the command-palette commands, and the
 * edit-enforcement rewrite path.
 */
export function planCaret(op: CaretOp, facts: PlacementFacts): CaretPlan {
  let caret: LinePos;
  let bystander = false;
  /** The caret IS the user's own column, carried forward — not one chosen here. */
  let mapped = false;

  switch (op.kind) {
    case 'derived':
      // The mapped position, but only where a caret may actually go. The
      // position being mapped is the main selection HEAD, which is a caret
      // only when the selection is empty — with a block cover active it is
      // the cover's end, and a cover ends on the trailing gap line it owns.
      mapped = facts.mapped !== undefined && isAddressable(facts.after, facts.mapped);
      caret = mapped ? facts.mapped! : subjectCaret(facts.after, facts.anchor);
      break;
    case 'subject':
      caret = subjectCaret(facts.after, facts.anchor);
      break;
    case 'exact':
      caret = facts.anchor;
      break;
    case 'deletion':
      caret = deletionCaret(facts, op.removed);
      bystander = true;
      break;
  }

  // The atom guard applies to BYSTANDER landings — a node the user did not act
  // on. A SUBJECT landing into a focus-capturing node (moving a table) is left
  // alone, and that case IS reachable: the "Move node up/down" commands move a
  // table and route the result here as `subject`. That is now the ONLY path —
  // those commands carry the Mod+Shift+Arrow default hotkey, and the keymap
  // binding that used to bypass them was removed (its nested-editor gate is
  // also fixed, so the keymap declines in a cell rather than mis-firing).
  //
  // Scoped out deliberately, not by accident. A bystander landing is a position
  // the user never asked for; a subject landing is the node they just acted on,
  // where "the caret follows the moved node" and "never enter a nested editor"
  // are in direct conflict. Real-vault use reports moving a table this way works
  // acceptably today. Resolving the conflict properly likely needs node identity
  // to live somewhere other than the caret, which is the modal block-selection
  // state the selection track parks — so it is filed, not pre-decided here.
  if (bystander) caret = avoidCapturing(facts.after, caret);

  // Not on a MAPPED caret: that one is the user's own column carried forward, and
  // the column they chose may BE this boundary — Home lands there. An indent
  // that relocated it would put Home and Tab at odds over a position
  // `content-space-caret` deliberately keeps addressable.
  return { caret: mapped ? caret : pastTaskMarker(facts.after, caret) };
}

/**
 * A caret at a task item's content start moves past the task marker, to where
 * the item's own text begins.
 *
 * `[ ] ` sits between the marker boundary every other kind has and the place a
 * reader would point at as the start of the item. Leaving a caret in front of it
 * is not a near miss: typing the first character of what the item is FOR
 * produces `- foo[ ] bar` and destroys it. That is true of an item the grammar
 * just created empty and of one that kept its text through a split, so the rule
 * does not ask which.
 *
 * Nor does it ask whether the box is ticked. Where an item's text begins is not
 * a function of its state — `itemContentIsEmpty`'s carve-out for a CHECKED box
 * belongs to the unwrap ladder, which decides whether an item may be outdented
 * away, a different question with a different answer.
 *
 * Stated on the resulting position rather than inside a `CaretOp` case: the same
 * position is reachable through more than one of them, and a case-by-case rule
 * is one a case added later can forget.
 *
 * Built on `caret.ts`'s own boundary, not on `ops.ts`' finished column — that
 * one swallows an ATX prefix too, and would move this caret onto the `#` of
 * `- # title`, which `caret-placement-policy` states it must not.
 *
 * Not a claim that `[ ]` is chrome (`enter-and-shift-enter-grammar` D5). The
 * content boundary, addressability, Home and the selection ladder are untouched;
 * a caret an operation PLACES moves by four characters, and one the user puts
 * there stays where they put it.
 */
function pastTaskMarker(doc: OutlineDoc, caret: LinePos): LinePos {
  const node = nodeAtLine(doc, caret.line);
  if (!node || node.kind !== 'list-item') return caret;
  if (nodeStartLine(doc, node.id) !== caret.line) return caret;
  const line = node.lines[0] ?? '';
  const boundary = contentBoundaryCh(node, line);
  if (caret.ch !== boundary) return caret;
  const task = taskMarkerLength(line.slice(boundary));
  return task === 0 ? caret : { line: caret.line, ch: boundary + task };
}
