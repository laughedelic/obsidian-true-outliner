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
import { editsToChanges, type EditorChange, type EditorPos } from './dispatch';
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
  /** Cursor position in the NEW document, as a character offset. */
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

function planFromOp(
  lines: readonly string[],
  result: OpResult<OpOutput>,
  userEvent: string,
): GrammarOutcome {
  if (!result.ok) return { notice: REJECTION_MESSAGES[result.rejection.reason] };
  const changes = editsToChanges(lines, result.value.edits);
  const newLines = applyEdits(lines, result.value.edits);
  return {
    plan: {
      changes,
      selection: offsetInNewText(newLines, result.value.cursor),
      userEvent,
    },
  };
}

/** Insert `text` at a position, cursor at its end — for Enter-on-heading
 * and Shift+Enter, which are text-level (transient-state) edits. */
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

export function planKey(text: string, cursor: EditorPos, key: GrammarKey): GrammarOutcome {
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
      return planFromOp(lines, indent(doc, node.id), 'input.structure.indent');
    case 'outdent':
      return planFromOp(lines, outdent(doc, node.id), 'input.structure.outdent');
    case 'move-up':
      return planFromOp(lines, moveUp(doc, node.id), 'move.structure');
    case 'move-down':
      return planFromOp(lines, moveDown(doc, node.id), 'move.structure');
    case 'split': {
      if (node.kind === 'heading') {
        // Enter on a heading: empty paragraph child right below the line.
        const line = lines[cursor.line] ?? '';
        return insertionPlan(
          lines,
          { line: cursor.line, ch: line.length },
          '\n',
          'input.structure.split',
        );
      }
      return planFromOp(
        lines,
        splitNode(doc, node.id, cursor),
        'input.structure.split',
      );
    }
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
