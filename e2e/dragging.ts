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

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface MoveSample {
  readonly x: number;
  readonly y: number;
  readonly buttons: number;
  /** Whether the pointer was inside the editor's own box at that moment. */
  readonly inside: boolean;
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
    w.__toDragSamples = [];
    w.__toDragRecorder = (event: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      w.__toDragSamples.push({
        x: event.clientX,
        y: event.clientY,
        buttons: event.buttons,
        inside:
          event.clientX >= r.left &&
          event.clientX <= r.right &&
          event.clientY >= r.top &&
          event.clientY <= r.bottom,
      });
    };
    dom.addEventListener('pointermove', w.__toDragRecorder, true);
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
