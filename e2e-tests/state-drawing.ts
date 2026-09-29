/**
 * Drawing an editor state as the presenting-examples notation. Pure: no browser, so the unit
 * suite covers it and the page-side read in `./drawing.ts` stays the only part that needs one.
 */

import { drawDocument, layout } from '../scripts/notation.ts';

/** What `readEditorState` returns: plain data, one editor's text, selection and block chrome. */
export interface EditorState {
  text: string;
  /** Every range, in document order. */
  ranges: { anchor: number; head: number }[];
  /** Index into `ranges` of the main range. */
  main: number;
  /** 0-based lines that carry the selected-node chrome. Lines off screen have none. */
  blockLines: number[];
  focused: boolean;
}

/** The lines of one column drawing `state`: the main range, and `▒` on the chrome's lines. */
export function drawState(state: EditorState): string[] {
  const main = state.ranges[state.main];
  return drawDocument({ text: state.text, ranges: main ? [main] : [], blockLines: state.blockLines });
}

/** What a drawing of `state` leaves out, one sentence each. */
export function stateNotes(state: EditorState): string[] {
  const notes: string[] = [];
  if (state.ranges.length > 1) {
    notes.push(`${state.ranges.length} ranges; the main one is drawn`);
  }
  if (!state.focused && state.blockLines.length === 0) notes.push('the editor does not have focus');
  return notes;
}

/** Columns of states laid out side by side, with each state's notes under the block. */
export function drawStates(columns: readonly { header: string; state: EditorState }[]): string {
  const block = layout(columns.map((c) => ({ header: c.header, lines: drawState(c.state) })));
  const notes = columns.flatMap((c) => stateNotes(c.state).map((n) => `${c.header}: ${n}`));
  return [block, ...notes.map((n) => `(${n})`)].join('\n');
}
