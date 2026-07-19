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

export function getCursor(): Promise<{ line: number; ch: number }> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    const cursor = view.editor.getCursor();
    return { line: cursor.line, ch: cursor.ch };
  });
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
