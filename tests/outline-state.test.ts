import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
  isOutlineMode,
  outlineStateExtension,
  outlineToggled,
} from '../src/plugin/outline-state';

const DOC = '# Top\n\n- one\n';

/** The plugin, as far as this module is concerned: one live boolean. */
function settings(outlineByDefault: boolean): { outlineByDefault: boolean } {
  return { outlineByDefault };
}

/**
 * A plugin load: ONE `outlineStateExtension` call, then as many tabs as the
 * test opens against it. Registration happens once per plugin load
 * (`registerEditorExtension` in main.ts), so a helper that rebuilt the
 * extension per tab would re-read the default every time and quietly pass
 * whether or not the field reads it live.
 */
function load(source: { outlineByDefault: boolean }): () => EditorState {
  const extension = outlineStateExtension(source);
  return () => EditorState.create({ doc: DOC, extensions: [extension] });
}

function editor(source: { outlineByDefault: boolean }): EditorState {
  return load(source)();
}

describe('outlineModeField: the per-tab mode', () => {
  it('starts a new editor in the default', () => {
    expect(isOutlineMode(editor(settings(true)))).toBe(true);
    expect(isOutlineMode(editor(settings(false)))).toBe(false);
  });

  it('reads the default LIVE, so a settings change reaches the next editor only', () => {
    // The whole of "changing the setting touches future opens only": the field
    // reads the setting when its editor is constructed, so an editor built
    // before the change keeps what it had and one built after takes the new
    // value. Nothing sweeps, and nothing is captured at load.
    const source = settings(true);
    const openTab = load(source);
    const before = openTab();
    source.outlineByDefault = false;
    const after = openTab();
    expect(isOutlineMode(before)).toBe(true);
    expect(isOutlineMode(after)).toBe(false);
  });

  it('flips on the effect, in both directions', () => {
    const on = editor(settings(false)).update({ effects: outlineToggled.of(true) }).state;
    expect(isOutlineMode(on)).toBe(true);
    const off = on.update({ effects: outlineToggled.of(false) }).state;
    expect(isOutlineMode(off)).toBe(false);
  });

  it('carries the state through transactions that say nothing about it', () => {
    const on = editor(settings(true));
    const edited = on.update({ changes: { from: 0, insert: 'x' } }).state;
    expect(isOutlineMode(edited)).toBe(true);
  });

  it('gives two editors on one document independent states', () => {
    // Two tabs on one file are two editor states and must be able to differ —
    // the same per-view shape the zoom scope already has. A mode kept on the
    // plugin, keyed by anything a file has one of, could not express this.
    const openTab = load(settings(true));
    const first = openTab();
    const second = openTab();
    const firstOff = first.update({ effects: outlineToggled.of(false) }).state;
    expect(isOutlineMode(firstOff)).toBe(false);
    expect(isOutlineMode(second)).toBe(true);
  });

  it('reads as off in an editor the field was never installed in', () => {
    // Anything the plugin's extensions did not reach: no gate should open there,
    // and asking for an absent field must not throw either.
    expect(isOutlineMode(EditorState.create({ doc: DOC }))).toBe(false);
  });
});
