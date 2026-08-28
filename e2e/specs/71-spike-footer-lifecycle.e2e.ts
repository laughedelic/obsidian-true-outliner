/**
 * Spike S2 (docs/research/17-backlinks-footer-spikes.md): does the block widget
 * survive the editor's lifecycle?
 *
 * S1 established that the widget can exist without perturbing the enforcement
 * layer. This asks the separate question of whether it stays correct as editors
 * are created, destroyed, split, switched and re-rendered — the failure mode
 * `coalesce` fights with a `MutationObserver` and an orphaned-container sweeper
 * (docs/research/16, "Prior art"). If a defence like that turns out to be
 * needed here, it is far cheaper to know now than after the footer has content.
 *
 * The invariant under test throughout: **exactly one widget per editor showing
 * an outline-mode note, and none anywhere else.** Counting globally across the
 * workspace is deliberate — a per-editor query would not see an orphan left
 * behind in a detached container, which is the thing most worth catching.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'Backlinks/Deep chain.md';
const OTHER = 'Backlinks/Branching arms.md';
const PLAIN = 'Notes/Sourdough Log.md';
const WIDGET_SELECTOR = '.to-spike-footer';

async function setWidget(on: boolean): Promise<void> {
  await browser.executeObsidian(
    async ({ plugins }, enabled) => {
      await (plugins.trueOutliner as any).setDebugFooterWidget(enabled);
    },
    on,
  );
}

/** Widgets anywhere in the workspace, including any detached-but-still-parented DOM. */
function widgetCount(): Promise<number> {
  return browser.executeObsidian(
    ({ app }, selector) => document.querySelectorAll(selector).length as number,
    WIDGET_SELECTOR,
  );
}

/**
 * Waits for the widget count to reach `n` rather than asserting immediately.
 * Mode toggling and leaf changes re-render asynchronously, so a bare assertion
 * races the render — the first version of this spec failed six ways for exactly
 * that reason and a diagnostic run showed the widget itself was always correct.
 * Polling for the expected value keeps the assertion honest without a fixed
 * sleep that would be slow when short and flaky when long.
 */
async function waitForWidgetCount(n: number): Promise<void> {
  await browser.waitUntil(async () => (await widgetCount()) === n, {
    timeout: 5000,
    timeoutMsg: `expected ${n} widget(s), saw ${await widgetCount()}`,
  });
  expect(await widgetCount()).toBe(n);
}

/**
 * `openNote` opens a new leaf rather than reusing the active one, so several
 * editors accumulate over a spec — measured, after an early version of this
 * spec assumed otherwise. The invariant is therefore one widget PER outline-mode
 * editor, never a fixed total.
 */
async function closeAllButOne(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    // Keep the ACTIVE leaf, not the oldest: every `openNote` adds a leaf, so the
    // first one still holds whichever note the spec opened first — keeping it
    // would silently measure the wrong file.
    const keep = app.workspace.getMostRecentLeaf();
    app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
      if (leaf !== keep) leaf.detach();
    });
  });
  await browser.waitUntil(async () => (await editorCount()) === 1, { timeout: 5000 });
}

/** Markdown editors currently mounted, so "one per editor" is checkable. */
function editorCount(): Promise<number> {
  return browser.executeObsidian(
    () => document.querySelectorAll('.markdown-source-view .cm-editor').length as number,
  );
}

async function ensureOutlineMode(notePath: string): Promise<void> {
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

async function setSourceMode(source: boolean): Promise<void> {
  await browser.executeObsidian(async ({ app }, wantSource) => {
    const leaf = app.workspace.getMostRecentLeaf();
    if (!leaf) return;
    const state = leaf.getViewState();
    await leaf.setViewState({
      ...state,
      state: { ...(state.state ?? {}), mode: 'source', source: wantSource },
    });
  }, source);
}

async function closeExtraLeaves(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    const leaves = app.workspace.getLeavesOfType('markdown');
    leaves.slice(1).forEach((leaf) => leaf.detach());
  });
}

describe('spike S2: end-of-document block widget lifecycle', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
    await h.openNote(NOTE);
    await ensureOutlineMode(NOTE);
    await setWidget(true);
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  after(async function () {
    await closeExtraLeaves();
    await setWidget(false);
  });

  it('survives repeated outline-mode toggling without leaking or duplicating', async function () {
    await h.openNote(NOTE);
    await ensureOutlineMode(NOTE);
    await closeAllButOne();
    await waitForWidgetCount(1);

    for (let i = 0; i < 10; i++) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode off');
      await h.dismissNotices();
      await waitForWidgetCount(0);

      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
      await waitForWidgetCount(1);
    }
  });

  it('follows the file when a leaf switches notes', async function () {
    await h.openNote(NOTE);
    await ensureOutlineMode(NOTE);
    await closeAllButOne();
    await waitForWidgetCount(1);

    // A note that is NOT in outline mode: the widget must not follow the editor,
    // only the file's mode.
    await h.openNote(PLAIN);
    if (await h.isOutlineMode(PLAIN)) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode off');
      await h.dismissNotices();
    }
    await closeAllButOne();
    await waitForWidgetCount(0);

    await h.openNote(NOTE);
    await closeAllButOne();
    await waitForWidgetCount(1);
  });

  it('renders once per editor when the same note is open in two leaves', async function () {
    await h.openNote(NOTE);
    await ensureOutlineMode(NOTE);
    await closeAllButOne();

    await browser.executeObsidian(async ({ app }, path) => {
      const file = app.vault.getAbstractFileByPath(path);
      const leaf = app.workspace.getLeaf('split');
      if (file) await leaf.openFile(file as any);
    }, NOTE);
    await browser.waitUntil(async () => (await editorCount()) === 2, { timeout: 5000 });

    await waitForWidgetCount(2);
    expect(await editorCount()).toBe(2);

    await closeAllButOne();
    await waitForWidgetCount(1);
  });

  it('survives Live Preview <-> Source toggling', async function () {
    await h.openNote(NOTE);
    await ensureOutlineMode(NOTE);
    await closeAllButOne();

    for (let i = 0; i < 5; i++) {
      // Both are the editing view, which is the surface the footer is scoped to,
      // so the widget belongs in both — and never twice.
      await setSourceMode(true);
      await waitForWidgetCount(1);

      await setSourceMode(false);
      await waitForWidgetCount(1);
    }
  });

  it('leaves nothing behind across 50 rapid open/close cycles', async function () {
    await h.openNote(NOTE);
    await ensureOutlineMode(NOTE);
    await h.openNote(OTHER);
    await ensureOutlineMode(OTHER);

    for (let i = 0; i < 50; i++) {
      await h.openNote(i % 2 === 0 ? NOTE : OTHER);
    }
    await closeAllButOne();
    // One editor, one widget. An orphan left in a detached container would show
    // up here as a count above the editor count — which is why this counts over
    // the whole document rather than the workspace container.
    await waitForWidgetCount(1);
    expect(await editorCount()).toBe(1);
  });

  /*
   * Window resize is deliberately absent. WebDriver cannot resize this Electron
   * window ("Browser.getWindowForTarget wasn't found"), and emulating a viewport
   * inside the page would exercise CSS rather than the editor's own re-measure —
   * a test that looks like coverage and is not. Resize, print/export and the
   * mobile viewport are recorded as manual-pass items in docs/research/17 (S2),
   * where the mandatory real-vault pass covers them.
   */
});
