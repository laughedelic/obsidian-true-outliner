/**
 * Zoom by clicking a node's mark — the outliner gesture, alongside the command.
 *
 * `outline-zoom` first listed this as out of scope, gated on two caveats
 * docs/research/12 had been carrying. Measured, one is real and the other is
 * worse than it read:
 *
 * - `pointer-events: none` on the marker is real, and is why a click never
 *   reached it. The stylesheet now re-enables it for marks that stand for a
 *   document node.
 * - `ignoreEvent() → true` does not merely make CM6 ignore the widget's events;
 *   through `eventBelongsToEditor` it makes CM6 skip its OWN registered
 *   handlers for anything inside such a widget. So `EditorView.domEventHandlers`
 *   is not a route to a marker at all — measured: a click on a bullet reached it
 *   and a click on a marker icon did not, which is the same result the caveat
 *   predicts and the opposite of what the first version of this file assumed.
 *
 * Hence a capture-phase listener on the editor's own element. Capture, so it
 * runs before CM6's handlers on `contentDOM` further down the tree turn the
 * press into a selection drag. One listener rather than one per mark, because
 * the marks come from three different places and only their DOM has anything in
 * common: a CM6 widget decoration on a plain line, an imperative injection on a
 * widget-replaced atom (`decorations.ts`), and Obsidian's own `.list-bullet` on
 * a list item — the mark for the commonest node of all, and not ours to build.
 *
 * `pointerdown` and not `mousedown`, which is what this listened for first: on a
 * touch device there is no mouse event to hear, and the gesture simply did not
 * exist there. Caught by the mobile e2e run, where every click test failed while
 * every command test passed.
 *
 * A pointer gesture still produces the mouse events afterwards, and
 * `preventDefault` on `pointerdown` does not suppress them for a mouse — so a
 * handled press is remembered until its own gesture ends, and the `mousedown`,
 * `mouseup` and `click` that follow it are swallowed rather than allowed to
 * place a caret from coordinates that now mean something else entirely.
 */

import { ViewPlugin, type EditorView, type PluginValue } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import { resolveZoom } from '../zoom';
import { parsedDoc } from './parsed-doc';
import { isNestedEditor } from './nested-editor';
import { OWN_CHROME_CLASS } from './chrome-line';
import { zoomTo } from './zoom-state';
import type { ModeSource } from './keymap';

/**
 * What counts as a node's mark.
 *
 * The native elements are here for the reason the module comment gives: a list
 * item's mark is Obsidian's, not ours. `.to-decor-ol-digits` is here because on
 * an ordered item Obsidian's own `.list-number` is not always emitted — the
 * decoration layer supplies a span around the digits precisely for the lines
 * where it is missing (`ORDERED_DIGITS_CLASS`), and without it the first items
 * of a nested ordered list had no reachable mark at all while their siblings
 * did. The whitespace after a marker is NOT included: `.cm-formatting-list`
 * spans that too, and swallowing a click there would take a position the reader
 * was aiming the caret at.
 */
const MARK_SELECTOR =
  '.to-decor-marker-icon, .list-bullet, .list-number, .to-decor-ol-digits';

/** The events a handled press has to swallow, in the order they arrive. */
const TRAILING_EVENTS = ['mousedown', 'mouseup', 'click'] as const;

class ZoomClickPlugin implements PluginValue {
  private readonly onPointerDown: (event: Event) => void;
  private readonly onTrailing: (event: Event) => void;
  /** A press this gesture took, until its own trailing events are spent. */
  private consuming = false;

  constructor(
    private readonly view: EditorView,
    private readonly modes: ModeSource,
  ) {
    this.onPointerDown = (event) => {
      if (event instanceof MouseEvent) this.handle(event);
    };
    this.onTrailing = (event) => this.swallow(event);
    this.view.dom.addEventListener('pointerdown', this.onPointerDown, true);
    for (const type of TRAILING_EVENTS) {
      this.view.dom.addEventListener(type, this.onTrailing, true);
    }
  }

  destroy(): void {
    this.view.dom.removeEventListener('pointerdown', this.onPointerDown, true);
    for (const type of TRAILING_EVENTS) {
      this.view.dom.removeEventListener(type, this.onTrailing, true);
    }
  }

  /** The rest of a press this gesture already took. `click` ends it: it is the
   * last of the three, and a gesture that never produces one — a drag off the
   * mark — is ended by the `mouseup` before it. */
  private swallow(event: Event): void {
    if (!this.consuming) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type !== 'mousedown') this.consuming = false;
  }

  private handle(event: MouseEvent): void {
    if (event.button !== 0) return;
    // A modified click is someone else's gesture — Obsidian's own follow-link
    // and multi-caret bindings live there — and never this one.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    // `Element`, not `HTMLElement`: a marker's hit target is a `<rect>` or a
    // `<path>` inside its SVG, and an SVG element is not an HTMLElement. The
    // narrower test silently dropped every click that actually landed on a
    // glyph — measured, and invisible to a synthesised event dispatched on the
    // span itself.
    const target = event.target instanceof Element ? event.target : null;
    const mark = target?.closest<HTMLElement>(MARK_SELECTOR);
    if (!mark) return;
    // The trail and the footer draw marks of their own inside `.cm-content` and
    // answer their own clicks — the trail's mark zooms OUT, and a footer row
    // navigates. Both already declare that they are not lines
    // (`chrome-line.ts`), which is exactly the question being asked here.
    if (mark.closest(`.${OWN_CHROME_CLASS}`)) return;
    if (isNestedEditor(this.view)) return;
    const path = this.view.state.field(editorInfoField, false)?.file?.path;
    if (!path || !this.modes.isOutline(path)) return;

    let pos: number;
    try {
      pos = this.view.posAtDOM(mark);
    } catch {
      // A mark the current document cannot place — mid-render DOM that has
      // already moved on. Leave the click to the editor.
      return;
    }
    const { doc } = parsedDoc(this.view.state.doc);
    const scope = resolveZoom(doc, this.view.state.doc.lineAt(pos).number - 1);
    if (!scope) return;

    // Both, and in the capture phase: `preventDefault` alone leaves CM6's own
    // handler on `contentDOM` to run and start a selection drag from the mark,
    // and `stopPropagation` alone leaves the browser to focus and place a
    // caret. The press is entirely this gesture's, trailing events included.
    event.preventDefault();
    event.stopPropagation();
    this.consuming = true;
    const rootStart = this.view.state.doc.line(scope.startLine + 1).from;
    this.view.dispatch({
      effects: zoomTo.of(rootStart),
      // ALWAYS moved, where the command leaves an empty selection alone. The
      // command zooms to the node the caret is already in; a click can name any
      // node on screen, so the caret is usually outside the scope this creates
      // and has to come along. The root's own start is the position the caret
      // policy then resolves onto that node's content.
      selection: { anchor: rootStart },
    });
  }
}

export function zoomClickExtension(modes: ModeSource): Extension {
  return ViewPlugin.define((view) => new ZoomClickPlugin(view, modes));
}
