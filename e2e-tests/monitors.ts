/**
 * Ambient monitors: what the rendered editor did during a case, read after it.
 *
 * A case asserts what its author predicted. The defects that reach the manual pass are mostly
 * ones nobody was asked to look at: a caret placed right and clipped out of sight, a caret off
 * its column, a scroll jump that settles back, a line off the grid on a shape no fixture had.
 * `docs/research/ambient-e2e-monitors` measures each reading. The monitors install before a
 * case's body and are read after it, from the shared wdio hooks, so every case contributes
 * without being edited.
 *
 * REPORT-ONLY. A reading is written to the run's monitor report, never thrown: a monitor whose
 * false positives are not yet understood must not fail a case, and a monitor that cannot read
 * (no editor, page reloaded, timeout) says so in the report rather than in the case's result.
 *
 * Two things a case can do about it:
 *  - `exempt(reason, ...monitors)` for a case that arranges a deliberately odd state. The reason
 *    is required, and the report lists every exemption with it.
 *  - Nothing. That is the point.
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { browser } from '@wdio/globals';

export const MONITORS = [
  'caret',
  'scroll',
  'grid',
  'heightMap',
  'layoutShift',
  'errors',
  'notices',
] as const;
export type MonitorName = (typeof MONITORS)[number];

/** One thing a monitor saw. `rule` is stable, so a report can group on it. */
export interface Observation {
  monitor: MonitorName;
  rule: string;
  detail: string;
}

/** What one case's monitors did: which read, which did not and why, and what they saw. */
export interface CaseRecord {
  spec: string;
  suite: string;
  test: string;
  checked: MonitorName[];
  skipped: Partial<Record<MonitorName, string>>;
  observations: Observation[];
  /** What installing and reading cost the worker, in ms. */
  overheadMs: number;
}

/** Where each worker appends its `CaseRecord`s. Cleared per invocation by `resetE2eReports`. */
export const MONITOR_RECORD_DIR = path.join(process.cwd(), '.obsidian-cache', 'e2e-monitors');

/** The aggregated report, beside `e2e-summary.json`. */
export const MONITOR_REPORT_FILE = path.join(process.cwd(), '.obsidian-cache', 'e2e-monitors.json');

// ---- Worker side: exemptions, notice expectations, the hooks ------------

interface Running {
  title: string;
  parent: string;
  exemptions: Map<MonitorName, string>;
  installMs: number;
}

/** Exemptions requested before the body starts (a `beforeEach`), promoted by `beforeCase`. */
let pending = new Map<MonitorName, string>();
let running: Running | null = null;

/** Notice texts the running case waited for or read, so a notice it did not is reported. */
let expectedNotices: string[] = [];

/**
 * Exempts the running case from monitors, and says why.
 *
 * Call it from the case body, or from a `beforeEach` to cover every case of a suite. With no
 * monitor named it covers all of them. An exemption is per monitor: a case that scrolls the
 * editor on purpose still has its grid read.
 */
export function exempt(reason: string, ...only: MonitorName[]): void {
  if (reason.trim() === '') throw new Error('exempt(): a reason is required');
  const target = running?.exemptions ?? pending;
  for (const name of only.length > 0 ? only : MONITORS) target.set(name, reason);
}

/** A case that waits for a notice, or reads the notices on screen, is not surprised by them. */
export function expectNotices(...texts: string[]): void {
  expectedNotices.push(...texts);
}

interface HookTest {
  title: string;
  parent?: string;
  file?: string;
  fullTitle?: string;
}

/** `a/b: c` is fine in a report; only the path of the spec needs shortening. */
function specOf(test: HookTest): string {
  const raw = test.file ?? '';
  return raw ? path.relative(process.cwd(), raw.replace(/^file:\/\//, '')) : '';
}

/** A monitor's failure to read is a fact about the run, and never the case's failure. */
async function guarded<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const HOOK_BUDGET_MS = 8000;

/** wdio's `beforeTest`: runs after the spec's `beforeEach`, immediately before the body. */
export async function beforeCase(test: HookTest): Promise<void> {
  if (process.env.E2E_MONITORS === 'off') return;
  const started = Date.now();
  running = { title: test.title, parent: test.parent ?? '', exemptions: pending, installMs: 0 };
  pending = new Map();
  expectedNotices = [];
  try {
    await guarded(browser.execute(installInPage), HOOK_BUDGET_MS);
  } catch (e) {
    // The read after the body reports the monitors missing.
    console.warn(`[e2e] monitors could not install for "${test.title}": ${String(e)}`);
  }
  running.installMs = Date.now() - started;
}

/**
 * wdio's `afterTest`: runs after the body, before the spec's `afterEach`. Only a case that passed
 * is read: after a failure or a timeout the editor is in whatever state the failure left, and a
 * timed-out case's hook can arrive after the next case has begun.
 */
export async function afterCase(test: HookTest, passed: boolean): Promise<void> {
  const started = Date.now();
  const mine = running;
  if (!mine || mine.title !== test.title || mine.parent !== (test.parent ?? '')) return;
  running = null;

  const record: CaseRecord = {
    spec: specOf(test),
    suite: mine.parent,
    test: test.title,
    checked: [],
    skipped: {},
    observations: [],
    overheadMs: 0,
  };
  const write = async (): Promise<void> => {
    record.overheadMs = mine.installMs + (Date.now() - started);
    await writeRecord(record);
  };

  if (!passed) {
    for (const name of MONITORS) record.skipped[name] = 'the case failed, timed out or was skipped';
    await write();
    return;
  }

  let reading: PageReading | null = null;
  try {
    reading = await guarded(browser.execute(readInPage, expectedNotices, true), HOOK_BUDGET_MS);
    if (reading === null) reading = {} as PageReading;
  } catch (e) {
    console.warn(`[e2e] monitors could not read for "${test.title}": ${String(e)}`);
    for (const name of MONITORS) record.skipped[name] = `unreadable: ${String(e).slice(0, 80)}`;
    await write();
    return;
  }

  for (const name of MONITORS) {
    const exemption = mine.exemptions.get(name);
    const result = reading?.[name];
    if (exemption !== undefined) {
      record.skipped[name] = `exempt: ${exemption}`;
    } else if (!result) {
      record.skipped[name] = 'the monitors were gone: the page reloaded during the case';
    } else if (result.skipped !== undefined) {
      record.skipped[name] = result.skipped;
    } else {
      record.checked.push(name);
      for (const o of result.observations) {
        record.observations.push({ monitor: name, rule: o.rule, detail: o.detail });
      }
    }
  }
  await write();
}

async function writeRecord(record: CaseRecord): Promise<void> {
  try {
    await fsp.mkdir(MONITOR_RECORD_DIR, { recursive: true });
    const worker = process.env.WDIO_WORKER_ID ?? 'launcher';
    await fsp.appendFile(
      path.join(MONITOR_RECORD_DIR, `${worker}.jsonl`),
      JSON.stringify(record) + '\n',
    );
  } catch (e) {
    console.warn(`[e2e] could not write a monitor record: ${String(e)}`);
  }
}

// ---- Page side ----------------------------------------------------------
//
// `browser.execute` serialises the function, so neither may close over anything in this module.

interface PageResult {
  skipped?: string;
  observations: { rule: string; detail: string }[];
}
export type PageReading = Record<MonitorName, PageResult>;

/** Installs the recorders, as `beforeCase` does. For the spec that checks the monitors themselves. */
export async function install(): Promise<void> {
  await browser.execute(installInPage);
}

/** Reads and stops the recorders, as `afterCase` does. `null` when none were installed. */
export async function read(expected: string[] = []): Promise<PageReading | null> {
  return browser.execute(readInPage, expected, false);
}

/** Starts every recorder in the page. Idempotent: a second call replaces the first's state. */
function installInPage(): void {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const w = window as any;
  w.__toMonitors?.stop();

  const activeCm = (): any => w.app?.workspace?.activeEditor?.editor?.cm ?? null;
  const stops: (() => void)[] = [];
  const M: any = {
    // Scroll: one entry each time the scroll position of the active editor changes.
    scroll: [] as any[],
    shifts: [] as any[],
    errors: [] as string[],
    notices: [] as string[],
    // Per editor: the lines its edits touched, as a span. An editor with no entry was not edited.
    touched: new Map<any, { min: number; max: number }>(),
    stop: () => stops.forEach((s) => s()),
  };
  // Per editor: its document as of the last change seen, to diff the next one against.
  const docs = new Map<any, string>();
  const remember = (cm: any): void => {
    if (cm && !docs.has(cm)) docs.set(cm, cm.state.doc.toString());
  };
  remember(activeCm());
  const t0 = performance.now();
  const now = () => +(performance.now() - t0).toFixed(1);

  // Scroll, every frame. Only a change is stored: a jump that settles back is two entries.
  let lastCm: any = null;
  let lastTop = -1;
  let raf = 0;
  let running = true;
  const tick = () => {
    if (!running) return;
    const cm = activeCm();
    if (cm) {
      const top = cm.scrollDOM.scrollTop;
      if (cm !== lastCm) {
        remember(cm);
        lastCm = cm;
        lastTop = top;
        M.scroll.push({ cm, t: now(), top, from: null, step: null, height: cm.scrollDOM.clientHeight });
      } else if (top !== lastTop) {
        let caretBefore: boolean | null = null;
        let caretAfter: boolean | null = null;
        try {
          const c = cm.coordsAtPos(cm.state.selection.main.head);
          const sr = cm.scrollDOM.getBoundingClientRect();
          if (c) {
            const yAfter = c.top - sr.top;
            const yBefore = yAfter + (top - lastTop);
            caretAfter = yAfter >= 0 && yAfter <= sr.height;
            caretBefore = yBefore >= 0 && yBefore <= sr.height;
          }
        } catch {
          // The position may be off-screen in a stale height map; the step is stored unjudged.
        }
        M.scroll.push({
          cm,
          t: now(),
          top,
          from: lastTop,
          step: top - lastTop,
          caretBefore,
          caretAfter,
          height: cm.scrollDOM.clientHeight,
        });
        lastTop = top;
      }
    }
    raf = requestAnimationFrame(tick);
  };
  // The baseline is taken now, not on the first frame: a case's first action can land before it.
  const first = activeCm();
  if (first) {
    lastCm = first;
    lastTop = first.scrollDOM.scrollTop;
    M.scroll.push({ cm: first, t: now(), top: lastTop, from: null, step: null, height: first.scrollDOM.clientHeight });
  }
  raf = requestAnimationFrame(tick);
  stops.push(() => {
    running = false;
    cancelAnimationFrame(raf);
  });

  // Layout shift, resolved to the editor line each source belongs to.
  const lineOf = (cm: any, node: Node | null): number | null => {
    const el = node ? (node.nodeType === 3 ? node.parentElement : (node as Element)) : null;
    if (!el || !cm.contentDOM.contains(el)) return null;
    let child: Element | null = el;
    while (child && child.parentElement !== cm.contentDOM) child = child.parentElement;
    // A widget (the footer, a table) follows the text around it, and is not a line that moved.
    if (!child || !child.classList.contains('cm-line')) return null;
    try {
      return cm.state.doc.lineAt(cm.posAtDOM(child)).number - 1;
    } catch {
      return null; // scaffolding: a viewport gap placeholder has no position
    }
  };
  try {
    const collect = (entries: any[]): void => {
      const cm = activeCm();
      if (!cm) return;
      for (const e of entries) {
        for (const s of e.sources ?? []) {
          const line = lineOf(cm, s.node);
          if (line === null) continue;
          M.shifts.push({
            cm,
            t: now(),
            line,
            dx: +(s.currentRect.x - s.previousRect.x).toFixed(2),
            dy: +(s.currentRect.y - s.previousRect.y).toFixed(2),
            cls: String((s.node as Element).className ?? '').slice(0, 40),
          });
        }
      }
    };
    const po = new PerformanceObserver((list) => collect(list.getEntries() as any[]));
    po.observe({ type: 'layout-shift', buffered: false });
    // Entries reach the observer's callback in a later task; a read straight after the last
    // action would otherwise miss them.
    M.flushShifts = () => collect(po.takeRecords() as any[]);
    stops.push(() => po.disconnect());
  } catch {
    M.shiftsUnsupported = true;
  }

  // The lines an edit touched, as a span, by diffing the document at each change. A change to an
  // editor first seen after the change began has nothing to diff against, so it touches all of it.
  const ref = w.app.workspace.on('editor-change', (ed: any) => {
    const cm = ed?.cm;
    if (!cm) return;
    const doc = cm.state.doc;
    const next: string = doc.toString();
    const prev = docs.get(cm);
    docs.set(cm, next);
    let span: { min: number; max: number };
    if (prev === undefined) {
      span = { min: 0, max: Infinity };
    } else {
      let a = 0;
      while (a < prev.length && a < next.length && prev[a] === next[a]) a++;
      let b = 0;
      while (
        b < prev.length - a &&
        b < next.length - a &&
        prev[prev.length - 1 - b] === next[next.length - 1 - b]
      ) {
        b++;
      }
      span = { min: doc.lineAt(a).number - 1, max: doc.lineAt(next.length - b).number - 1 };
    }
    const seen = M.touched.get(cm);
    M.touched.set(cm, seen ? { min: Math.min(seen.min, span.min), max: Math.max(seen.max, span.max) } : span);
  });
  stops.push(() => w.app.workspace.offref(ref));

  // Uncaught errors, and what CodeMirror logs when one of its plugins throws.
  const onError = (ev: ErrorEvent) => {
    const msg = String(ev.message ?? ev.error ?? '');
    if (/ResizeObserver loop/.test(msg)) return; // benign, and Chromium's own
    M.errors.push(`uncaught: ${msg.slice(0, 160)}`);
  };
  const onRejection = (ev: PromiseRejectionEvent) => {
    M.errors.push(`unhandled rejection: ${String(ev.reason?.message ?? ev.reason).slice(0, 160)}`);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    M.errors.push(`console.error: ${args.map((a) => String((a as Error)?.message ?? a)).join(' ').slice(0, 160)}`);
    originalConsoleError.apply(console, args as []);
  };
  stops.push(() => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    console.error = originalConsoleError;
  });

  // Notices, by their own observer: the shared recorder is cleared by the cases that read it.
  // Those already on screen belong to whatever came before the case.
  const onScreen = new Set<Element>(Array.from(document.querySelectorAll('.notice')));
  const seen = (): void => {
    for (const el of Array.from(document.querySelectorAll('.notice'))) {
      if (onScreen.has(el)) continue;
      const text = el.textContent ?? '';
      if (text && !/^Indexing vault/i.test(text.trim()) && !M.notices.includes(text)) {
        M.notices.push(text);
      }
    }
  };
  const mo = new MutationObserver(seen);
  mo.observe(document.body, { childList: true, subtree: true });
  stops.push(() => mo.disconnect());

  w.__toMonitors = M;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Reads every monitor. Takes the notice texts the case expected, and whether this is the last
 * read of the case, which stops the recorders.
 */
function readInPage(expected: string[], final: boolean): PageReading | null {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const w = window as any;
  const M = w.__toMonitors;
  if (!M) return null;
  const cm = w.app?.workspace?.activeEditor?.editor?.cm ?? null;
  const out = {} as PageReading;
  const r = (n: number, d = 2): string => String(+n.toFixed(d));
  M.flushShifts?.();

  // ---- caret -----------------------------------------------------------
  out.caret = ((): PageResult => {
    if (!cm) return { skipped: 'no editor', observations: [] };
    const main = cm.state.selection.main;
    const ds = window.getSelection();
    // CodeMirror's `hasFocus` also asks whether the window has focus, which several Obsidian
    // windows on one display take from each other. The DOM selection follows the active element.
    if (cm.root.activeElement !== cm.contentDOM) {
      return { skipped: 'the editor is not the active element', observations: [] };
    }
    if (!main.empty) return { skipped: 'a range is selected, and paints as one', observations: [] };
    if (!ds || ds.rangeCount !== 1 || !ds.isCollapsed) {
      return { skipped: 'the page has no collapsed selection', observations: [] };
    }
    const obs: PageResult['observations'] = [];
    const range = ds.getRangeAt(0);
    const coords = cm.coordsAtPos(main.head);
    const painted = range.getClientRects()[0] ?? null;
    const container =
      range.startContainer.nodeType === 3 ? range.startContainer.parentElement : (range.startContainer as Element);
    const line = container?.closest('.cm-line, .cm-embed-block') ?? null;

    // A caret on an empty line stands on an element boundary, where the range has no rect. The
    // browser still draws it, at the position CodeMirror reports.
    const at = painted
      ? { x: painted.left, y: painted.top + painted.height / 2 }
      : coords
        ? { x: coords.left, y: (coords.top + coords.bottom) / 2 }
        : null;
    if (painted && coords) {
      const dx = painted.left - coords.left;
      const dTop = painted.top - coords.top;
      const dH = painted.height - (coords.bottom - coords.top);
      if (Math.abs(dx) > 0.5 || Math.abs(dTop) > 1 || Math.abs(dH) > 1) {
        obs.push({
          rule: 'caret-off-coords',
          detail: `painted caret is ${r(dx)}px right and ${r(dTop)}px down of coordsAtPos, ${r(dH)}px taller, at ${main.head}`,
        });
      }
    }
    if (!at) return { skipped: 'no position to read the caret at', observations: obs };
    const sr = cm.scrollDOM.getBoundingClientRect();
    // A case that scrolled the editor may have left the caret behind on purpose; the scroll
    // monitor reads what the scrolling did.
    const scrolled = M.scroll.some((x: any) => x.cm === cm && x.step);
    if (at.x < sr.left || at.x > sr.right || at.y < sr.top || at.y > sr.bottom) {
      if (!scrolled) obs.push({
        rule: 'caret-outside-scroller',
        detail: `caret at (${r(at.x, 1)}, ${r(at.y, 1)}) is outside the scroller (${r(sr.left, 0)}–${r(sr.right, 0)} × ${r(sr.top, 0)}–${r(sr.bottom, 0)})`,
      });
    } else {
      const hit = document.elementFromPoint(at.x, at.y);
      const hitLine = hit?.closest('.cm-line, .cm-embed-block') ?? null;
      if (!hit || !line || hitLine !== line) {
        obs.push({
          rule: 'caret-covered',
          detail: `the element at the caret is ${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 40)}` : 'nothing'}, not its own line`,
        });
      }
    }
    return { observations: obs };
  })();

  // ---- scroll ----------------------------------------------------------
  out.scroll = ((): PageResult => {
    const obs: PageResult['observations'] = [];
    const byCm = new Map<any, any[]>();
    for (const s of M.scroll) byCm.set(s.cm, [...(byCm.get(s.cm) ?? []), s]);
    for (const list of byCm.values()) {
      const height = list.find((s) => s.height)?.height ?? 0;
      const threshold = Math.max(48, height / 4);
      // An excursion: the position leaves by more than the threshold and comes back.
      let best: { away: number; ms: number } | null = null;
      for (let i = 0; i < list.length; i++) {
        let away = 0;
        for (let k = i + 1; k < list.length; k++) {
          away = Math.max(away, Math.abs(list[k].top - list[i].top));
          if (Math.abs(list[k].top - list[i].top) <= 2 && away > threshold) {
            if (!best || away > best.away) best = { away, ms: list[k].t - list[i].t };
            break;
          }
        }
      }
      if (best) {
        obs.push({
          rule: 'scroll-excursion',
          detail: `scroll left its position by ${r(best.away, 0)}px and returned within ${r(best.ms, 0)} ms`,
        });
      }
      // A large step while the caret was in view before it and after it.
      for (const s of list) {
        if (s.step !== null && s.height && Math.abs(s.step) > s.height / 2 && s.caretBefore && s.caretAfter) {
          obs.push({
            rule: 'scroll-step-with-caret-in-view',
            detail: `scroll moved ${r(s.step, 0)}px in one frame though the caret was in view before and after`,
          });
          break;
        }
      }
    }
    return byCm.size === 0 ? { skipped: 'no editor was scrolled or visible', observations: obs } : { observations: obs };
  })();

  // ---- grid ------------------------------------------------------------
  out.grid = ((): PageResult => {
    if (!cm) return { skipped: 'no editor', observations: [] };
    const content: HTMLElement = cm.contentDOM;
    const cb = content.getBoundingClientRect();
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const unitRaw = getComputedStyle(content).getPropertyValue('--to-decor-unit').trim();
    const unit = parseFloat(unitRaw) * (unitRaw.endsWith('rem') ? remPx : 1);
    let gutterRaw = '';
    for (const child of Array.from(content.children) as HTMLElement[]) {
      const v = child.style.getPropertyValue('--to-marker-gutter').trim();
      if (v) {
        gutterRaw = v;
        break;
      }
    }
    if (!Number.isFinite(unit) || !gutterRaw) return { skipped: 'outline decorations are not on', observations: [] };
    const host = (cm.dom.parentElement ?? document.body) as HTMLElement;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;height:0;';
    probe.style.setProperty('--to-marker-gutter', gutterRaw);
    probe.style.width = 'var(--to-marker-gutter)';
    host.appendChild(probe);
    const gutter = probe.getBoundingClientRect().width;
    probe.remove();

    const obs: PageResult['observations'] = [];
    let checked = 0;
    const BOX = 'HyperMD-codeblock, .cm-embed-block, .to-decor-widget-line, .cm-gap, .cm-callout';
    for (const child of Array.from(content.children) as HTMLElement[]) {
      if (child.matches(BOX) || child.classList.contains('HyperMD-codeblock')) continue;
      let n: number;
      try {
        n = cm.state.doc.lineAt(cm.posAtDOM(child)).number - 1;
      } catch {
        continue;
      }
      const depthRaw = getComputedStyle(child).getPropertyValue('--to-depth').trim();
      const depth = Number(depthRaw);
      if (depthRaw === '' || child.textContent === '' || !Number.isFinite(depth)) continue;
      // Right-to-left text begins at the right edge, and reads from there.
      if (/[\u0590-\u08FF]/.test(child.textContent ?? '') || getComputedStyle(child).direction === 'rtl') continue;
      const column = depth * unit;

      // First INK per visual row, from the text nodes' own rects: a wrapper's box says where a
      // run of whitespace begins, and the first glyph is what a reader sees.
      const range = document.createRange();
      const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
      const boxes: { left: number; top: number; bottom: number }[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const chrome = node.parentElement?.closest(
          '.cm-formatting-list, .cm-hmd-list-indent, .task-list-label, .internal-embed, .markdown-embed, .cm-html-embed',
        );
        // Text a decoration draws inside the line (a fold count, a chip) is that decoration's.
        const drawn = node.parentElement?.closest('[contenteditable="false"], [class*="to-decor-"]');
        const text = node.textContent ?? '';
        if (chrome || (drawn && drawn !== child && child.contains(drawn)) || text.trim() === '') continue;
        range.setStart(node, text.length - text.trimStart().length);
        range.setEnd(node, text.length);
        for (const b of Array.from(range.getClientRects())) {
          if (b.width > 0) boxes.push({ left: b.left - cb.left, top: b.top, bottom: b.bottom });
        }
      }
      // A visual row is the boxes that overlap vertically: an inline code span's padding puts its
      // box a pixel or two off the text beside it, which a rounded `top` would call another row.
      boxes.sort((x, y) => x.top - y.top);
      const groups: { top: number; bottom: number; left: number }[] = [];
      for (const b of boxes) {
        const g = groups[groups.length - 1];
        const overlap = g ? Math.min(b.bottom, g.bottom) - Math.max(b.top, g.top) : 0;
        if (g && overlap > 0.5 * Math.min(b.bottom - b.top, g.bottom - g.top)) {
          g.top = Math.min(g.top, b.top);
          g.bottom = Math.max(g.bottom, b.bottom);
          g.left = Math.min(g.left, b.left);
        } else {
          groups.push({ top: b.top, bottom: b.bottom, left: b.left });
        }
      }
      const rows = groups.map((g) => g.left - column - gutter);
      if (rows.length === 0) continue;
      checked++;

      const ordered = !!child.querySelector('.cm-formatting-list-ol');
      const task = !!child.querySelector('.task-list-item-checkbox');
      // Whitespace after a marker beyond one space is left standing, at its own width.
      const surplus = /^\s*(?:[-*+]|\d+[.)])(?: {2,}|\t)/.test(cm.state.doc.line(n + 1).text);
      const label = `line ${n + 1} "${cm.state.doc.line(n + 1).text.trim().slice(0, 24)}" (${child.className.replace(/\b(cm-line|cm-active|to-decor-guides)\b/g, '').trim().replace(/\s+/g, ' ').slice(0, 60)})`;
      const left = rows.find((d) => d < -0.5);
      if (left !== undefined) {
        obs.push({ rule: 'grid-left-of-column', detail: `${label}: text starts ${r(-left)}px left of column + gutter` });
      } else if (!ordered && !task && !surplus && rows.some((d) => Math.abs(d) > 0.5)) {
        const off = rows.find((d) => Math.abs(d) > 0.5) as number;
        obs.push({ rule: 'grid-off-column', detail: `${label}: text starts ${r(off)}px right of column + gutter` });
      }
      if (!ordered && !surplus && rows.length > 1 && rows.some((d) => Math.abs(d - rows[0]!) > 0.5)) {
        obs.push({ rule: 'grid-wrap-hang', detail: `${label}: wrapped rows start at ${rows.map((d) => r(d)).join(', ')}px past column + gutter` });
      }

      // The mark's centre on the column, within the half pixel its guide is drawn off by.
      let markerX: number | null = null;
      const bullet = child.querySelector('.list-bullet');
      const icon = child.querySelector(':scope > .to-decor-marker-icon');
      const checkbox = child.querySelector('.task-list-item-checkbox');
      if (bullet) {
        const after = getComputedStyle(bullet, '::after');
        markerX =
          bullet.getBoundingClientRect().left - cb.left + (parseFloat(after.left) || 0) + (parseFloat(after.width) || 0) / 2;
      } else if (icon || checkbox) {
        const rect = (icon ?? checkbox)!.getBoundingClientRect();
        markerX = rect.left - cb.left + rect.width / 2;
      }
      if (markerX !== null && Math.abs(markerX - column) > 0.5) {
        obs.push({ rule: 'grid-marker-off-column', detail: `${label}: mark centre is ${r(markerX - column)}px from its column` });
      }
    }
    return checked === 0 ? { skipped: 'no rendered line on the grid', observations: [] } : { observations: obs };
  })();

  // ---- height map ------------------------------------------------------
  out.heightMap = ((): PageResult => {
    if (!cm) return { skipped: 'no editor', observations: [] };
    const obs: PageResult['observations'] = [];
    let checked = 0;
    const sr = cm.scrollDOM.getBoundingClientRect();
    for (const child of Array.from(cm.contentDOM.children) as HTMLElement[]) {
      // A widget stands for several lines, and a line outside the scroller has no point to hit.
      if (!child.classList.contains('cm-line') || child.querySelector('.cm-embed-block')) continue;
      let pos: number;
      try {
        pos = cm.posAtDOM(child);
      } catch {
        continue;
      }
      const line = cm.state.doc.lineAt(pos);
      if (line.text.trim() === '' || child.getBoundingClientRect().height === 0) continue;
      const coords = cm.coordsAtPos(line.from);
      if (!coords || coords.top < sr.top || coords.bottom > sr.bottom) continue;
      checked++;
      const back = cm.posAtCoords({ x: coords.left + 1, y: (coords.top + coords.bottom) / 2 });
      if (back === null) {
        obs.push({ rule: 'heightmap-no-position', detail: `line ${line.number}: no position at its own coordinates` });
      } else if (cm.state.doc.lineAt(back).number !== line.number) {
        obs.push({
          rule: 'heightmap-wrong-line',
          detail: `line ${line.number}: its coordinates resolve to line ${cm.state.doc.lineAt(back).number}`,
        });
      }
    }
    return checked === 0 ? { skipped: 'no rendered line to round-trip', observations: [] } : { observations: obs };
  })();

  // ---- layout shift ----------------------------------------------------
  out.layoutShift = ((): PageResult => {
    if (M.shiftsUnsupported) return { skipped: 'no Layout Instability API', observations: [] };
    if (M.touched.size === 0) return { skipped: 'the case edited no document', observations: [] };
    const obs: PageResult['observations'] = [];
    const seen = new Set<string>();
    for (const s of M.shifts) {
      const touched = M.touched.get(s.cm) as undefined | { min: number; max: number };
      if (!touched) continue;
      if (s.line >= touched.min && s.line <= touched.max) continue;
      const above = s.line < touched.min;
      let rule: string | null = null;
      if (above && (Math.abs(s.dx) > 0.5 || Math.abs(s.dy) > 0.5)) rule = 'shift-above-edit';
      else if (Math.abs(s.dx) > 0.5) rule = 'shift-sideways';
      if (!rule) continue;
      const key = `${rule}:${s.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      obs.push({
        rule,
        detail: `line ${s.line + 1} (${s.cls || 'line'}) moved ${r(s.dx)}px right, ${r(s.dy)}px down, edit touched lines ${touched.min + 1}–${touched.max + 1}`,
      });
    }
    return { observations: obs.slice(0, 20) };
  })();

  // ---- errors ----------------------------------------------------------
  out.errors = {
    observations: Array.from(new Set(M.errors as string[])).map((e) => ({
      rule: e.startsWith('console.error') ? 'console-error' : 'uncaught-error',
      detail: e,
    })),
  };

  // ---- notices ---------------------------------------------------------
  out.notices = {
    observations: (M.notices as string[])
      .filter((t) => !expected.some((e) => t.includes(e)))
      .map((t) => ({ rule: 'unexpected-notice', detail: `"${t.slice(0, 100)}"` })),
  };

  if (final) {
    M.stop();
    w.__toMonitors = undefined;
  }
  return out;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
