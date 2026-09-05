/**
 * The public-API route from an Obsidian command to a CM6 `EditorView`
 * (`outline-zoom` design D5).
 *
 * A `StateEffect` can only be dispatched to an `EditorView`, and Obsidian's
 * public `Editor`/`MarkdownView` API exposes no `EditorState` — `main.ts`'s own
 * `StructuralOp` comment already records that gap as the reason the palette
 * path cannot read the `indentUnit` facet. This project does not reach for
 * `(editor as any).cm`, so the view has to announce itself instead: a
 * `ViewPlugin` is constructed with its own view and can publish it, keyed by
 * the `MarkdownFileInfo` it carries in the public `editorInfoField`.
 *
 * Why not bind zoom only in the CM6 keymap, where a view is already in hand:
 * zoom needs a command-palette entry, a user-rebindable hotkey and a
 * context-menu item, all of which come from `addCommand` and none of which a
 * keymap binding provides. Both entry points then dispatch the same effect,
 * the way the keyboard and palette paths already share `caret-policy.ts`.
 *
 * A `WeakMap` keyed by the info object rather than by file path, deliberately:
 * two panes on the same file are two views and must stay distinguishable, which
 * is what makes a per-view zoom scope possible at all. Entries die with their
 * view, and a `destroy` that never ran cannot leak a detached editor.
 */

import { ViewPlugin, type EditorView, type PluginValue } from '@codemirror/view';
import { editorInfoField, type MarkdownFileInfo } from 'obsidian';
import type { Extension } from '@codemirror/state';
import { isNestedEditor } from './nested-editor';

const views = new WeakMap<MarkdownFileInfo, EditorView>();

/**
 * The live `EditorView` for a view Obsidian handed us, or undefined when none
 * has registered — a note in reading view, or a leaf whose editor has not
 * mounted yet. Callers decide what to do about it rather than being given a
 * fallback that pretends.
 */
export function viewFor(info: MarkdownFileInfo | null | undefined): EditorView | undefined {
  return info ? views.get(info) : undefined;
}

class ViewRegistryPlugin implements PluginValue {
  private info: MarkdownFileInfo | undefined;
  private resolved = false;

  constructor(private readonly view: EditorView) {
    // A nested per-cell editor resolves to the SAME `MarkdownFileInfo` as its
    // host note (see `nested-editor.ts`), so registering one overwrites the real
    // editor's entry and sends every command into a table cell.
    //
    // The question cannot be answered here, which is the whole reason this is
    // not one line in the constructor. `isNestedEditor` walks the DOM, and a
    // nested editor's DOM is not yet inside `.cm-embed-block` when its
    // ViewPlugins are built — `nested-editor.ts` records the same timing and
    // defers for the same reason. Asked at construction the answer is always
    // "not nested", so a table cell registered itself over its host and every
    // later command in that note went into the cell: zoom did nothing, from any
    // node, for the rest of the session. Found by probing a real Obsidian after
    // a report that zooming into a table did nothing and then broke zoom
    // everywhere else in the note.
    this.sync();
  }

  /**
   * Register once the ancestry is knowable, and not before.
   *
   * `isConnected` is the condition that makes `closest()` mean anything: while
   * the view's DOM is detached it has no ancestors to find, so a "no" is an
   * artefact of the timing rather than an answer. Once connected the answer is
   * final, so it is taken once and latched.
   */
  private sync(): void {
    if (this.resolved || !this.view.dom.isConnected) return;
    this.resolved = true;
    if (isNestedEditor(this.view)) return;
    this.info = this.view.state.field(editorInfoField, false) ?? undefined;
    if (this.info) views.set(this.info, this.view);
  }

  update(): void {
    this.sync();
  }

  destroy(): void {
    // Only if the entry is still OURS. A leaf that swaps its editor can
    // construct the replacement before destroying the old one, and an
    // unconditional delete there would unregister the live view.
    if (this.info && views.get(this.info) === this.view) views.delete(this.info);
  }
}

export function viewRegistryExtension(): Extension {
  return ViewPlugin.fromClass(ViewRegistryPlugin);
}
