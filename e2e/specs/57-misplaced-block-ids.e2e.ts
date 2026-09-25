/**
 * A misplaced block id (`misplaced-block-ids`, misplaced-ids.ts): the mark on
 * its text and the warning glyph in place of its paragraph's marker, the
 * correction menu a press on either opens, the correction it applies, and the
 * command that opens the same menu from the keyboard.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { Key } from 'webdriverio';
import * as h from '../helpers.js';
import { dragFrom, markPoint } from '../dragging.js';

const NOTE = 'Scratch/misplaced-ids.md';
const DOC = 'Lead.\n- a\n- b\n\n^foo\n\nAfter.\n';
const ID_LINE = 4;
const MARK = '.to-decor-misplaced-id';
const GLYPH = '.to-decor-marker-icon[data-misplaced]';

/** The open menu's rows, in order, each with whether it is disabled. */
function menuRows(): Promise<{ title: string; disabled: boolean }[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll('.menu .menu-item')).map((item) => ({
      title: item.querySelector('.menu-item-title')?.textContent ?? '',
      disabled: item.classList.contains('is-disabled'),
    })),
  );
}

async function waitForMenu(): Promise<void> {
  await browser.waitUntil(async () => (await menuRows()).length > 0, {
    timeout: 2000,
    timeoutMsg: 'no menu opened',
  });
}

async function closeMenu(): Promise<void> {
  await browser.keys(Key.Escape);
  await browser.waitUntil(async () => (await menuRows()).length === 0, { timeout: 2000 });
}

function chooseRow(title: string): Promise<void> {
  return browser.execute((title) => {
    const item = Array.from(document.querySelectorAll<HTMLElement>('.menu .menu-item')).find(
      (el) => el.querySelector('.menu-item-title')?.textContent === title,
    );
    if (!item) throw new Error(`no menu row "${title}"`);
    item.click();
  }, title);
}

function zoomed(): Promise<boolean> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    return !!view?.containerEl.querySelector('.to-zoom-trail');
  });
}

async function pressCentre(line: number, selector: string): Promise<void> {
  const [rect] = await h.getLineChildRects(line, selector);
  if (!rect) throw new Error(`nothing matching ${selector} on line ${line}`);
  await h.clickAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

const ROWS = [
  { title: 'Obsidian reads this ID as naming the whole list above it', disabled: true },
  { title: 'Attach to “Lead.”', disabled: false },
  { title: 'Attach to “b”', disabled: false },
  { title: 'Remove ^foo', disabled: false },
];

describe('a misplaced block id', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  beforeEach(async function () {
    await h.createNote(NOTE, DOC);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await h.setBuffer(DOC);
    await browser.pause(150);
  });

  afterEach(async function () {
    if ((await menuRows()).length > 0) await closeMenu();
    await h.dismissNotices();
  });

  it('is marked on its text and by a warning glyph, only in outline mode', async function () {
    expect(await h.getLineChildRects(ID_LINE, MARK)).toHaveLength(1);
    expect(await h.getLineChildRects(ID_LINE, GLYPH)).toHaveLength(1);
    expect(await h.getLineChildRects(0, MARK)).toHaveLength(0);

    await h.setOutlineMode(false);
    await browser.pause(150);
    expect(await h.getLineChildRects(ID_LINE, MARK)).toHaveLength(0);
    expect(await h.getLineChildRects(ID_LINE, GLYPH)).toHaveLength(0);
    expect(await h.getBuffer()).toBe(DOC);
  });

  it('keeps its glyph where leaf markers are hidden', async function () {
    await h.setPluginSetting('markerVisibility', 'with-children');
    await browser.pause(150);
    expect(await h.getLineChildRects(ID_LINE, GLYPH)).toHaveLength(1);
    await h.setPluginSetting('markerVisibility', 'all');
  });

  it('opens the correction menu from a press on the mark, leaving the caret', async function () {
    await h.setCursorSettled(6, 3);
    await pressCentre(ID_LINE, MARK);
    await waitForMenu();
    expect(await menuRows()).toEqual(ROWS);
    expect(await h.getCursor()).toEqual({ line: 6, ch: 3 });
  });

  it('opens the same menu from a press on the glyph, and does not zoom', async function () {
    await pressCentre(ID_LINE, GLYPH);
    await waitForMenu();
    expect(await menuRows()).toEqual(ROWS);
    expect(await zoomed()).toBe(false);
  });

  it('applies a correction as one undo step', async function () {
    await pressCentre(ID_LINE, MARK);
    await waitForMenu();
    await chooseRow('Attach to “b”');
    await browser.waitUntil(async () => (await h.getBuffer()) === 'Lead.\n- a\n- b ^foo\n\nAfter.\n', {
      timeout: 2000,
      timeoutMsg: 'the correction did not apply',
    });
    expect(await h.getCursor()).toEqual({ line: 2, ch: 8 });
    expect(await h.getLineChildRects(2, MARK)).toHaveLength(0);
    await h.keys.undo();
    expect(await h.getBuffer()).toBe(DOC);
  });

  it('drags its paragraph from a glyph press that moves, opening no menu', async function () {
    // The pointer gesture cannot be aimed at a mark under mobile emulation.
    if (h.IS_MOBILE_RUN) this.skip();
    const glyph = await markPoint(GLYPH);
    const top = await h.getLineRect(0);
    await dragFrom(glyph, [
      { x: glyph.x, y: glyph.y - 20 },
      { x: glyph.x, y: top.top + 2 },
    ]);
    await browser.waitUntil(async () => (await h.getBuffer()).startsWith('^foo\n'), {
      timeout: 2000,
      timeoutMsg: 'the glyph press did not drag the paragraph',
    });
    expect(await menuRows()).toEqual([]);
    expect(await zoomed()).toBe(false);
  });

  it('lands a dropped id as a line of the paragraph above it', async function () {
    if (h.IS_MOBILE_RUN) this.skip();
    const md = 'Lead.\n- a\n\n^id\n\nAfter.\n';
    await h.setBuffer(md);
    await browser.pause(150);
    const glyph = await markPoint(GLYPH);
    const lead = await h.getLineRect(0);
    const item = await h.getLineRect(1);
    const seam = (lead.top + lead.height + item.top) / 2;
    await dragFrom(glyph, [
      { x: glyph.x, y: glyph.y - 20 },
      { x: glyph.x, y: seam },
    ]);
    await browser.waitUntil(async () => (await h.getBuffer()) === 'Lead.\n^id\n- a\n\nAfter.\n', {
      timeout: 2000,
      timeoutMsg: `the drop wrote ${JSON.stringify(await h.getBuffer())}`,
    });
    expect(await h.getLineChildRects(1, MARK)).toHaveLength(0);
  });

  it('opens the menu at the caret from the command, only on a misplaced line', async function () {
    await h.setCursorSettled(0, 2);
    expect(await h.commandAvailable('correct-misplaced-block-id')).toBe(false);
    await h.setCursorSettled(ID_LINE, 2);
    expect(await h.commandAvailable('correct-misplaced-block-id')).toBe(true);
    await h.runCommand('correct-misplaced-block-id');
    await waitForMenu();
    expect(await menuRows()).toEqual(ROWS);
  });
});

describe('keys on an attached block id', function () {
  const TABLE = 'Intro.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n^t1\n\nOutro.\n';

  beforeEach(async function () {
    await h.createNote(NOTE, TABLE);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await h.setBuffer(TABLE);
    await browser.pause(150);
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('refuses Enter inside the id and Backspace at its start, with the cue', async function () {
    await h.setCursorSettled(6, 2);
    await browser.keys(Key.Enter);
    await browser.pause(100);
    expect(await h.getBuffer()).toBe(TABLE);
    await h.setCursorSettled(6, 0);
    await browser.keys(Key.Backspace);
    await browser.pause(100);
    expect(await h.getBuffer()).toBe(TABLE);
    expect((await h.noticeTexts()).length).toBeGreaterThan(0);
  });

  it('opens a line after the table from Enter at the end of its id', async function () {
    await h.setCursorSettled(6, 3);
    await browser.keys(Key.Enter);
    await browser.waitUntil(async () => (await h.getBuffer()) !== TABLE, { timeout: 2000 });
    expect(await h.getBuffer()).toBe('Intro.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n^t1\n\n\n\nOutro.\n');
    expect(await h.getCursor()).toEqual({ line: 8, ch: 0 });
  });
});

describe('a link to an attached block id', function () {
  // Written as Obsidian's table editor pads it, which it does once the caret
  // is in the table.
  const MD = 'Intro.\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n\n^t1\n\nOutro.\n';

  /** The line Obsidian's metadata names for `^t1`, once it has caught up with `text`. */
  async function blockStart(text: string): Promise<number> {
    let start = -1;
    await browser.waitUntil(
      async () => {
        start = await browser.executeObsidian(({ app }, path, text) => {
          const file = app.vault.getFileByPath(path);
          const cache = file ? app.metadataCache.getFileCache(file) : null;
          const lines = text.split('\n');
          const block = cache?.blocks?.['t1'];
          if (!block || !cache?.sections?.length) return -1;
          // The cache for the current text: its last section ends where the text does.
          const last = cache.sections[cache.sections.length - 1]!;
          if (lines[last.position.end.line]?.trim() !== 'Outro.') return -1;
          return block.position.start.line;
        }, NOTE, text);
        return start !== -1;
      },
      { timeout: 5000, timeoutMsg: 'the metadata cache never named ^t1' },
    );
    return start;
  }

  it('still lands on the table after the table moves', async function () {
    await h.createNote(NOTE, MD);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await h.setBuffer(MD);
    await browser.pause(150);
    await h.setCursorSettled(2, 2);
    await h.runCommand('move-node-up');
    const moved = '| a   | b   |\n| --- | --- |\n| 1   | 2   |\n\n^t1\n\nIntro.\n\nOutro.\n';
    await browser.waitUntil(async () => (await h.getBuffer()) === moved, {
      timeout: 2000,
      timeoutMsg: `the move wrote ${JSON.stringify(await h.getBuffer())}`,
    });
    await h.saveActiveFile();
    expect(await blockStart(moved)).toBe(0);

    await h.setCursorSettled(7, 0);
    await browser.executeObsidian(({ app }) => app.workspace.openLinkText('misplaced-ids#^t1', '', false));
    await browser.waitUntil(async () => (await h.getCursor()).line <= 4, {
      timeout: 2000,
      timeoutMsg: 'following the link did not reach the table',
    });
    expect((await h.getCursor()).line).toBeLessThanOrEqual(4);
  });
});
