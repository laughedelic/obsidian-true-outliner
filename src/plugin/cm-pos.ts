/**
 * The CM6 boundary for line positions: CodeMirror addresses a document by
 * character offset, everything in core addresses it by `{line, ch}`. These
 * three conversions are that translation.
 *
 * One home because they were copied verbatim into the keymap, the transaction
 * filter and the decoration builder — three chances to get the 1-based /
 * 0-based line shift wrong, in the layer where getting it wrong moves the
 * user's caret.
 */

import type { SelectionRange, Text } from '@codemirror/state';
import type { LinePos, LineRange } from '../line-pos';

/** CM6 numbers lines from 1; `LinePos.line` is 0-based. */
export function offsetToLinePos(doc: Text, offset: number): LinePos {
  const line = doc.lineAt(offset);
  return { line: line.number - 1, ch: offset - line.from };
}

export function linePosToOffset(doc: Text, pos: LinePos): number {
  return doc.line(pos.line + 1).from + pos.ch;
}

/** A CM6 selection range as an oriented `LineRange`, keeping anchor/head. */
export function toLineRange(doc: Text, range: SelectionRange): LineRange {
  return {
    anchor: offsetToLinePos(doc, range.anchor),
    head: offsetToLinePos(doc, range.head),
  };
}
