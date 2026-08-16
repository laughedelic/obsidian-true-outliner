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
  type Text,
  type TransactionSpec,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';
import { editorInfoField, Notice } from 'obsidian';
import type { OutlineDoc } from '../model';
import { encodeLines } from '../encode';
import { classify, type ChangedLineSpan, type TransactionFacts } from '../classify';
import { escalateRanges } from '../escalate';
import { rangesEqual } from '../line-pos';
import { resolvePlacement, resolveMarkerPlacement } from '../caret';
import { linePosToOffset, offsetToLinePos, toLineRange } from './cm-pos';
import { computeVerdictForRanges, type EditFact, type RewriteVerdict } from '../enforce';
import type { Edit, RejectionReason } from '../result';
import { applyEdits } from '../result';
import { editsToChanges } from './dispatch';
import { REJECTION_MESSAGES } from './messages';
import type { ModeSource } from './keymap';
import { parsedDoc } from './parsed-doc';
import { isNestedTransaction } from './nested-editor';
import type { TransactionStats } from './stats';

export interface ClassificationSource extends ModeSource {
  readonly debugCrossCheck: boolean;
}

/** Carries a veto's rejection reason to the update listener (design.md D6):
 * the filter attaches it, never shows the cue itself. */
export const vetoEffect = StateEffect.define<RejectionReason>();

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
      rangeEnd: offsetToLinePos(tr.startState.doc, toA),
    });
  });
  return spans;
}

/**
 * ALL of the transaction's changes, each in old-document `LinePos`
 * coordinates, for the verdict layer (`EditFact`). `fix-orphan-gap-on-node-
 * deletion` D2 lifts the original single-change-range restriction: every
 * range is now collected, and `computeVerdictForRanges` decides per-range
 * whether the shapes it sees are enforceable, falling back to `pass` for
 * anything it doesn't model.
 */
function collectEditFacts(tr: Transaction): EditFact[] {
  const facts: EditFact[] = [];
  const cursorBefore = offsetToLinePos(tr.startState.doc, tr.startState.selection.main.head);
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    facts.push({
      from: offsetToLinePos(tr.startState.doc, fromA),
      to: offsetToLinePos(tr.startState.doc, toA),
      insert: tr.newDoc.sliceString(fromB, toB),
      cursorBefore,
    });
  });
  return facts;
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

/**
 * Escalates the transaction's resulting selection (`tr.newSelection` — the
 * old selection unchanged for a selection-only transaction with no explicit
 * new selection, or the dispatched new selection otherwise) through the
 * pure `escalateRanges`, which applies both the per-range rules and the
 * uniform multi-range rule (D4 as amended). A cursor (empty range) that
 * `escalateRanges` leaves untouched by design is additionally run through
 * `resolvePlacement` (content-space-caret D2) — the general content-space
 * placement resolver, which supersedes the old marker-only
 * `clampCursorToContent` by also catching gap lines (D9's reversal: a
 * cursor can no longer rest on one in outline mode). Returns `undefined` if
 * no range actually changed, so the caller can skip wrapping the
 * transaction.
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
    const resolved = resolvePlacement(outlineDoc, range.anchor);
    return resolved === range.anchor ? range : { anchor: resolved, head: resolved };
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
 * Cursor placement resolution for a FOREIGN selection-only dispatch that
 * classifies `programmatic` (no `userEvent` at all, no changes).
 *
 * Measured (docs/research/04 Q25): pressing Home on a checkbox list item
 * lands our own dispatch correctly on content start, and Obsidian core then
 * issues a SEPARATE, later selection-only dispatch that moves the caret back
 * to column 0 — onto the `- ` marker, the exact position this change makes
 * non-addressable. Captured with a `cm.dispatch` monkey-patch recording
 * stack traces: the second dispatch originates in `app://obsidian.md/app.js`
 * (Obsidian's own checkbox-widget mount), carries no annotations, and is
 * not ours. Because `isProgrammatic` claims every `userEvent`-less
 * transaction BEFORE the `selection-only` test (src/classify.ts), it
 * bypassed placement resolution entirely — the caret invariant had a hole
 * exactly where any foreign, unannotated cursor move lands.
 *
 * Deliberately narrower than `escalateSelection` in TWO ways.
 *
 * Only EMPTY ranges are touched: a non-empty programmatic selection stays
 * exempt, preserving node-selection-enforcement's own accepted
 * `programmatic` case (a workspace restore, a nested editor's focus
 * hand-off) which must not be escalated.
 *
 * And only the MARKER half of placement resolution applies
 * (`resolveMarkerPlacement`), never the gap half. D2 deliberately scopes
 * gap-line resolution to real user gestures, and 62-outline-enforcement
 * asserts it directly ("a PROGRAMMATIC gap-line placement is untouched").
 * The marker clamp has no such limit — it predates this change as
 * node-edit-enforcement's `clampCursorToContent` (D13) and always applied
 * to any cursor from any source.
 *
 * Nested per-cell table editors are handled EARLIER, by the
 * `isNestedTransaction` gate at the top of the filter — not by anything about
 * this branch. An earlier version of this comment claimed a cell was safe
 * because its tiny document is plain text with no marker to clamp; that is
 * false. A cell whose text starts with `- ` parses as a list item, and this
 * branch did clamp stock motion inside it until the gate existed. The gate is
 * the reason, and it has its own regression test.
 *
 * Idempotent, and so self-terminating: `resolveMarkerPlacement` maps an
 * already-addressable position to itself, so the appended correction
 * reports no change on re-entry and appends nothing further — the same
 * property the `selection-only` branch above already relies on.
 */
function resolveForeignCursors(
  outlineDoc: OutlineDoc,
  doc: Text,
  tr: Transaction,
): EditorSelection | undefined {
  let changed = false;
  const ranges = tr.newSelection.ranges.map((original) => {
    if (!original.empty) return original; // selections keep the programmatic exemption
    const pos = offsetToLinePos(doc, original.head);
    const resolved = resolveMarkerPlacement(outlineDoc, pos);
    if (resolved.line === pos.line && resolved.ch === pos.ch) return original;
    changed = true;
    return EditorSelection.cursor(linePosToOffset(doc, resolved));
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

    // A nested per-cell table editor resolves to the SAME host file, so without
    // this it would be enforced as if its tiny document were the outline. See
    // nested-editor.ts: a cell whose text starts with `- ` parses as a list
    // item, and stock motion inside it was being clamped off the "marker".
    // `isNestedTransaction` also covers the flag's own startup window, where the
    // setting dispatch's `startState` still reads false.
    if (isNestedTransaction(tr)) return tr;

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
    } else if (cls === 'programmatic' && userEvent === undefined && changedLineSpans.length === 0) {
      // A foreign, unannotated cursor move (see resolveForeignCursors).
      const placed = resolveForeignCursors(outlineDoc, tr.startState.doc, tr);
      if (placed) result = [tr, { selection: placed }];
    } else if (cls === 'boundary-crossing-edit') {
      const edits = collectEditFacts(tr);
      // Public CM6 facet, same as keymap.ts's grammar path — Obsidian sets
      // it from "Indent using tabs", so a structural rewrite that has to
      // materialize brand-new indentation (paste/type-over with no
      // existing indented line to infer from) respects the same setting.
      const verdict = computeVerdictForRanges(cls, outlineDoc, edits, tr.startState.facet(indentUnit));
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
