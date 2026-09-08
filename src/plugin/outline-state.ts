/**
 * Outline mode's only piece of state: one boolean per editor
 * (`per-tab-outline-mode` design D2).
 *
 * The mode used to be a per-PATH fact on the plugin instance, which made a
 * toggle invisible to CodeMirror: nothing in editor state moved, so no
 * decoration recomputed and the plugin had to nudge each affected view by hand.
 * As a `StateField` a toggle is an ordinary transaction, and every gate and
 * decoration that reads it recomputes because the field moved.
 *
 * The reset boundary is CM6's own, not a rule this module enforces. Measured
 * (docs/research/24): Obsidian keeps ONE `EditorView` per leaf and rebuilds its
 * `EditorState` only when the leaf switches files, so `create` runs when a tab
 * opens and when a tab changes notes — and NOT when a pane goes to reading view
 * and back, which keeps the state chain. That is exactly the ephemerality the
 * spec states: a manual state dies with the tab or with the note it was set on,
 * and survives a view-mode round-trip.
 *
 * This module imports no `obsidian`, deliberately, so it is reachable from the
 * unit suite — the same division, and the same reason, as `zoom-state.ts`.
 */

import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';

/** Turn this view's outline mode on or off. */
export const outlineToggled = StateEffect.define<boolean>();

/**
 * Where a newly constructed editor's mode comes from.
 *
 * Injected rather than imported, for `zoom-state.ts`'s reason: the default is a
 * plugin setting and this module must stay free of `obsidian` to remain
 * reachable from the unit suite. Read at `create` — the setting is live, not
 * captured, so a tab constructed after the setting changed picks up the new
 * value and one constructed before keeps the old one, which is the whole of
 * "changing it touches future opens only" (design D8).
 */
let readDefault: (() => boolean) | undefined;

export const outlineModeField = StateField.define<boolean>({
  create: () => readDefault?.() ?? false,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(outlineToggled)) return effect.value;
    return value;
  },
});

/**
 * Is this editor in outline mode?
 *
 * The one definition every gate reads — grammar, decorations, the enforcement
 * filter, the backlinks footer, the zoom gates — so none of them can drift into
 * a private answer. It deliberately says nothing about NESTED per-cell editors:
 * a table cell gets its own field like any other editor, and each consumer that
 * must decline inside one already asks `isNestedEditor` / `nestedEditorField` /
 * `isNestedTransaction` for its own reasons (see `nested-editor.ts`, which
 * explains why only some of them can ask the DOM).
 *
 * An editor without the field — anything this plugin's extensions were not
 * installed in — reads as off, which is the safe direction: no gate opens.
 */
export function isOutlineMode(state: EditorState): boolean {
  return state.field(outlineModeField, false) ?? false;
}

export function outlineStateExtension(source: { readonly outlineByDefault: boolean }): Extension {
  readDefault = () => source.outlineByDefault;
  return outlineModeField;
}
