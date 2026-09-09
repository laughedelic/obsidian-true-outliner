/**
 * The rule that keeps a caret and a fold from contradicting each other: a
 * position inside hidden content opens the fold that hides it.
 *
 * Arrow keys never produce this — CodeMirror steps over a folded range — but
 * everything that places a position by computing it does: a command, a
 * breadcrumb, a backlink navigating to a node, a search result. Without this
 * the caret sits in text nobody can see, and the next keystroke edits it.
 *
 * A view plugin rather than a transaction filter, for the reason
 * `zoom-view.ts` gives about its own deferral: the correction is a SECOND
 * dispatch, and issuing it from inside the update cycle re-enters CM6 while it
 * is still writing the first.
 */

import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isOutlineMode } from './outline-state';
import { currentFolds, unfoldEffectsWithin } from './fold-ops';

class FoldRevealPlugin implements PluginValue {
  constructor(
    private readonly view: EditorView,
    private readonly source: FoldPersistenceSource,
  ) {
    // "Remember folds" off: Obsidian has already restored this file's folds
    // from its own workspace state by the time an editor exists, so the
    // setting is a suppression rather than a store — there is nothing of ours
    // to not-write. Deferred past construction for the same reason every other
    // correction here is: a dispatch inside the view's own setup re-enters it.
    if (!source.rememberFolds) queueMicrotask(() => this.expandAll());
  }

  /** Everything in our jurisdiction, opened. Obsidian's own folds in a
   * non-outline note are none of our business either way. */
  private expandAll(): void {
    if (!isOutlineMode(this.view.state)) return;
    const effects = unfoldEffectsWithin(this.view.state, 0, this.view.state.doc.length);
    if (effects.length > 0) this.view.dispatch({ effects });
  }

  update(update: ViewUpdate): void {
    if (!update.selectionSet && !update.docChanged) return;
    if (!isOutlineMode(update.state)) return;
    const head = update.state.selection.main.head;
    // Strictly inside: a position AT a fold's start is the head line's own end,
    // which is visible and is exactly where folding a node leaves the caret.
    const hiding = currentFolds(update.state).find((r) => head > r.from && head <= r.to);
    if (!hiding) return;
    queueMicrotask(() => {
      if (this.view.state.selection.main.head !== head) return;
      const effects = unfoldEffectsWithin(this.view.state, hiding.from, hiding.from);
      if (effects.length > 0) this.view.dispatch({ effects });
    });
  }
}

/** What the view needs to know about persistence: one boolean, read live so a
 * settings change reaches the next editor without a reload. */
export interface FoldPersistenceSource {
  readonly rememberFolds: boolean;
}

export function foldViewExtension(source: FoldPersistenceSource): Extension {
  return ViewPlugin.define((view) => new FoldRevealPlugin(view, source));
}
