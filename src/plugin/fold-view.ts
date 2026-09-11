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
import type { EditorState, Extension } from '@codemirror/state';
import { foldEffect } from '@codemirror/language';
import { isOutlineMode } from './outline-state';
import { currentFolds, unfoldEffectsWithin, type FoldRange } from './fold-ops';

/** Positional equality for two selection snapshots. */
function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

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
    // Fold effects count as well as selection and document changes: opening the
    // outermost of two nested folds is itself an effects-only update, and the
    // inner one may still be hiding the position that started this.
    const foldChanged = update.transactions.some((tr) => tr.effects.length > 0);
    if (!update.selectionSet && !update.docChanged && !foldChanged) return;
    if (!isOutlineMode(update.state)) return;
    const hiding = this.foldsHidingSelection(update.state);
    if (hiding.length === 0) return;
    const positions = this.selectionPositions(update.state);
    // Which of the two contradicted the other decides which one gives way. A
    // fold that ARRIVED in this update, over a caret that was already there, is
    // the reader folding a node from above the caret — Obsidian's own chevron
    // dispatches the fold and nothing else — and undoing it would make every
    // ancestor of the caret unfoldable, more of them the deeper the caret sat.
    // The caret moves out instead, to where our own fold gesture would have put
    // it. A caret that arrived in an existing fold is the other case, and the
    // fold gives way.
    const arrived = update.transactions.flatMap((tr) =>
      tr.effects.filter((effect) => effect.is(foldEffect)).map((effect) => effect.value),
    );
    const justFolded = hiding.filter((range) =>
      arrived.some((fold) => fold.from === range.from && fold.to === range.to),
    );
    queueMicrotask(() => {
      // The selection may have moved on while this waited; re-derive rather
      // than acting on what was true a microtask ago.
      if (!isOutlineMode(this.view.state)) return;
      if (!sameNumbers(positions, this.selectionPositions(this.view.state))) return;
      if (justFolded.length > 0) {
        // The outermost: its start is on a visible line, whatever is nested.
        const anchor = Math.min(...justFolded.map((range) => range.from));
        this.view.dispatch({ selection: { anchor } });
        return;
      }
      const effects = this.foldsHidingSelection(this.view.state).flatMap((range) =>
        unfoldEffectsWithin(this.view.state, range.from, range.from),
      );
      if (effects.length > 0) this.view.dispatch({ effects });
    });
  }

  /** Every position the selection actually occupies — both ends of every range.
   * A backward selection can leave its ANCHOR hidden while its head is fine. */
  private selectionPositions(state: EditorState): number[] {
    return state.selection.ranges.flatMap((range) => [range.from, range.to]);
  }

  /**
   * Every fold hiding any of those positions, innermost included.
   *
   * All of them, not the first: nested folds hide the same position at
   * different starts, and opening only the outermost leaves the caret hidden by
   * the inner one.
   */
  private foldsHidingSelection(state: EditorState): FoldRange[] {
    const positions = this.selectionPositions(state);
    // Strictly inside, at both ends. A position AT a fold's start is the head
    // line's own end, which is visible and is exactly where folding a node
    // leaves the caret; a position AT its end is the end of the last hidden
    // line, which renders after the placeholder and is where extending a
    // selection over a folded node — Shift+Down from its head — puts the head.
    // Counting that end as hidden opened the fold under every such selection,
    // which had selected the node whole and correctly.
    return currentFolds(state).filter((range) =>
      positions.some((pos) => pos > range.from && pos < range.to),
    );
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
