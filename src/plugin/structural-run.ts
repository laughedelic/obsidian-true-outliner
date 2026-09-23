/**
 * The shared command funnel: everything a structural entry point does between
 * "here is an operand and an operation" and "here is a transaction to
 * dispatch".
 *
 * `selection-structural-ops` requires every entry point to resolve one operand
 * and one after-state, and the funnel is where that requirement is kept. It was
 * the body of `main.ts`'s `runOp` while there were two entry points and one of
 * them held an Obsidian `Editor`. The gesture is a third, and it arrives
 * holding a CodeMirror view instead, so what the two paths share had to stop
 * being a method on the plugin.
 *
 * What stayed behind in each adapter is what genuinely differs: where the
 * operand comes from (a selection, or the node a pointer is holding), and how
 * the resulting transaction is dispatched. Everything between — the zoom-scope
 * refusal, the operation, the caret policy and the after-state — is here,
 * once; the cue a refusal shows is `notices.ts`, which is the same answer kept
 * apart only because it needs `obsidian`.
 *
 * The result is stated in Obsidian's `{line, ch}` world because the caret
 * policy and `afterState` both speak it; the view adapter converts on its way
 * out (`dispatch.ts`'s `changesToSpec`).
 */

import type { OutlineDoc } from '../model';
import type { LinePos } from '../line-pos';
import type { OpOutput } from '../ops';
import type { OpResult, RejectionReason } from '../result';
import { applyEdits } from '../result';
import { afterState } from '../operand';
import { planCaret, type CaretOp } from '../caret-policy';
import { parse } from '../parse';
import { operandEscapes, type ZoomScope } from '../zoom';
import { editsToChanges, mapCursorForward, type EditorChange } from './dispatch';
import { placeOutline } from './decorate';

/**
 * Note: `indent`/`outdent` also accept an optional trailing
 * `fallbackIndentUnit` (the unit to use for brand-new indentation with no
 * existing evidence in the document — see ops.ts's `destinationIndent`).
 * The command-palette path can't supply it: Obsidian's public `Editor`/
 * `MarkdownView` API doesn't expose the underlying CM6 `EditorState`, so
 * there's no public-API way to read the live "Indent using tabs" setting
 * (the `@codemirror/language` `indentUnit` facet) from a command callback
 * the way keymap.ts's Tab/Shift-Tab handler and transaction-filter.ts's
 * paste path do. Those commands fall back to inferring from the document's
 * own existing indentation — a known, small gap limited to the
 * command-palette / custom-hotkey entry point. The keyboard path and the
 * pointer gesture both hold the view, and both read the live unit.
 */
export type StructuralOp = (
  doc: OutlineDoc,
  groups: readonly (readonly number[])[],
) => OpResult<OpOutput>;

export interface StructuralRequest {
  /** The buffer as it stands at invocation. */
  readonly text: string;
  /** The tree to act on: the outline a provisional position stands for where
   * one is open, and the plain parse otherwise. Passed in rather than derived
   * here, because a gesture resolves its DESTINATION against this same tree
   * and its node ids have to be the ones the operation is given. */
  readonly opDoc: OutlineDoc;
  readonly groups: readonly (readonly number[])[];
  /** Whether the selection this operand came from was a block cover, which
   * decides the after-state between a cover and a caret. */
  readonly wasCover: boolean;
  readonly op: StructuralOp;
  readonly caret: CaretOp;
  /** The pre-operation caret, for the caret policy's derived form. */
  readonly mapFrom?: LinePos;
  /** The provisional position this operation is carrying, if any. */
  readonly placeLine?: number;
  /** The zoom scope, already re-resolved against `opDoc` — its ids are
   * compared against the operand's. */
  readonly scope?: ZoomScope | null;
  /** Outdent is the one operation whose result can leave a zoom scope from a
   * node that is not the root itself, so the guard has to be told. */
  readonly isOutdent?: boolean;
  /** The user's own selection orientation, which only each adapter can see: a
   * run built by extending upward keeps growing upward. */
  readonly backward?: boolean;
}

export type StructuralOutcome =
  | { readonly ok: false; readonly reason: RejectionReason }
  | {
      readonly ok: true;
      readonly changes: readonly EditorChange[];
      /** The document the changes produce, as lines. An adapter holding a view
       * needs it: the after-state is stated in the RESULT's coordinates, and
       * the state it is dispatched from is still the document before. */
      readonly newLines: readonly string[];
      readonly from: LinePos;
      readonly to?: LinePos;
    };

/**
 * The operation, and the transaction it asks for — or the reason it refused.
 *
 * Nothing here touches the editor: an adapter can ask what a drop would do
 * before it does it, and the unit suite can compare two entry points' answers
 * without one.
 */
export function planStructural(request: StructuralRequest): StructuralOutcome {
  const { opDoc, groups } = request;
  // `outline-zoom` D8: refuse an operand that would leave the scope, before the
  // algebra runs. Checked here and in `grammar.ts` against the SAME predicate,
  // so the entry points cannot disagree about it.
  if (request.scope && operandEscapes(request.scope, groups, request.isOutdent ?? false)) {
    return { ok: false, reason: 'would-leave-zoom-scope' };
  }
  const result = request.op(opDoc, groups);
  if (!result.ok) return { ok: false, reason: result.rejection.reason };

  const lines = request.text === '' ? [] : request.text.split('\n');
  const changes = editsToChanges(lines, result.value.edits);
  const newLines = applyEdits(lines, result.value.edits);
  const caret = resultCursor(
    lines,
    newLines,
    changes,
    opDoc,
    request.caret,
    result.value.anchor,
    request.mapFrom,
    request.placeLine,
  );
  // A selection that WAS a block cover survives the operation as the cover of
  // the nodes that moved; anything else lands a caret.
  const planned = afterState(result.value, request.wasCover, caret);
  const oriented =
    request.backward && planned.to ? { from: planned.to, to: planned.from } : planned;
  return { ok: true, changes, newLines, ...oriented };
}

/** A `{line, ch}` in the funnel's result as a flat offset into it. */
export function offsetInLines(lines: readonly string[], pos: LinePos): number {
  let offset = 0;
  for (let i = 0; i < pos.line && i < lines.length; i++) offset += (lines[i] ?? '').length + 1;
  return offset + pos.ch;
}

/**
 * The cursor a structural operation should end on: decided by
 * `caret-policy.ts`, the same procedure `grammar.ts` uses for the keyboard
 * path, so the entry points cannot diverge.
 *
 * Purely an adapter — it converts Obsidian's `{line, ch}` world into the
 * policy's facts and back. It holds no rule of its own; an earlier version
 * re-implemented the mapped-with-addressability-fallback rule here, and had
 * already drifted once (the palette missed the addressability guard entirely
 * until review caught it).
 */
function resultCursor(
  lines: readonly string[],
  newLines: readonly string[],
  changes: readonly EditorChange[],
  before: OutlineDoc,
  op: CaretOp,
  anchor: LinePos,
  mapFrom?: LinePos,
  placeLine?: number,
): LinePos {
  const afterText = newLines.join('\n');
  const mapped =
    mapFrom === undefined
      ? undefined
      : offsetToPos(newLines, mapCursorForward(lines, changes, mapFrom));
  // Read through the place the operation carried along, or the caret cannot stay
  // on it: `grammar.ts`'s `planFromOp` states why, and `placeOutline` holds the
  // gate every entry point asks through.
  const after = placeOutline(afterText, mapped, placeLine) ?? parse(afterText);
  return planCaret(op, { before, after, anchor, mapped }).caret;
}

/** Flat character offset (as `mapCursorForward` returns) → `{line, ch}`. */
function offsetToPos(lines: readonly string[], offset: number): LinePos {
  let acc = 0;
  for (let line = 0; line < lines.length; line++) {
    const len = lines[line]?.length ?? 0;
    if (offset <= acc + len) return { line, ch: offset - acc };
    acc += len + 1;
  }
  return { line: Math.max(0, lines.length - 1), ch: lines[lines.length - 1]?.length ?? 0 };
}
