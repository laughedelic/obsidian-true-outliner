/**
 * Driving folds from a spec, and reading the chrome they draw.
 *
 * Not in `helpers.ts`: every helper here is folding's own — the fold layer's
 * view of the editor, its toggles, counts and affordances, the guide gesture
 * that folds — and the `90`-series specs are their readers. Imported by name,
 * the way `footer.ts` is.
 */

import { browser } from '@wdio/globals';
import * as path from 'node:path';
import * as h from './helpers.js';

/**
 * The fold layer's view of the active editor, in LINE numbers, from the
 * plugin's own `foldState()` probe.
 *
 * Through the plugin because CM6's fold exports resolve only in plugin module
 * scope: neither `@codemirror/language` nor `obsidian` is reachable from the
 * renderer's own `require`, so a spec has no way to read a folded range
 * directly (docs/research/fold-mechanics).
 */
interface FoldStateSnapshot {
  folded: { from: number; to: number }[];
  editorFoldable: { line: number; from: number; to: number }[];
  ourFoldable: { line: number; from: number; to: number }[];
  chromeLines: number[];
}

function foldState(): Promise<FoldStateSnapshot> {
  return browser.executeObsidian(
    ({ plugins }) => (plugins.trueOutliner as any).foldState() as FoldStateSnapshot,
  );
}

/** Lines the editor considers foldable, or — with `oursOnly` — the ones OUR
 * provider claims. The two differ on purpose: declining is not a veto, so the
 * editor still reports folds we deliberately do not offer. */
export async function foldableLines(
  opts: { oursOnly?: boolean } = {},
): Promise<{ line: number; from: number; to: number }[]> {
  const state = await foldState();
  return opts.oursOnly ? state.ourFoldable : state.editorFoldable;
}

/** Currently folded ranges, as the first and last hidden LINE. */
export async function foldedLineRanges(): Promise<{ from: number; to: number }[]> {
  return (await foldState()).folded;
}

/** Lines carrying Obsidian's own fold indicator, right now. Whether one is
 * VISIBLE is a hover state in CSS; this reports whether the element is there at
 * all, which is what decides who has to draw the affordance. */
export function nativeChevronLines(): Promise<number[]> {
  return browser.executeObsidian(() =>
    Array.from(document.querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line'))
      .map((el, i) => (el.querySelector('.cm-fold-indicator') ? i : -1))
      .filter((i) => i >= 0),
  );
}

/**
 * Remove Obsidian's own fold indicators from the rendered lines, simulating a
 * configuration where it paints none.
 *
 * NOT by driving `foldHeading` / `foldIndent`: those were tried first and do
 * not apply reliably from here — measured, the same call left the indicators in
 * place in one sequence and removed them in another, and in a third it left the
 * editor in a state where no fold effect landed at all. A test that sometimes
 * configures the app and sometimes does not is worse than no test.
 *
 * What this simulates is exactly the condition the plugin's own affordance keys
 * on — a foldable line with no native chevron on it — and it does so
 * deterministically. The elements come back on the next render.
 */
export async function removeNativeChevrons(): Promise<number> {
  return browser.executeObsidian(() => {
    const found = document.querySelectorAll(
      '.workspace-leaf.mod-active .cm-content .cm-fold-indicator',
    );
    found.forEach((el) => el.remove());
    return found.length;
  });
}

/** Close the active tab, so the next `h.openNote` builds a fresh editor — the
 * only way to exercise what Obsidian restores when a file is opened. */
export async function closeActiveLeaf(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    app.workspace.getMostRecentLeaf()?.detach();
  });
  await browser.pause(300);
}

/**
 * Unfold everything in the active note.
 *
 * Needed as a fixture step because fold state PERSISTS per file in Obsidian's
 * workspace state — the feature working. Rewriting a note's content through
 * `h.createNote` does not clear it, so without this a test inherits whatever the
 * previous one left folded, and the failure looks like the command under test
 * folding far more than it was asked to.
 */
export async function clearFolds(): Promise<void> {
  // A loop, not one call: Obsidian restores a file's saved folds when the note
  // opens, and that restore can land AFTER a fixture has already cleared them.
  // Measured as a leak between two specs in this file, where the second folded
  // far more than it asked for.
  await browser.waitUntil(
    async () => {
      if ((await foldedLineRanges()).length === 0) return true;
      if (await h.commandAvailable('unfold-all')) await h.runCommand('unfold-all');
      return (await foldedLineRanges()).length === 0;
    },
    { timeout: h.waitBudget(3000), interval: 100, timeoutMsg: 'folds did not clear' },
  );
}

/** Lines carrying the folded-node class — a folded node's OWN line, per the
 * plugin's own answer rather than the editor's. */
export function foldedNodeLines(): Promise<number[]> {
  return browser.executeObsidian(() =>
    Array.from(document.querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line'))
      .map((el, i) => (el.classList.contains('to-decor-folded') ? i : -1))
      .filter((i) => i >= 0),
  );
}

/** The hidden-descendant counts currently rendered, by line. */
export function foldCounts(): Promise<{ line: number; count: number }[]> {
  return browser.executeObsidian(() =>
    Array.from(document.querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line'))
      .map((el, i) => {
        const badge = el.querySelector('.to-decor-fold-count');
        return badge ? { line: i, count: Number(badge.textContent) } : null;
      })
      .filter((v): v is { line: number; count: number } => v !== null),
  );
}

/**
 * How many controls a folded line actually SHOWS after its text — ours and
 * Obsidian's placeholder together.
 *
 * Both are in the DOM whenever a fold is on the line; the question is how many
 * of them a reader sees, and `textContent` cannot answer it — a hidden node
 * still contributes its text.
 */
export function foldTailControlCount(line: number): Promise<number> {
  return browser.executeObsidian(({}, n: number) => {
    const el = document.querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line')[n];
    return Array.from(el?.querySelectorAll('.cm-foldPlaceholder, .to-decor-fold-count') ?? []).filter(
      (control) => {
        const style = getComputedStyle(control as HTMLElement);
        return style.display !== 'none' && Number(style.opacity) > 0.05;
      },
    ).length;
  }, line);
}

/**
 * How far LEFT of a line's marker column the fold control it shows is drawn,
 * with the unit those guides repeat at — for asserting the control sits on the
 * midpoint between the parent's guide and the marker, whatever the unit is.
 *
 * The control is whichever of the two the line shows; where the column comes
 * from is said inside. `doc: true` addresses the line by document number
 * rather than by DOM order, for a note with folds in it.
 */
export function foldControlGap(
  line: number,
  opts: { doc?: boolean } = {},
): Promise<{ gap: number; unit: number; offset: number }> {
  return browser.executeObsidian(
    ({ app, obsidian }, n: number, byDoc: boolean) => {
      let el: HTMLElement | null;
      if (byDoc) {
        // By DOCUMENT line, through the editor: a folded range's lines are
        // absent from the DOM, so DOM order stops matching the document.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cm = (app.workspace.getActiveViewOfType(obsidian.MarkdownView)!.editor as any).cm;
        const node = cm.domAtPos(cm.state.doc.line(n + 1).from).node as Node;
        el = (node.nodeType === 1 ? (node as Element) : node.parentElement!).closest('.cm-line');
      } else {
        el = document.querySelectorAll<HTMLElement>(
          '.workspace-leaf.mod-active .cm-content > .cm-line',
        )[n] ?? null;
      }
      if (!el) throw new Error(`no line ${n}`);
      const box = el.getBoundingClientRect();
      const probeWidth = (expr: string): number => {
        const probe = el!.ownerDocument.createElement('div');
        probe.style.cssText = `position:absolute;visibility:hidden;height:0;width:${expr};`;
        el!.appendChild(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
      };
      // The marker column. A block line's own icon is centred on it, which is
      // the reading that holds where no guide is painted — a depth-0 line has
      // nothing to its left. A list line's mark is not a box the column can be
      // read from, so there it comes from the guide overlay's origin and the
      // line's depth, as `guideColumnPoint` finds a guide.
      const icon = el.querySelector(':scope > .to-decor-marker-icon');
      const after = getComputedStyle(el, '::after');
      const paintedUnit = parseFloat(after.backgroundSize);
      const unit = paintedUnit > 1 ? paintedUnit : probeWidth('var(--to-decor-unit)');
      let column: number;
      if (icon) {
        const rect = icon.getBoundingClientRect();
        column = rect.left + rect.width / 2;
      } else {
        if (!(paintedUnit > 1)) throw new Error(`line ${n} paints no guides to find its column from`);
        const origin = parseFloat(after.left) + parseFloat(after.borderLeftWidth);
        const depth = Number(getComputedStyle(el).getPropertyValue('--to-depth'));
        column = box.left + origin + depth * unit;
      }
      const glyph = Array.from(
        el.querySelectorAll('.cm-fold-indicator .collapse-indicator svg, .to-decor-fold-toggle svg'),
      ).find((g) => g.getBoundingClientRect().width > 0);
      if (!glyph) throw new Error(`line ${n} shows no fold control`);
      const rect = glyph.getBoundingClientRect();
      return {
        gap: Number((column - (rect.left + rect.width / 2)).toFixed(1)),
        unit,
        offset: Number(probeWidth('var(--to-fold-chevron-offset)').toFixed(1)),
      };
    },
    line,
    opts.doc === true,
  );
}

/** The painted colour of a line's marker and of the fold control it shows. */
export function foldChromeColors(line: number): Promise<{ marker: string; control: string | null }> {
  return browser.executeObsidian(({}, n: number) => {
    const el = document.querySelectorAll<HTMLElement>(
      '.workspace-leaf.mod-active .cm-content > .cm-line',
    )[n];
    if (!el) throw new Error(`no line ${n}`);
    const mark =
      el.querySelector<HTMLElement>(':scope > .to-decor-marker-icon') ??
      el.querySelector<HTMLElement>('.list-number') ??
      el.querySelector<HTMLElement>('.list-bullet');
    if (!mark) throw new Error(`line ${n} has no marker`);
    // A bullet paints its dot as a background on its `::after`; every other
    // mark is `color`.
    const marker = mark.classList.contains('list-bullet')
      ? getComputedStyle(mark, '::after').backgroundColor
      : getComputedStyle(mark).color;
    const glyph = Array.from(
      el.querySelectorAll<SVGElement>('.cm-fold-indicator .collapse-indicator svg, .to-decor-fold-toggle svg'),
    ).find((g) => g.getBoundingClientRect().width > 0);
    return { marker, control: glyph ? getComputedStyle(glyph).color : null };
  }, line);
}

/** Park the pointer on a line's own marker icon — the zoom gesture's target. */
export async function hoverMarker(line: number): Promise<void> {
  const point = await browser.executeObsidian(({}, n: number) => {
    const el = document.querySelectorAll<HTMLElement>(
      '.workspace-leaf.mod-active .cm-content > .cm-line',
    )[n];
    const icon = el?.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
    if (!icon) throw new Error(`line ${n} has no marker icon`);
    const box = icon.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, line);
  await browser
    .action('pointer', { parameters: { pointerType: 'mouse' } })
    .move({ x: Math.round(point.x), y: Math.round(point.y), origin: 'viewport' })
    .perform();
  await browser.pause(150);
}

/** Park the pointer on a line's text, so the line is hovered and nothing in
 * its gutter is. */
export async function hoverLineText(line: number): Promise<void> {
  const point = await browser.executeObsidian(({}, n: number) => {
    const el = document.querySelectorAll<HTMLElement>(
      '.workspace-leaf.mod-active .cm-content > .cm-line',
    )[n];
    if (!el) throw new Error(`no line ${n}`);
    const box = el.getBoundingClientRect();
    return { x: box.left + parseFloat(getComputedStyle(el).paddingLeft) + 40, y: box.top + 10 };
  }, line);
  await browser
    .action('pointer', { parameters: { pointerType: 'mouse' } })
    .move({ x: Math.round(point.x), y: Math.round(point.y), origin: 'viewport' })
    .perform();
  await browser.pause(150);
}

/**
 * Poll a read until it satisfies `ok`, and on giving up say what it last saw.
 *
 * `browser.waitUntil` takes its message as a string, built before the wait —
 * so a message meant to carry the last reading carried the reading from before
 * the first poll, every time. A read that throws is a reading too: the error
 * is what is reported if it never stops throwing.
 */
export async function waitForRead<T>(
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  what: string,
  budgetMs = 3000,
): Promise<T> {
  let last = 'never read';
  const deadline = Date.now() + h.waitBudget(budgetMs);
  do {
    try {
      const value = await read();
      if (ok(value)) return value;
      last = JSON.stringify(value);
    } catch (error) {
      last = String(error);
    }
    await browser.pause(100);
  } while (Date.now() < deadline);
  throw new Error(`${what}: last saw ${last}`);
}

/**
 * Rest the pointer on a guide column. Moved off the line's text first, always:
 * a move to the point the pointer already occupies dispatches no pointer
 * event, and a case that follows a press on the same guide then hovered
 * nothing — on CI, where the previous case left the pointer exactly there.
 */
export async function hoverGuideColumn(line: number, column: number): Promise<void> {
  await hoverLineText(line);
  const point = await guideColumnPoint(line, column);
  await browser
    .action('pointer', { parameters: { pointerType: 'mouse' } })
    .move({ x: Math.round(point.x), y: Math.round(point.y), origin: 'viewport' })
    .perform();
  await browser.pause(150);
}

/**
 * What the guide gesture's hover is showing: the lines whose guide background
 * the decoration pass painted with the hover width, and whether the editor
 * shows the hand.
 */
export function litGuide(): Promise<{ thickened: number[]; hand: boolean }> {
  return browser.executeObsidian(() => {
    const leaf = document.querySelector('.workspace-leaf.mod-active')!;
    const lines = Array.from(leaf.querySelectorAll<HTMLElement>('.cm-content > .cm-line'));
    const scroller = leaf.querySelector<HTMLElement>('.cm-scroller');
    return {
      thickened: lines
        .map((el, i) => (el.style.getPropertyValue('--to-guides').includes('--to-guide-hover-width') ? i : -1))
        .filter((i) => i >= 0),
      hand: scroller ? getComputedStyle(scroller).cursor === 'pointer' : false,
    };
  });
}

/** Is the count part of the editable document, or chrome beside it? */
export function foldCountIsEditable(line: number): Promise<boolean> {
  return browser.executeObsidian(({}, n: number) => {
    const el = document
      .querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line')
      [n]?.querySelector<HTMLElement>('.to-decor-fold-count');
    return el ? el.isContentEditable : false;
  }, line);
}

/** The painted geometry and weight of a line's marker glyph — a RELATIONSHIP
 * instrument: compare two of these, never one against a number. */
export function markerGlyphStyle(
  line: number,
): Promise<{ strokeWidth: string; color: string; width: number; height: number }> {
  return browser.executeObsidian(({}, n: number) => {
    const el = document.querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line')[n];
    const wrapper = el?.querySelector<HTMLElement>('.to-decor-marker-icon');
    const glyph = wrapper?.querySelector('svg');
    const painted = glyph?.querySelector('line, polyline, rect, circle, path');
    if (!wrapper || !glyph || !painted) throw new Error(`no marker glyph on line ${n}`);
    const box = wrapper.getBoundingClientRect();
    return {
      strokeWidth: getComputedStyle(painted).strokeWidth,
      color: getComputedStyle(wrapper).color,
      width: box.width,
      height: box.height,
    };
  }, line);
}

/** Lines offering a fold affordance — Obsidian's own indicator or ours,
 * whichever is actually rendered and not hidden. */
export function foldAffordanceLines(): Promise<number[]> {
  return browser.executeObsidian(() =>
    Array.from(document.querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line'))
      .map((el, i) => {
        const controls = Array.from(
          el.querySelectorAll('.cm-fold-indicator, .to-decor-fold-toggle'),
        ).filter((c) => getComputedStyle(c as HTMLElement).display !== 'none');
        return controls.length > 0 ? i : -1;
      })
      .filter((i) => i >= 0),
  );
}

/** How many fold affordances a line actually renders — one is the contract. */
export function foldAffordanceCount(line: number): Promise<number> {
  return browser.executeObsidian(({}, n: number) => {
    const el = document.querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line')[n];
    return Array.from(
      el?.querySelectorAll('.cm-fold-indicator, .to-decor-fold-toggle') ?? [],
    ).filter((c) => getComputedStyle(c as HTMLElement).display !== 'none').length;
  }, line);
}

/** Is the affordance visible WITHOUT a hover? True is required once folded. */
export function foldAffordanceVisible(line: number): Promise<boolean> {
  return browser.executeObsidian(({}, n: number) => {
    const el = document.querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line')[n];
    // ANY of them: a folded line can carry both the native indicator and our
    // own, with CSS hiding one — which one comes first in the DOM is not the
    // question being asked.
    return Array.from(el?.querySelectorAll('.cm-fold-indicator, .to-decor-fold-toggle') ?? []).some(
      (control) => {
        const style = getComputedStyle(control as HTMLElement);
        return style.display !== 'none' && Number(style.opacity) > 0.05;
      },
    );
  }, line);
}

/**
 * Where a line's guide column is on screen.
 *
 * The column's x is read from the PAINT — the guide overlay's own origin and
 * the unit its gradient repeats at — because the paint is what a reader aims
 * at, and it is the one description of a column that holds for every kind and
 * depth. An earlier version derived a step from the line's own rendered mark
 * and the depth the fixture declared, which needed the mark and the column to
 * share an origin; on a list whose root is itself indented they do not, and
 * every press came out a level off.
 *
 * That the gesture reads the same paint is deliberate rather than circular:
 * what these tests assert is which NODES a press folds, and the map from a
 * column to a node is nothing this measurement can supply.
 *
 * `offsetFraction` shifts the press by that fraction of a step, for testing the
 * tolerance's edges.
 */
export async function guideColumnPoint(
  line: number,
  column: number,
  opts: { offsetFraction?: number } = {},
): Promise<{ x: number; y: number }> {
  return browser.executeObsidian(
    ({}, n: number, k: number, fraction: number) => {
      const el = document.querySelectorAll<HTMLElement>(
        '.workspace-leaf.mod-active .cm-content > .cm-line',
      )[n];
      if (!el) throw new Error(`no line ${n}`);
      const box = el.getBoundingClientRect();
      // Where the guides are actually PAINTED, which is what a reader aims at:
      // the overlay's own origin, and the unit its gradient repeats at. Derived
      // from a rendered mark instead, this had to know how far the line's own
      // box had already been shifted, and got it wrong for every list whose
      // root is itself indented.
      const after = getComputedStyle(el, '::after');
      const unit = parseFloat(after.backgroundSize);
      if (!(unit > 1)) throw new Error(`line ${n} paints no guides to measure`);
      const origin = parseFloat(after.left) + parseFloat(after.borderLeftWidth);
      return {
        x: box.left + origin + k * unit + fraction * unit,
        y: box.top + box.height / 2,
      };
    },
    line,
    column,
    opts.offsetFraction ?? 0,
  );
}

/** Press a real pointer on a guide column. */
export async function clickGuideColumn(
  line: number,
  column: number,
  opts: { offsetFraction?: number } = {},
): Promise<void> {
  const point = await guideColumnPoint(line, column, opts);
  await h.clickAtPoint(point.x, point.y);
  await browser.pause(150);
}

/** Press a real pointer on a folded line's tail control. */
export async function clickFoldCount(line: number): Promise<void> {
  const point = await browser.executeObsidian(({}, n: number) => {
    const el = document
      .querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line')
      [n]?.querySelector('.to-decor-fold-count');
    if (!el) throw new Error(`line ${n} shows no fold count`);
    const box = el.getBoundingClientRect();
    if (box.width === 0) throw new Error(`line ${n}'s fold count is not laid out`);
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, line);
  await h.clickAtPoint(point.x, point.y);
  await browser.pause(150);
}

/**
 * Press a real pointer on the fold control a line actually shows — Obsidian's
 * own indicator where it draws one, ours where it does not.
 *
 * Real coordinates, like `clickGuideColumn` and for the same reason: what is
 * under test is which handler claims a press, and a synthesised event on the
 * element would answer that question by assumption.
 */
export async function clickFoldControl(line: number): Promise<void> {
  const point = await browser.executeObsidian(({}, n: number) => {
    const el = document.querySelectorAll<HTMLElement>(
      '.workspace-leaf.mod-active .cm-content > .cm-line',
    )[n];
    if (!el) throw new Error(`no line ${n}`);
    const glyph = el.querySelector('.cm-fold-indicator svg, .to-decor-fold-toggle svg');
    if (!glyph) throw new Error(`line ${n} shows no fold control`);
    const box = glyph.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, line);
  await h.clickAtPoint(point.x, point.y);
  await browser.pause(150);
}

/** Press a real pointer in the middle of a line's own text. */
export async function clickLineText(line: number): Promise<void> {
  const point = await browser.executeObsidian(({}, n: number) => {
    const el = document.querySelectorAll<HTMLElement>(
      '.workspace-leaf.mod-active .cm-content > .cm-line',
    )[n];
    if (!el) throw new Error(`no line ${n}`);
    const box = el.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(el).paddingLeft);
    return { x: box.left + pad + 12, y: box.top + box.height / 2 };
  }, line);
  await h.clickAtPoint(point.x, point.y);
  await browser.pause(150);
}

/** The guide-visibility setting, through the plugin's own accessor. */
export async function setGuideVisibility(value: string): Promise<void> {
  await browser.executeObsidian(
    async ({ plugins }, v: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (plugins.trueOutliner as any).setGuideVisibility(v),
    value,
  );
  await browser.pause(200);
}

/** The marker-visibility setting, through the plugin's own accessor. */
export async function setMarkerVisibility(value: string): Promise<void> {
  await browser.executeObsidian(
    async ({ plugins }, v: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (plugins.trueOutliner as any).setMarkerVisibility(v),
    value,
  );
  await browser.pause(200);
}

/** Lines carrying the plugin's OWN fold toggle element, whether or not CSS is
 * currently hiding it behind Obsidian's. */
export function foldToggleLines(): Promise<number[]> {
  return browser.executeObsidian(() =>
    Array.from(document.querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line'))
      .map((el, i) => (el.querySelector('.to-decor-fold-toggle') ? i : -1))
      .filter((i) => i >= 0),
  );
}

/**
 * How far our own fold control sits from the native indicator it stands in for,
 * per line, in that line's own coordinates.
 *
 * A difference rather than a position: where the control belongs is a different
 * number for every depth and every kind, and the one thing that is true of all
 * of them is that both controls answer for the same node and so belong in the
 * same place. Obsidian's answer is the reference because ours exists only where
 * its is missing — the two are never on screen together, and a reader who turns
 * the setting off should see the affordance stay put.
 *
 * Destructive, and necessarily so: ours is hidden while a native indicator is on
 * the line, so the natives are measured, then removed, then ours is measured.
 */
export function foldControlOffsets(): Promise<Array<{ line: number; dx: number; dy: number }>> {
  return browser.executeObsidian(() => {
    const lines = Array.from(
      document.querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line'),
    );
    const centre = (el: Element) => {
      const box = el.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };
    const native = new Map<number, { x: number; y: number }>();
    lines.forEach((el, i) => {
      const glyph = el.querySelector('.cm-fold-indicator svg');
      if (glyph) native.set(i, centre(glyph));
    });
    document
      .querySelectorAll('.workspace-leaf.mod-active .cm-content .cm-fold-indicator')
      .forEach((el) => el.remove());
    const out: Array<{ line: number; dx: number; dy: number }> = [];
    lines.forEach((el, i) => {
      const glyph = el.querySelector('.to-decor-fold-toggle svg');
      const reference = native.get(i);
      if (!glyph || !reference) return;
      const ours = centre(glyph);
      out.push({
        line: i,
        dx: Number((ours.x - reference.x).toFixed(1)),
        dy: Number((ours.y - reference.y).toFixed(1)),
      });
    });
    return out;
  });
}

/** Lines where the plugin's own fold chrome belongs. */
export async function foldChromeLines(): Promise<number[]> {
  return (await foldState()).chromeLines;
}

/**
 * What the editor actually renders, line by line — a folded range's lines are
 * absent from the DOM entirely, which is how a fold is asserted from outside.
 *
 * `textContent`, not `innerText`: an empty `.cm-line` holds a `<br>`, which
 * `innerText` reports as a newline. And the text is the RENDERED text, so Live
 * Preview's hidden syntax is already gone — a heading reads `Top`, not
 * `# Top` — which is what a reader sees and what a fold is judged against.
 */
export function renderedLineTexts(): Promise<string[]> {
  return browser.executeObsidian(() =>
    Array.from(document.querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line')).map(
      (el) => (el.textContent ?? '').replace(/\u200b/g, ''),
    ),
  );
}
