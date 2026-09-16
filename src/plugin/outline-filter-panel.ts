/**
 * The in-note filter's panel: the query field, what it matched, and a way out.
 *
 * A CM6 top panel (`outline-filter` D5). `showPanel` mounts into
 * `.cm-panels-top`, a sibling of `.cm-scroller`, so the panel sits above the
 * note's title and properties block and stays there while the content scrolls.
 * `zoom-trail.ts` declined that same mechanism for the breadcrumb trail, and
 * the reason does not carry here: a trail says where the reader IS and has to
 * sit where they are, while a query field is a control over the view. Obsidian's
 * own in-file find reads exactly that way, and a long sparse tree is precisely
 * the case where the field must not scroll out of reach.
 *
 * The field is not the editor, so the keyboard grammar never sees its keys —
 * which is why Escape is handled here rather than through a keymap.
 */

import { showPanel, type EditorView, type Panel } from '@codemirror/view';
import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { setIcon } from 'obsidian';
import { clearFilter, filterCleared, setFilterQuery } from './outline-filter-state';
import { outlineFilter } from './outline-filter-scope';

export const PANEL_CLASS = 'to-filter-panel';
/** The field, while the query in it matches nothing (D8). */
export const MISSED_CLASS = 'is-missed';

/** What the count reads for a query that matched. */
function countLabel(count: number): string {
  return count === 1 ? '1 match' : `${count} matches`;
}

function buildPanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = PANEL_CLASS;

  const field = dom.createDiv({ cls: 'to-filter-field' });
  const glass = field.createSpan({ cls: 'to-filter-icon' });
  glass.setAttribute('aria-hidden', 'true');
  // Obsidian's own icon rather than the footer's private glyph: `backlinks-
  // footer.ts` does not export it, and reaching into that module for one span
  // would couple this surface to a file another change is rewriting.
  setIcon(glass, 'search');

  // `text`, not `search`, for the reason the footer's own field records: a
  // search input carries Chromium's native cancel button, which reserves room
  // at the field's end and swallows the press meant for our own close control.
  const input = field.createEl('input', { cls: 'to-filter-input' });
  input.type = 'text';
  input.placeholder = 'Filter outline…';
  input.setAttribute('aria-label', 'Filter this note by content');

  const status = dom.createSpan({ cls: 'to-filter-status' });
  const close = dom.createEl('button', { cls: 'to-filter-close' });
  close.setAttribute('aria-label', 'Close filter');
  close.textContent = '✕';

  // `input`, not `change`: a filter that waits for blur is one the reader has
  // to commit to before seeing what it does.
  input.addEventListener('input', () => setFilterQuery(view, input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeFilterPanel(view);
  });
  close.addEventListener('click', () => closeFilterPanel(view));

  const sync = (): void => {
    const filter = outlineFilter(view.state);
    input.value = filter?.query ?? '';
    // The field itself shows the miss, because the view is answering a query
    // the field no longer holds and nothing else on screen says so.
    input.toggleClass(MISSED_CLASS, filter !== null && !filter.matched);
    if (!filter || filter.query.trim().length === 0) status.textContent = '';
    else if (!filter.matched) status.textContent = 'no matches';
    else status.textContent = filter.anchors ? countLabel(filter.anchors.length) : '';
  };
  sync();

  return {
    dom,
    top: true,
    mount: () => input.focus(),
    update: (update) => {
      if (update.docChanged || update.transactions.length > 0) sync();
    },
  };
}

/**
 * Whether the panel is showing, as editor state.
 *
 * A field rather than a handle beside the view, because `showPanel` computes
 * from state and because the panel is per editor view exactly as the filter it
 * drives is — one note filtered leaves another alone.
 */
const panelOpen = StateEffect.define<boolean>();

const panelOpenField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(panelOpen)) return effect.value;
      // Clearing the filter from anywhere else closes the panel with it: a
      // panel left open over an unfiltered note is a control with nothing to
      // control.
      if (effect.is(filterCleared)) return false;
    }
    return value;
  },
});

export function filterPanelOpen(state: EditorState): boolean {
  return state.field(panelOpenField, false) ?? false;
}

export function openFilterPanel(view: EditorView): void {
  view.dispatch({ effects: panelOpen.of(true) });
}

/**
 * Close the panel and restore the note.
 *
 * Clearing the query is part of closing rather than a step beside it: a panel
 * that shut while still hiding content would leave a filtered view with nothing
 * on screen to explain it.
 */
export function closeFilterPanel(view: EditorView): void {
  clearFilter(view);
  view.focus();
}

export function outlineFilterPanelExtension(): Extension {
  return [panelOpenField, showPanel.from(panelOpenField, (open) => (open ? buildPanel : null))];
}
