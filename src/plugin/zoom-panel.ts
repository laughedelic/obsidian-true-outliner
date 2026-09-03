/**
 * Zoom's breadcrumb trail: a CM6 panel above the editor content
 * (`outline-zoom` design D10).
 *
 * `showPanel` from `@codemirror/view` — the package Obsidian provides and the
 * build externalises. Verified rather than assumed: the task-1 spike mounted a
 * panel in a real markdown view and measured it on screen
 * (docs/research/23). The alternative, injecting into the `MarkdownView`
 * header, is not a public extension point and would need per-view lifecycle
 * management the panel gives for free.
 *
 * Contents, in order: the file, then each ancestor of the zoom root from the
 * outermost in. The zoom root itself is NOT a crumb — it is the first visible
 * line of the content, which is the whole reason the trail stops short of it.
 *
 * Every crumb dispatches the same effects the commands do. One dispatch path,
 * not a parallel one: a panel that zoomed by its own route would be a second
 * place for the scope's entry rules to drift.
 */

import { StateField, type EditorState, type Extension } from '@codemirror/state';
import { showPanel, type EditorView, type Panel } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import { nodeLabel } from '../node-text';
import { nodeStartLine } from '../locate';
import { parsedDoc } from './parsed-doc';
import { zoomScope } from './zoom-scope';
import { zoomCleared, zoomTo } from './zoom-state';
import type { ModeSource } from './keymap';

export const PANEL_CLASS = 'to-zoom-trail';
export const CRUMB_CLASS = 'to-zoom-crumb';

/** A crumb's own click target. A button, not a div with a handler: it is a
 * control, and the keyboard and screen readers should be told so. */
function crumb(parent: HTMLElement, label: string, onPick: () => void): HTMLElement {
  const el = parent.createEl('button', { cls: CRUMB_CLASS, text: label });
  el.type = 'button';
  el.addEventListener('click', (event) => {
    event.preventDefault();
    onPick();
  });
  return el;
}

function render(view: EditorView, modes: ModeSource, dom: HTMLElement): void {
  dom.empty();
  const scope = zoomScope(view.state, modes);
  if (!scope) return;

  const file = view.state.field(editorInfoField, false)?.file;
  crumb(dom, file?.basename ?? 'Note', () => {
    view.dispatch({ effects: zoomCleared.of(null) });
  });

  const { doc } = parsedDoc(view.state.doc);
  for (const ancestor of scope.trail) {
    // Resolved from the CURRENT parse rather than from the node captured in the
    // trail: a crumb clicked after an edit must zoom to where that node is now,
    // and the scope is re-derived per state anyway.
    const line = nodeStartLine(doc, ancestor.id);
    crumb(dom, nodeLabel(ancestor), () => {
      if (line < 0) return;
      view.dispatch({ effects: zoomTo.of(view.state.doc.line(line + 1).from) });
    });
  }
}

function panelFor(modes: ModeSource): (view: EditorView) => Panel {
  return (view) => {
    const dom = createDiv({ cls: PANEL_CLASS });
    render(view, modes, dom);
    return {
      dom,
      top: true,
      update(update) {
        // Re-rendered on any state change rather than diffed: the trail is a
        // handful of buttons, and an edit can rename an ancestor, add one, or
        // remove the scope entirely.
        if (update.docChanged || update.state !== update.startState) {
          render(update.view, modes, dom);
        }
      },
    };
  };
}

/**
 * The panel exists only while a scope does.
 *
 * Driven from a `StateField` over the scope's presence, because `showPanel`
 * takes a facet value rather than a per-view callback that may decline —
 * `showPanel.from(field, …)` is CodeMirror's own conditional form. The field
 * holds a boolean and not the scope itself, so an ordinary edit inside the
 * scope does not churn the panel's identity.
 */
export function zoomPanelExtension(modes: ModeSource): Extension {
  const active = StateField.define<boolean>({
    create: (state: EditorState) => zoomScope(state, modes) !== null,
    update: (_value, tr) => zoomScope(tr.state, modes) !== null,
    provide: (f) => showPanel.from(f, (on) => (on ? panelFor(modes) : null)),
  });
  return active;
}
