/**
 * Minimal line edits → editor change ranges ({line, ch} positions), for a
 * single `Editor.transaction`. Pure module, property-tested against the
 * library's own applyEdits.
 */

import type { Edit } from '../result';

export interface EditorPos {
  line: number;
  ch: number;
}

export interface EditorChange {
  from: EditorPos;
  to: EditorPos;
  text: string;
}

/**
 * Convert one line-range edit into a position-based change against the
 * buffer snapshot `lines` (the same snapshot the op was computed from).
 */
export function editToChange(lines: readonly string[], edit: Edit): EditorChange {
  const { fromLine, toLine, insert } = edit;
  const endOfDoc: EditorPos = {
    line: Math.max(0, lines.length - 1),
    ch: lines[lines.length - 1]?.length ?? 0,
  };

  if (toLine < lines.length) {
    // Replacement ends before EOF: cover whole lines including their
    // terminating newlines.
    return {
      from: { line: fromLine, ch: 0 },
      to: { line: toLine, ch: 0 },
      text: insert.length > 0 ? insert.join('\n') + '\n' : '',
    };
  }

  // Replacement reaches EOF: there is no newline after the last line.
  if (insert.length === 0) {
    // Pure deletion through EOF must also consume the newline before it.
    const from: EditorPos =
      fromLine === 0
        ? { line: 0, ch: 0 }
        : { line: fromLine - 1, ch: lines[fromLine - 1]?.length ?? 0 };
    return { from, to: endOfDoc, text: '' };
  }
  return { from: { line: fromLine, ch: 0 }, to: endOfDoc, text: insert.join('\n') };
}

export function editsToChanges(lines: readonly string[], edits: readonly Edit[]): EditorChange[] {
  return edits.map((edit) => editToChange(lines, edit));
}
