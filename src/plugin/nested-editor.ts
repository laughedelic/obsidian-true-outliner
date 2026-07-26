import { StateEffect, StateField, type Extension, type Transaction } from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import { ViewPlugin, type EditorView } from '@codemirror/view';

/**
 * True when `view` is NOT the real, top-level note editor but a separate,
 * nested CM6 instance Obsidian mounts inside another widget's own DOM — the
 * only case found so far: a table cell currently being edited in Live
 * Preview renders as its own tiny, independent `EditorView` embedded inside
 * `.cm-embed-block.cm-table-widget` (confirmed live by walking the DOM
 * ancestry of a stray marker up to the table widget). `registerEditorExtension`
 * (main.ts) applies this whole extension to EVERY CM6 instance app-wide,
 * this nested one included, and its own "document" is just the cell's raw
 * text — a bare line with no special syntax reads as a plain paragraph to
 * decorate()/parse(), so without this guard it picks up a marker AND
 * depth-based padding/margin exactly like a real top-level paragraph,
 * visibly corrupting the cell being edited. A real top-level note's own
 * `.cm-editor` is never itself nested inside a `.cm-embed-block` (those are
 * its own descendants, not its ancestors), so this only ever fires for a
 * genuinely embedded editor — confirmed also via `editorInfoField`, which
 * resolves to the SAME outer `MarkdownView` for both, so state alone can't
 * tell them apart; only the DOM ancestry can, which is why this check lives
 * here (view-level) rather than in the state-only decoration builders.
 *
 * Shared by decorations.ts and keymap.ts. The KEYMAP needs it for the same
 * reason: `registerEditorExtension` installs the motion handlers in the nested
 * editor too, and `outlinePathOf`'s `editorInfoField` lookup resolves to the
 * same outer note there, so without this check the handlers fire inside a table
 * cell and move the caret by outline rules through a document that is just the
 * cell's raw text. Measured before the guard: Home, Right and ArrowDown all
 * reported invoked AND consumed with focus inside `.cm-embed-block`
 * (docs/research/04 Q27). `transaction-filter.ts` deliberately does NOT use
 * this — a state-level filter has no `view` and so cannot ask the DOM. */
export function isNestedEditor(view: EditorView): boolean {
  return view.dom.closest('.cm-embed-block') !== null;
}

/**
 * State-level mirror of `isNestedEditor`, for consumers that have a
 * `Transaction` but no `EditorView`.
 *
 * `transaction-filter.ts` is one: `editorInfoField` resolves to the same
 * outline-mode host file inside a table cell, so without this the filter treats
 * the cell's raw text as an outline. A cell whose text begins with `- ` parses
 * as a list item, and Home's native unannotated dispatch to column 0 was being
 * clamped to column 2 — inside a nested editor where stock motion should be
 * untouched. Both halves of the filter did it: `escalateSelection` for
 * `selection-only` and `resolveForeignCursors` for `programmatic`.
 *
 * Detection has to start from the DOM (only ancestry can tell the two apart),
 * so a ViewPlugin observes it and publishes the answer into state once. There
 * is a one-transaction window before the flag lands; the transactions a nested
 * editor dispatches in that window are its own construction and focus, not user
 * motion, so the gap has no practical effect.
 */
const setNested = StateEffect.define<boolean>();

export const nestedEditorField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setNested)) return effect.value;
    return value;
  },
});

/** Registers the field and the ViewPlugin that populates it. */
export function nestedEditorExtension(): Extension {
  return [
    nestedEditorField,
    ViewPlugin.define((view) => {
      // Checked LATER, never at construction: a nested editor's DOM is not yet
      // inside `.cm-embed-block` when its ViewPlugins are built, so an
      // ancestry test there always answers "not nested" and the flag never
      // lands. Measured exactly that way — the filter went on classifying the
      // cell's own `selection-only` and `programmatic` transactions. Re-checked
      // on update until it resolves, then latched.
      let announced = false;
      const check = (): void => {
        if (announced || !isNestedEditor(view)) return;
        announced = true;
        view.dispatch({ effects: setNested.of(true) }); // deferred: never dispatch mid-update
      };
      queueMicrotask(check);
      return {
        update: () => {
          if (!announced) queueMicrotask(check);
        },
      };
    }),
  ];
}

/**
 * Is this transaction running in a nested per-cell editor? For consumers with a
 * `Transaction` and no `EditorView`.
 *
 * Three signals, because the state flag alone has a startup window. It is set by
 * a dispatch, and that dispatch's own `startState` still reads `false`, so a
 * caret placed in a cell before the flag lands would be enforced — reachable by
 * opening an existing cell whose text starts with `- `, where the placement is
 * an unannotated dispatch and the marker clamp would move it.
 *
 * 1. The latched field, once set.
 * 2. The transition transaction itself, recognized by the effect it carries.
 * 3. A structural cross-check with no timing window at all: `editorInfoField`
 *    resolves to the HOST note in a nested editor, so a document whose line
 *    count disagrees with that note's is not the note. This is what closes the
 *    window; the field remains the authority once available, and covers the one
 *    case the cross-check cannot see (a single-line note with a single-line
 *    cell).
 */
export function isNestedTransaction(tr: Transaction): boolean {
  if (tr.startState.field(nestedEditorField, false)) return true;
  for (const effect of tr.effects) if (effect.is(setNested)) return true;

  const hostLines = tr.startState.field(editorInfoField, false)?.editor?.lineCount();
  return hostLines !== undefined && hostLines !== tr.startState.doc.lines;
}
