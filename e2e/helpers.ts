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

/**
 * Stretches the harness wait budgets when instances share a machine.
 *
 * The timeouts below were sized against a sequential run and are too tight
 * under contention — a loaded runner can still be producing the thing being
 * waited for when the budget expires. Widening them is free: these are
 * `waitUntil` ceilings, not sleeps, so a wait still returns as soon as its
 * condition holds and only a genuine failure takes longer to report.
 */
export const waitBudget = (base: number): number =>
  Number(process.env.E2E_MAX_INSTANCES ?? 1) > 1 ? base * 2 : base;

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
/**
 * Sets the cursor and waits until it actually reads back there.
 *
 * On a line Obsidian renders a widget for — a task item's checkbox — the mount
 * issues a SEPARATE, later, unannotated selection dispatch that moves the caret
 * (docs/research/04 Q25; `resolveForeignCursors` in transaction-filter.ts
 * corrects where such a caret lands, not the fact that it moved). A test that
 * sets the cursor and immediately presses a key races that mount: on desktop the
 * set wins, under mobile emulation it does not, and the keypress then acts from
 * wherever the mount left the caret — silently testing a different gesture.
 *
 * So the position is re-asserted until it holds. This is a PRECONDITION only:
 * every assertion about where a caret ENDS UP is made after the gesture, so
 * settling the start cannot hide a placement bug. It fails loudly rather than
 * proceeding from the wrong place.
 */
export async function setCursorSettled(line: number, ch: number): Promise<void> {
  // The target is what the editor RESOLVES the request to, read in the same
  // call that makes it: a `ch` past the line's end clamps to its length, and a
  // position inside a marker is pulled to content start by this plugin's own
  // filter. Both are synchronous with the dispatch, so this reads the truth
  // before any later mount can move it — where waiting on the literal `(line,
  // ch)` would spin forever on a caller that deliberately overshoots.
  const target = await browser.executeObsidian(
    ({ app, obsidian }, line, ch) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      view.editor.focus();
      view.editor.setCursor({ line, ch });
      return view.editor.getCursor();
    },
    line,
    ch,
  );
  // STABLE, not merely correct once. The dispatch this outwaits arrives on a
  // later render pass, so a check that passes the instant the cursor is set
  // proves nothing — it just runs before the mount. Requiring the position to
  // hold across several polls spans that pass. It cannot be PROVEN settled, only
  // held long enough that a same-pass move would have landed; the timeout is
  // what makes a position that never holds fail loudly instead of quietly.
  const STABLE_POLLS = 4;
  let stable = 0;
  await browser.waitUntil(
    async () => {
      const at = await getCursor();
      if (at.line === target.line && at.ch === target.ch) return ++stable >= STABLE_POLLS;
      stable = 0;
      await setCursor(target.line, target.ch);
      return false;
    },
    {
      timeout: waitBudget(3000),
      interval: 50,
      timeoutMsg:
        `cursor never held ${target.line}:${target.ch} ` +
        `(requested ${line}:${ch})`,
    },
  );
}

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

/**
 * Obsidian's own "Show indentation guides" (Editor settings), the same way.
 *
 * It is not only a guide switch: with it off Obsidian stops emitting the
 * `.cm-indent` spans that quantise a list line's leading whitespace, so it
 * changes list LAYOUT as well as decoration. `check-vault-drift.mjs` covers the
 * config file, but a spec that turns it off should still turn it back on.
 */
export async function setIndentGuides(show: boolean): Promise<void> {
  await browser.executeObsidian(({ app }, show) => {
    (app.vault as any).setConfig('showIndentGuide', show);
    app.workspace.updateOptions();
  }, show);
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

/** Every range of the current selection, in order. `getSelection` above reads
 * only `selection.main`, which is the wrong question for multi-cursor
 * assertions — the interesting failure there is a selection collapsing from
 * several ranges into one, which `main` alone cannot see. */
export function getSelectionRanges(): Promise<
  { anchor: { line: number; ch: number }; head: { line: number; ch: number } }[]
> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    const cm = (view.editor as any).cm;
    const doc = cm.state.doc;
    const toPos = (offset: number) => {
      const line = doc.lineAt(offset);
      return { line: line.number - 1, ch: offset - line.from };
    };
    return cm.state.selection.ranges.map((r: { anchor: number; head: number }) => ({
      anchor: toPos(r.anchor),
      head: toPos(r.head),
    }));
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
      {
        timeout: waitBudget(3000),
        timeoutMsg: `no coords at line ${line} ch ${ch} after scrolling into view`,
      },
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
 * Scrolls `selector` clear of the app's fixed chrome and clicks it.
 *
 * `element.click()` scrolls too, but to the nearest edge — which on the mobile
 * viewport puts the target at y≈9, under Obsidian's `view-header`. WebDriver
 * then refuses with "element click intercepted ... other element would receive
 * the click", retries for several seconds, and fails. Centring is what keeps the
 * target out from under both the header and the status bar; the short viewport
 * is why mobile sees this and desktop does not.
 *
 * The element is re-queried AFTER the scroll. The footer rebuilds its DOM on
 * every render, and an async group fill landing between the scroll and the click
 * left the first handle pointing at a node no longer in the document — a "stale
 * element reference" that reads like a test bug and is really a race. Observed
 * on CI, on a commit whose only changes were documentation.
 */
export async function clickClear(selector: string): Promise<void> {
  // Retried, because re-querying after the scroll narrows the window and does
  // not close it. The footer rebuilds its whole subtree on every render, and a
  // render can start between the second query and the click as easily as
  // between the first and the scroll — a scroll is itself one of the things
  // that starts one, since CodeMirror rebuilding its viewport recreates the
  // widget the footer lives in. Observed on CI on both platforms, and more
  // often once the footer had controls that re-render it.
  //
  // Four attempts rather than one, and only for staleness: any other failure is
  // a real one and is thrown on the spot.
  for (let attempt = 0; ; attempt++) {
    try {
      await (await $(selector)).scrollIntoView({ block: 'center' });
      await browser.pause(150);
      await (await $(selector)).click();
      return;
    } catch (error) {
      if (attempt >= 3 || !String(error).includes('stale')) throw error;
      await browser.pause(250);
    }
  }
}

/**
 * The platform's Mod key held across a REAL click, for a Mod-click gesture.
 *
 * Two input sources in ONE `browser.actions([...])` call, which WebDriver
 * tick-aligns, so the key is genuinely down while the pointer goes down and up.
 * A modifier held across SEPARATE `performActions` calls does not survive to the
 * next one in this harness — see `dispatchSelectOnlyRanges` above, whose
 * workaround exists for that reason. The single-chain form does work, and
 * `75-footer-behaviour` uses it for Mod-click.
 *
 * The caller scrolls first and passes an absolute viewport point: `performActions`
 * does not scroll the way `element.click()` does, and a pointer moved to a point
 * outside the viewport lands on whatever is there instead — silently, since a
 * click that hits nothing throws nothing.
 */
export async function modClickAt(x: number, y: number): Promise<void> {
  await browser.actions([
    browser.action('key').down(PRIMARY_MOD),
    browser
      .action('pointer', { parameters: { pointerType: 'mouse' } })
      .move({ x: Math.round(x), y: Math.round(y), origin: 'viewport' })
      .down({ button: 0 })
      .up({ button: 0 }),
  ]);
  await browser.action('key').up(PRIMARY_MOD).perform();
}

/**
 * A plain click at an absolute VIEWPORT point — distinct from `clickAt`, which
 * takes a document position and is about placing the caret.
 *
 * Absolute rather than `element.click({x, y})`, whose offsets are relative to
 * the element's centre in some versions and its top-left in others — an
 * ambiguity that silently clicked a neighbouring element rather than failing.
 * A point the caller computed from a real glyph rect has no such question.
 */
export async function clickAtPoint(x: number, y: number): Promise<void> {
  await browser
    .action('pointer', { parameters: { pointerType: 'mouse' } })
    .move({ x: Math.round(x), y: Math.round(y), origin: 'viewport' })
    .down({ button: 0 })
    .up({ button: 0 })
    .perform();
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

/**
 * Pin the position-indicator settings OFF for a spec that measures the base
 * decoration layers (indentation, guides, markers).
 *
 * Both axes default to something visible (hierarchy-position-indicators), so any
 * spec whose caret happens to land inside a subtree now sees an ACCENTED ancestor guide
 * where it used to see a plain one — same geometry, different color, and a
 * different gradient function. That silently changes what a layer-counting or
 * color-comparing assertion measures, which is how a default change quietly
 * weakens an existing regression net rather than failing loudly. Specs that
 * mean to test the base layers say so here; `55-position-indicators.e2e.ts`
 * owns the accents themselves.
 */
export async function pinPositionIndicatorsOff(): Promise<void> {
  await browser.executeObsidian(async ({ plugins }) => {
    const plugin = plugins.trueOutliner as any;
    await plugin.setGuideHighlight('off');
    await plugin.setMarkerHighlight('off');
  });
}

/**
 * Lift the footer's OVERALL cap for a spec that is not about volume.
 *
 * The cap defaults to 50 references, and the hub fixture carries roughly 400,
 * so a spec looking for a particular source note's rows in that footer finds
 * whatever the cap admitted rather than what it asked for. A spec that means to
 * exercise the cap sets it itself; every other spec says here that it does not.
 *
 * The same argument as `pinPositionIndicatorsOff`: a default that changes what
 * an assertion measures should be stated by the spec, not inherited from it.
 */
export async function pinBacklinksCapOff(): Promise<void> {
  await browser.executeObsidian(async ({ plugins }) => {
    await (plugins.trueOutliner as any).setBacklinksOverallCap('none');
  });
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
  await wrapper.waitForExist({ timeout: waitBudget(5000) });
  await wrapper.waitForClickable({ timeout: waitBudget(5000) });
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

/**
 * The marker gutter as the RENDERED document publishes it, in px.
 *
 * Read rather than restated, and RESOLVED rather than parsed. The gutter is
 * derived (`MARKER_GUTTER_CSS`, docs/research/21-marker-text-gap.md) and its
 * checkbox term reads a live theme value, so its published form is a `calc()`
 * expression rather than a length — parsing the token gives the first number in
 * it, which is not the gutter and is not even close.
 *
 * A probe element resolves it the way the layout does. It is attached beside the
 * editor rather than inside `.cm-content`, so the theme's own scoped values are
 * in the cascade without CodeMirror's managed DOM being touched.
 */
export function publishedGutter(): Promise<number> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    let raw = '';
    for (const child of Array.from(cm.contentDOM.children) as HTMLElement[]) {
      const value = child.style.getPropertyValue('--to-marker-gutter').trim();
      if (value) {
        raw = value;
        break;
      }
    }
    if (!raw) throw new Error('no rendered line published --to-marker-gutter');

    const host = (cm.dom.parentElement ?? document.body) as HTMLElement;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;height:0;';
    probe.style.setProperty('--to-marker-gutter', raw);
    probe.style.width = 'var(--to-marker-gutter)';
    host.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return +width.toFixed(2);
  });
}

/**
 * The outline unit as the RENDERED document publishes it, in px.
 *
 * Read rather than restated: overriding the unit's single declaration is a
 * SUPPORTED adjustment, so a spec that spells its value asserts the default
 * rather than that a level steps by whatever unit is in force.
 *
 * RESOLVED rather than parsed, for the reason `publishedGutter` records and one
 * more that belongs to this value in particular. A snippet may write any CSS
 * length that does NOT resolve against the consuming line’s own font size —
 * `2rem`, `28px`, `1in`, `calc(2rem + 1px)` are all valid, but `em`/`ex` are
 * not: the spec requires the unit to be font-size-independent, so those are
 * excluded by the contract itself, not merely unsupported by this helper.
 * `getPropertyValue` hands back the token a reader wrote, not a length, so
 * parsing it would read `1in` as one pixel and `calc(...)` as `NaN` — a spec
 * meant to hold the adjustment would mis-evaluate the very inputs the
 * adjustment exists to support.
 *
 * A probe INHERITS the property rather than copying it, the unit being declared
 * on `body` and inherited by everything — so this reads whatever is in force,
 * including an override a snippet applied.
 */
export function publishedUnit(): Promise<number> {
  return browser.execute(() => {
    if (!getComputedStyle(document.body).getPropertyValue('--to-decor-unit').trim()) {
      throw new Error('--to-decor-unit is not declared');
    }
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;visibility:hidden;height:0;width:var(--to-decor-unit);';
    document.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return +width.toFixed(2);
  });
}

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

/**
 * Everything a decoration assertion needs about whichever element actually
 * renders a given DOCUMENT line — `.cm-line` or not.
 *
 * `getLineRect`/`getLineComputedStyle` index into `:scope > .cm-line`, which
 * silently means "the Nth plain line", not "document line N". That is fine
 * for a document Obsidian renders entirely as plain lines, but as soon as
 * one line is replaced by a widget (a table, a callout, a wiki embed) every
 * index past it is off by one, and the assertion reads a neighbouring line
 * while looking perfectly healthy. This resolves by document position
 * instead (`posAtDOM` over every direct child of `contentDOM`), so it is
 * correct regardless of how Obsidian chose to render the line.
 */
export interface LineElementInfo {
  /** className of the element rendering this line. */
  cls: string;
  isCmLine: boolean;
  rect: Rect;
  marginLeft: number;
  paddingLeft: number;
  /**
   * The COLUMN this line's indentation places it at: border-box left plus
   * the element's own native left padding. The single quantity a same-depth
   * comparison should use — plain lines carry their indentation as
   * `padding-left` (box stays put, content moves) while widgets carry it as
   * `margin-left` (the whole box moves), so neither `rect.left` nor
   * `padding-left` alone is comparable across the two; their sum is exactly
   * what `widgetOwnShiftExpr` is defined to hold constant across kinds.
   *
   * NOT "where the text starts", and deliberately does NOT add
   * `border-left-width`. Measured at depth 1, with a plain paragraph's text
   * at x=334.9: paragraph rect+pad 334.9 (text 334.9), callout 334.9 (text
   * 380.9), table 334.9 (text 343.9), embed 334.9 (text 336.9). Every kind
   * agrees on rect+pad and disagrees on text origin by up to 46px, because
   * each draws its own internal chrome (a callout's icon, a table's cell
   * padding, an embed's 2px left border) inside that shared column. The
   * border is the embed's own visible left edge, the counterpart of a
   * callout's bar, and belongs ON the column rather than inset from it.
   */
  alignedLeft: number;
  hasMarker: boolean;
  /** Absolute left edge of the marker icon, or null when there is none. */
  markerLeft: number | null;
  hasGuides: boolean;
  /** Resolved background of the guide layer ('' when no guide renders). */
  guideBackground: string;
  hasSelectedChrome: boolean;
}

export function getLineElementInfo(lineIndex: number): Promise<LineElementInfo> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const content: HTMLElement = cm.contentDOM;
      const matches: HTMLElement[] = [];
      for (const child of Array.from(content.children)) {
        try {
          if (cm.state.doc.lineAt(cm.posAtDOM(child)).number - 1 === lineIndex) {
            matches.push(child as HTMLElement);
          }
        } catch {
          // Scaffolding (a viewport gap placeholder) has no document
          // position of its own — never the element we're looking for.
        }
      }
      if (matches.length === 0) throw new Error(`no element renders document line ${lineIndex}`);
      // Fail loudly rather than silently picking whichever came first in DOM
      // order. One document line really can be rendered by TWO direct
      // children at once — with the cursor on it, Obsidian reveals the raw
      // source as a `.cm-line` while KEEPING the rendered widget — and in
      // that state "the element for line N" is an ambiguous question this
      // helper has no business answering by accident. Every caller today
      // parks the cursor elsewhere so exactly one element exists; a caller
      // that genuinely wants the doubly-rendered state should ask for the
      // rendering it means, not inherit a DOM-order coin flip.
      if (matches.length > 1) {
        throw new Error(
          `document line ${lineIndex} is rendered by ${matches.length} elements ` +
            `(${matches.map((m) => `"${m.className}"`).join(', ')}) — ` +
            `move the cursor off the line, or assert against the specific rendering you mean`,
        );
      }
      const found = matches[0]!;
      const cs = getComputedStyle(found);
      const r = found.getBoundingClientRect();
      const marginLeft = parseFloat(cs.marginLeft) || 0;
      const paddingLeft = parseFloat(cs.paddingLeft) || 0;
      const marker = found.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
      // The guide renders as an ::after layer; read the resolved value so a
      // pass proves something actually painted, not just that a custom
      // property was set (the postmortem's false-confidence rule).
      const guideBg = getComputedStyle(found, '::after').backgroundImage;
      return {
        cls: found.className,
        isCmLine: found.classList.contains('cm-line'),
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        marginLeft,
        paddingLeft,
        alignedLeft: r.left + paddingLeft,
        hasMarker: !!marker,
        markerLeft: marker ? marker.getBoundingClientRect().left : null,
        hasGuides: found.classList.contains('to-decor-guides'),
        guideBackground: guideBg && guideBg !== 'none' ? guideBg : '',
        hasSelectedChrome: found.classList.contains('to-decor-node-selected'),
      };
    },
    lineIndex,
  );
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
 * Computed style property of the first element matching `selector` INSIDE the
 * Nth `.cm-line` — optionally of one of its pseudo-elements. Returns null when
 * the line has no such element at all, so a caller can tell "not there" apart
 * from "there, with this value".
 *
 * Needed by the position-indicator accents (hierarchy-position-indicators),
 * whose targets are elements nested in a line rather than the line itself: our
 * own marker icon (`color`, which its SVG's `currentColor` follows) and
 * Obsidian's native list bullet (`.list-bullet::after`'s `background-color`).
 * Reading the browser's resolved value — never the custom property we set —
 * for the same reason `getLinePseudoComputedStyle` does.
 */
export function getLineChildComputedStyle(
  lineIndex: number,
  selector: string,
  prop: string,
  pseudo: '::before' | '::after' | null = null,
): Promise<string | null> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex, selector, prop, pseudo) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      const el = lines[lineIndex] as HTMLElement | undefined;
      if (!el) throw new Error(`no .cm-line at index ${lineIndex}`);
      const child = el.querySelector(selector) as HTMLElement | null;
      if (!child) return null;
      return getComputedStyle(child, pseudo ?? undefined).getPropertyValue(prop);
    },
    lineIndex,
    selector,
    prop,
    pseudo,
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
    { timeout: waitBudget(4000), timeoutMsg: `notice containing "${text}" did not appear` },
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
  timeout = waitBudget(5000),
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

/** The platform's Mod key. Exported because a spec driving a Mod-CLICK needs
 * the same key the Mod-keystroke helpers below use. */
export const PRIMARY_MOD = process.platform === 'darwin' ? Key.Command : Key.Ctrl;

export const keys = {
  tab: () => browser.keys(Key.Tab),
  shiftTab: () => browser.keys([Key.Shift, Key.Tab]),
  enter: () => browser.keys(Key.Enter),
  shiftEnter: () => browser.keys([Key.Shift, Key.Enter]),
  /** The default hotkey for the `move-node-up`/`move-node-down` commands.
   * These go through Obsidian's command/hotkey layer, NOT our CM6 keymap —
   * see `addStructuralCommand` in src/plugin/main.ts. */
  moveNodeUp: () => browser.keys([PRIMARY_MOD, Key.Shift, Key.ArrowUp]),
  moveNodeDown: () => browser.keys([PRIMARY_MOD, Key.Shift, Key.ArrowDown]),
  undo: () => browser.keys([PRIMARY_MOD, 'z']),
  copy: () => browser.keys([PRIMARY_MOD, 'c']),
  paste: () => browser.keys([PRIMARY_MOD, 'v']),
  type: (text: string) => browser.keys([...text]),
  left: () => browser.keys(Key.ArrowLeft),
  right: () => browser.keys(Key.ArrowRight),
  up: () => browser.keys(Key.ArrowUp),
  down: () => browser.keys(Key.ArrowDown),
  home: () => browser.keys(Key.Home),
  end: () => browser.keys(Key.End),
  backspace: () => browser.keys(Key.Backspace),
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
