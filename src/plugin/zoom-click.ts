/**
 * Zoom by clicking a node's mark — the outliner gesture, alongside the command.
 *
 * `outline-zoom` first listed this as out of scope, gated on two caveats
 * docs/research/decoration-follow-ups had been carrying. Measured, one is real and the other is
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

import { ViewPlugin, type EditorView, type PluginValue, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { reresolveZoom, resolveZoom, type ZoomScope } from '../zoom';
import { dragOperand } from '../operand';
import { nodeAtLine } from '../locate';
import { linePosToOffset, offsetToLinePos, toLineRange } from './cm-pos';
import { indentUnit } from '@codemirror/language';
import { walkNodes, type OutlineDoc, type OutlineNode } from '../model';
import {
  dropSeams,
  resolveDestination,
  startLineOf,
  type DropSeam,
} from '../drop-destinations';
import { dragGeometry, measureUnit } from './drag-geometry';
import { unfoldEffectsWithin } from './fold-ops';
import {
  dragLiftField,
  dragPreviewField,
  sameDestination,
  setDragLift,
  setDragPreview,
  type DragPreview,
} from './drag-state';
import { foldedChrome } from './fold-service';
import { entryAtLine } from './fold-model';
import { zoomScope } from './zoom-scope';
import { parsedDoc } from './parsed-doc';
import { subtreeDocument } from '../project';
import { moveSubtreesTo } from '../ops';
import { placeOutline } from './decorate';
import { openPlaceLine } from './provisional-cleanup';
import { changesToSpec } from './dispatch';
import { offsetInLines, planStructural } from './structural-run';
import { noticeRejection } from './notices';
import { GUIDES_CLASS } from './chrome-line';
import { guideOwnerAt, toggleGuideAt } from './fold-commands';
import { foldLines } from './fold-model';
import { guideHoverField, setGuideHover, type GuideHover } from './guide-hover';
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

/**
 * A task's mark, which is Obsidian's own checkbox.
 *
 * Kept apart from the marks above because the claim on it is NARROWER. Its
 * click already means something — toggling the task — and this gesture does
 * not contest it: measured, a press that leaves the box produces no click on
 * it at all, so the browser never runs the input's activation behaviour and a
 * drag can start there with nothing suppressed. So the press is watched for
 * movement rather than taken, and a press that never moves reaches the
 * checkbox and toggles it exactly as it always has. The zoom half of that
 * question stays where `outline-zoom` left it: a task is not zoomed by its
 * mark.
 */
const TASK_MARK_SELECTOR = '.task-list-item-checkbox';

/** On the editor root while the pointer rests on a guide: the one place the
 * cursor can be set that every element under the pointer inherits, and that
 * no line decoration rewrites. */
const GUIDE_HOVERING_CLASS = 'to-decor-guide-hovering';

/** The events a handled press has to swallow, in the order they arrive. */
const TRAILING_EVENTS = ['mousedown', 'mouseup', 'click'] as const;

/** The events a touch carries besides its pointer events, each one the
 * platform's own reading of it: the tap that focuses the editor, the long
 * press that places a caret or opens a menu, and the pan. */
const TOUCH_EVENTS = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'contextmenu'] as const;

/**
 * How far a press moves before it stops being a click.
 *
 * A threshold rather than the first move: a pointer reports movement a hand
 * never intended, and turning a tremor into a drag would make the zoom
 * unreachable for anyone whose hand is not perfectly still.
 */
const DRAG_THRESHOLD_PX = 4;

/**
 * How long a touch rests on a mark before it is a drag (design D12). A touch
 * drag and a scroll are the same gesture until something separates them, and
 * the dwell is what every touch outliner separates them with: a touch that
 * moves before it is up is a scroll, and the press is let go.
 */
const TOUCH_DWELL_MS = 350;

/**
 * How far a touch may wander while it rests before it no longer counts as
 * resting. A resting finger is not a still one, and the mouse's threshold
 * would end most holds before the dwell is up.
 */
const TOUCH_SLOP_PX = 10;

/**
 * Autoscroll (design D13): the band inside the scroller's top and bottom edges
 * where a held pointer scrolls, and the most it scrolls per second — reached at
 * the band's outer edge and beyond, so the rate is the pointer's distance past
 * the edge and not a fixed step. Per second and not per frame: a frame that
 * scrolls onto a new seam dispatches a preview, and a rate stated per frame
 * would slow down exactly where the view has the most to redraw.
 */
const AUTOSCROLL_BAND_PX = 40;
const AUTOSCROLL_MAX_PX_PER_SECOND = 1440;
/** The longest a single frame is credited with, so a stalled frame does not
 * become a jump when the next one arrives. */
const AUTOSCROLL_MAX_FRAME_MS = 100;

/** What one press resolves its destinations against, held for its duration. */
interface PressSeams {
  readonly list: readonly DropSeam[];
  /** The tree the seams were read from: the zoom scope's own re-rooted
   * document, or the press's tree. */
  readonly tree: OutlineDoc;
  /** The scope's first line, which maps the tree's lines back to the source. */
  readonly lineOffset: number;
  /** One depth step in CSS pixels, measured with the seams. */
  readonly unit: number | null;
  /** The nodes in flight: every root and every descendant. */
  readonly runSize: number;
}

/** A press on a mark, from its arrival until the button comes up. */
interface MarkPress {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** The mark itself, so the release resolves against the document as it is
   * THEN rather than against a line number taken before the press. */
  readonly mark: HTMLElement;
  /** Set once the press has moved past the threshold, and never unset: a
   * gesture that wanders and comes back is still a drag. */
  dragging: boolean;
  /** A touch press becomes a drag by resting, not by moving (D12). */
  readonly touch: boolean;
  /** The dwell timer of a touch press, until it fires or the press ends. */
  dwell: number | undefined;
  /** Whether a release in place zooms. False for a task's checkbox, whose
   * press was never taken from it. */
  readonly zooms: boolean;
  /** What the drag picked up, once it became one. */
  groups: readonly (readonly number[])[] | undefined;
  /** The tree the whole gesture is resolved against: taken once at the
   * pick-up, and the same one the seams, the preview and the drop all read.
   * The ids have to agree across the three, and a document change under the
   * drag cancels it, so there is nothing to re-derive. */
  tree: OutlineDoc | undefined;
  /** The provisional position open at the pick-up, if any (`outline-keyboard-
   * grammar`). Read before the collapse, which is a selection dispatch with no
   * `userEvent` and so destroys the record. */
  placeLine: number | undefined;
  /** The seams this drag can land on, read once: the tree they are read from
   * is the press's own, the folds cannot change while a button is held, and
   * the zoom scope is a function of that tree. Reading them again on every
   * move was, on a long note, the whole cost of a move. */
  seams: PressSeams | undefined;
  /** The selection as it was BEFORE the drag collapsed it — what a cancel
   * puts back. The collapse belongs to the drag, so undoing the drag undoes
   * the collapse with it. */
  selectionBefore: { anchor: number; head: number } | undefined;
}

class ZoomClickPlugin implements PluginValue {
  private readonly onPointerDown: (event: Event) => void;
  private readonly onTrailing: (event: Event) => void;
  private readonly onPointerMove: (event: Event) => void;
  private readonly onPointerUp: (event: Event) => void;
  private readonly onPointerLost: (event: Event) => void;
  private readonly onKeyDown: (event: Event) => void;
  private readonly onTouch: (event: Event) => void;
  /**
   * How much of the current touch this gesture has taken from the platform:
   * all of it, for a touch that lands on a mark, or its moves and its lift
   * once a checkbox's press has become a drag, since the checkbox's tap stays
   * its own. A touch event follows the pointer event it pairs with, so this
   * outlives the press by the `touchend` that closes it.
   */
  private touchClaim: 'whole' | 'moves' | null = null;
  /** Where the pointer last was, so the hover can be re-applied after the
   * view rebuilds under it — the fold a press makes replaces the very lines
   * the band was on, and left the guide dark until the pointer moved. */
  private lastPointer: { x: number; y: number; target: EventTarget | null } | null = null;
  /** The autoscroll in progress: its frame request, the pointer it reads, and
   * when its last frame ran. */
  private autoscroll: { frame: number; pointer: { x: number; y: number }; last: number } | null = null;
  /** This view's OWN `Element`, not the module's global — see the module
   * comment on pop-out windows. Read once: a live view's DOM does not move to
   * a different window without being torn down and rebuilt. */
  private readonly Element: typeof Element;
  /** A press this gesture took, until its own trailing events are spent. */
  private consuming = false;
  /** The press in flight, if any — a mark is held and its meaning is not yet
   * decided. */
  private press: MarkPress | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly touchDragging: () => boolean,
  ) {
    this.Element = view.dom.ownerDocument.defaultView?.Element ?? Element;
    // No realm check needed on `event` itself: a listener registered for
    // `'pointerdown'` is only ever invoked with a `PointerEvent`, whichever
    // window built it, so a cast is exact here — unlike `event.target` below,
    // which needs the real check because nothing pins its type this way.
    this.onPointerDown = (event) => this.handle(event as PointerEvent);
    this.onTrailing = (event) => this.swallow(event);
    this.onPointerMove = (event) => this.onMove(event as PointerEvent);
    this.onPointerUp = (event) => this.release(event as PointerEvent);
    this.onPointerLost = () => this.cancelPress();
    this.onKeyDown = (event) => this.keyCancel(event as KeyboardEvent);
    this.onTouch = (event) => this.claimTouch(event);
    this.view.dom.addEventListener('pointerdown', this.onPointerDown, true);
    // Not passive any more: a drag in flight is the one case that has to be
    // able to refuse the platform's own interpretation of the same movement.
    this.view.dom.addEventListener('pointermove', this.onPointerMove);
    this.view.dom.addEventListener('pointerleave', this.onPointerMove);
    this.view.dom.addEventListener('pointerup', this.onPointerUp, true);
    this.view.dom.addEventListener('pointercancel', this.onPointerLost, true);
    this.view.dom.addEventListener('lostpointercapture', this.onPointerLost, true);
    for (const type of TRAILING_EVENTS) {
      this.view.dom.addEventListener(type, this.onTrailing, true);
    }
    // Not passive: a claimed touch is one whose defaults are refused.
    for (const type of TOUCH_EVENTS) {
      this.view.dom.addEventListener(type, this.onTouch, { capture: true, passive: false });
    }
  }

  update(update: ViewUpdate): void {
    // A write under a held press invalidates everything the press resolved
    // against — the operand's ids, the mark's position, the seams. Cancelled
    // rather than re-resolved: the reader is holding a node that has moved
    // under them, and continuing would drop it somewhere they did not aim at.
    // Our own collapse and restore are selection-only, so they do not trip
    // this.
    if (update.docChanged && this.press) {
      // The press is dropped now, so no move that lands before the microtask
      // continues it; the rest of the cancel dispatches, and a dispatch from
      // inside an update is one CodeMirror refuses.
      const press = this.press;
      this.press = null;
      // The selection to put back was read before this write, so it moves
      // with it.
      const before = press.selectionBefore;
      if (before) {
        press.selectionBefore = {
          anchor: update.changes.mapPos(before.anchor),
          head: update.changes.mapPos(before.head),
        };
      }
      queueMicrotask(() => this.endPress(press));
    }
    // A change clears the hover state (its line numbers moved) while the
    // pointer has not. Re-derive from where it last was — and only then. The
    // state survives everything else, the fold a press makes included; and
    // re-deriving after that fold read whatever the fold had just moved under
    // the resting pointer, a chevron among the candidates, and put the guide
    // out on the press that acted on it.
    if (!this.lastPointer || !update.docChanged) return;
    // Snapshotted by REFERENCE, and re-checked before acting: a real
    // `pointermove` between now and the microtask replaces `lastPointer` with
    // a new object, and that move's own `hoverGuideAt` call already set the
    // correct state — for a position this doc change knows nothing about,
    // since it landed after this update was queued. Without the check, the
    // stale re-derive ran anyway and overwrote the correct hover with one
    // computed from where the pointer used to be, against whatever geometry
    // is at that position now. Reached in practice one call in several: a
    // fresh note load (this same trigger, in another view's `beforeEach`)
    // races a `pointermove` from the gesture the next moment tests.
    const snapshot = this.lastPointer;
    queueMicrotask(() => {
      if (this.lastPointer !== snapshot) return;
      const { x, y, target } = snapshot;
      this.hoverGuideAt(x, y, target);
    });
  }

  destroy(): void {
    this.cancelPress();
    this.clearGuideHover();
    this.view.dom.removeEventListener('pointermove', this.onPointerMove);
    this.view.dom.removeEventListener('pointerleave', this.onPointerMove);
    this.view.dom.removeEventListener('pointerdown', this.onPointerDown, true);
    this.view.dom.removeEventListener('pointerup', this.onPointerUp, true);
    this.view.dom.removeEventListener('pointercancel', this.onPointerLost, true);
    this.view.dom.removeEventListener('lostpointercapture', this.onPointerLost, true);
    for (const type of TRAILING_EVENTS) {
      this.view.dom.removeEventListener(type, this.onTrailing, true);
    }
    for (const type of TOUCH_EVENTS) {
      this.view.dom.removeEventListener(type, this.onTouch, true);
    }
  }

  /**
   * A touch this gesture holds, kept from the platform. Cancelling the
   * pointer event does not do that: the touch's own events carry the
   * platform's readings of it, and the pan among them takes the pointer back
   * the moment a held finger moves, which cancels the drag
   * (docs/research/node-drag-and-drop).
   *
   * A `touchstart` refused is the whole touch refused — no tap, no long
   * press, no pan — which is what a touch on a mark is. A checkbox's is not
   * refused, so its tap still toggles and a swipe from it still scrolls.
   */
  private claimTouch(event: Event): void {
    const claim = this.touchClaim;
    if (claim === null) return;
    if (claim === 'whole' || event.type !== 'touchstart') {
      event.preventDefault();
      event.stopPropagation();
    }
    if ((event.type === 'touchend' || event.type === 'touchcancel') && (event as TouchEvent).touches.length === 0) {
      this.touchClaim = null;
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
   * Every pointer move over the editor, routed by whether a mark is held.
   *
   * A press in flight owns the movement: its meaning is the question the
   * threshold answers, and the guide hover has no business lighting up under a
   * held button — it dispatches a transaction, which lands in the middle of
   * whatever the press is doing.
   */
  private onMove(event: PointerEvent): void {
    if (this.press && event.type === 'pointermove' && event.pointerId === this.press.pointerId) {
      this.trackPress(event);
      return;
    }
    this.trackGuide(event);
  }

  /**
   * A held mark's movement: below the threshold nothing has happened yet, and
   * past it the press is a drag for good — a gesture that wanders and comes
   * back is still a drag, so `dragging` is never unset.
   */
  private trackPress(event: PointerEvent): void {
    const press = this.press;
    if (!press) return;
    if (!press.dragging) {
      const dx = event.clientX - press.startX;
      const dy = event.clientY - press.startY;
      const moved = Math.hypot(dx, dy);
      if (moved < (press.touch ? TOUCH_SLOP_PX : DRAG_THRESHOLD_PX)) return;
      // A touch that moves before its dwell is up was not a hold, and the
      // press is let go: from a checkbox the platform scrolls, and from a mark,
      // whose touch the platform never had, nothing happens at all.
      if (press.touch) {
        this.cancelPress();
        return;
      }
      press.dragging = true;
      this.beginDrag(press);
      // Not on this move. Collapsing to a cover puts the covered rows into
      // block-selection mode, and a row that stops rendering raw can change
      // height — so the seams are read once that has settled, which is the
      // next move at the earliest.
      return;
    }
    this.previewDrop(press, event.clientX, event.clientY);
    this.trackAutoscroll(press, event.clientX, event.clientY);
  }

  /**
   * Autoscroll while the pointer is held within the band at the scroller's
   * edges (design D13). The scroller scrolls, and nothing else moves: the seam
   * geometry is re-read against the scrolled view on every frame, so the
   * preview follows the document under the resting pointer. The rate is the
   * pointer's distance past the band's inner edge, so a pointer that is barely
   * in the band creeps and one past the edge moves at the full rate.
   */
  private trackAutoscroll(press: MarkPress, x: number, y: number): void {
    const rate = this.autoscrollRate(y);
    if (rate === 0) {
      this.stopAutoscroll();
      return;
    }
    const pointer = { x, y };
    if (this.autoscroll) {
      this.autoscroll.pointer = pointer;
      return;
    }
    const win = this.view.dom.ownerDocument.defaultView ?? window;
    const step = (now: number): void => {
      const running = this.autoscroll;
      if (!running || this.press !== press) return;
      const elapsed = Math.min(now - running.last, AUTOSCROLL_MAX_FRAME_MS);
      running.last = now;
      const perSecond = this.autoscrollRate(running.pointer.y);
      const scroller = this.view.scrollDOM;
      const before = scroller.scrollTop;
      scroller.scrollTop = before + (perSecond * elapsed) / 1000;
      // At the scroller's limit nothing moves, and a frame loop that keeps
      // asking is a frame loop for nothing.
      if (perSecond === 0 || (elapsed > 0 && scroller.scrollTop === before)) {
        this.stopAutoscroll();
        return;
      }
      this.previewDrop(press, running.pointer.x, running.pointer.y);
      running.frame = win.requestAnimationFrame(step);
    };
    this.autoscroll = { frame: win.requestAnimationFrame(step), pointer, last: win.performance.now() };
  }

  /** Pixels per second for a pointer at viewport `y`: negative above, positive
   * below, zero outside both bands. */
  private autoscrollRate(y: number): number {
    const rect = this.view.scrollDOM.getBoundingClientRect();
    const past =
      y < rect.top + AUTOSCROLL_BAND_PX
        ? -(rect.top + AUTOSCROLL_BAND_PX - y)
        : y > rect.bottom - AUTOSCROLL_BAND_PX
          ? y - (rect.bottom - AUTOSCROLL_BAND_PX)
          : 0;
    if (past === 0) return 0;
    const fraction = Math.min(Math.abs(past), AUTOSCROLL_BAND_PX) / AUTOSCROLL_BAND_PX;
    return Math.sign(past) * fraction * AUTOSCROLL_MAX_PX_PER_SECOND;
  }

  private stopAutoscroll(): void {
    if (!this.autoscroll) return;
    const win = this.view.dom.ownerDocument.defaultView ?? window;
    win.cancelAnimationFrame(this.autoscroll.frame);
    this.autoscroll = null;
  }

  /**
   * Where the run would land if the button came up here, published as state
   * for the preview to draw and the release to apply — one resolution, so the
   * two cannot disagree.
   *
   * Dispatched only when the destination CHANGES. A pointer emits moves far
   * faster than the destination changes under it, and a transaction per sample
   * is a rebuild per sample.
   */
  private previewDrop(press: MarkPress, x: number, y: number): void {
    const next = this.resolveDrop(press, x, y);
    const current = this.view.state.field(dragPreviewField, false) ?? null;
    if (sameDestination(current, next)) return;
    this.view.dispatch({ effects: setDragPreview.of(next) });
  }

  private resolveDrop(press: MarkPress, x: number, y: number): DragPreview | null {
    const seams = this.seamsFor(press);
    if (!seams) return null;
    // The geometry is the move's: the scroller may have moved under a resting
    // pointer, and a seam's y is read against the view as it is now.
    const geometry = dragGeometry(this.view, seams.list, seams.lineOffset, seams.unit);
    if (!geometry) return null;
    const resolved = resolveDestination(seams.list, geometry, { x, y });
    if (!resolved) return null;
    // Back into the SOURCE's line space, which is the one every consumer of
    // this state reads.
    const offset = seams.lineOffset;
    const parent = resolved.destination.landsUnder ?? resolved.destination.parentId;
    const parentLine = parent === 'root' ? undefined : startLineOf(seams.tree, parent);
    return {
      seamLine: resolved.seam.line + offset,
      destination: resolved.destination,
      parentLine: parentLine === undefined ? null : parentLine + offset,
      lineOffset: offset,
      runSize: seams.runSize,
    };
  }

  /** The press's seams, read on the first move that asks and held after. */
  private seamsFor(press: MarkPress): PressSeams | null {
    if (press.seams) return press.seams;
    if (!press.groups || !press.tree) return null;
    // Under a zoom the seams are resolved against the scope's OWN re-rooted
    // document, so no destination outside the scope exists to be offered in
    // the first place. Re-resolved against the press's tree first: the scope
    // was built from the view's cached parse, and over an open position that
    // is a different tree with different ids.
    const scope = this.scopeFor(press.tree);
    const tree = scope ? subtreeDocument(scope.root) : press.tree;
    const wanted = new Set(press.groups.flat());
    const roots: OutlineNode[] = [];
    for (const node of walkNodes(tree)) {
      if (wanted.has(node.id)) roots.push(node);
    }
    if (roots.length !== wanted.size) return null;

    const list = dropSeams(tree, roots, {
      folded: foldedIds(this.view, tree),
      // The gesture holds the view, so it reads the editor's live unit where
      // the command path has to fall back to a default.
      fallbackIndentUnit: this.view.state.facet(indentUnit),
      // Which document this is, which is the other half of applying the zoom:
      // a scope's top level is the zoom root's own level, and a run dropped
      // there leaves the view it was dragged in.
      scoped: scope !== null,
    });
    let runSize = 0;
    const count = (node: OutlineNode): void => {
      runSize++;
      node.children.forEach(count);
    };
    roots.forEach(count);
    press.seams = {
      list,
      tree,
      lineOffset: scope ? scope.startLine : 0,
      unit: measureUnit(this.view),
      runSize,
    };
    return press.seams;
  }

  /**
   * The threshold has been passed. The pointer is captured on the editor ROOT
   * rather than on the mark: a drag autoscrolls, which takes the source line
   * out of the viewport where CodeMirror recycles it, and nothing measured
   * says the mark survives that. The root is stable by construction, is
   * already the listener's element, and gives `lostpointercapture` as the one
   * place a cancelled drag cleans up from.
   */
  private beginDrag(press: MarkPress): void {
    try {
      this.view.dom.setPointerCapture(press.pointerId);
    } catch {
      // A pointer the platform has already finished with. The drag goes on
      // without capture rather than not at all.
    }
    // On the DOCUMENT, and only while a drag is in flight. Collapsing the
    // selection to a cover blurs the content DOM, so a key listener on the
    // editor's own element would not hear the Escape that cancels.
    this.view.dom.ownerDocument.addEventListener('keydown', this.onKeyDown, true);
    if (press.touch && this.touchClaim === null) this.touchClaim = 'moves';
    this.pickUp(press);
    // The pick-up may have cancelled the press; only a drag that holds an
    // operand has rows to lift.
    if (this.press === press && press.groups) {
      this.view.dispatch({ effects: setDragLift.of(true) });
    }
  }

  /**
   * What the drag carries, resolved by the same rule every other structural
   * operation resolves its operand by — asked about the node the pointer is
   * holding rather than about the caret.
   *
   * Here, at the THRESHOLD, and not at the press. A cover IS the
   * block-selection interaction mode: the editor blurs, the covered lines stop
   * rendering raw, and block chrome appears. A press that never moves is a
   * zoom, and has no business entering that mode on its way.
   */
  private pickUp(press: MarkPress): void {
    let pos: number;
    try {
      pos = this.view.posAtDOM(press.mark);
    } catch {
      this.cancelPress();
      return;
    }
    const main = this.view.state.selection.main;
    // The OUTLINE a provisional position stands for, on the same terms the
    // keyboard and the palette resolve it on (`selection-structural-ops`): a
    // blank line one of our own keypresses opened is a node to the other two
    // entry points, so a seam it offers is a place they can already act on.
    //
    // Read HERE and not at the release. The collapse below is a selection
    // dispatch carrying no `userEvent`, and `placeLineAfter` recognises
    // neither a creating nor a carrying dispatch without one, so the record is
    // gone by the time the button comes up.
    const text = this.view.state.doc.toString();
    press.placeLine = openPlaceLine(this.view) ?? undefined;
    const doc =
      placeOutline(text, offsetToLinePos(this.view.state.doc, main.head), press.placeLine) ??
      parsedDoc(this.view.state.doc).doc;
    press.tree = doc;
    const pressed = nodeAtLine(doc, this.view.state.doc.lineAt(pos).number - 1);
    if (!pressed) {
      this.cancelPress();
      return;
    }
    const operand = dragOperand(doc, toLineRange(this.view.state.doc, main), pressed.id);
    if (!operand) {
      this.cancelPress();
      return;
    }
    press.groups = operand.groups;
    if (!operand.collapseTo) return;
    press.selectionBefore = { anchor: main.anchor, head: main.head };
    this.view.dispatch({
      selection: {
        anchor: linePosToOffset(this.view.state.doc, operand.collapseTo.start),
        head: linePosToOffset(this.view.state.doc, operand.collapseTo.end),
      },
    });
  }

  /** The selection as it was before the drag collapsed it. */
  private restoreSelection(press: MarkPress): void {
    const before = press.selectionBefore;
    if (!before) return;
    const end = this.view.state.doc.length;
    if (before.anchor > end || before.head > end) return;
    this.view.dispatch({ selection: { anchor: before.anchor, head: before.head } });
  }

  /**
   * The button comes up, and the press says which gesture it was. `pointerup`
   * and not `click`: a gesture that leaves the mark before releasing fires no
   * click on it at all, which is exactly the case the threshold has to judge.
   */
  private release(event: PointerEvent): void {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) return;
    this.press = null;
    this.clearDwell(press);
    this.stopAutoscroll();
    this.releaseCapture(press.pointerId);
    this.view.dom.ownerDocument.removeEventListener('keydown', this.onKeyDown, true);
    if (press.dragging) {
      // What the preview NAMED, rather than a second resolution from the
      // release's own coordinates: the reader acted on what they were shown,
      // and two resolutions are two chances to disagree. Read before the
      // preview is cleared, which is a dispatch of its own.
      const preview = this.view.state.field(dragPreviewField, false) ?? null;
      this.clearPreview();
      // A release that names no destination cancels with nothing written,
      // which includes putting back the selection the pick-up collapsed.
      if (!preview || !this.drop(press, preview)) this.restoreSelection(press);
      return;
    }
    this.clearPreview();
    if (press.zooms) this.zoomToMark(press.mark);
  }

  /**
   * The drop: the move the preview named, through the shared command funnel.
   *
   * Through it rather than beside it, because `selection-structural-ops`
   * requires every entry point to reach the same document and the same
   * selection — the gesture is a third one, and what it would otherwise have
   * to reproduce is the single transaction, the undo grouping, the caret
   * policy, the fold carry and the rejection cue. It enters one step further
   * along than the other two: the operand is the run the pointer is holding,
   * not the one a selection resolves to.
   *
   * True when the drop was applied — including a move that writes nothing
   * because the run is already where it was aimed. Its selection is still the
   * run, which is what the reader dropped.
   */
  private drop(press: MarkPress, preview: DragPreview): boolean {
    if (!press.groups || !press.tree) return false;
    const destination = preview.destination;
    // A destination inside a folded node opens the fold before the run lands
    // (`outline-folding`: nothing changes where the reader cannot see it). Its
    // own dispatch, on the document as it is, since the fold's positions are
    // stated in that document; and every fold touching the parent's own line
    // is the parent's — a visible destination cannot sit inside a closed one.
    if (preview.parentLine !== null) {
      const head = this.view.state.doc.line(preview.parentLine + 1);
      const opening = unfoldEffectsWithin(this.view.state, head.from, head.to);
      if (opening.length > 0) this.view.dispatch({ effects: opening });
    }
    const before = this.view.state.doc;
    const main = this.view.state.selection.main;
    // The gesture holds the view, so it reads the editor's live unit where the
    // command path has to fall back to a default.
    const unit = this.view.state.facet(indentUnit);
    const outcome = planStructural({
      text: before.toString(),
      opDoc: press.tree,
      groups: press.groups,
      // Always: the run that was in flight is the run that is selected when it
      // lands, whether the drag picked up a cover or made one.
      wasCover: true,
      op: (doc, groups) => moveSubtreesTo(doc, groups, destination, unit),
      caret: { kind: 'subject' },
      ...(press.placeLine === undefined ? {} : { placeLine: press.placeLine }),
      scope: this.scopeFor(press.tree),
      backward: main.anchor > main.head,
    });
    if (!outcome.ok) {
      noticeRejection(outcome.reason);
      return false;
    }
    const anchor = offsetInLines(outcome.newLines, outcome.from);
    const selection = {
      anchor,
      head: outcome.to === undefined ? anchor : offsetInLines(outcome.newLines, outcome.to),
    };
    if (outcome.changes.length === 0) {
      // A run dropped where it already is. The move is real and its
      // after-state stands; there is simply nothing to write, and an empty
      // changeset must not become an undo entry.
      this.view.dispatch({ selection });
      return true;
    }
    this.view.dispatch({
      changes: changesToSpec(before, outcome.changes),
      selection,
      // The same annotation the keyboard path's own moves carry, which is what
      // makes this one undo step rather than one joined to whatever preceded
      // it.
      userEvent: 'move.structure',
      scrollIntoView: true,
    });
    return true;
  }

  /** The zoom scope re-resolved against the tree this gesture is working in —
   * over an open position that is a different parse from the view's cached
   * one, and `parse()` allocates every node a new id. */
  private scopeFor(tree: OutlineDoc): ZoomScope | null {
    const scope = zoomScope(this.view.state);
    return scope ? reresolveZoom(tree, scope) : null;
  }

  /** Every path that ends a press without resolving it: a cancelled pointer,
   * capture lost to something else, the view going away. */
  /** Escape cancels a drag in flight, and nothing else — a press that has not
   * become one is a zoom waiting to happen, which Escape has no part in. */
  private keyCancel(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.press?.dragging) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancelPress();
  }

  private cancelPress(): void {
    const press = this.press;
    if (!press) return;
    this.press = null;
    this.endPress(press);
  }

  /** What every cancel does once the press has been let go of. */
  private endPress(press: MarkPress): void {
    this.clearDwell(press);
    this.stopAutoscroll();
    this.releaseCapture(press.pointerId);
    this.view.dom.ownerDocument.removeEventListener('keydown', this.onKeyDown, true);
    this.clearPreview();
    this.restoreSelection(press);
  }

  /** Nothing of a drag outlives it: the preview and the lift both go, in one
   * transaction, on every path that ends a press. */
  private clearPreview(): void {
    const effects = [];
    if (this.view.state.field(dragPreviewField, false)) effects.push(setDragPreview.of(null));
    if (this.view.state.field(dragLiftField, false)) effects.push(setDragLift.of(false));
    if (effects.length > 0) this.view.dispatch({ effects });
  }

  private releaseCapture(pointerId: number): void {
    try {
      if (this.view.dom.hasPointerCapture(pointerId)) {
        this.view.dom.releasePointerCapture(pointerId);
      }
    } catch {
      // Already released, or a pointer that no longer exists.
    }
  }

  /**
   * The zoom a press delivers when it never became a drag.
   *
   * Resolved from the MARK rather than from a line number taken at the press,
   * so the answer is against the document as it is when the button comes up.
   */
  private zoomToMark(mark: HTMLElement): void {
    let pos: number;
    try {
      pos = this.view.posAtDOM(mark);
    } catch {
      return;
    }
    const { doc } = parsedDoc(this.view.state.doc);
    const scope = resolveZoom(doc, this.view.state.doc.lineAt(pos).number - 1);
    if (!scope) return;
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

  /**
   * The guide gesture's hover feedback: the guide under the pointer, as editor
   * state the decoration pass paints thicker on every line it runs through
   * (`guide-hover.ts` says why state and not a style) — and the cursor, on the
   * editor root.
   *
   * A guide has no element, so it cannot be hovered — the same fact that makes
   * the gesture arithmetic (`guideHit`) makes its feedback arithmetic too. The
   * manual pass found the gesture working and invisible: nothing said where a
   * press would land. And a band on the hovered line alone said which column
   * but not which subtree, which is what a press acts on: the guide is the
   * owner's, from its first child through its last, and lights up whole.
   *
   * Recomputed only when the pointer changes line or column: pointer moves are
   * frequent, and an unchanged guide costs one arithmetic pass and no style
   * write.
   */
  private trackGuide(event: PointerEvent): void {
    if (event.type === 'pointerleave') {
      this.lastPointer = null;
      this.clearGuideHover();
      return;
    }
    // A held button is a drag, not a hover — and the hover dispatches a
    // transaction, which lands in the middle of CodeMirror's own mouse
    // selection and breaks it (measured: a drag onto a gap line lost its
    // chrome). Nothing lights while a button is down.
    if (event.buttons !== 0) {
      this.clearGuideHover();
      return;
    }
    this.lastPointer = { x: event.clientX, y: event.clientY, target: event.target };
    this.hoverGuideAt(event.clientX, event.clientY, event.target);
  }

  /** The hover, from a point — so it can be re-applied after the view rebuilds
   * under a resting pointer, as a fold does. */
  private hoverGuideAt(x: number, y: number, eventTarget: EventTarget | null): void {
    if (isNestedEditor(this.view) || !isOutlineMode(this.view.state)) {
      this.clearGuideHover();
      return;
    }
    // A target the view has since replaced — the fold a press makes rebuilds
    // the lines the band was on — still answers `closest` and measures as
    // nothing. Whatever is under the point NOW stands in for it.
    const remembered = eventTarget instanceof this.Element ? eventTarget : null;
    const target =
      remembered?.isConnected === false
        ? this.view.dom.ownerDocument.elementFromPoint(x, y)
        : remembered;
    // A fold control under the pointer is that control's own. By target, not
    // by geometry as a press decides it: a pointer's target is the element
    // under it, so the two agree — measured, a chevron wrapper's dead space
    // lies right of its glyph, toward the mark, never over a shallower guide's
    // band, so the only overlap between a band and a control is the glyph,
    // where the control must win.
    if (target?.closest('.cm-fold-indicator, .to-decor-fold-toggle')) {
      this.clearGuideHover();
      return;
    }
    const lineEl = this.lineElementAt(target, x, y);
    const column =
      lineEl && lineEl.classList.contains(GUIDES_CLASS) ? guideHit(lineEl, x) : null;
    if (!lineEl || column === null) {
      this.clearGuideHover();
      return;
    }
    let pos: number;
    try {
      pos = this.view.posAtDOM(lineEl);
    } catch {
      return;
    }
    const lineNumber = this.view.state.doc.lineAt(pos).number - 1;
    const owner = guideOwnerAt(this.view.state, lineNumber, column);
    if (!owner) {
      this.clearGuideHover();
      return;
    }
    // The lines the owner's guide runs through: from the line after the
    // node's own TEXT — a node's span includes the gap it owns before its
    // first child, and the guide runs through that gap — to the last CONTENT
    // line, since a trailing gap is in the span and carries no guide.
    const lines = foldLines(owner.node, owner.startLine);
    if (!lines) {
      this.clearGuideHover();
      return;
    }
    const hover: GuideHover = {
      first: owner.startLine + owner.node.lines.length,
      last: lines.lastLine,
      column,
    };
    const current = this.view.state.field(guideHoverField, false) ?? null;
    if (
      !current ||
      current.first !== hover.first ||
      current.last !== hover.last ||
      current.column !== hover.column
    ) {
      this.view.dispatch({ effects: setGuideHover.of(hover) });
    }
    this.view.dom.classList.add(GUIDE_HOVERING_CLASS);
  }

  private clearGuideHover(): void {
    this.view.dom.classList.remove(GUIDE_HOVERING_CLASS);
    if (this.view.state.field(guideHoverField, false)) {
      this.view.dispatch({ effects: setGuideHover.of(null) });
    }
  }

  /**
   * The line a point is on. The event's own target when it is in one; by
   * coordinates otherwise, because a guide's band is centred on a line the
   * pointer can be LEFT of — the outermost guide runs along the line box's
   * own edge, and half of its band, and a press there, landed on the content
   * container and on nothing. `posAtCoords` in its imprecise mode answers for
   * a point outside any line's box with the nearest line at that height.
   */
  private lineElementAt(target: Element | null, x: number, y: number): HTMLElement | null {
    const own = target?.closest<HTMLElement>('.cm-line');
    if (own) return own;
    // The editor, not the content: the strip left of every line box belongs to
    // the scroller (measured), and that strip is where the outermost guide's
    // outer half lies. The text side is excluded downstream, where a press
    // right of a line's own text start is never a guide press.
    if (!target || !this.view.dom.contains(target)) return null;
    const pos = this.view.posAtCoords({ x, y }, false);
    const node = this.view.domAtPos(this.view.state.doc.lineAt(pos).from).node;
    const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
    return el?.closest<HTMLElement>('.cm-line') ?? null;
  }

  /**
   * The guide half of the gesture. Returns whether it acted, so the caller
   * takes the press only when it did — a miss has to stay an ordinary click.
   */
  private handleGuide(event: MouseEvent, target: Element | null): boolean {
    if (isNestedEditor(this.view)) return false;
    if (!isOutlineMode(this.view.state)) return false;
    // A press on a fold control is that control's own, whichever of the two
    // drew it. Their ink sits in the gutter a guide column also runs through,
    // and a control is the more specific claim — when the press is actually ON
    // it. Decided by geometry rather than by the event's target, because on a
    // touch screen the two disagree: Chrome snaps a tap to the nearest small
    // clickable element and leaves the coordinates where the finger was, so a
    // tap on the parent's guide, a few pixels from a chevron at a narrow unit,
    // arrives targeting the chevron's SVG. Measured on the emulated phone: the
    // guide's second press reopened one child instead of two.
    const control = target?.closest<HTMLElement>('.cm-fold-indicator, .to-decor-fold-toggle');
    if (control && controlOwnsPress(control, event.clientX, event.clientY)) return false;
    const lineEl = this.lineElementAt(target, event.clientX, event.clientY);
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
    const column = guideHit(lineEl, event.clientX);
    if (column === null) return false;
    // A press on a guide is a guide press whatever it finds to fold. Returned
    // false when there was nothing, the press fell through to the editor and
    // placed the caret on the line — a valid gesture on a guide must not move
    // the caret.
    toggleGuideAt(this.view, lineNumber, column);
    return true;
  }

  /**
   * A press on a task's checkbox: recorded so the threshold can turn it into a
   * drag, and otherwise left entirely alone.
   *
   * Nothing is prevented and nothing is swallowed. The toggle is Obsidian's,
   * with its own states and its own plugins, and claiming the press to replay
   * it as a document write is explicitly not the mechanism — a gesture that
   * leaves the box produces no click on it, which is the whole reason this
   * costs the toggle nothing.
   */
  private watchTaskPress(event: PointerEvent, checkbox: HTMLElement): boolean {
    // A checkbox's press is watched only to become a drag, which a touch
    // cannot while touch dragging is off.
    if (event.pointerType === 'touch' && !this.touchDragging()) return false;
    if (checkbox.closest(`.${OWN_CHROME_CLASS}`)) return false;
    if (isNestedEditor(this.view)) return false;
    if (!isOutlineMode(this.view.state)) return false;
    this.press = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mark: checkbox,
      dragging: false,
      touch: event.pointerType === 'touch',
      dwell: undefined,
      zooms: false,
      groups: undefined,
      tree: undefined,
      placeLine: undefined,
      seams: undefined,
      selectionBefore: undefined,
    };
    this.armDwell(this.press);
    return true;
  }

  private handle(event: PointerEvent): void {
    // A fresh gesture starting is also the only reliable point to notice a
    // PREVIOUS one that dragged off the mark and never produced its `click` —
    // see `swallow`'s own comment for why that leaves this set. A press whose
    // release never arrived goes the same way.
    this.consuming = false;
    this.touchClaim = null;
    this.cancelPress();
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
    if (!mark) {
      // A task's checkbox is a drag source too, and the only one whose press
      // stays its own: watched for movement, never taken. Before the guide,
      // because a checkbox sits where a mark sits and is the more specific
      // claim on that point.
      const checkbox = target?.closest<HTMLElement>(TASK_MARK_SELECTOR);
      if (checkbox && this.watchTaskPress(event, checkbox)) return;
      // No mark under the press: the other thing this gutter offers is a guide
      // column, which folds the branch it belongs to. Marks win, because a mark
      // is the smaller target and the more specific claim — and because the two
      // gestures have to be ordered somewhere, which is why they share a listener
      // rather than racing in two.
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
    // Resolved here only to decide whether the press is this gesture's at all.
    // What it delivers is decided when the button comes up.
    if (!resolveZoom(doc, this.view.state.doc.lineAt(pos).number - 1)) return;

    // Both, and in the capture phase: `preventDefault` alone leaves CM6's own
    // handler on `contentDOM` to run and start a selection drag from the mark,
    // and `stopPropagation` alone leaves the browser to focus and place a
    // caret. The press is entirely this gesture's, trailing events included.
    event.preventDefault();
    event.stopPropagation();
    this.consuming = true;
    // Only a touch that can become a drag is kept from the platform. With
    // touch dragging off, a touch on a mark is the zoom it was, and one that
    // moves from it is the platform's scroll.
    if (event.pointerType === 'touch' && this.touchDragging()) this.touchClaim = 'whole';
    // Claimed on arrival, before its meaning is known: nothing else acts on it
    // while it is undecided. A press that moves past the threshold is a drag;
    // one that does not is the zoom it has always been.
    this.press = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mark,
      dragging: false,
      touch: event.pointerType === 'touch',
      dwell: undefined,
      zooms: true,
      groups: undefined,
      tree: undefined,
      placeLine: undefined,
      seams: undefined,
      selectionBefore: undefined,
    };
    this.armDwell(this.press);
  }

  /**
   * A touch press becomes a drag by resting on the mark for the dwell, with
   * the pointer still down and not yet moved. A mouse press is untouched by
   * this: its drag begins on movement, as `trackPress` says.
   */
  private armDwell(press: MarkPress): void {
    if (!press.touch || !this.touchDragging()) return;
    press.dwell = window.setTimeout(() => {
      press.dwell = undefined;
      if (this.press !== press || press.dragging) return;
      press.dragging = true;
      this.beginDrag(press);
      if (this.press === press) this.tick();
    }, TOUCH_DWELL_MS);
  }

  /** A short vibration when the hold takes, where the platform offers one:
   * the finger covers the mark, so the lift beside it is the only other sign. */
  private tick(): void {
    const navigator = this.view.dom.ownerDocument.defaultView?.navigator;
    if (!navigator || !('vibrate' in navigator)) return;
    try {
      navigator.vibrate(15);
    } catch {
      // A platform that refuses has no tick to give.
    }
  }

  private clearDwell(press: MarkPress): void {
    if (press.dwell === undefined) return;
    window.clearTimeout(press.dwell);
    press.dwell = undefined;
  }
}

/**
 * Whether a press at this point lies within a fold control's own hit box.
 *
 * Obsidian's control is its `.collapse-indicator` wrapper, the box it sizes and
 * pads for the purpose. Ours is a zero-size anchor the glyph hangs off, so its
 * box is the glyph's, grown to the touch target the stylesheet gives it under a
 * coarse pointer — the same 24px, stated once there and once here.
 */
function controlOwnsPress(control: HTMLElement, x: number, y: number): boolean {
  let box: DOMRect;
  if (control.classList.contains('to-decor-fold-toggle')) {
    const glyph = control.querySelector('svg');
    if (!glyph) return false;
    const rect = glyph.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height, TOUCH_TARGET_PX);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    box = new DOMRect(cx - size / 2, cy - size / 2, size, size);
  } else {
    box = (control.querySelector('.collapse-indicator') ?? control).getBoundingClientRect();
  }
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/** The touch target styles.css gives our own fold control under a coarse
 * pointer. */
const TOUCH_TARGET_PX = 24;

/**
 * The visual depth of the guide a press landed on, or null if it landed on none.
 *
 * The columns are read from what the renderer actually PAINTED — the guide
 * gradient's own `background-position-x` and `background-size`, resolved to
 * pixels — rather than computed from the node's depth in the tree. Those two
 * are not the same number: a heading is an ancestor of everything in its
 * section but indents none of it, so a list item three nodes deep sits at
 * visual depth two. Computing the columns from the tree therefore placed them
 * a level apart from where they were drawn, and a press on a node's own fold
 * chevron landed inside its PARENT's band — folding every sibling instead of
 * the node clicked, which is how this was found.
 *
 * Reading the paint also settles two things for free: only guides that are
 * actually drawn can be clicked, whatever the visibility setting says, and the
 * unit comes from the same declaration the gradient is sized by.
 *
 * The one thing it does not settle is WHERE those positions are measured from.
 * The overlay is shifted back off the line by the line's own margin and bled
 * out by a border (styles.css), and a background is positioned from the
 * padding edge — so the origin is the overlay's own, not the line's, and using
 * the line's is a whole level of error on any list whose root is itself
 * indented.
 */
function guideHit(lineEl: HTMLElement, clientX: number): number | null {
  const after = getComputedStyle(lineEl, '::after');
  const unit = parseFloat(after.backgroundSize);
  if (!(unit > 1)) return null;
  const box = lineEl.getBoundingClientRect();
  const origin = parseFloat(after.left) + parseFloat(after.borderLeftWidth);
  if (Number.isNaN(origin)) return null;
  const offset = clientX - box.left - origin;
  // Left of the line's own text, always: a press in the text is a press in the
  // text, whatever column it happens to line up with. Measured in the same
  // frame, so the text's own start moves back by the overlay's origin too.
  if (offset > parseFloat(getComputedStyle(lineEl).paddingLeft) - origin) return null;
  // Wider on the left than on the right. Right of a guide, within a gutter,
  // sits the mark of the node one level in, and the chevron beside it — the
  // band must stop short of both, and a third of a unit does. Left of a guide
  // is the parent level's own empty run: nothing else claims it until the next
  // guide, half a unit away, so the band reaches nearly to the midpoint. The
  // chevron of a node at THIS level sits in that run too, but only on the
  // node's own line, where this guide is not painted at all.
  const toleranceRight = unit / 3;
  const toleranceLeft = unit / 2 - 2;
  for (const part of after.backgroundPositionX.split(',')) {
    const x = parseFloat(part);
    if (Number.isNaN(x)) continue;
    const delta = offset - x;
    if (delta > toleranceRight || -delta > toleranceLeft) continue;
    // The painted position is inset by half the guide's own width; rounding
    // against the unit recovers the level it stands for.
    return Math.max(0, Math.round(x / unit));
  }
  return null;
}


/**
 * The nodes whose children are hidden right now, as ids.
 *
 * Read from the folds the editor actually holds rather than from the tree,
 * because a fold is view state: the same document renders with different
 * depths available depending on what the reader has collapsed.
 */
function foldedIds(view: EditorView, tree: OutlineDoc): Set<number> {
  const ids = new Set<number>();
  for (const chrome of foldedChrome(view.state)) {
    const entry = entryAtLine(tree, chrome.markerLine);
    if (entry) ids.add(entry.node.id);
  }
  return ids;
}

/** `touchDragging` is read at each press, so a change to it holds from the
 * next one. */
export function zoomClickExtension(touchDragging: () => boolean): Extension {
  return ViewPlugin.define((view) => new ZoomClickPlugin(view, touchDragging));
}
