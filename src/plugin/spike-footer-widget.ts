/**
 * Spike S1 (docs/research/17-backlinks-footer-spikes.md): the smallest possible
 * block widget at the end of the document, so we can measure what its PRESENCE
 * does to the enforcement layer before any backlinks feature is built on it.
 *
 * Deliberately content-free. The question this spike asks is not "does a footer
 * render" — it is whether a `Decoration.widget({ block: true })` anchored at
 * `state.doc.length` perturbs `content-space-caret` (which positions the caret
 * may occupy), `progressive-select-all` (the select-all ladder), or
 * `caret-placement-policy` (where the caret lands after an operation). A widget
 * carrying real content would confound "the widget is here" with "the content
 * inside it did something", and the first is the only variable worth isolating.
 *
 * Gated on a debug setting, off by default: it is measurement apparatus, not a
 * feature, and it must be togglable inside one running app so the same document
 * can be measured with and without it.
 *
 * ## Why a StateField, when every other decoration layer here is a ViewPlugin
 *
 * CodeMirror refuses block decorations from a plugin outright — S1's first run
 * failed with "Block decorations may not be specified via plugins". Block
 * decorations change the document's HEIGHT, and the view needs them before
 * plugins run in order to lay out and measure; a plugin-supplied one would be
 * discovered too late. So they must come from a `StateField` via
 * `EditorView.decorations.from`.
 *
 * `decorations.ts` uses `ViewPlugin` throughout for a deliberate reason — each
 * one needs `view` access for `isNestedEditor`'s DOM-ancestry check. A
 * `StateField` has no view and cannot ask the DOM anything. That problem is
 * already solved: `nested-editor.ts` publishes the answer into state precisely
 * so state-level consumers can read it, which is what this does. The seam
 * existed before there was a second kind of consumer to use it.
 *
 * `side: -1` places the widget BEFORE the position, i.e. after all document
 * content, matching where the real footer would anchor — the same anchoring
 * `influx` uses, and (unremarked at the time) from a `StateField` as well; see
 * docs/research/16.
 */

import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import type { ModeSource } from './keymap';
import { nestedEditorField } from './nested-editor';

/** Marks the spike's DOM so e2e can find it and assert on instance count. */
export const SPIKE_FOOTER_CLASS = 'to-spike-footer';

export interface SpikeFooterSource extends ModeSource {
  /** Off by default; the spike renders nothing at all when false. */
  readonly debugFooterWidget: boolean;
  /**
   * Bumped by the plugin whenever something OUTSIDE editor state changes what
   * this field would compute — outline mode toggling, or the debug flag. See
   * `refreshBridge` for why a counter is needed at all.
   */
  readonly footerRevision: number;
}

/** Carries "recompute now" into a transaction the StateField can observe. */
const refreshFooter = StateEffect.define<void>();

class SpikeFooterWidget extends WidgetType {
  /**
   * Every instance is interchangeable — the widget has no content and no state,
   * so CM6 may reuse the existing DOM across updates rather than tearing it down
   * and rebuilding it. Returning true here is what makes "does the widget's DOM
   * survive an update" a meaningful question for S2 rather than an artifact of
   * this class recreating itself on every keystroke.
   */
  override eq(other: WidgetType): boolean {
    return other instanceof SpikeFooterWidget;
  }

  toDOM(): HTMLElement {
    // A fixed, visible height (from styles.css) so layout effects — scroll
    // extent, click-below-last-line targeting, print pagination — are
    // observable. No text: see the module comment on why content would confound
    // the measurement.
    return createDiv({ cls: SPIKE_FOOTER_CLASS, attr: { 'aria-hidden': 'true' } });
  }

  /**
   * The real footer will be interactive, but this spike must not swallow events:
   * if it did, "clicking below the last line does nothing" would be the widget
   * eating the click rather than the editor's own behavior, and S1's whole point
   * is to observe the editor's behavior unchanged.
   */
  override ignoreEvent(): boolean {
    return false;
  }
}

const FOOTER = Decoration.widget({ widget: new SpikeFooterWidget(), side: -1, block: true });

function compute(state: EditorState, source: SpikeFooterSource): DecorationSet {
  if (!source.debugFooterWidget) return Decoration.none;
  // A nested per-cell editor resolves to the same outer file through
  // `editorInfoField`, so without this the spike would mount a footer inside a
  // table cell being edited. Read from state, not the DOM — see the module note.
  if (state.field(nestedEditorField, false) === true) return Decoration.none;
  const path = state.field(editorInfoField, false)?.file?.path;
  if (!path || !source.isOutline(path)) return Decoration.none;

  return Decoration.set([FOOTER.range(state.doc.length)]);
}

/**
 * S2 finding: a `StateField` recomputes only when a TRANSACTION arrives, and
 * outline mode toggling produces none.
 *
 * `main.ts`'s `refreshDecorations` nudges with `setCursor(getCursor())` — a
 * selection set to the position the caret already occupies. That is enough for
 * every other decoration layer, because a `ViewPlugin` reruns on any view
 * update whether or not a transaction was dispatched. A no-op selection set
 * produces no transaction, so a `StateField` never sees it and keeps rendering
 * the previous answer: measured directly — after toggling outline mode off the
 * widget stayed until the next real document edit, which cleared it.
 *
 * This bridge closes the gap without changing the shared nudge. It is a
 * `ViewPlugin`, so it does observe the nudge's view update; when it sees the
 * external revision move it dispatches a real, effect-carrying transaction that
 * the field can act on. The dispatch is deferred to a microtask because
 * dispatching from inside `update()` re-enters the view.
 */
function refreshBridge(source: SpikeFooterSource): Extension {
  return ViewPlugin.define((view) => {
    let seen = source.footerRevision;
    return {
      update() {
        if (seen === source.footerRevision) return;
        seen = source.footerRevision;
        queueMicrotask(() => view.dispatch({ effects: refreshFooter.of() }));
      },
    };
  });
}

export function spikeFooterExtension(source: SpikeFooterSource): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => compute(state, source),
    update: (_value, tr) => compute(tr.state, source),
    provide: (f) => EditorView.decorations.from(f),
  });
  return [field, refreshBridge(source)];
}
