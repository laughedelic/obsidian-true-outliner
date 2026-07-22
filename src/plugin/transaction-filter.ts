/**
 * CM6 adapter for the enforcement funnel (design.md D1/D2/D4/D7): a single
 * `EditorState.transactionFilter` that classifies every transaction in an
 * outline-mode editor, escalates boundary-crossing selections
 * (`selection-only`), and — new in Phase C — hands `boundary-crossing-edit`
 * transactions to the pure verdict layer (`src/enforce.ts`), applying its
 * `pass`/`rewrite`/`veto` verdict. A companion `EditorView.updateListener`
 * (registered alongside the filter, not inside it — filters must stay
 * side-effect-free) surfaces the veto rejection cue, the same split
 * decorations.ts uses for DOM work (design.md D6).
 *
 * All decision logic is pure (classify.ts, escalate.ts, enforce.ts); this
 * module only extracts facts from a `Transaction`, converts between CM6
 * character offsets and line/ch positions, and applies the verdict.
 */

import {
  EditorSelection,
  EditorState,
  StateEffect,
  Transaction,
  type ChangeSpec,
  type Extension,
  type SelectionRange,
  type Text,
  type TransactionSpec,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editorInfoField, Notice } from 'obsidian';
import type { OutlineDoc } from '../model';
import { encodeLines } from '../encode';
import { classify, type ChangedLineSpan, type TransactionFacts } from '../classify';
import { clampCursorToContent, escalateRanges, rangesEqual, type LinePos, type LineRange } from '../escalate';
import { computeVerdict, type EditFact, type RewriteVerdict } from '../enforce';
import type { Edit, RejectionReason } from '../result';
import { applyEdits } from '../result';
import { editsToChanges } from './dispatch';
import { REJECTION_MESSAGES } from './messages';
import type { ModeSource } from './keymap';
import { parsedDoc } from './parsed-doc';
import type { TransactionStats } from './stats';

export interface ClassificationSource extends ModeSource {
  readonly debugCrossCheck: boolean;
}

/** Carries a veto's rejection reason to the update listener (design.md D6):
 * the filter attaches it, never shows the cue itself. */
export const vetoEffect = StateEffect.define<RejectionReason>();

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
 * line it lands on. Also carries the two Phase C facts classify.ts needs to
 * recognize boundary shapes a line-only span can't (node-edit-enforcement
 * D4/D5): the inserted text itself, and whether this change deletes
 * exactly one line-break character. */
function collectChangedLineSpans(tr: Transaction): ChangedLineSpan[] {
  const spans: ChangedLineSpan[] = [];
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    const fromLineObj = tr.startState.doc.lineAt(fromA);
    const toLineObj = tr.startState.doc.lineAt(Math.max(fromA, toA - 1));
    const insertedText = tr.newDoc.sliceString(fromB, toB);
    const deletesLineBoundary = toA === fromA + 1 && fromLineObj.to === fromA;
    spans.push({
      fromLine: fromLineObj.number - 1,
      toLine: toLineObj.number - 1,
      insertedText,
      deletesLineBoundary,
      fromCh: fromA - fromLineObj.from,
      toCh: toA - toLineObj.from,
    });
  });
  return spans;
}

/**
 * The transaction's single change, in old-document `LinePos` coordinates,
 * for the verdict layer (`EditFact`). `undefined` when the transaction has
 * zero or more-than-one change ranges — the verdict layer treats that as
 * `pass` (design.md D1's conservative bias: this phase models the
 * single-range shapes the spec scenarios describe, not multi-cursor edits).
 */
function collectEditFact(tr: Transaction): EditFact | undefined {
  let fact: EditFact | undefined;
  let count = 0;
  const cursorBefore = offsetToLinePos(tr.startState.doc, tr.startState.selection.main.head);
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    count++;
    if (count > 1) return;
    fact = {
      from: offsetToLinePos(tr.startState.doc, fromA),
      to: offsetToLinePos(tr.startState.doc, toA),
      insert: tr.newDoc.sliceString(fromB, toB),
      cursorBefore,
    };
  });
  return count === 1 ? fact : undefined;
}

/** `verdict.edits` (old-document line ranges) → a CM6 `ChangeSpec` against
 * `tr.startState.doc`, via the same `editsToChanges` position-based
 * conversion the grammar's own dispatches use. */
function editsToChangeSpec(doc: Text, oldLines: readonly string[], edits: readonly Edit[]): ChangeSpec[] {
  return editsToChanges(oldLines, edits).map((c) => ({
    from: linePosToOffset(doc, c.from),
    to: linePosToOffset(doc, c.to),
    insert: c.text,
  }));
}

/** Character offset of a `{line, ch}` position in a freshly-built lines
 * array (the NEW document a rewrite's edits produce) — no `Text` instance
 * needed, mirroring grammar.ts's own `offsetInNewText`. */
function offsetInLines(lines: readonly string[], pos: { line: number; ch: number }): number {
  let offset = 0;
  for (let i = 0; i < pos.line && i < lines.length; i++) offset += (lines[i] ?? '').length + 1;
  return offset + pos.ch;
}

function toLineRange(doc: Text, range: SelectionRange): LineRange {
  return { anchor: offsetToLinePos(doc, range.anchor), head: offsetToLinePos(doc, range.head) };
}

/**
 * Escalates the transaction's resulting selection (`tr.newSelection` — the
 * old selection unchanged for a selection-only transaction with no explicit
 * new selection, or the dispatched new selection otherwise) through the
 * pure `escalateRanges`, which applies both the per-range rules and the
 * uniform multi-range rule (D4 as amended). A cursor (empty range) that
 * `escalateRanges` leaves untouched by design is additionally run through
 * `clampCursorToContent` (D13) — a separate, narrower mechanism for list-
 * item marker prefixes only. Returns `undefined` if no range actually
 * changed, so the caller can skip wrapping the transaction.
 */
function escalateSelection(
  outlineDoc: OutlineDoc,
  doc: Text,
  tr: Transaction,
): EditorSelection | undefined {
  const before = tr.newSelection.ranges.map((range) => toLineRange(doc, range));
  const escalated = escalateRanges(outlineDoc, before);
  const after = escalated.map((range) => {
    if (range.anchor.line !== range.head.line || range.anchor.ch !== range.head.ch) return range;
    const clamped = clampCursorToContent(outlineDoc, range.anchor);
    return clamped === range.anchor ? range : { anchor: clamped, head: clamped };
  });
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

/**
 * Builds the replacement `TransactionSpec` for a `rewrite` verdict
 * (design.md D7): the original changes are replaced WHOLESALE (never
 * layered on top of `tr` — that would apply both), carrying the verdict's
 * plugin-own `userEvent` (the D7a short-circuit), the post-op cursor as an
 * explicit selection, and an explicit `addToHistory: true` so the rewrite
 * forms exactly one undo step.
 */
function buildRewriteSpec(tr: Transaction, outlineDoc: OutlineDoc, verdict: RewriteVerdict): TransactionSpec {
  const oldLines = encodeLines(outlineDoc);
  const changes = editsToChangeSpec(tr.startState.doc, oldLines, verdict.edits);
  const newLines = applyEdits(oldLines, verdict.edits);
  const cursorOffset = offsetInLines(newLines, verdict.cursor);
  return {
    changes,
    selection: EditorSelection.cursor(cursorOffset),
    userEvent: verdict.userEvent,
    annotations: Transaction.addToHistory.of(true),
  };
}

export function transactionFilterExtension(
  source: ClassificationSource,
  stats: TransactionStats,
): Extension {
  const filter = EditorState.transactionFilter.of((tr) => {
    const path = tr.startState.field(editorInfoField, false)?.file?.path;
    if (!path || !source.isOutline(path)) return tr; // off-mode: byte-for-byte stock, nothing recorded

    const start = performance.now();
    const userEvent = tr.annotation(Transaction.userEvent);
    const isComposition = tr.isUserEvent('input.type.compose');
    const changedLineSpans = collectChangedLineSpans(tr);
    const { doc: outlineDoc } = parsedDoc(tr.startState.doc);

    const cursorBefore = offsetToLinePos(
      tr.startState.doc,
      tr.startState.selection.main.head,
    );
    const facts: TransactionFacts = { userEvent, isComposition, changedLineSpans, cursorBefore };
    const cls = classify(facts, outlineDoc);

    let result: Transaction | TransactionSpec | readonly [Transaction, { selection: EditorSelection }] = tr;
    let verdictKind: 'pass' | 'rewrite' | 'veto' | undefined;

    if (cls === 'selection-only') {
      const escalated = escalateSelection(outlineDoc, tr.startState.doc, tr);
      if (escalated) result = [tr, { selection: escalated }];
    } else if (cls === 'boundary-crossing-edit') {
      const edit = collectEditFact(tr);
      const verdict = computeVerdict(cls, outlineDoc, edit);
      verdictKind = verdict.kind;
      if (verdict.kind === 'rewrite') {
        result = buildRewriteSpec(tr, outlineDoc, verdict);
      } else if (verdict.kind === 'veto') {
        // Dissolve the transaction: no changes, no selection change — just
        // an effect the update listener below observes to show the cue
        // (design.md D6: never a side effect inside the filter itself).
        result = { effects: vetoEffect.of(verdict.reason) };
      }
    }

    const ms = performance.now() - start;
    stats.record(cls, ms, userEvent);
    if (verdictKind) stats.recordVerdict(verdictKind, ms);
    if (source.debugCrossCheck) {
      // console.warn (not .log), matching main.ts's existing crossCheck
      // logging under this same debug setting — one debug-console
      // convention across the plugin, not a new one.
      console.warn(
        `[true-outliner] tx classified "${cls}"${verdictKind ? ` verdict "${verdictKind}"` : ''}`,
        { userEvent, isComposition, changedLineSpans, ms: Number(ms.toFixed(3)) },
      );
    }

    return result;
  });

  const vetoCue = EditorView.updateListener.of((update) => {
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (effect.is(vetoEffect)) {
          new Notice(REJECTION_MESSAGES[effect.value] ?? effect.value, 1500);
        }
      }
    }
  });

  return [filter, vetoCue];
}
