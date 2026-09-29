/**
 * The editor's state as a drawn column, for `scripts/drive.ts state`.
 *
 * `stateMarkup` writes a document in the form `scripts/layout.ts` reads: `┃` at each range's head,
 * `«…»` around the part of each line a range covers, `∅` at the end of the document, and `▒`
 * opening a block-selected line. A block selection has no caret (the
 * editor gives up focus while one holds), so while any line is block-selected no line carries `«»`
 * or `┃`.
 *
 * `drawColumns` lays the columns out with `scripts/notation.ts`, which `scripts/layout.ts` and the
 * drawn-case runner use too.
 */

import { layout } from './notation.ts';

export interface StateRange {
  anchor: number;
  head: number;
}

const CARET = '┃';
const OPEN = '«';
const CLOSE = '»';
const END = '∅';

/** Order of markers at one position: a selection's end, then the caret, then a selection's start. */
const ORDER: Record<string, number> = { [CLOSE]: 0, [CARET]: 1, [OPEN]: 2 };

/**
 * `doc` with the selection drawn into it. `blockLines` are 0-based line numbers the editor draws
 * as block-selected.
 */
export function stateMarkup(doc: string, ranges: readonly StateRange[], blockLines: ReadonlySet<number>): string {
  const out: string[] = [];
  const shown = blockLines.size === 0 ? ranges : [];
  let from = 0;
  const lines = doc.split('\n');
  lines.forEach((text, index) => {
    const to = from + text.length;
    const last = index === lines.length - 1;
    if (blockLines.has(index)) {
      out.push(`▒${text}${last ? END : ''}`);
    } else {
      const marks: { at: number; glyph: string }[] = [];
      for (const range of shown) {
        const start = Math.max(from, Math.min(range.anchor, range.head));
        const end = Math.min(to, Math.max(range.anchor, range.head));
        if (start < end) marks.push({ at: start, glyph: OPEN }, { at: end, glyph: CLOSE });
        if (range.head >= from && range.head <= to) marks.push({ at: range.head, glyph: CARET });
      }
      marks.sort((a, b) => a.at - b.at || (ORDER[a.glyph] ?? 0) - (ORDER[b.glyph] ?? 0));
      let drawn = '';
      let cursor = from;
      for (const mark of marks) {
        drawn += text.slice(cursor - from, mark.at - from) + mark.glyph;
        cursor = mark.at;
      }
      out.push(drawn + text.slice(cursor - from) + (last ? END : ''));
    }
    from = to + 1;
  });
  return out.join('\n');
}

export interface Column {
  header: string;
  /** The column in `scripts/layout.ts`'s input form, lines joined by `\n`. */
  text: string;
}

/** Columns side by side, as `scripts/layout.ts` prints them. */
export function drawColumns(columns: readonly Column[]): string {
  return layout(columns.map((c) => ({ header: c.header, lines: c.text.split('\n') })));
}
