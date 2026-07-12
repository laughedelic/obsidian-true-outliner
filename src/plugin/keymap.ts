/**
 * CM6 adapter for the outline keyboard grammar: a high-precedence keymap,
 * gated per keypress on outline mode via the public editorInfoField. All
 * decisions live in the pure grammar module.
 */

import { Prec, type Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import { Notice, editorInfoField } from 'obsidian';
import { planKey, type GrammarKey } from './grammar';

export interface ModeSource {
  isOutline(path: string): boolean;
}

function makeHandler(modes: ModeSource, key: GrammarKey) {
  return (view: EditorView): boolean => {
    const info = view.state.field(editorInfoField, false);
    const path = info?.file?.path;
    if (!path || !modes.isOutline(path)) return false;

    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const outcome = planKey(view.state.doc.toString(), {
      line: line.number - 1,
      ch: head - line.from,
    }, key);

    if (outcome === null) return false;
    if ('notice' in outcome) {
      new Notice(outcome.notice, 1500);
      return true; // consume: stock behavior must not fire on a rejected op
    }
    const doc = view.state.doc;
    view.dispatch({
      changes: outcome.plan.changes.map((change) => ({
        from: doc.line(change.from.line + 1).from + change.from.ch,
        to: doc.line(change.to.line + 1).from + change.to.ch,
        insert: change.text,
      })),
      selection: { anchor: outcome.plan.selection },
      userEvent: outcome.plan.userEvent,
      scrollIntoView: true,
    });
    return true;
  };
}

export function grammarExtension(modes: ModeSource): Extension {
  return Prec.highest(
    keymap.of([
      { key: 'Tab', run: makeHandler(modes, 'indent') },
      { key: 'Shift-Tab', run: makeHandler(modes, 'outdent') },
      { key: 'Alt-ArrowUp', run: makeHandler(modes, 'move-up') },
      { key: 'Alt-ArrowDown', run: makeHandler(modes, 'move-down') },
      { key: 'Enter', run: makeHandler(modes, 'split') },
      { key: 'Shift-Enter', run: makeHandler(modes, 'continue') },
    ]),
  );
}
