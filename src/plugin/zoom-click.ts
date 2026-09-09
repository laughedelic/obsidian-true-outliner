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
 *
 * `instanceof Element` (below) reads from the view's OWN window, not the
 * global one it happens to be evaluated in. An Obsidian pop-out leaf runs in a
 * real separate window, with its OWN `Element`/`MouseEvent` constructors — an
 * element or event built there is not an `instanceof` this MODULE's globals,
 * so a check against the bare identifiers declined every click there. Read
 * once, from `view.dom.ownerDocument.defaultView`, the same resolution
 * `zoom-view.ts` already uses for the same reason.
 */

import { ViewPlugin, type EditorView, type PluginValue } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { resolveZoom } from '../zoom';
import { parsedDoc } from './parsed-doc';
import { ancestryAtLine } from './fold-model';
import { GUIDES_CLASS } from './chrome-line';
import { toggleGuideAt } from './fold-commands';
import { isNestedEditor } from './nested-editor';
import { OWN_CHROME_CLASS } from './chrome-line';
import { zoomTo } from './zoom-state';
import { isOutlineMode } from './outline-state';

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
const MARK_SELECTOR = '.to-decor-marker-icon, .list-bullet, .list-number, .to-decor-ol-digits';

/** The events a handled press has to swallow, in the order they arrive. */
const TRAILING_EVENTS = ['mousedown', 'mouseup', 'click'] as const;

class ZoomClickPlugin implements PluginValue {
  private readonly onPointerDown: (event: Event) => void;
  private readonly onTrailing: (event: Event) => void;
  /** This view's OWN `Element`, not the module's global — see the module
   * comment on pop-out windows. Read once: a live view's DOM does not move to
   * a different window without being torn down and rebuilt. */
  private readonly Element: typeof Element;
  /** A press this gesture took, until its own trailing events are spent. */
  private consuming = false;

  constructor(private readonly view: EditorView) {
    this.Element = view.dom.ownerDocument.defaultView?.Element ?? Element;
    // No realm check needed on `event` itself: a listener registered for
    // `'pointerdown'` is only ever invoked with a `PointerEvent`, whichever
    // window built it, so a cast is exact here — unlike `event.target` below,
    // which needs the real check because nothing pins its type this way.
    this.onPointerDown = (event) => this.handle(event as MouseEvent);
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

  /**
   * The rest of a press this gesture already took. `click` is what clears it,
   * NOT `mouseup`: a real mouse press fires `mousedown`, `mouseup`, then
   * `click`, in that order, so clearing on `mouseup` left `consuming` false
   * by the time `click` arrived — the swallow guard above returned
   * immediately, and the click ran uncaught, free to place a caret or fold a
   * list item exactly where this gesture is supposed to have the only say.
   *
   * A gesture that drags OFF the mark before release produces `mousedown`
   * and `mouseup` with no `click` at all, so clearing only on `click` would
   * leave this stuck `true` forever — `handle` clears it unconditionally on
   * every new press instead, which is the only point a stuck flag can
   * matter: nothing else runs between one gesture's end and the next one's
   * start.
   */
  private swallow(event: Event): void {
    if (!this.consuming) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'click') this.consuming = false;
  }

  /**
   * The guide half of the gesture. Returns whether it acted, so the caller
   * takes the press only when it did — a miss has to stay an ordinary click.
   */
  private handleGuide(event: MouseEvent, target: Element | null): boolean {
    if (isNestedEditor(this.view)) return false;
    if (!isOutlineMode(this.view.state)) return false;
    const lineEl = target?.closest<HTMLElement>('.cm-line');
    if (!lineEl) return false;
    // A guide is drawn only when guides are drawn: an affordance that
    // disappears with a display setting cannot be the only route to an
    // operation, and this one is not — the commands and the per-node control
    // remain.
    if (!lineEl.classList.contains(GUIDES_CLASS)) return false;
    let pos: number;
    try {
      pos = this.view.posAtDOM(lineEl);
    } catch {
      return false;
    }
    const lineNumber = this.view.state.doc.lineAt(pos).number - 1;
    const { doc } = parsedDoc(this.view.state.doc);
    const chain = ancestryAtLine(doc, lineNumber);
    const depth = chain.length - 1;
    if (depth < 1) return false;
    const column = guideHit(this.view, lineEl, event.clientX, depth);
    if (column === null) return false;
    return toggleGuideAt(this.view, lineNumber, column);
  }

  private handle(event: MouseEvent): void {
    // A fresh gesture starting is also the only reliable point to notice a
    // PREVIOUS one that dragged off the mark and never produced its `click` —
    // see `swallow`'s own comment for why that leaves this set.
    this.consuming = false;
    if (event.button !== 0) return;
    // A modified click is someone else's gesture — Obsidian's own follow-link
    // and multi-caret bindings live there — and never this one.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    // `Element`, not `HTMLElement`: a marker's hit target is a `<rect>` or a
    // `<path>` inside its SVG, and an SVG element is not an HTMLElement. The
    // narrower test silently dropped every click that actually landed on a
    // glyph — measured, and invisible to a synthesised event dispatched on the
    // span itself. `this.Element`, not the bare identifier: see the module
    // comment on pop-out windows.
    const target = event.target instanceof this.Element ? event.target : null;
    const mark = target?.closest<HTMLElement>(MARK_SELECTOR);
    // No mark under the press: the other thing this gutter offers is a guide
    // column, which folds the branch it belongs to. Marks win, because a mark
    // is the smaller target and the more specific claim — and because the two
    // gestures have to be ordered somewhere, which is why they share a listener
    // rather than racing in two.
    if (!mark) {
      if (this.handleGuide(event, target)) {
        event.preventDefault();
        event.stopPropagation();
        this.consuming = true;
      }
      return;
    }
    // The trail and the footer draw marks of their own inside `.cm-content` and
    // answer their own clicks — the trail's mark zooms OUT, and a footer row
    // navigates. Both already declare that they are not lines
    // (`chrome-line.ts`), which is exactly the question being asked here.
    if (mark.closest(`.${OWN_CHROME_CLASS}`)) return;
    if (isNestedEditor(this.view)) return;
    if (!isOutlineMode(this.view.state)) return;

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

/**
 * A press on an indentation guide, or null if it was not one.
 *
 * Guides are painted as a gradient on one pseudo-element per line
 * (docs/research/09), so there is no element to hit — the column has to be
 * found by arithmetic. All of it comes from the line under the press:
 *
 * - its box's left edge is column 0, measured;
 * - its own mark sits at `left + depth × unit`, so one rendered mark on the
 *   line gives the unit without resolving a CSS variable to pixels;
 * - the guides it draws are its ancestors' columns, `k < depth`.
 *
 * The tolerance is a third of a unit either side, comfortably short of the half
 * that would start stealing presses meant for the level beside it, and the
 * press must land LEFT of the line's own text — a click in the text is a click
 * in the text, whatever column it happens to line up with.
 */
function guideHit(
  view: EditorView,
  lineEl: HTMLElement,
  clientX: number,
  depth: number,
): number | null {
  if (depth < 1) return null;
  const box = lineEl.getBoundingClientRect();
  const markEl = lineEl.querySelector<HTMLElement>(
    ':scope > .to-decor-marker-icon, .list-bullet, .cm-formatting-list, .task-list-item-checkbox',
  );
  const step = markEl ? (markEl.getBoundingClientRect().left - box.left) / depth : null;
  if (step === null || !(step > 1)) return null;
  const textLeft = box.left + parseFloat(getComputedStyle(lineEl).paddingLeft);
  if (clientX > textLeft) return null;
  const tolerance = step / 3;
  for (let k = 0; k < depth; k++) {
    if (Math.abs(clientX - (box.left + k * step)) <= tolerance) return k;
  }
  return null;
}

export function zoomClickExtension(): Extension {
  return ViewPlugin.define((view) => new ZoomClickPlugin(view));
}
