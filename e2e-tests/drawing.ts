/**
 * The state-to-drawing helper: what the editor holds, drawn as the notation a case is written in.
 *
 * `readEditorState` is one function of the Obsidian app with no closure and no other input, so
 * its source can be evaluated anywhere the app can, over the DevTools protocol included.
 */

import { browser } from '@wdio/globals';
import { drawStates, type EditorState } from './state-drawing.js';

export type { EditorState } from './state-drawing.js';
export { drawState, drawStates, stateNotes } from './state-drawing.js';

/** The chrome class the decorations put on a covered line; see `SELECTED_NODE_CLASS` in
 * src/plugin/decorations.ts. Read from the DOM so `▒` says what is painted. */
export function readEditorState(): Promise<EditorState> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    const cm = (view.editor as any).cm;
    const doc = cm.state.doc;
    const blockLines: number[] = [];
    for (const el of cm.contentDOM.querySelectorAll('.cm-line.to-decor-node-selected')) {
      blockLines.push(doc.lineAt(cm.posAtDOM(el)).number - 1);
    }
    return {
      text: doc.toString() as string,
      ranges: cm.state.selection.ranges.map((r: { anchor: number; head: number }) => ({
        anchor: r.anchor,
        head: r.head,
      })),
      main: cm.state.selection.mainIndex as number,
      blockLines,
      focused: cm.hasFocus as boolean,
    };
  });
}

/** The active editor, drawn: `header` over one column. */
export async function drawEditor(header = 'now'): Promise<string> {
  return drawStates([{ header, state: await readEditorState() }]);
}
