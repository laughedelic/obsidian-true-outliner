/**
 * The editor's state as a drawn column, for `scripts/drive.ts state`.
 *
 * `stateMarkup` writes a document in the form `scripts/notation.ts` reads back: the main range as
 * one `«…»` that may span lines, `┃` at its head, `▒` opening each block-selected line, and `∅`
 * where reading would not supply the end of the document. A block selection has no caret (the
 * editor gives up focus while one holds), so while any line is block-selected the text carries no
 * `«»` or `┃`. The notation states one selection, so the other ranges of a multi-range state are
 * left out and `stateNotes` says so.
 *
 * `drawColumns` lays the columns out with `scripts/notation.ts`, which `scripts/layout.ts` and the
 * drawn-case runner use too.
 */

import { drawDocument, layout } from './notation.ts';

export interface StateRange {
  anchor: number;
  head: number;
}

/**
 * `doc` with the range at `ranges[main]` drawn into it. `blockLines` are 0-based line numbers the
 * editor draws as block-selected.
 */
export function stateMarkup(
  doc: string,
  ranges: readonly StateRange[],
  main: number,
  blockLines: readonly number[],
): string {
  const range = ranges[main];
  return drawDocument({ text: doc, ranges: range ? [range] : [], blockLines }).join('\n');
}

/** What the drawing leaves out. */
export function stateNotes(ranges: readonly StateRange[]): string[] {
  return ranges.length > 1 ? [`${ranges.length} ranges; the main one is drawn`] : [];
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
