/**
 * The outline keyboard grammar as a pure planner: (buffer, cursor, key) →
 * either null (decline the key: stock editor behavior) or a transaction
 * plan / rejection notice. No CodeMirror imports — the CM6 keymap wrapper
 * is a thin adapter, and this module is unit-testable.
 */

import type { OutlineDoc, OutlineNode } from '../model';
import { isAtom } from '../model';
import { parse } from '../parse';
import { indent, moveDown, moveUp, outdent, splitNode } from '../ops';
import type { OpOutput } from '../ops';
import type { OpResult } from '../result';
import { applyEdits } from '../result';
import { nodeAtLine } from './locate';
import { planCaret, type CaretOp } from '../caret-policy';
import { editsToChanges, mapCursorForward, type EditorChange, type EditorPos } from './dispatch';
import { REJECTION_MESSAGES } from './messages';

export type GrammarKey =
  | 'indent'
  | 'outdent'
  | 'move-up'
  | 'move-down'
  | 'split'
  | 'continue';

export interface TxPlan {
  changes: EditorChange[];
  /**
   * Cursor position in the NEW document, as a character offset, decided by
   * `caret-policy.ts` — see `planFromOp`, which supplies the facts.
   *
   * For indent/outdent (`minimal-change-dispatch`) the policy's answer is the
   * pre-op cursor mapped forward through the (minimal) change set with
   * assoc=1 — not the op's own cursor, and deliberately NOT left to the
   * editor's implicit default mapping either: CM6's own default assoc (-1)
   * disagrees with what `@codemirror/commands`' history redo later computes
   * (hardcoded assoc=1) whenever the cursor sits exactly at a change
   * boundary, which is common for Tab (see `dispatch.ts`'s
   * `mapCursorForward`). Computing that same assoc=1 mapping and stating it
   * explicitly keeps a live dispatch and its eventual redo mathematically
   * identical, so nothing needs recording. Every other structural operation's
   * resulting cursor is a deliberate choice (a join point, a moved node's new
   * location, the seam after a deletion) that mapping cannot recover at all.
   *
   * Indent/outdent fall back to the op's own cursor when the mapped position
   * would not be caret-addressable. That fallback IS recorded — it is a
   * dispatch whose cursor differs from the mapping, which is the axis
   * `record-decision.ts` keys on.
   */
  selection: number;
  userEvent: string;
}

export type GrammarOutcome = { plan: TxPlan } | { notice: string } | null;

function offsetInNewText(newLines: readonly string[], pos: EditorPos): number {
  let offset = 0;
  for (let i = 0; i < pos.line && i < newLines.length; i++) {
    offset += (newLines[i] ?? '').length + 1;
  }
  return offset + pos.ch;
}

function startLine(doc: OutlineDoc, target: OutlineNode): number {
  let line = doc.preamble.length;
  let found = -1;
  const walk = (node: OutlineNode): void => {
    if (found !== -1) return;
    if (node === target) {
      found = line;
      return;
    }
    line += node.lines.length + node.trailingGap.length;
    node.children.forEach(walk);
  };
  doc.children.forEach(walk);
  return found;
}

const LIST_CONT_RE = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]+)/;

/** Offset → `{line, ch}` within an already-built lines array. */
function posInLines(lines: readonly string[], offset: number): EditorPos {
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i]?.length ?? 0;
    if (offset <= acc + len) return { line: i, ch: offset - acc };
    acc += len + 1;
  }
  const last = Math.max(0, lines.length - 1);
  return { line: last, ch: lines[last]?.length ?? 0 };
}

/**
 * `mapCursorFrom`, when given, means "this op's own cursor is not the
 * semantic result — map this pre-op position forward through the change set
 * instead" (indent/outdent). Omitted, the op's own `OpOutput.cursor` is used
 * (every other structural op: its cursor is a deliberate choice, not
 * recoverable by mapping).
 *
 * Mapping is used only if it lands somewhere a caret may actually go, and
 * falls back to the operation's own cursor otherwise. The position being
 * mapped is the editor's main selection HEAD, which is a caret only when the
 * selection is empty: with a BLOCK SELECTION active it is the cover's end,
 * and a subtree cover ends on the trailing gap line it owns. Mapping a gap
 * position forward faithfully yields another gap position, so Tab on a
 * block-selected paragraph dispatched a caret onto a gap line — reported from
 * a real vault, and a regression this change introduced by preferring the
 * mapped position unconditionally.
 *
 * Testing addressability of the RESULT rather than emptiness of the input is
 * deliberate: it is the invariant that actually matters ("never dispatch a
 * caret onto a non-addressable position"), it needs no extra parameter
 * threaded from the CM6 adapter, and it also covers a genuine caret that was
 * already parked somewhere non-addressable by a programmatic placement, which
 * an emptiness test would miss. Column preservation is unaffected: a real
 * caret on content always maps to content.
 *
 * Amended by `caret-placement-policy`: that rule, and every other placement
 * rule, now lives in `caret-policy.ts`. This function supplies FACTS — the
 * before/after trees, the operation's anchor, and the mapped position when
 * the caller asked for one — plus which of the policy's four cases the
 * operation falls into. It holds no placement rule of its own, which is what
 * keeps the keyboard path from drifting away from the palette's.
 */
function planFromOp(
  lines: readonly string[],
  result: OpResult<OpOutput>,
  userEvent: string,
  op: CaretOp,
  before: OutlineDoc,
  mapCursorFrom?: EditorPos,
): GrammarOutcome {
  if (!result.ok) return { notice: REJECTION_MESSAGES[result.rejection.reason] };
  const changes = editsToChanges(lines, result.value.edits);
  const newLines = applyEdits(lines, result.value.edits);
  const after = parse(newLines.join('\n'));

  const mapped =
    mapCursorFrom === undefined
      ? undefined
      : posInLines(newLines, mapCursorForward(lines, changes, mapCursorFrom));

  const { caret } = planCaret(op, { before, after, anchor: result.value.anchor, mapped });

  return {
    plan: { changes, selection: offsetInNewText(newLines, caret), userEvent },
  };
}

/** Insert `text` at a position, cursor at its end — for Shift+Enter, which is
 * a text-level (transient-state) edit. */
function insertionPlan(
  lines: readonly string[],
  at: EditorPos,
  text: string,
  userEvent: string,
): GrammarOutcome {
  const before = (lines[at.line] ?? '').slice(0, at.ch);
  const changes: EditorChange[] = [{ from: at, to: at, text }];
  const inserted = text.split('\n');
  const newCursorLine = at.line + inserted.length - 1;
  const newCh =
    inserted.length === 1 ? before.length + text.length : (inserted.at(-1) ?? '').length;
  // Build enough of the new text to compute the offset.
  const newLines = [...lines];
  const tail = (lines[at.line] ?? '').slice(at.ch);
  newLines.splice(
    at.line,
    1,
    before + inserted[0]!,
    ...inserted.slice(1, -1),
    ...(inserted.length > 1 ? [(inserted.at(-1) ?? '') + tail] : []),
  );
  if (inserted.length === 1) newLines[at.line] = before + text + tail;
  return {
    plan: {
      changes,
      selection: offsetInNewText(newLines, { line: newCursorLine, ch: newCh }),
      userEvent,
    },
  };
}

export function planKey(
  text: string,
  cursor: EditorPos,
  key: GrammarKey,
  fallbackIndentUnit?: string,
): GrammarOutcome {
  const doc = parse(text);
  const node = nodeAtLine(doc, cursor.line);
  if (!node) return null; // preamble or nothing: stock behavior
  const lines = text === '' ? [] : text.split('\n');
  const nodeStart = startLine(doc, node);
  const onFirstLine = cursor.line === nodeStart;
  const onOwnLines = cursor.line < nodeStart + node.lines.length;

  // Atom interiors are opaque: only whole-atom ops from the first line.
  if (isAtom(node)) {
    if (!onFirstLine) return null;
    if (key === 'split' || key === 'continue') return null;
  }
  // Cursor on a gap line: structural ops act on the owning node; text-level
  // keys behave stock.
  if (!onOwnLines && (key === 'split' || key === 'continue')) return null;

  switch (key) {
    case 'indent':
      return planFromOp(
        lines,
        indent(doc, node.id, fallbackIndentUnit),
        'input.structure.indent',
        { kind: 'derived' },
        doc,
        cursor,
      );
    case 'outdent':
      return planFromOp(
        lines,
        outdent(doc, node.id, fallbackIndentUnit),
        'input.structure.outdent',
        { kind: 'derived' },
        doc,
        cursor,
      );
    case 'move-up':
      return planFromOp(lines, moveUp(doc, node.id), 'move.structure', { kind: 'subject' }, doc);
    case 'move-down':
      return planFromOp(lines, moveDown(doc, node.id), 'move.structure', { kind: 'subject' }, doc);
    case 'split':
      return planFromOp(
        lines,
        splitNode(doc, node.id, cursor, fallbackIndentUnit),
        'input.structure.split',
        { kind: 'exact' },
        doc,
      );
    case 'continue': {
      if (node.kind === 'list-item' && onFirstLine) {
        const match = LIST_CONT_RE.exec(node.lines[0] ?? '');
        const prefix = match ? `${match[1]}${' '.repeat(match[2]!.length + match[3]!.length)}` : '';
        return insertionPlan(lines, cursor, `\n${prefix}`, 'input');
      }
      if (node.kind === 'list-item') {
        // Continuation line: keep its own leading whitespace.
        const ws = /^[ \t]*/.exec(lines[cursor.line] ?? '')?.[0] ?? '';
        return insertionPlan(lines, cursor, `\n${ws}`, 'input');
      }
      return insertionPlan(lines, cursor, '\n', 'input');
    }
  }
}
