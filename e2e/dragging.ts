/**
 * The node-drag gesture's own e2e helpers.
 *
 * A held button does not survive the end of the call that drove it: WebDriver
 * releases it when `performActions` returns, so the move that follows arrives
 * with `buttons: 0` (docs/research/node-drag-and-drop section 5a). Everything
 * this gesture is asked about while it is in flight therefore has to be
 * RECORDED as the one driving call runs, and read afterwards — `startRecording`
 * installs the sampler, `dragFrom` runs the whole gesture in one call, and
 * `recorded` reads what it saw.
 *
 * The sampler listens on the editor ROOT in the capture phase, which is the
 * element the gesture itself listens on and captures the pointer to. So what
 * it records is what the gesture receives, rather than what the platform
 * delivers somewhere else.
 */

import { browser } from '@wdio/globals';
import { Key } from 'webdriverio';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface MoveSample {
  readonly x: number;
  readonly y: number;
  readonly buttons: number;
  /** The pointer's id, which a synthetic `pointercancel` has to carry to be
   * taken for the pointer the press belongs to. */
  readonly pointerId: number;
  /** The scroller's `scrollTop` at that move. */
  readonly scrollTop: number;
  /** How long the page took to finish handling this move, in ms: from the
   * capture-phase sample to a bubble-phase listener registered after the
   * plugin's own, so the plugin's handling — the resolution, the preview
   * dispatch and the decoration rebuild it runs synchronously — is inside
   * the interval. -1 until the bubble listener has run. */
  readonly cost: number;
  /** Whether the pointer was inside the editor's own box at that moment. */
  readonly inside: boolean;
  /** The selection as it stood at that move — what the drag has picked up,
   * readable only from inside the driving call. */
  readonly selection: {
    readonly anchor: { readonly line: number; readonly ch: number };
    readonly head: { readonly line: number; readonly ch: number };
  };
  /** The lines wearing the block-selection treatment at that move, 0-based.
   * Empty wherever the plugin's decorations are not running at all, which is
   * what a decline looks like from the outside. */
  readonly selected: readonly number[];
  /**
   * The drop indicator as the page actually paints it: the row it hangs on,
   * and its own left edge in the overlay's coordinate space — which is the
   * space every column on that row is stated in.
   *
   * Found by background-SIZE, which is what tells the indicator's layer from
   * the others sharing the list: a guide and a trail accent are each one unit
   * wide and full height, and the indicator is full width and one stripe tall.
   * `null` while nothing is drawn.
   */
  readonly indicator: {
    readonly line: number;
    readonly x: number;
    /** The row's plain guide layers by resolved size: a guide is one unit
     * wide and `100%` tall, a segment stopped at the ghost is shorter. */
    readonly guides: { readonly full: number; readonly segments: number };
  } | null;
  /** The count at the rule's right end, as its text, or null where none. */
  readonly count: string | null;
  /**
   * The ghost mark the preview draws: the kind the run will BE where it
   * lands, and its level where that is a heading. Read off the mark's own
   * `data-kind`/`data-level`, which every marker this plugin draws states.
   */
  readonly ghost: {
    readonly kind: string;
    readonly level: string | null;
    /** The mark's own centre, in viewport x — comparable with `columnOfMark`. */
    readonly x: number;
    /** The mark's rendered box, so a mark that is mounted and paints nothing
     * can be told from one that is not there. */
    readonly width: number;
    readonly height: number;
    /** A task's state (`done`/`open`) or an ordered item's delimiter, where
     * the ghost draws one of those instead of a bullet. */
    readonly task: string | null;
    readonly ordered: string | null;
  } | null;
  /** Each decorated row's depth as the depth rules see it at that move — the
   * value an absorbed row is drawn one deeper by — keyed by line. */
  readonly rowDepths: Readonly<Record<number, number>>;
  /** The rows wearing the lifted treatment at that move, 0-based, with each
   * one's rendered top in viewport y — what "in place" is checked against. */
  readonly lifted: readonly { readonly line: number; readonly top: number }[];
  /** The rows wearing a marker accent class at that move — the caret's own
   * node and ancestors, and during a drag the destination parent. */
  readonly accentedRows: readonly number[];
  /** Each guide-bearing row's resolved `::after` background image, keyed by
   * line: the layer list the guides, the trail and the indicator all ride. */
  readonly guideImages: Readonly<Record<number, string>>;
  /** The resolved colour of the first ANCESTOR-accented marker on the page —
   * a native bullet's dot or a marker icon's ink — or null where none is.
   * During a drag with the caret's trail out of the way, that is the
   * destination parent's mark. */
  readonly parentAccent: string | null;
  /** Where the drag would land at that move, as the gesture itself resolved
   * it — `null` before a destination is named, and after one is dropped. */
  readonly preview: {
    readonly seamLine: number;
    readonly depth: number;
    readonly index: number;
    readonly parentId: number | 'root';
    readonly firstLine: string;
  } | null;
}

/** The viewport centre of the nth mark matching a selector. */
export async function markPoint(selector: string, index = 0): Promise<Point> {
  const point = await browser.executeObsidian(
    ({ app, obsidian }, selector, index) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const marks = (cm.dom as HTMLElement).querySelectorAll(`.cm-content ${selector}`);
      const mark = marks[index] as HTMLElement | undefined;
      if (!mark) throw new Error(`no ${selector}[${index}] rendered`);
      const r = mark.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    selector,
    index,
  );
  return point;
}

/**
 * The viewport centre of an element anywhere in the view — the chrome this
 * plugin draws outside the content included, which `markPoint` deliberately
 * does not reach.
 */
export function pointOf(selector: string, index = 0): Promise<Point> {
  return browser.executeObsidian(
    ({ app, obsidian }, selector, index) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const el = view.containerEl.querySelectorAll(selector)[index] as HTMLElement | undefined;
      if (!el) throw new Error(`no ${selector}[${index}] rendered`);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    selector,
    index,
  );
}

/**
 * A mark's own COLUMN, in viewport x.
 *
 * Which edge that is depends on the kind, and the difference is the whole
 * reason the indicator is positioned from `chrome-line.ts`'s expression rather
 * than from any mark's box: measured (docs/research/node-drag-and-drop section
 * 1), a list bullet's span BEGINS on its column, where every other mark is
 * CENTRED on it. A reading that treats the two alike is right for one kind of
 * destination and half a bullet out for the other.
 */
export function columnOfMark(
  selector: string,
  index: number,
  on: 'centre' | 'left',
): Promise<number> {
  return browser.executeObsidian(
    ({ app, obsidian }, selector, index, on) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const marks = (cm.dom as HTMLElement).querySelectorAll(`.cm-content ${selector}`);
      const mark = marks[index] as HTMLElement | undefined;
      if (!mark) throw new Error(`no ${selector}[${index}] rendered`);
      const r = mark.getBoundingClientRect();
      return on === 'left' ? r.left : r.left + r.width / 2;
    },
    selector,
    index,
    on,
  );
}

/** The editor root's own box, in viewport coordinates. */
export function editorBox(): Promise<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const r = (cm.dom as HTMLElement).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}

/** The SCROLLER's box, which the autoscroll bands are measured from — not the
 * editor root's, whose bottom edge sits below the scroller's. */
export function scrollerBox(): Promise<{ left: number; top: number; right: number; bottom: number }> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const r = (cm.scrollDOM as HTMLElement).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}

/** Begin sampling the moves that reach the gesture, discarding any earlier run. */
export function startRecording(): Promise<void> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const dom = cm.dom as HTMLElement;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.__toDragRecorder) dom.removeEventListener('pointermove', w.__toDragRecorder, true);
    if (w.__toDragAfter) dom.removeEventListener('pointermove', w.__toDragAfter);
    if (w.__toScrollTimer) clearInterval(w.__toScrollTimer);
    w.__toDragSamples = [];
    w.__toScrollSamples = [];
    // Exceptions a handler throws surface as window `error` events, and a
    // gesture that threw looks from outside like one that resolved nothing.
    if (w.__toDragOnError) window.removeEventListener('error', w.__toDragOnError);
    w.__toDragErrors = [];
    w.__toDragOnError = (event: ErrorEvent) => {
      w.__toDragErrors.push(`${event.message} @ ${event.filename}:${event.lineno}`);
    };
    window.addEventListener('error', w.__toDragOnError);
    // The scroller's position over TIME, not per move, with the seam the
    // preview names at that moment: an autoscroll runs while the pointer holds
    // still, when no move arrives to sample on.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugin = (app as any).plugins?.plugins?.['true-outliner'];
    w.__toScrollTimer = setInterval(() => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const preview = plugin?.activeDragPreview?.() ?? null;
      w.__toScrollSamples.push({
        t: performance.now(),
        scrollTop: cm.scrollDOM.scrollTop,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        seamLine: preview ? (preview.seamLine as number) : null,
      });
    }, 16);
    let started = 0;
    w.__toDragAfter = () => {
      const samples = w.__toDragSamples as { cost: number }[];
      const last = samples[samples.length - 1];
      if (last) last.cost = performance.now() - started;
    };
    w.__toDragRecorder = (event: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      const main = cm.state.selection.main;
      const at = (offset: number) => {
        const line = cm.state.doc.lineAt(offset);
        return { line: line.number - 1, ch: offset - line.from };
      };
      const selected: number[] = [];
      // `Array.from` rather than iterating the NodeList: the e2e project's own
      // target does not give it an iterator.
      for (const el of Array.from(dom.querySelectorAll('.to-decor-node-selected'))) {
        try {
          selected.push(cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1);
        } catch {
          // An element the view has already moved past.
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const held = (app as any).plugins?.plugins?.['true-outliner'];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const live = held?.activeDragPreview?.() ?? null;
      // Computed `background-size` and `background-position` are resolved to
      // plain lengths, so splitting the layer list on commas is exact here —
      // it would not be on `background-image`, whose functions carry their
      // own.
      // A layer list split at the commas between layers, never at those inside
      // a `max()` or `calc()` of one layer's own size.
      const layerList = (value: string): string[] => {
        const out: string[] = [];
        let depth = 0;
        let start = 0;
        for (let i = 0; i < value.length; i++) {
          const ch = value[i];
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          else if (ch === ',' && depth === 0) {
            out.push(value.slice(start, i).trim());
            start = i + 1;
          }
        }
        out.push(value.slice(start).trim());
        return out;
      };
      let indicator: { line: number; x: number; guides: { full: number; segments: number } } | null = null;
      for (const el of Array.from(dom.querySelectorAll('.cm-line.to-decor-guides'))) {
        const style = getComputedStyle(el, '::after');
        const sizes = layerList(style.backgroundSize);
        const which = sizes.findIndex((size) => size.startsWith('100%'));
        if (which < 0) continue;
        const positions = layerList(style.backgroundPosition);
        // Plain guides only: a guide is a repeating gradient, where the trail's
        // and the drop parent's accents are single stripes.
        const images = layerList(style.backgroundImage);
        const others = sizes.filter((_, i) => i !== which && (images[i] ?? '').startsWith('repeating-'));
        try {
          indicator = {
            line: cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1,
            x: parseFloat(positions[which] ?? ''),
            guides: {
              full: others.filter((size) => size.endsWith(' 100%')).length,
              segments: others.filter((size) => !size.endsWith(' 100%')).length,
            },
          };
        } catch {
          // A row the view has already moved past.
        }
        break;
      }
      const ghostEl = dom.querySelector('.to-drag-ghost') as HTMLElement | null;
      const ghost = ghostEl
        ? {
            kind: ghostEl.dataset.kind ?? '',
            level: ghostEl.dataset.level ?? null,
            x: ghostEl.getBoundingClientRect().left + ghostEl.getBoundingClientRect().width / 2,
            width: ghostEl.getBoundingClientRect().width,
            height: ghostEl.getBoundingClientRect().height,
            task: ghostEl.dataset.task ?? null,
            ordered: ghostEl.dataset.ordered ?? null,
          }
        : null;
      const lifted: { line: number; top: number }[] = [];
      for (const el of Array.from(dom.querySelectorAll('.to-drag-lifted'))) {
        try {
          lifted.push({
            line: cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1,
            top: el.getBoundingClientRect().top,
          });
        } catch {
          // An element the view has already moved past.
        }
      }
      const accentedRows: number[] = [];
      const guideImages: Record<number, string> = {};
      for (const el of Array.from(dom.querySelectorAll('.cm-content > .cm-line'))) {
        let line: number;
        try {
          line = cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1;
        } catch {
          continue;
        }
        if (
          el.classList.contains('to-decor-current') ||
          el.classList.contains('to-decor-current-native') ||
          el.classList.contains('to-decor-ancestor') ||
          el.classList.contains('to-decor-ancestor-native')
        ) {
          accentedRows.push(line);
        }
        if (el.classList.contains('to-decor-guides')) {
          guideImages[line] = getComputedStyle(el, '::after').backgroundImage;
        }
      }
      const nativeAccented = dom.querySelector('.to-decor-ancestor-native .list-bullet');
      const iconAccented = dom.querySelector('.to-decor-ancestor .to-decor-marker-icon');
      const parentAccent = nativeAccented
        ? getComputedStyle(nativeAccented, '::after').backgroundColor
        : iconAccented
          ? getComputedStyle(iconAccented).color
          : null;
      const rowDepths: Record<number, number> = {};
      for (const el of Array.from(dom.querySelectorAll('.cm-content > .cm-line'))) {
        const cs = getComputedStyle(el);
        const depth = cs.getPropertyValue('--to-depth') || cs.getPropertyValue('--to-supp-depth');
        if (depth === '') continue;
        try {
          rowDepths[cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1] = Number(depth);
        } catch {
          // A row the view has already moved past.
        }
      }
      const countEl = dom.querySelector('.to-drag-count');
      w.__toDragSamples.push({
        count: countEl ? countEl.textContent : null,
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
        scrollTop: cm.scrollDOM.scrollTop,
        cost: -1,
        indicator,
        ghost,
        rowDepths,
        accentedRows,
        guideImages,
        parentAccent,
        buttons: event.buttons,
        inside:
          event.clientX >= r.left &&
          event.clientX <= r.right &&
          event.clientY >= r.top &&
          event.clientY <= r.bottom,
        selection: { anchor: at(main.anchor), head: at(main.head) },
        selected,
        lifted,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        preview: live
          ? {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              seamLine: live.seamLine,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              depth: live.destination.depth,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              index: live.destination.index,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              parentId: live.destination.parentId,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              firstLine: live.destination.firstLine,
            }
          : null,
      });
      // The clock starts once the sampler's own reading is done, so what the
      // bubble listener measures is the handling between — the plugin's.
      started = performance.now();
    };
    dom.addEventListener('pointermove', w.__toDragRecorder, true);
    // Bubble phase, registered after the plugin's own bubble listener on this
    // same element, so it runs once the plugin has finished with the move.
    dom.addEventListener('pointermove', w.__toDragAfter);
  });
}

/**
 * One pointer event, synthesised in the page on whatever is under the point —
 * the way `80-outline-zoom.e2e.ts` drives a mark press, and the only way a
 * TOUCH press can be driven at all: the harness has no coordinate-addressable
 * touch (docs/research/node-drag-and-drop section 2). What it proves is the
 * handler's answer to the event, not the platform's hit-testing.
 */
export function syntheticPointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  at: Point,
  pointerType: 'touch' | 'mouse',
  pointerId = 7,
): Promise<void> {
  return browser.executeObsidian(
    ({ app, obsidian }, type, x, y, pointerType, pointerId) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const dom = cm.dom as HTMLElement;
      const target = (dom.ownerDocument.elementFromPoint(x, y) as HTMLElement | null) ?? dom;
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          pointerId,
          pointerType,
          isPrimary: true,
        }),
      );
    },
    type,
    Math.round(at.x),
    Math.round(at.y),
    pointerType,
    pointerId,
  );
}

/**
 * A touch's own event at a point, dispatched in the page the way
 * `syntheticPointer` dispatches the pointer events it follows, and whether the
 * editor refused its default — the platform's tap, long press or pan.
 * `contextmenu` is the long press's own event.
 */
export function syntheticTouch(
  type: 'touchstart' | 'touchmove' | 'touchend' | 'contextmenu',
  at: Point,
): Promise<boolean> {
  return browser.executeObsidian(
    ({ app, obsidian }, type, x, y) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const dom = cm.dom as HTMLElement;
      const target = (dom.ownerDocument.elementFromPoint(x, y) as HTMLElement | null) ?? dom;
      let event: Event;
      if (type === 'contextmenu') {
        event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y });
      } else {
        const touch = new Touch({ identifier: 7, target, clientX: x, clientY: y });
        const down = type === 'touchend' ? [] : [touch];
        event = new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          touches: down,
          targetTouches: down,
          changedTouches: [touch],
        });
      }
      target.dispatchEvent(event);
      return event.defaultPrevented;
    },
    type,
    Math.round(at.x),
    Math.round(at.y),
  );
}

/** Every uncaught exception the page raised since `startRecording`. */
export function recordedErrors(): Promise<string[]> {
  return browser.executeObsidian(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    return (w.__toDragErrors ?? []) as string[];
  });
}

/** The scroller's position over time, oldest first, since `startRecording`,
 * with the seam the preview named at each reading. */
export function recordedScroll(): Promise<{ t: number; scrollTop: number; seamLine: number | null }[]> {
  return browser.executeObsidian(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    return (w.__toScrollSamples ?? []) as { t: number; scrollTop: number; seamLine: number | null }[];
  });
}

/** A pointer step: a move to a point, or a hold of so many milliseconds. */
export type DragStep = Point | { readonly holdMs: number };

/**
 * A drag through moves and holds, cancelled by Escape while the button is still
 * down — `dragThenEscape` with holds among the moves. Ticks are shared across
 * the two sources, so a hold on the pointer is a tick the key source waits
 * through as well; the Escape lands in the tick after the last step.
 */
export async function dragStepsThenEscape(from: Point, steps: readonly DragStep[]): Promise<void> {
  let pointer = browser
    .action('pointer', { parameters: { pointerType: 'mouse' } })
    .move({ x: Math.round(from.x), y: Math.round(from.y), origin: 'viewport' })
    .down({ button: 0 });
  for (const step of steps) {
    pointer =
      'holdMs' in step
        ? pointer.pause(step.holdMs)
        : pointer.move({ x: Math.round(step.x), y: Math.round(step.y), origin: 'viewport' });
  }
  const keys = browser.action('key');
  for (let i = 0; i < steps.length + 2; i++) keys.pause(20);
  keys.down(Key.Escape).up(Key.Escape);
  await browser.actions([pointer, keys]);
}

/**
 * Every trace a drag can leave on the page, counted: what a cancel, a drop and
 * a release with no destination each have to leave at zero.
 */
export function dragTraces(): Promise<{
  readonly lifted: number;
  readonly ghosts: number;
  readonly indicators: number;
  readonly preview: boolean;
}> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const dom = cm.dom as HTMLElement;
    let indicators = 0;
    for (const el of Array.from(dom.querySelectorAll('.cm-line.to-decor-guides'))) {
      const sizes = getComputedStyle(el, '::after').backgroundSize.split(',');
      if (sizes.some((size) => size.trim().startsWith('100%'))) indicators++;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const held = (app as any).plugins?.plugins?.['true-outliner'];
    return {
      lifted: dom.querySelectorAll('.to-drag-lifted').length,
      // The count at the rule's end is a trace of the same kind as the ghost.
      ghosts: dom.querySelectorAll('.to-drag-ghost, .to-drag-count').length,
      indicators,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      preview: (held?.activeDragPreview?.() ?? null) !== null,
    };
  });
}

/** What the sampler saw, oldest first. */
export function recorded(): Promise<MoveSample[]> {
  return browser.executeObsidian(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    return (w.__toDragSamples ?? []) as MoveSample[];
  });
}

/**
 * A drag that is interrupted by Escape WHILE THE BUTTON IS STILL DOWN.
 *
 * Two input sources ticking together in one call: the pointer moves, and the
 * key source pauses for exactly as many ticks before pressing Escape. Sent as
 * a call of its own instead, the Escape would arrive after the button had been
 * auto-released and would cancel nothing — which is the measurement this shape
 * exists to work around. The pointer is deliberately left held: what the drag
 * does with the release is a different question.
 *
 * That auto-release is not inert, though. Observed: a gesture driven this way
 * from a task's CHECKBOX toggles it, where the same gesture given an explicit
 * release far from the box does not. A case about what a press leaves the
 * checkbox alone to do therefore uses `dragFrom`, which releases where the
 * pointer actually is.
 */
export async function dragThenEscape(from: Point, through: readonly Point[]): Promise<void> {
  const pointer = browser
    .action('pointer', { parameters: { pointerType: 'mouse' } })
    .move({ x: Math.round(from.x), y: Math.round(from.y), origin: 'viewport' })
    .down({ button: 0 });
  for (const point of through) {
    pointer.move({ x: Math.round(point.x), y: Math.round(point.y), origin: 'viewport' });
  }
  // One pause per tick the pointer chain has already spent, so Escape lands
  // after the last move rather than beside the first.
  const keys = browser.action('key');
  for (let i = 0; i < through.length + 2; i++) keys.pause(20);
  keys.down(Key.Escape).up(Key.Escape);
  await browser.actions([pointer, keys]);
}

/**
 * A drag that HOLDS still for a while with the button down, then goes on to
 * its release. The hold is what gives something else time to happen under the
 * drag — a document change, a cancelled pointer — scheduled in the page before
 * the call by `interruptLater`, since a second WebDriver call would arrive only
 * after the button had been auto-released.
 */
export async function dragWithHold(
  from: Point,
  through: readonly Point[],
  holdMs: number,
  after: readonly Point[] = [],
): Promise<void> {
  let chain = browser
    .action('pointer', { parameters: { pointerType: 'mouse' } })
    .move({ x: Math.round(from.x), y: Math.round(from.y), origin: 'viewport' })
    .down({ button: 0 });
  for (const point of through) {
    chain = chain.move({ x: Math.round(point.x), y: Math.round(point.y), origin: 'viewport' });
  }
  chain = chain.pause(holdMs);
  for (const point of after) {
    chain = chain.move({ x: Math.round(point.x), y: Math.round(point.y), origin: 'viewport' });
  }
  await chain.up({ button: 0 }).perform();
}

/**
 * Arms something to happen under a drag in flight, once the drag has named a
 * destination and the recorder has seen it: a `- late` line written at the
 * start of the 0-based `line`, or a `pointercancel` for the pointer the
 * recorder last saw — the event the platform sends when it takes the pointer
 * back, and the same path `lostpointercapture` cancels through. Armed on the
 * preview rather than on a delay, because the WebDriver chain's own pace
 * decides when the drag reaches a seam, and a timer either fires before the
 * press or after the release.
 */
export function interruptWhenPreviewing(
  how: { readonly write: number } | 'pointercancel',
  giveUpMs = 5000,
): Promise<void> {
  return browser.executeObsidian(
    ({ app, obsidian }, how, giveUpMs) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const held = (app as any).plugins?.plugins?.['true-outliner'];
      const started = Date.now();
      const tick = () => {
        // Armed once the RECORDER has seen a destination, not merely once one
        // exists: the sampler runs on the next move, and an interruption that
        // lands between the resolving move and the next one leaves the record
        // with no evidence that the drag ever named a place.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const live = (held?.activeDragPreview?.() ?? null) !== null;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const seen = ((w.__toDragSamples ?? []) as { preview: unknown }[]).some((s) => s.preview !== null);
        const previewing = live && seen;
        if (!previewing) {
          if (Date.now() - started < giveUpMs) setTimeout(tick, 30);
          return;
        }
        if (how !== 'pointercancel') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          const from = cm.state.doc.line(how.write + 1).from;
          cm.dispatch({ changes: { from, insert: '- late\n' } });
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const last = (w.__toDragSamples ?? []).at(-1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const pointerId: number = last ? last.pointerId : 1;
        (cm.dom as HTMLElement).dispatchEvent(
          new PointerEvent('pointercancel', { bubbles: true, pointerId, pointerType: 'mouse' }),
        );
      };
      setTimeout(tick, 30);
    },
    how,
    giveUpMs,
  );
}

/**
 * `dragFrom` with Shift held for the whole gesture: the key goes down one tick
 * before the pointer arrives and comes up one tick after it releases, so every
 * event of the press carries the modifier.
 */
export async function dragFromWithShift(from: Point, through: readonly Point[]): Promise<void> {
  const keys = browser.action('key').down(Key.Shift);
  for (let i = 0; i < through.length + 3; i++) keys.pause(20);
  keys.up(Key.Shift);
  let pointer = browser
    .action('pointer', { parameters: { pointerType: 'mouse' } })
    .pause(20)
    .move({ x: Math.round(from.x), y: Math.round(from.y), origin: 'viewport' })
    .down({ button: 0 });
  for (const point of through) {
    pointer = pointer.move({ x: Math.round(point.x), y: Math.round(point.y), origin: 'viewport' });
  }
  pointer = pointer.up({ button: 0 });
  await browser.actions([keys, pointer]);
}

/**
 * One pointer gesture, start to finish, in ONE call: move to the source, press,
 * move through each waypoint, release. Split across calls the button would be
 * released between them and every move after the first would arrive unpressed.
 */
export async function dragFrom(from: Point, through: readonly Point[]): Promise<void> {
  let chain = browser
    .action('pointer', { parameters: { pointerType: 'mouse' } })
    .move({ x: Math.round(from.x), y: Math.round(from.y), origin: 'viewport' })
    .down({ button: 0 });
  for (const point of through) {
    chain = chain.move({ x: Math.round(point.x), y: Math.round(point.y), origin: 'viewport' });
  }
  await chain.up({ button: 0 }).perform();
}
