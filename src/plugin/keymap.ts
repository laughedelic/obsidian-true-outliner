/**
 * CM6 adapter for the outline keyboard grammar: a high-precedence keymap,
 * gated per keypress on outline mode via the public editorInfoField. All
 * decisions live in the pure grammar module.
 *
 * Also carries the progressive-select-all Mod-A handler (design.md, that
 * change): same precedence tier and outline-mode gating as the grammar
 * handlers above, but its own pure decision module (`select-all-ladder.ts`)
 * rather than `grammar.ts`.
 */

import { EditorSelection, Prec, type Extension, type SelectionRange, type Text } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';
import { Notice, editorInfoField } from 'obsidian';
import { planKey, type GrammarKey } from './grammar';
import { nextRungs } from '../select-all-ladder';
import type { LinePos, LineRange } from '../escalate';
import { parsedDoc } from './parsed-doc';

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
    // Public CM6 facet — Obsidian sets it from its own "Indent using tabs"
    // editor setting, so reading it here respects that preference without
    // touching any Obsidian-private API (confirmed live: toggling the
    // setting flips this facet's value immediately).
    const outcome = planKey(view.state.doc.toString(), {
      line: line.number - 1,
      ch: head - line.from,
    }, key, view.state.facet(indentUnit));

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

function offsetToLinePos(doc: Text, pos: number): LinePos {
  const line = doc.lineAt(pos);
  return { line: line.number - 1, ch: pos - line.from };
}

function linePosToOffset(doc: Text, pos: LinePos): number {
  return doc.line(pos.line + 1).from + pos.ch;
}

function toLineRange(doc: Text, range: SelectionRange): LineRange {
  return { anchor: offsetToLinePos(doc, range.anchor), head: offsetToLinePos(doc, range.head) };
}

/**
 * Progressive Select All (design.md D2/D3): intercepts Mod-A in outline
 * mode and, for every range in the current selection, replaces it with the
 * next rung of `select-all-ladder.ts`'s ladder. Returns `false` — letting
 * native Select All run — when every range has no further rung (already at
 * the ladder's top, or outside any node's jurisdiction), so the ladder's
 * own top is a pass-through to stock whole-document behavior rather than a
 * hand-computed duplicate of it. A range with no further rung but where
 * SOME other range in the selection does still climb is left in place
 * (unchanged), not swept into whole-document selection — each range's own
 * ladder is independent (design.md D5).
 */
function makeSelectAllHandler(modes: ModeSource) {
  return (view: EditorView): boolean => {
    const info = view.state.field(editorInfoField, false);
    const path = info?.file?.path;
    if (!path || !modes.isOutline(path)) return false;

    const doc = view.state.doc;
    const { doc: outlineDoc } = parsedDoc(doc);
    const before = view.state.selection.ranges.map((range) => toLineRange(doc, range));
    const next = nextRungs(outlineDoc, before);
    if (next.every((range) => range === null)) return false;

    const ranges = before.map((original, i) => {
      const escalated = next[i];
      const target = escalated ?? original;
      return EditorSelection.range(linePosToOffset(doc, target.anchor), linePosToOffset(doc, target.head));
    });
    view.dispatch({
      selection: EditorSelection.create(ranges, view.state.selection.mainIndex),
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
      { key: 'Mod-a', run: makeSelectAllHandler(modes) },
    ]),
  );
}
