/**
 * What the VIEW does when the zoom scope changes: where it scrolls, and where
 * the caret ends up.
 *
 * Both were previously left to whichever site dispatched the zoom, and the
 * result was four gestures with four different answers — reported as "cursor
 * placement on zoom in and out is not very clear", with three distinct symptoms
 * that were all the same missing rule.
 *
 * One rule now, both directions: after a zoom gesture the editor has FOCUS, and
 * the caret is inside the visible range — where it already was when that
 * position survives the change, and on the new root otherwise. Focus is half of
 * it and was the invisible half: the "current node" accent is drawn from the
 * selection whether or not the editor is focused, so a command run from the
 * palette left the node lit with no caret in it, and a click that consumed its
 * own mousedown left a caret nothing had focused. Two signals for one state,
 * disagreeing.
 *
 * And the view opens at the TOP while zoomed. The zoomed subtree begins there,
 * whatever its length, so there is no other position the view could sensibly be
 * left at — and being left mid-scroll from before the zoom hid the trail
 * entirely. Clearing the zoom scrolls the node just left instead, which is the
 * only position that keeps the reader's place in the document that came back.
 *
 * A ViewPlugin rather than four call sites, because this is a property of the
 * scope changing, not of any particular way of changing it.
 */

import { ViewPlugin, EditorView, type PluginValue, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { containsPos } from '../zoom';
import { offsetToLinePos } from './cm-pos';
import { zoomAnchorField } from './zoom-state';
import { zoomScope } from './zoom-scope';
import type { ModeSource } from './keymap';

class ZoomViewPlugin implements PluginValue {
  private anchor: number | null;

  constructor(
    private readonly view: EditorView,
    private readonly modes: ModeSource,
  ) {
    this.anchor = view.state.field(zoomAnchorField, false) ?? null;
  }

  update(update: ViewUpdate): void {
    const next = update.state.field(zoomAnchorField, false) ?? null;
    if (next === this.anchor) return;
    const previous = this.anchor;
    this.anchor = next;
    // Never from inside an update: a dispatch there re-enters CM6's own update
    // cycle, and `focus()` moves the DOM selection under a view that is still
    // writing it. The same deferral `nested-editor.ts` makes, for the same
    // reason.
    queueMicrotask(() => this.settle(previous));
  }

  private settle(previous: number | null): void {
    const scope = zoomScope(this.view.state, this.modes);
    const caret = this.caretTarget(scope);
    if (caret !== null) this.view.dispatch({ selection: { anchor: caret } });
    if (!scope && previous !== null && previous <= this.view.state.doc.length) {
      // Zoom cleared: the node just left is the reader's place in the document
      // that came back, and the only thing on screen they were looking at.
      this.view.dispatch({ effects: EditorView.scrollIntoView(previous, { y: 'center' }) });
    }
    // A FRAME later, not now. Both of these are about the layout the scope
    // change produced rather than the one it replaced, and focus in particular
    // has to land after whatever ran the gesture has finished with it — the
    // command palette closing returns focus on its own schedule, and a
    // microtask is inside that window. The view's OWN window, because an
    // Obsidian pop-out leaf runs in one of its own and a frame scheduled on the
    // wrong one never arrives.
    const win = this.view.dom.ownerDocument.defaultView ?? window;
    win.requestAnimationFrame(() => {
      if (scope) this.view.scrollDOM.scrollTop = 0;
      this.view.focus();
    });
  }

  /**
   * Where the caret has to move, or null to leave it alone.
   *
   * Leaving it alone is the common answer and the right one: zooming in from
   * the command starts with the caret inside the node it zooms to, and zooming
   * out only widens the scope, so in both the caret is already where it belongs
   * and moving it would lose a position the reader chose. What needs an answer
   * is a caret the new scope does not contain — after a click on some other
   * node's mark, or a gesture that re-rooted somewhere else entirely.
   */
  private caretTarget(scope: ReturnType<typeof zoomScope>): number | null {
    if (!scope) return null;
    const { doc } = this.view.state;
    const head = this.view.state.selection.main.head;
    if (containsPos(scope.cover, offsetToLinePos(doc, head))) return null;
    // The root's own start. The caret policy resolves it onto that node's
    // content from there, so this does not have to know about markers.
    return doc.line(scope.startLine + 1).from;
  }
}

export function zoomViewExtension(modes: ModeSource): Extension {
  return ViewPlugin.define((view) => new ZoomViewPlugin(view, modes));
}
