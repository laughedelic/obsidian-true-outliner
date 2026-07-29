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
import {
  isAddressable,
  nodeContentEnd,
  nodeContentStart,
  nextNodeInOrder,
  previousNodeInOrder,
  type LinePos,
} from './caret';

/**
 * Which case an operation's caret falls into. The dispatch site knows which
 * operation it invoked, so this is an argument rather than something inferred
 * from a `userEvent` string — inferring it from strings is the mechanism this
 * change removes from `history-caret.ts`.
 */
export type CaretOp =
  /** indent, outdent — the pre-op position mapped forward. */
  | { readonly kind: 'derived' }
  /** move up/down, heading level shift — the subject node's content start. */
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
  /**
   * True when `caret` is not what mapping would produce, so CodeMirror's
   * history cannot recompute it on redo and it must be recorded.
   *
   * The pure layer states it; `history-caret.ts` decides the live case by
   * comparing against CM6's own mapping, which cannot drift from the dispatch
   * sites the way a list of operation names can.
   */
  readonly record: boolean;
}

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

function samePos(a: LinePos, b: LinePos): boolean {
  return a.line === b.line && a.ch === b.ch;
}

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
  // Nothing precedes the deleted region: the node that now follows it starts
  // exactly where the deletion left off, which is the anchor's own line.
  const following = nodeAtLine(facts.after, facts.anchor.line);
  if (following) return nodeContentStart(facts.after, following);
  // Neither exists — the document is empty or preamble-only.
  return { line: facts.after.preamble.length, ch: 0 };
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

  switch (op.kind) {
    case 'derived':
      // The mapped position, but only where a caret may actually go. The
      // position being mapped is the main selection HEAD, which is a caret
      // only when the selection is empty — with a block cover active it is
      // the cover's end, and a cover ends on the trailing gap line it owns.
      caret =
        facts.mapped !== undefined && isAddressable(facts.after, facts.mapped)
          ? facts.mapped
          : subjectCaret(facts.after, facts.anchor);
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

  // The atom guard applies to BYSTANDER landings — a node the user did not
  // act on. A subject landing into a focus-capturing node is a different and
  // currently unreachable question (docs/research/13: structural keys are not
  // gated against the nested cell editor, so a table cannot be moved by
  // keyboard at all), left to its own change.
  if (bystander) caret = avoidCapturing(facts.after, caret);

  return {
    caret,
    record: facts.mapped === undefined || !samePos(caret, facts.mapped),
  };
}
