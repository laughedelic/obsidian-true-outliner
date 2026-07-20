/**
 * CM6 adapter for the enforcement funnel (design.md D1/D2/D4): a single
 * `EditorState.transactionFilter` that classifies every transaction in an
 * outline-mode editor and, for `selection-only` transactions, escalates
 * boundary-crossing selections. Gated per-transaction on outline mode via
 * the public `editorInfoField` — the same pattern keymap.ts's
 * grammarExtension and decorations.ts's decorationsExtension use.
 *
 * All decision logic is pure (classify.ts, escalate.ts); this module only
 * extracts facts from a `Transaction`, converts between CM6 character
 * offsets and line/ch positions, and applies the verdict. Document text is
 * NEVER touched here — the filter's only permitted mutation is selection
 * replacement (node-selection-enforcement), applied via the `[tr, {
 * selection }]` return idiom so it lands inside the SAME transaction: no
 * second dispatch, no history entry, no observable intermediate state.
 */

import {
  EditorSelection,
  EditorState,
  Transaction,
  type Extension,
  type SelectionRange,
  type Text,
} from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import type { OutlineDoc } from '../model';
import { classify, type ChangedLineSpan, type TransactionFacts } from '../classify';
import { escalateRanges, rangesEqual, type LinePos, type LineRange } from '../escalate';
import type { ModeSource } from './keymap';
import { parsedDoc } from './parsed-doc';
import type { TransactionStats } from './stats';

export interface ClassificationSource extends ModeSource {
  readonly debugCrossCheck: boolean;
}

function offsetToLinePos(doc: Text, pos: number): LinePos {
  const line = doc.lineAt(pos);
  return { line: line.number - 1, ch: pos - line.from };
}

function linePosToOffset(doc: Text, pos: LinePos): number {
  return doc.line(pos.line + 1).from + pos.ch;
}

/** Old-document (`tr.startState.doc`) line spans touched by this
 * transaction's changes — inclusive on both ends (classify.ts's
 * convention). A pure insertion (fromA === toA) only ever touches the one
 * line it lands on. */
function collectChangedLineSpans(tr: Transaction): ChangedLineSpan[] {
  const spans: ChangedLineSpan[] = [];
  tr.changes.iterChangedRanges((fromA, toA) => {
    const fromLine = tr.startState.doc.lineAt(fromA).number - 1;
    const toLine = tr.startState.doc.lineAt(Math.max(fromA, toA - 1)).number - 1;
    spans.push({ fromLine, toLine });
  });
  return spans;
}

function toLineRange(doc: Text, range: SelectionRange): LineRange {
  return { anchor: offsetToLinePos(doc, range.anchor), head: offsetToLinePos(doc, range.head) };
}

/**
 * Escalates the transaction's resulting selection (`tr.newSelection` — the
 * old selection unchanged for a selection-only transaction with no explicit
 * new selection, or the dispatched new selection otherwise) through the
 * pure `escalateRanges`, which applies both the per-range rules and the
 * uniform multi-range rule (D4 as amended). Returns `undefined` if no
 * range actually changed, so the caller can skip wrapping the transaction.
 */
function escalateSelection(
  outlineDoc: OutlineDoc,
  doc: Text,
  tr: Transaction,
): EditorSelection | undefined {
  const before = tr.newSelection.ranges.map((range) => toLineRange(doc, range));
  const after = escalateRanges(outlineDoc, before);
  let changed = false;
  const ranges = tr.newSelection.ranges.map((original, i) => {
    if (rangesEqual(before[i]!, after[i]!)) return original;
    changed = true;
    const anchor = linePosToOffset(doc, after[i]!.anchor);
    const head = linePosToOffset(doc, after[i]!.head);
    return EditorSelection.range(anchor, head);
  });
  if (!changed) return undefined;
  return EditorSelection.create(ranges, tr.newSelection.mainIndex);
}

export function transactionFilterExtension(
  source: ClassificationSource,
  stats: TransactionStats,
): Extension {
  return EditorState.transactionFilter.of((tr) => {
    const path = tr.startState.field(editorInfoField, false)?.file?.path;
    if (!path || !source.isOutline(path)) return tr; // off-mode: byte-for-byte stock, nothing recorded

    const start = performance.now();
    const userEvent = tr.annotation(Transaction.userEvent);
    const isComposition = tr.isUserEvent('input.type.compose');
    const changedLineSpans = collectChangedLineSpans(tr);
    const { doc: outlineDoc } = parsedDoc(tr.startState.doc);

    const facts: TransactionFacts = { userEvent, isComposition, changedLineSpans };
    const cls = classify(facts, outlineDoc);

    let result: Transaction | readonly [Transaction, { selection: EditorSelection }] = tr;
    if (cls === 'selection-only') {
      const escalated = escalateSelection(outlineDoc, tr.startState.doc, tr);
      if (escalated) result = [tr, { selection: escalated }];
    }

    const ms = performance.now() - start;
    stats.record(cls, ms, userEvent);
    if (source.debugCrossCheck) {
      // console.warn (not .log), matching main.ts's existing crossCheck
      // logging under this same debug setting — one debug-console
      // convention across the plugin, not a new one.
      console.warn(
        `[true-outliner] tx classified "${cls}"`,
        { userEvent, isComposition, changedLineSpans, ms: Number(ms.toFixed(3)) },
      );
    }

    return result;
  });
}
