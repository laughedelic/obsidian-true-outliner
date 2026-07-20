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
import { nodeAtLine } from './locate';

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
  'move.structure',
];

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

function isPluginOwn(facts: TransactionFacts): boolean {
  return PLUGIN_OWN_USER_EVENTS.some((prefix) => matchesEvent(facts.userEvent, prefix));
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
 * Classifies one transaction. Total and side-effect-free: every input
 * produces exactly one class, in the D2 order.
 */
export function classify(facts: TransactionFacts, doc: OutlineDoc): TransactionClass {
  if (isProgrammatic(facts)) return 'programmatic';
  if (facts.isComposition) return 'composition';
  if (isPluginOwn(facts)) return 'plugin-own';
  if (facts.changedLineSpans.length === 0) return 'selection-only';
  return facts.changedLineSpans.some((span) => spanCrossesBoundary(doc, span))
    ? 'boundary-crossing-edit'
    : 'within-node-edit';
}
