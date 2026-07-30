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
  await armNoticeRecorder();
  await obsidianPage.openFile(notePath);
}

/** Create (or overwrite) a note and open it. */
export async function createNote(notePath: string, content: string): Promise<void> {
  await armNoticeRecorder();
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

const SELECT_ALL_KEYS = [process.platform === 'darwin' ? Key.Command : Key.Ctrl, 'a'];

/** One Mod-A keypress. */
export async function pressSelectAll(): Promise<void> {
  await browser.keys(SELECT_ALL_KEYS);
}

/**
 * Presses Mod-A repeatedly until the selection stops changing (progressive-
 * select-all: repeated presses climb the ladder — content, subtree, each
 * ancestor, whole outline body — before falling through to native Select
 * All at the top). Returns the final, stable selection. Throws if it hasn't
 * stabilized within `maxPresses`, so a broken ladder that never terminates
 * fails the test loudly instead of silently comparing a mid-climb selection.
 */
export async function selectAllToStock(
  maxPresses = 20,
): Promise<{ anchor: { line: number; ch: number }; head: { line: number; ch: number } }> {
  let prev = await getSelection();
  for (let i = 0; i < maxPresses; i++) {
    await pressSelectAll();
    const sel = await getSelection();
    if (
      sel.anchor.line === prev.anchor.line &&
      sel.anchor.ch === prev.anchor.ch &&
      sel.head.line === prev.head.line &&
      sel.head.ch === prev.head.ch
    ) {
      return sel;
    }
    prev = sel;
  }
  throw new Error(`Select All did not stabilize within ${maxPresses} presses`);
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

/** A real single mouse click (down+up, no movement) at a document position —
 * places the caret exactly as a real click would, unlike `Editor.setCursor`.
 * Distinct from `mouseDragSelect`'s W3C pointer-move sequence so it isn't
 * caught by IS_MOBILE_RUN's drag-only skip: a plain tap works the same
 * under Chrome's mobile emulation (only a drag's move phase misbehaves
 * there). */
export async function clickAt(line: number, ch: number): Promise<void> {
  const coords = await posToCoords(line, ch);
  const x = Math.round(coords.left);
  const y = Math.round((coords.top + coords.bottom) / 2);
  await browser
    .action('pointer', { parameters: { pointerType: 'mouse' } })
    .move({ x, y, origin: 'viewport' })
    .down({ button: 0 })
    .up({ button: 0 })
    .perform();
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

/** Per-key keymap-liveness counters (`consumed/invoked`), from the plugin's
 * dev-build probe. Lets a test assert the MECHANISM rather than only the
 * outcome: a caret can land correctly without our keymap ever running, because
 * the transaction filter corrects native motion after the fact, so an
 * outcome-only assertion passes identically whether our handler fired or never
 * existed at all. See docs/research/04 Q27 — that blind spot hid a real defect
 * (Home never routed to our keymap) through three rewrites of the Home/End
 * logic, all of which the outcome-only tests happily passed. */
/**
 * Clicks into a table cell to make Obsidian mount its per-cell nested CM6
 * editor, targeting the cell's own TEXT element rather than the `<td>`.
 *
 * Scoped to `.workspace-leaf.mod-active`, which is the whole point. An
 * unscoped `.markdown-source-view .cm-table-widget td` matches the FIRST table
 * cell in the document — which may belong to a different, inactive leaf left
 * open by an earlier test, and an element in a hidden pane is never
 * interactable. That produced a reproducible "element not interactable" whose
 * error text gave it away: the cell it had found contained text from an
 * entirely different fixture note than the one the test had just created.
 * Diagnosed for a while as flake, because whether it failed depended on
 * leftover workspace layout rather than on anything the test did.
 *
 * Targets the wrapper INSIDE a `td` — `td .table-cell-wrapper`, the cell's own
 * text element. Two constraints meet here: the `<td>` itself is a poor click
 * target because Obsidian overlays a `.table-row-drag-handle` inside it, which
 * on a one-character column covers most of the box; but `.table-cell-wrapper`
 * alone also matches `<th>`, so dropping the `td` clicks the HEADER row. That
 * one is silent rather than loud — the nested editor mounts fine and the test
 * goes on to type into the wrong cell — so the `td` is load-bearing.
 *
 * Mounting the nested editor is a PRECONDITION in these tests, never the
 * assertion, so making it deterministic weakens nothing.
 */
export async function clickTableCell(): Promise<void> {
  const wrapper = browser.$(
    '.workspace-leaf.mod-active .markdown-source-view .cm-table-widget td .table-cell-wrapper',
  );
  await wrapper.waitForExist({ timeout: 5000 });
  await wrapper.waitForClickable({ timeout: 5000 });
  await wrapper.click();
  await waitForContentChildCount('.cm-embed-block .cm-editor', 1);
}

export function getMotionCounts(): Promise<Record<string, { invoked: number; consumed: number }>> {
  return browser.executeObsidian(
    ({ plugins }) =>
      (plugins.trueOutliner as any).motionCounts as Record<
        string,
        { invoked: number; consumed: number }
      >,
  );
}

/** Zeroes the keymap-liveness counters so a test can attribute what follows to
 * its own keypresses. */
export function resetMotionCounts(): Promise<void> {
  return browser.executeObsidian(({ plugins }) => {
    const counts = (plugins.trueOutliner as any).motionCounts as Record<string, unknown>;
    for (const key of Object.keys(counts)) delete counts[key];
  });
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
  // Armed BEFORE the toggle: the notice this produces lives ~1500ms, which a
  // slow poll can miss entirely if recording only starts once someone waits.
  await armNoticeRecorder();
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
 * Computed style property of the Nth (0-indexed) `.cm-line`'s `::before` or
 * `::after` pseudo-element (defaults to `::after`, Experiment 2b's
 * guide-line gradient — `::before` is Obsidian's own native blockquote
 * colored-bar pseudo, see styles.css). `::before` is also where
 * selection-visual-treatment's escalated-selection chrome renders (guides
 * already own `::after` on the same elements). Reading the browser's own
 * *resolved* value (not the raw custom property we set) confirms something
 * actually rendered, the same rigor 2a's rect assertions provide for its
 * overlay divs — a DOM-attribute check alone only proves the code ran, not
 * that Obsidian's own CSS didn't silently override it (the postmortem's
 * central false-confidence warning).
 */
export function getLinePseudoComputedStyle(
  lineIndex: number,
  prop: string,
  pseudo: '::before' | '::after' = '::after',
): Promise<string> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex, prop, pseudo) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      const el = lines[lineIndex] as HTMLElement | undefined;
      if (!el) throw new Error(`no .cm-line at index ${lineIndex}`);
      return getComputedStyle(el, pseudo).getPropertyValue(prop);
    },
    lineIndex,
    prop,
    pseudo,
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
 * `selector`'s `::before` or `::after` pseudo-element (defaults to
 * `::after`) — the widget-atom equivalent of getLinePseudoComputedStyle,
 * for guide-line assertions (`::after`) or escalated-selection chrome
 * (`::before`) on table/callout/html/hr (which don't render as a plain
 * `.cm-line`, `.hr` excepted).
 */
export function getContentChildPseudoComputedStyle(
  selector: string,
  index: number,
  prop: string,
  pseudo: '::before' | '::after' = '::after',
): Promise<string> {
  return browser.executeObsidian(
    ({ app, obsidian }, selector, index, prop, pseudo) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const matches = cm.contentDOM.querySelectorAll(selector);
      const el = matches[index] as HTMLElement | undefined;
      if (!el) throw new Error(`no "${selector}" at index ${index}`);
      return getComputedStyle(el, pseudo).getPropertyValue(prop);
    },
    selector,
    index,
    prop,
    pseudo,
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

/**
 * Start recording notices in the page, so a notice that appears and
 * auto-dismisses between two polls is still observable afterwards.
 *
 * Why this exists (CI, 2026-07-30). `waitForNotice` used to poll the live DOM
 * only. A notice is shown for 1500–2000ms, and one poll costs several
 * WebDriver round-trips (`$$('.notice')` plus a `getText()` each) — on a loaded
 * CI runner that is slow enough for a whole notice lifetime to fall BETWEEN two
 * polls. The wait then spun to its timeout and reported "did not appear" for a
 * notice that had appeared and gone.
 *
 * The signature was a giveaway that it was timing, not behaviour: different
 * tests failed on each run, always with the same message, and re-running an
 * UNCHANGED commit that had previously passed reproduced it. The full suite
 * passes locally, where a run takes ~3 minutes against CI's ~10.
 *
 * Idempotent, and safe across an app restart: the flag lives on `window`, so a
 * reload drops both the flag and the observer and the next call re-arms.
 *
 * Armed from the wdio `before` hook so it is live before ANY spec acts, and
 * again from `openNote`/`createNote`/`toggleOutlineMode` to cover the window
 * being replaced by a reload. Arming only inside `waitForNotice` is too late by
 * construction — review found a real path, `40-shell.e2e.ts`'s
 * `enablePlugin` → `waitForNotice('obsidian-outliner')`, where the notice is
 * produced by the action itself and nothing had armed the recorder when that
 * spec runs alone.
 */
export async function armNoticeRecorder(): Promise<void> {
  await browser.execute(() => {
    const w = window as unknown as { __toNoticeLog?: string[]; __toNoticeArmed?: boolean };
    if (w.__toNoticeArmed) return;
    if (!document.body) return; // too early; a later call re-arms
    w.__toNoticeArmed = true;
    w.__toNoticeLog = [];
    const record = (): void => {
      for (const el of Array.from(document.querySelectorAll('.notice'))) {
        const text = el.textContent ?? '';
        if (text && !w.__toNoticeLog!.includes(text)) w.__toNoticeLog!.push(text);
      }
    };
    new MutationObserver(record).observe(document.body, { childList: true, subtree: true });
    record(); // anything already on screen
  });
}

/** Notices recorded since arming, whether or not they are still on screen. */
export async function recordedNoticeTexts(): Promise<string[]> {
  return browser.execute(
    () => (window as unknown as { __toNoticeLog?: string[] }).__toNoticeLog ?? [],
  );
}

export async function waitForNotice(text: string): Promise<void> {
  await armNoticeRecorder();
  await browser.waitUntil(
    async () => {
      if ((await recordedNoticeTexts()).some((t) => t.includes(text))) return true;
      return (await noticeTexts()).some((t) => t.includes(text));
    },
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
    // Clear the recorder too, so a notice from an earlier step can never
    // satisfy a later `waitForNotice`. Tests call this between steps precisely
    // to draw that line.
    const w = window as unknown as { __toNoticeLog?: string[] };
    if (w.__toNoticeLog) w.__toNoticeLog.length = 0;
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
  left: () => browser.keys(Key.ArrowLeft),
  right: () => browser.keys(Key.ArrowRight),
  up: () => browser.keys(Key.ArrowUp),
  down: () => browser.keys(Key.ArrowDown),
  home: () => browser.keys(Key.Home),
  end: () => browser.keys(Key.End),
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
