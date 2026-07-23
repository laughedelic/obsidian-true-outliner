/**
 * Shared helpers for e2e specs. Everything that talks to Obsidian goes
 * through executeObsidian (runs inside the app); disk assertions read the
 * sandboxed vault copy from the test process with node:fs.
 */

import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { Key } from 'webdriverio';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

export const PLUGIN_ID = 'true-outliner';

/**
 * True when running under e2e/wdio.mobile-emulation.conf.mts (set by
 * `test:e2e:mobile`; same env var 00-smoke's platform check uses). Tests
 * that drive REAL MOUSE DRAGS must skip themselves on this run: Chrome's
 * mobile emulation translates W3C pointer sequences to touch semantics,
 * where a drag scrolls instead of selecting — the gesture the test means
 * to make simply doesn't exist there (confirmed in CI: every drag-based
 * selection test fails under emulation with the selection never leaving
 * the drag start, while all keyboard/dispatch-driven tests pass). Real
 * mobile selection (long-press + handles) produces ordinary CM6 selection
 * transactions the filter handles like any other — it just isn't a
 * gesture this harness can synthesize, consistent with the project's Q7
 * decision: mobile-safe by construction, desktop-tested.
 */
export const IS_MOBILE_RUN = process.env.OBSIDIAN_E2E_MOBILE === '1';

// ---- Notes and editor buffer -------------------------------------------

export async function openNote(notePath: string): Promise<void> {
  await obsidianPage.openFile(notePath);
}

/** Create (or overwrite) a note and open it. */
export async function createNote(notePath: string, content: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, p, c) => {
      const existing = app.vault.getAbstractFileByPath(p);
      if (existing) await app.vault.delete(existing);
      const dir = p.split('/').slice(0, -1).join('/');
      if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
      await app.vault.create(p, c);
    },
    notePath,
    content,
  );
  await openNote(notePath);
}

export function getBuffer(): Promise<string> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    return view.editor.getValue();
  });
}

/** Replace the whole buffer — for arranging exact test states quickly. */
export function setBuffer(text: string): Promise<void> {
  return browser.executeObsidian(({ app, obsidian }, text) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    view.editor.setValue(text);
  }, text);
}

/** Focus the editor and place the cursor — call before sending keys. */
export function setCursor(line: number, ch: number): Promise<void> {
  return browser.executeObsidian(
    ({ app, obsidian }, line, ch) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      view.editor.focus();
      view.editor.setCursor({ line, ch });
    },
    line,
    ch,
  );
}

/** Focus the editor and set a multi-line selection (anchor → head). */
export function setSelection(
  anchor: { line: number; ch: number },
  head: { line: number; ch: number },
): Promise<void> {
  return browser.executeObsidian(
    ({ app, obsidian }, anchor, head) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      view.editor.focus();
      view.editor.setSelection(anchor, head);
    },
    anchor,
    head,
  );
}

/** Overwrite a note's content the way an external tool (sync, another
 * editor) would: through `Vault.process`, which Obsidian diffs into any
 * currently-open editor for that file as a no-userEvent transaction — the
 * real-world "programmatic/remote" path, not just `setValue`. */
export async function processFileExternally(notePath: string, content: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, p, c) => {
      const file = app.vault.getAbstractFileByPath(p);
      if (!file) throw new Error(`no file at ${p}`);
      await app.vault.process(file as import('obsidian').TFile, () => c);
    },
    notePath,
    content,
  );
}

/**
 * Test-setup-only: toggles Obsidian's own "Indent using tabs" editor
 * setting (Settings → Editor). `vault.setConfig`/`getConfig` aren't part of
 * the plugin's public-API surface — the plugin itself never touches them
 * (it reads the equivalent CM6 `indentUnit` facet instead, see
 * src/plugin/keymap.ts) — but arranging Obsidian's own state for a test is
 * a different concern from what the shipped plugin code is allowed to do,
 * same category as this file's existing `(editor as any).cm` reads.
 * `updateOptions()` is the same public "editor-extension-affecting settings
 * changed" call the plugin's own `forceRedraw` uses, so a freshly-opened or
 * re-focused editor's CM6 state picks up the new facet value.
 */
export async function setIndentUsingTabs(useTab: boolean): Promise<void> {
  await browser.executeObsidian(({ app }, useTab) => {
    (app.vault as any).setConfig('useTab', useTab);
    app.workspace.updateOptions();
  }, useTab);
}

export function getCursor(): Promise<{ line: number; ch: number }> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    const cursor = view.editor.getCursor();
    return { line: cursor.line, ch: cursor.ch };
  });
}

export function getSelection(): Promise<{
  anchor: { line: number; ch: number };
  head: { line: number; ch: number };
}> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    const editor = view.editor as any;
    const cm = editor.cm;
    const range = cm.state.selection.main;
    const doc = cm.state.doc;
    const toPos = (offset: number) => {
      const line = doc.lineAt(offset);
      return { line: line.number - 1, ch: offset - line.from };
    };
    return { anchor: toPos(range.anchor), head: toPos(range.head) };
  });
}

// ---- Real pointer input (mouse drag selection) -----------------------------

interface Coords {
  left: number;
  top: number;
  bottom: number;
}

function readCoordsAt(line: number, ch: number): Promise<Coords | null> {
  return browser.executeObsidian(
    ({ app, obsidian }, line, ch) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const pos = cm.state.doc.line(line + 1).from + ch;
      const coords = cm.coordsAtPos(pos);
      return coords ? { left: coords.left, top: coords.top, bottom: coords.bottom } : null;
    },
    line,
    ch,
  );
}

/** Scrolls a document position into view without touching selection/cursor
 * — dispatches CM6's own `EditorView.scrollIntoView` StateEffect, reached
 * via the live instance's own constructor (the only reference to the
 * `EditorView` class available in this browser-context script). */
function scrollPositionIntoView(line: number, ch: number): Promise<void> {
  return browser.executeObsidian(
    ({ app, obsidian }, line, ch) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const pos = cm.state.doc.line(line + 1).from + ch;
      cm.dispatch({ effects: (cm.constructor as any).scrollIntoView(pos, { y: 'center' }) });
    },
    line,
    ch,
  );
}

/**
 * Viewport pixel coordinates of a document position, via CM6's own
 * `coordsAtPos` — precise per-character placement, unlike approximating
 * from a `.cm-line`'s bounding rect. On a large (virtualized) document the
 * target position may not currently be rendered (`coordsAtPos` returns
 * null for anything outside CM6's render window), so this scrolls it into
 * view and polls — a scroll dispatch doesn't synchronously reflow within
 * one `executeObsidian` call, so `waitUntil` gives the browser real turns
 * to actually repaint between checks.
 */
export async function posToCoords(line: number, ch: number): Promise<Coords> {
  let coords = await readCoordsAt(line, ch);
  if (!coords) {
    await scrollPositionIntoView(line, ch);
    await browser.waitUntil(
      async () => {
        coords = await readCoordsAt(line, ch);
        return coords !== null;
      },
      { timeout: 3000, timeoutMsg: `no coords at line ${line} ch ${ch} after scrolling into view` },
    );
  }
  return coords!;
}

/**
 * Real mouse drag selection: a genuine W3C pointer down/move.../up sequence
 * (not `Editor.setSelection`), so it exercises the SAME `select.pointer`
 * userEvent path a real user's drag produces — the thing Phase A's
 * choke-point claim ("every mutation path flows through the filter") is
 * actually about. `steps` intermediate moves let a test assert the
 * live-drag stability scenario (each pointer update stays escalated, no
 * flicker), not just the final released position.
 */
export async function mouseDragSelect(
  from: { line: number; ch: number },
  to: { line: number; ch: number },
  steps = 3,
): Promise<void> {
  const fromCoords = await posToCoords(from.line, from.ch);
  const toCoords = await posToCoords(to.line, to.ch);
  const fromY = Math.round((fromCoords.top + fromCoords.bottom) / 2);
  const toY = Math.round((toCoords.top + toCoords.bottom) / 2);
  const fromX = Math.round(fromCoords.left);
  const toX = Math.round(toCoords.left);

  const action = browser.action('pointer', { parameters: { pointerType: 'mouse' } });
  action.move({ x: fromX, y: fromY, origin: 'viewport' }).down({ button: 0 }).pause(20);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    action.move({
      x: Math.round(fromX + (toX - fromX) * t),
      y: Math.round(fromY + (toY - fromY) * t),
      origin: 'viewport',
      duration: 30,
    });
  }
  action.up({ button: 0 });
  await action.perform();
}

/** A real double-click at a document position (word selection). */
export async function doubleClickAt(line: number, ch: number): Promise<void> {
  const coords = await posToCoords(line, ch);
  const x = Math.round(coords.left);
  const y = Math.round((coords.top + coords.bottom) / 2);
  await browser
    .action('pointer', { parameters: { pointerType: 'mouse' } })
    .move({ x, y, origin: 'viewport' })
    .down({ button: 0 })
    .up({ button: 0 })
    .pause(10)
    .down({ button: 0 })
    .up({ button: 0 })
    .perform();
}

/**
 * Dispatches a real multi-range selection transaction directly through the
 * live CM6 instance, annotated with a genuine `select`-family userEvent —
 * for the multi-range escalation scenario, where simulating the actual
 * "add a selection range" mouse/keyboard gesture (Cmd/Ctrl+click then
 * Shift+click, CM6's standard two-step pattern) turned out to be
 * unreliable in this harness: a modifier held via `perform(true)` across
 * separate `performActions` calls did not survive to the next call
 * (verified empirically — both a held-modifier drag and a held-modifier
 * click behaved as if no modifier were held at all, replacing the
 * selection instead of adding to it). This is a harness/WebDriver-session
 * limitation, not a plugin behavior under test, so it's worked around by
 * exercising the SAME real adapter code path (the actual registered
 * `transactionFilter`, unmocked) through a direct dispatch instead of a
 * simulated gesture — every single-range scenario elsewhere in this suite
 * already covers genuine mouse/keyboard input; this covers the one thing
 * that's specifically about multi-range iteration.
 */
export async function dispatchSelectOnlyRanges(
  ranges: readonly { anchor: { line: number; ch: number }; head: { line: number; ch: number } }[],
): Promise<void> {
  await browser.executeObsidian(
    ({ app, obsidian }, ranges) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const Selection = cm.state.selection.constructor;
      const toOffset = (pos: { line: number; ch: number }) =>
        cm.state.doc.line(pos.line + 1).from + pos.ch;
      const cmRanges = ranges.map((r: (typeof ranges)[number]) =>
        Selection.range(toOffset(r.anchor), toOffset(r.head)),
      );
      cm.dispatch({ selection: Selection.create(cmRanges), userEvent: 'select' });
    },
    ranges,
  );
}

/**
 * Force-save the active view. Obsidian autosave is debounced (~2s); every
 * disk assertion must sit behind this boundary or it races.
 */
export async function saveActiveFile(): Promise<void> {
  await browser.executeObsidian(async ({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (view) await view.save();
  });
}

// ---- Disk (sandboxed vault copy) ---------------------------------------

export function vaultFilePath(rel: string): string {
  return path.join(obsidianPage.getVaultPath(), rel);
}

export function readVaultFile(rel: string): Promise<string> {
  return fsp.readFile(vaultFilePath(rel), 'utf-8');
}

export async function statMtimeMs(rel: string): Promise<number> {
  return (await fsp.stat(vaultFilePath(rel))).mtimeMs;
}

interface PluginData {
  outlinePaths: string[];
  debugCrossCheck: boolean;
  coexistenceWarned: boolean;
}

/** Read the plugin's data.json from the sandboxed vault (null if absent). */
export async function readPluginData(): Promise<PluginData | null> {
  const configDir = await browser.executeObsidian(({ app }) => app.vault.configDir);
  try {
    const raw = await fsp.readFile(
      vaultFilePath(path.join(configDir, 'plugins', PLUGIN_ID, 'data.json')),
      'utf-8',
    );
    return JSON.parse(raw) as PluginData;
  } catch {
    return null;
  }
}

/** Reset plugin data to defaults and reload the plugin so it re-reads it. */
export async function resetPluginState(): Promise<void> {
  await browser.executeObsidian(async ({ plugins }) => {
    await (plugins.trueOutliner as any).saveData({
      outlinePaths: [],
      debugCrossCheck: false,
      coexistenceWarned: false,
    });
  });
  await obsidianPage.disablePlugin(PLUGIN_ID);
  await obsidianPage.enablePlugin(PLUGIN_ID);
}

// ---- Commands -----------------------------------------------------------

export function runCommand(shortId: string): Promise<void> {
  return browser.executeObsidianCommand(`${PLUGIN_ID}:${shortId}`);
}

/** Is the command registered at all (e.g. after plugin unload)? */
export function commandRegistered(shortId: string): Promise<boolean> {
  return browser.executeObsidian(
    ({ app }, fullId) =>
      // app.commands is not in the public typings but is stable; test-only.
      Boolean((app as any).commands.commands[fullId]),
    `${PLUGIN_ID}:${shortId}`,
  );
}

/** Would the command show in the palette for the active editor right now? */
export function commandAvailable(shortId: string): Promise<boolean> {
  return browser.executeObsidian(
    ({ app, obsidian }, fullId) => {
      const cmd = (app as any).commands.commands[fullId];
      if (!cmd) return false;
      if (!cmd.editorCheckCallback) return true;
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) return false;
      return cmd.editorCheckCallback(true, view.editor, view) === true;
    },
    `${PLUGIN_ID}:${shortId}`,
  );
}

// ---- Transaction classification stats (design.md D8) ----------------------

export interface StatsTiming {
  count: number;
  median: number;
  p95: number;
  max: number;
}

export interface StatsSnapshot {
  counts: Record<string, number>;
  timing: Record<string, StatsTiming>;
  recent: { cls: string; userEvent: string | undefined; ms: number; timestamp: number }[];
  verdictCounts: Record<string, number>;
  verdictTiming: Record<string, StatsTiming>;
}

export function getStats(): Promise<StatsSnapshot> {
  return browser.executeObsidian(
    ({ plugins }) => (plugins.trueOutliner as any).stats.snapshot() as StatsSnapshot,
  );
}

export function resetStats(): Promise<void> {
  return browser.executeObsidian(({ plugins }) => {
    (plugins.trueOutliner as any).stats.reset();
  });
}

// ---- Outline mode --------------------------------------------------------

export function isOutlineMode(notePath: string): Promise<boolean> {
  return browser.executeObsidian(
    ({ plugins }, p) => (plugins.trueOutliner as any).isOutline(p) as boolean,
    notePath,
  );
}

/** Toggle outline mode for the active note via the real command. */
export async function toggleOutlineMode(): Promise<void> {
  await runCommand('toggle-outline-mode');
}

// ---- Decorations (rendered layout) ----------------------------------------

/** Set the app-wide color scheme by toggling the body theme classes. */
export async function setTheme(dark: boolean): Promise<void> {
  await browser.execute((dark) => {
    document.body.classList.toggle('theme-dark', dark);
    document.body.classList.toggle('theme-light', !dark);
  }, dark);
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** getBoundingClientRect() of the Nth (0-indexed) `.cm-line` in the active editor. */
export function getLineRect(lineIndex: number): Promise<Rect> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      const el = lines[lineIndex] as HTMLElement | undefined;
      if (!el) throw new Error(`no .cm-line at index ${lineIndex}`);
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    },
    lineIndex,
  );
}

/** Computed style property of the Nth (0-indexed) `.cm-line` in the active editor. */
export function getLineComputedStyle(lineIndex: number, prop: string): Promise<string> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex, prop) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      const el = lines[lineIndex] as HTMLElement | undefined;
      if (!el) throw new Error(`no .cm-line at index ${lineIndex}`);
      return getComputedStyle(el).getPropertyValue(prop);
    },
    lineIndex,
    prop,
  );
}

/**
 * Computed style property of the Nth (0-indexed) `.cm-line`'s `::before`
 * pseudo-element — for Experiment 2b's guide-line gradient, which is
 * consumed by `::after` (not `::before` — that's Obsidian's own native
 * blockquote colored-bar pseudo, see styles.css), not the line itself.
 * Reading the browser's own *resolved* value (not the raw `--to-guides`
 * custom property we set) confirms something actually rendered, the same
 * rigor 2a's rect assertions provide for its overlay divs — a DOM-attribute
 * check alone (e.g. reading `--to-guides` off the line) only proves the
 * code ran, not that Obsidian's own CSS didn't silently override it (the
 * postmortem's central false-confidence warning).
 */
export function getLinePseudoComputedStyle(lineIndex: number, prop: string): Promise<string> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex, prop) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      const el = lines[lineIndex] as HTMLElement | undefined;
      if (!el) throw new Error(`no .cm-line at index ${lineIndex}`);
      return getComputedStyle(el, '::after').getPropertyValue(prop);
    },
    lineIndex,
    prop,
  );
}

/** classList of the Nth (0-indexed) `.cm-line` in the active editor. */
export function getLineClassList(lineIndex: number): Promise<string[]> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      const el = lines[lineIndex] as HTMLElement | undefined;
      if (!el) throw new Error(`no .cm-line at index ${lineIndex}`);
      return Array.from(el.classList);
    },
    lineIndex,
  );
}

/** Bounding rects of every element matching `selector` within the Nth `.cm-line`. */
export function getLineChildRects(lineIndex: number, selector: string): Promise<Rect[]> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex, selector) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      const el = lines[lineIndex] as HTMLElement | undefined;
      if (!el) throw new Error(`no .cm-line at index ${lineIndex}`);
      return Array.from(el.querySelectorAll(selector)).map((n) => {
        const r = n.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });
    },
    lineIndex,
    selector,
  );
}

/**
 * Computed style property of the Nth (0-indexed) element matching
 * `selector` under the editor's content root — for widget-replaced atoms
 * (tables, callouts, raw HTML, horizontal rules) that don't render as a
 * plain `.cm-line`, unlike getLineComputedStyle.
 */
export function getContentChildComputedStyle(
  selector: string,
  index: number,
  prop: string,
): Promise<string> {
  return browser.executeObsidian(
    ({ app, obsidian }, selector, index, prop) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const matches = cm.contentDOM.querySelectorAll(selector);
      const el = matches[index] as HTMLElement | undefined;
      if (!el) throw new Error(`no "${selector}" at index ${index}`);
      return getComputedStyle(el).getPropertyValue(prop);
    },
    selector,
    index,
    prop,
  );
}

/**
 * Computed style property of the Nth (0-indexed) element matching
 * `selector`'s `::after` pseudo-element — the widget-atom equivalent of
 * getLinePseudoComputedStyle, for guide-line assertions on table/callout/
 * html/hr (which don't render as a plain `.cm-line`, `.hr` excepted).
 */
export function getContentChildPseudoComputedStyle(
  selector: string,
  index: number,
  prop: string,
): Promise<string> {
  return browser.executeObsidian(
    ({ app, obsidian }, selector, index, prop) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const matches = cm.contentDOM.querySelectorAll(selector);
      const el = matches[index] as HTMLElement | undefined;
      if (!el) throw new Error(`no "${selector}" at index ${index}`);
      return getComputedStyle(el, '::after').getPropertyValue(prop);
    },
    selector,
    index,
    prop,
  );
}

/**
 * getBoundingClientRect() of the Nth (0-indexed) element anywhere under the
 * editor's content root — for comparing visual box positions across
 * elements that don't share a common line-index scheme (e.g. a widget's
 * nested visible content vs. a sibling `.cm-line`'s own box).
 */
export function getContentChildRect(selector: string, index: number): Promise<Rect> {
  return browser.executeObsidian(
    ({ app, obsidian }, selector, index) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const matches = cm.contentDOM.querySelectorAll(selector);
      const el = matches[index] as HTMLElement | undefined;
      if (!el) throw new Error(`no "${selector}" at index ${index}`);
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    },
    selector,
    index,
  );
}

export async function screenshotFull(dir: string, name: string): Promise<void> {
  await browser.saveScreenshot(path.join(dir, `${name}.png`));
}

// ---- Notices --------------------------------------------------------------

export async function noticeTexts(): Promise<string[]> {
  const notices = browser.$$('.notice');
  return notices.map((n) => n.getText());
}

export async function waitForNotice(text: string): Promise<void> {
  await browser.waitUntil(
    async () => (await noticeTexts()).some((t) => t.includes(text)),
    { timeout: 4000, timeoutMsg: `notice containing "${text}" did not appear` },
  );
}

/**
 * Poll the active editor's content DOM for a selector's match count, rather
 * than sleeping a fixed duration — a widget-replaced atom (table/callout/
 * html/hr) can settle its own DOM asynchronously after our decoration patch
 * runs, so a fixed pause is a race against however long that happens to take
 * (worse under system load). Waits until `expected` is observed, or throws.
 */
export async function waitForContentChildCount(
  selector: string,
  expected: number,
  timeout = 5000,
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const count = await browser.executeObsidian(
        ({ app, obsidian }, selector) => {
          const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
          if (!view) return -1;
          const cm = (view.editor as any).cm;
          return cm.contentDOM.querySelectorAll(selector).length as number;
        },
        selector,
      );
      return count === expected;
    },
    { timeout, timeoutMsg: `expected ${expected} "${selector}" element(s) within ${timeout}ms` },
  );
}

export async function dismissNotices(): Promise<void> {
  await browser.execute(() => {
    document.querySelectorAll('.notice').forEach((n) => n.remove());
  });
}

// ---- Keys -----------------------------------------------------------------

const PRIMARY_MOD = process.platform === 'darwin' ? Key.Command : Key.Ctrl;

export const keys = {
  tab: () => browser.keys(Key.Tab),
  shiftTab: () => browser.keys([Key.Shift, Key.Tab]),
  enter: () => browser.keys(Key.Enter),
  shiftEnter: () => browser.keys([Key.Shift, Key.Enter]),
  altUp: () => browser.keys([Key.Alt, Key.ArrowUp]),
  altDown: () => browser.keys([Key.Alt, Key.ArrowDown]),
  undo: () => browser.keys([PRIMARY_MOD, 'z']),
  type: (text: string) => browser.keys([...text]),
};

/** A real clipboard paste (Ctrl/Cmd+V after writing to the OS clipboard) —
 * carries CM6's own paste userEvent, distinct from typed input; genuine
 * mutation-path coverage rather than a programmatic `replaceSelection`. */
export async function pasteText(text: string): Promise<void> {
  await browser.execute(async (t) => {
    await navigator.clipboard.writeText(t);
  }, text);
  await browser.keys([PRIMARY_MOD, 'v']);
}
