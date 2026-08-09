/**
 * Transaction classification (design.md D2/D3): the enforcement funnel's
 * pure core. Classifies a transaction against the parsed tree using plain
 * data facts extracted by the CM6 adapter (src/plugin/transaction-filter.ts)
 * — no CodeMirror/Obsidian imports, unit- and property-tested independently.
 *
 * Six classes, evaluated in this order, first match wins (D2). The order
 * IS the specification: it is what makes every transaction receive exactly
 * one class, and what keeps the polarity default-permit (an edit or
 * selection this module doesn't recognize with confidence falls through to
 * the least specific applicable class — selection-only or an edit class —
 * rather than being invented a false enforcement class).
 */

import type { OutlineDoc } from './model';
import { nodeAtLine, nodeStartLine } from './locate';
import { parse } from './parse';
import { contentColumnCh } from './ops';
import { coveredSubtreeRoots, type LinePos, type LineRange } from './escalate';

export type TransactionClass =
  | 'programmatic'
  | 'composition'
  | 'plugin-own'
  | 'selection-only'
  | 'within-node-edit'
  | 'boundary-crossing-edit';

/**
 * One document change's OLD-document line span, inclusive on both ends —
 * unlike ops.ts's `Edit` (exclusive `toLine`), because this only ever needs
 * to ask "which node(s) does this touch," never to re-slice a line array.
 * A pure insertion (nothing deleted) has `fromLine === toLine`: it only
 * ever touches the single line it lands on.
 */
export interface ChangedLineSpan {
  readonly fromLine: number;
  readonly toLine: number;
  /**
   * Text this change inserts, verbatim — populated only by the Phase C
   * adapter, optional so every pre-existing call site (and test) is
   * unaffected. Needed for exactly one thing: a multi-block paste/drop
   * landing at a single cursor position (nothing deleted) never crosses a
   * boundary by span alone — `fromLine === toLine` in the OLD document,
   * since nothing spanned multiple lines before the edit — so recognizing
   * it as `boundary-crossing-edit` requires looking at what's being
   * inserted, not just what was touched (node-edit-enforcement D5).
   */
  readonly insertedText?: string;
  /**
   * True when this change deletes EXACTLY one character and that character
   * is the line break ending `fromLine` — the Backspace-at-node-start /
   * Delete-at-node-end shape (node-edit-enforcement D4). A single-character
   * deletion always has `fromLine === toLine` above by construction (removing
   * one character can't span two lines under the `Math.max(fromA, toA - 1)`
   * convention, which is deliberately blind to a single trailing newline —
   * correct for the boundary-INSENSITIVE cases that convention exists for),
   * so recognizing THIS one shape as boundary-crossing needs this separate
   * bit from the adapter, which alone has the true character offsets.
   */
  readonly deletesLineBoundary?: boolean;
  /**
   * Character offsets of the change's OLD-document range on `fromLine` /
   * `toLine` — populated by the Phase C adapter alongside the two facts
   * above, needed only by the chrome-boundary shapes (a marker-space
   * deletion is invisible at line granularity).
   */
  readonly fromCh?: number;
  readonly toCh?: number;
  /**
   * The change's true OLD-document end position (`lineAt(toA)` directly) —
   * unlike `toLine`/`toCh` above, which use the `Math.max(fromA, toA - 1)`
   * convention and so read as the LAST TOUCHED line, not where the range
   * actually ends (deliberately, for the boundary-INSENSITIVE cases that
   * convention exists for). Needed for exactly one thing (node-edit-
   * enforcement's exact-cover amendment): recognizing a deletion whose range
   * exactly covers one or more whole subtrees, including the trailing gap's
   * final newline — a check that must see the range's real end, which the
   * `toA - 1` idiom is exactly blind to. Optional, like the facts above.
   */
  readonly rangeEnd?: LinePos;
}

/**
 * Facts the CM6 adapter extracts from a `Transaction`, over the doc BEFORE
 * the change (`tr.startState`) — classification describes what the
 * transaction DID, not the document it produced.
 */
export interface TransactionFacts {
  /** `tr.annotation(Transaction.userEvent)` — undefined for programmatic/
   * remote/sync dispatches (D3: absence is the load-bearing convention). */
  readonly userEvent: string | undefined;
  /** `tr.isUserEvent('input.type.compose')` — CM6's own IME marker. */
  readonly isComposition: boolean;
  /** Empty iff the transaction has no document changes at all. */
  readonly changedLineSpans: readonly ChangedLineSpan[];
  /**
   * The PRE-edit main-selection head (old-document line/ch) — the fact that
   * distinguishes a chrome-boundary merge intent from deliberate gap
   * editing (node-edit-enforcement's chrome-transparency amendment):
   * Backspace at a node's content start and Delete at the end of the
   * preceding gap line produce byte-identical transactions; only where the
   * cursor WAS tells them apart. Optional so every pre-amendment call site
   * (and test) is unaffected; without it the chrome shapes simply don't
   * classify as boundary-crossing (conservative default).
   */
  readonly cursorBefore?: { readonly line: number; readonly ch: number };
}

/** This plugin's own grammar/command userEvent values (grammar.ts) —D2
 * class 3, "already valid by construction." `move.structure` and the
 * `input.structure.*` family; Shift+Enter's continuation insert
 * deliberately reuses generic `input` (see design's D3 open-question note)
 * and is NOT in this list — it still lands correctly, as within-node-edit,
 * since a single-line insertion can never cross a boundary. */
const PLUGIN_OWN_USER_EVENTS: readonly string[] = [
  'input.structure.indent',
  'input.structure.outdent',
  'input.structure.split',
  // The two operations the Enter/Shift+Enter grammar reaches that are not
  // splits: leaving a list from an empty item, and drafting the next heading.
  // Both are structural dispatches and must short-circuit the verdict layer
  // like every other one — without an entry here they would be classified by
  // SHAPE, and a whole-line removal or a new heading line reads as a
  // boundary-crossing edit for enforcement to rewrite.
  'input.structure.unwrap',
  'input.structure.sibling-heading',
  'move.structure',
  // node-edit-enforcement rewrites (design.md D7a): these carry the SAME
  // short-circuit grammar dispatches already rely on — a rewritten
  // transaction must never be handed back to the verdict layer a second
  // time, so it is unconditionally `plugin-own` regardless of the shape of
  // the change it carries.
  'delete.structural',
  'input.paste.structural',
];

/*
 * `SEMANTIC_CURSOR_USER_EVENTS` / `hasSemanticCursor` lived here until
 * `caret-placement-policy`: the subset of the above whose resulting cursor was
 * a CHOICE rather than a function of the pre-operation caret, used to decide
 * what the history recorder had to re-assert.
 *
 * Removed because the distinction is not a property of the OPERATION. Indent
 * and outdent derive their cursor by mapping — except when the mapped position
 * would not be addressable, where they fall back to the operation's own cursor
 * and are choosing one after all. A list keyed on the operation left that
 * dispatch unrecorded, and a redo put the caret back on a gap line.
 *
 * `history-caret.ts`'s `needsRecording` now asks the transaction directly,
 * comparing the dispatched selection against CM6's own forward mapping at the
 * association its redo restore uses. That preserves what this set existed for —
 * redo restores the dispatched cursor — while recording strictly fewer
 * transactions: an operation on this list whose chosen position happens to
 * equal the mapped one (a split inserting its marker at the caret) no longer
 * pays for a recording that would change nothing. And it cannot drift from the
 * dispatch sites, because there is no list to maintain.
 */

/** CM6's own `Transaction.isUserEvent` semantics, reimplemented on plain
 * strings (dot-namespaced prefix match) so this module stays CM6-import-
 * free: `event` matches `prefix` if equal, or if `event` extends `prefix`
 * with a `.`-separated suffix. */
function matchesEvent(userEvent: string | undefined, prefix: string): boolean {
  if (userEvent === undefined) return false;
  return (
    userEvent === prefix ||
    (userEvent.length > prefix.length &&
      userEvent.startsWith(prefix) &&
      userEvent[prefix.length] === '.')
  );
}

function isProgrammatic(facts: TransactionFacts): boolean {
  // No annotation at all covers setValue-style full-document loads and any
  // dispatch with no explicit origin (D2 class 1). undo/redo are CM6
  // history's own userEvent values (D3) — restores, never re-normalized.
  // Phase A finding (tasks.md 3.8): Obsidian reconciling an external file
  // change into an already-open editor (Vault.process/Vault.modify from
  // another process, sync, a reload) does NOT arrive with an undefined
  // userEvent as D3 originally hypothesized — it dispatches a real
  // transaction annotated `"set"`. Confirmed live (60-transaction-
  // classification.e2e.ts): without this, such a reconciliation with a
  // diff spanning multiple nodes classified `boundary-crossing-edit`
  // instead of `programmatic` — still safe by default-permit (nothing is
  // rewritten either way in this change), but it inflates the
  // boundary-crossing-edit count Phase C will use for sizing, which is
  // meant to measure USER edits, not external syncs. Tightened per D3's
  // own guidance ("the finding gets recorded and the classifier
  // tightened").
  return (
    facts.userEvent === undefined ||
    matchesEvent(facts.userEvent, 'undo') ||
    matchesEvent(facts.userEvent, 'redo') ||
    matchesEvent(facts.userEvent, 'set')
  );
}

/**
 * Whether a `userEvent` identifies a transaction this plugin dispatched
 * itself.
 */
export function isPluginOwnUserEvent(userEvent: string | undefined): boolean {
  return PLUGIN_OWN_USER_EVENTS.some((prefix) => matchesEvent(userEvent, prefix));
}

function isPluginOwn(facts: TransactionFacts): boolean {
  return isPluginOwnUserEvent(facts.userEvent);
}

/** A line's identity for boundary comparisons: the owning node's id, or the
 * sentinel `'preamble'` for frontmatter/pre-first-node lines (never a real
 * node id, since ids start at 1 — see model.ts's `nextId`). */
function lineIdentity(doc: OutlineDoc, line: number): number | 'preamble' {
  return nodeAtLine(doc, line)?.id ?? 'preamble';
}

function spanCrossesBoundary(doc: OutlineDoc, span: ChangedLineSpan): boolean {
  return lineIdentity(doc, span.fromLine) !== lineIdentity(doc, span.toLine);
}

/**
 * Whether a parsed block sequence needs boundary splicing rather than a raw
 * character-level insertion (node-edit-enforcement D5, corrected 2026-07-22
 * third manual pass): true for more than one top-level block, OR a single
 * top-level block that itself has CHILDREN — a whole one-node subtree copy
 * (e.g. a list item with nested children) needs exactly the same splice/
 * re-indent treatment a multi-node copy does, since its children's
 * indentation is baked into the copied text at the ORIGINAL depth and is
 * meaningless pasted verbatim at a different one. A single block with no
 * children (a plain paragraph, or a lone childless list item) is left as a
 * raw insertion — indistinguishable from continuation-line typing.
 */
export function isStructuralBlockSequence(parsedBlocks: readonly { children: readonly unknown[] }[]): boolean {
  return parsedBlocks.length > 1 || (parsedBlocks.length === 1 && parsedBlocks[0]!.children.length > 0);
}

/**
 * A pure insertion (nothing deleted) whose inserted text parses as a
 * structural block sequence (see `isStructuralBlockSequence`), landing on a
 * real node's own line (not the preamble) — the shape node-edit-enforcement
 * D5 splices at a boundary rather than leaving as a raw mid-node character
 * insertion.
 */
function isMultiBlockInsertion(doc: OutlineDoc, span: ChangedLineSpan): boolean {
  if (!span.insertedText) return false;
  if (span.fromLine !== span.toLine) return false;
  if (!nodeAtLine(doc, span.fromLine)) return false; // preamble: out of jurisdiction
  return isStructuralBlockSequence(parse(span.insertedText).children);
}

/** The single-newline-deletion shape (see `deletesLineBoundary`'s own
 * comment) checked against the line immediately following `fromLine` —
 * the line whose owner the removed newline used to separate `fromLine`
 * from. */
function crossesViaBoundaryDeletion(doc: OutlineDoc, span: ChangedLineSpan): boolean {
  if (!span.deletesLineBoundary) return false;
  return lineIdentity(doc, span.fromLine) !== lineIdentity(doc, span.fromLine + 1);
}

/**
 * Chrome-boundary deletion shapes (node-edit-enforcement's
 * chrome-transparency amendment, 2026-07-21) — deletions that stay inside
 * ONE node at line granularity yet express a content-level merge intent,
 * established by the pre-edit cursor:
 *
 * 1. Marker-space deletion: a single-character deletion on a list item's
 *    first line ending exactly at its content column, cursor there —
 *    Backspace at the item's first content character eating the marker's
 *    trailing space.
 * 2. Delete into the own gap: a single-newline deletion whose adjacent
 *    lines BOTH belong to one node (the newline ending its last content
 *    line, pulling its own trailing gap up), cursor at the node's content
 *    end — Delete at the last content character reaching for the next node
 *    through the gap.
 *
 * The same bytes with the cursor elsewhere (editing the gap from within
 * it) deliberately do NOT match — that's the native whitespace-authoring
 * escape hatch.
 */
function crossesViaChromeDeletion(
  doc: OutlineDoc,
  facts: TransactionFacts,
  span: ChangedLineSpan,
): boolean {
  const cursor = facts.cursorBefore;
  if (!cursor) return false;
  if (span.insertedText !== undefined && span.insertedText !== '') return false;

  // Shape 1: marker-space deletion at a list item's content start.
  if (
    span.fromLine === span.toLine &&
    span.fromCh !== undefined &&
    span.toCh !== undefined &&
    span.toCh - span.fromCh === 1 &&
    !span.deletesLineBoundary
  ) {
    const node = nodeAtLine(doc, span.fromLine);
    if (!node || node.kind !== 'list-item') return false;
    if (nodeStartLine(doc, node.id) !== span.fromLine) return false;
    const contentCol = contentColumnCh(node.lines[0] ?? '');
    return (
      span.toCh === contentCol && cursor.line === span.fromLine && cursor.ch === contentCol
    );
  }

  // Shape 2: Delete at content end into the node's own trailing gap.
  if (span.deletesLineBoundary) {
    const node = nodeAtLine(doc, span.fromLine);
    if (!node) return false;
    if (nodeAtLine(doc, span.fromLine + 1) !== node) return false; // crossing case is handled above
    const lastContentLine = nodeStartLine(doc, node.id) + node.lines.length - 1;
    if (span.fromLine !== lastContentLine) return false; // gap-interior deletion
    const lastLen = (node.lines[node.lines.length - 1] ?? '').length;
    return cursor.line === lastContentLine && cursor.ch === lastLen;
  }

  return false;
}

/**
 * A change whose range exactly covers one or more whole subtrees — including
 * each covered subtree's owned trailing gap (`fix-orphan-gap-on-node-
 * deletion` D1) — even though its raw line span (`spanCrossesBoundary`) falls
 * inside a single node. Reuses `escalate.ts`'s exported `coveredSubtreeRoots`
 * rather than a second cover computation (the duplication hazard recorded in
 * docs/research/04 Q18/Q19). Needs `rangeEnd` (the untruncated end position);
 * without it, this never matches — the conservative default for pre-Phase
 * C-amendment callers.
 */
function isExactSubtreeCoverDeletion(doc: OutlineDoc, span: ChangedLineSpan): boolean {
  if (span.fromCh === undefined || !span.rangeEnd) return false;
  const range: LineRange = { anchor: { line: span.fromLine, ch: span.fromCh }, head: span.rangeEnd };
  return coveredSubtreeRoots(doc, range) !== null;
}

/**
 * Classifies one transaction. Total and side-effect-free: every input
 * produces exactly one class, in the D2 order.
 */
export function classify(facts: TransactionFacts, doc: OutlineDoc): TransactionClass {
  if (isProgrammatic(facts)) return 'programmatic';
  if (facts.isComposition) return 'composition';
  if (isPluginOwn(facts)) return 'plugin-own';
  if (facts.changedLineSpans.length === 0) return 'selection-only';
  if (facts.changedLineSpans.some((span) => spanCrossesBoundary(doc, span))) {
    return 'boundary-crossing-edit';
  }
  const other = facts.changedLineSpans.some(
    (span) =>
      isMultiBlockInsertion(doc, span) ||
      crossesViaBoundaryDeletion(doc, span) ||
      crossesViaChromeDeletion(doc, facts, span) ||
      isExactSubtreeCoverDeletion(doc, span),
  );
  return other ? 'boundary-crossing-edit' : 'within-node-edit';
}
