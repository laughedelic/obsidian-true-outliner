/**
 * The line-space position vocabulary: a `{line, ch}` coordinate, an oriented
 * range over two of them, and the predicates that compare them.
 *
 * Its own module because this is shared vocabulary rather than any one
 * feature's geometry. `escalate.ts` and `caret.ts` each declared an identical
 * `LinePos` and consumers imported whichever they happened to reach for —
 * structurally compatible, so nothing ever complained, and the predicates got
 * copied across three modules on top of that. Core-only (no CodeMirror
 * import), so the plugin layer shares the same definitions; the CM6
 * offset↔position conversions live in `src/plugin/cm-pos.ts`.
 */

export interface LinePos {
  readonly line: number;
  readonly ch: number;
}

/** A selection range with orientation preserved: `anchor` is the drag/
 * extend origin, `head` is the current end — `head` may be before or after
 * `anchor` in document order ("backward" vs "forward"). */
export interface LineRange {
  readonly anchor: LinePos;
  readonly head: LinePos;
}

export function posEqual(a: LinePos, b: LinePos): boolean {
  return a.line === b.line && a.ch === b.ch;
}

export function posBefore(a: LinePos, b: LinePos): boolean {
  return a.line < b.line || (a.line === b.line && a.ch < b.ch);
}

/** An empty range is a cursor: both ends at the same position. */
export function isEmptyRange(range: LineRange): boolean {
  return posEqual(range.anchor, range.head);
}

/** A backward range's head sits before its anchor: the selection grew
 * UPWARD, so its fixed end is the bottom one. */
export function isBackward(range: LineRange): boolean {
  return posBefore(range.head, range.anchor);
}

export function rangesEqual(a: LineRange, b: LineRange): boolean {
  return posEqual(a.anchor, b.anchor) && posEqual(a.head, b.head);
}
