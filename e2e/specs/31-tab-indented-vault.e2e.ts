/**
 * Structural keys in a vault that indents with tabs — Obsidian's own default
 * for "Indent using tabs", and the setting most of the suite never turns on.
 *
 * Every fixture here gives a node lines of its own below its first — a
 * continuation, a child, a child's continuation — because those lines are
 * where a tab-unit indent used to write spaces: the first line took the tab
 * and every line below it was moved by a column count (#154). A buffer
 * compared whole pins the characters, not only the tree the parse reads back.
 */

import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'Scratch/tab-indented-vault.md';

async function outlineNote(content: string, line: number, ch: number): Promise<void> {
  await h.createNote(NOTE, content);
  await h.setOutlineMode(true);
  await h.setCursorSettled(line, ch);
}

/** Obsidian's own "Indent using tabs", read the way `setIndentUsingTabs`
 * writes it, so the spec can hand the vault back as it found it. */
function useTabSetting(): Promise<boolean> {
  return browser.executeObsidian(({ app }) =>
    Boolean((app.vault as unknown as { getConfig(key: string): unknown }).getConfig('useTab')),
  );
}

describe('a tab-indented vault: every line a node owns takes the tab', function () {
  let useTabBefore = false;

  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    useTabBefore = await useTabSetting();
    await h.setIndentUsingTabs(true);
  });

  after(async function () {
    await h.setIndentUsingTabs(useTabBefore);
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('Tab writes the tab on a continuation line, not six spaces', async function () {
    await outlineNote('- top\n- foo\n  bar\n', 1, 5);
    await h.keys.tab();
    expect(await h.getBuffer()).toBe('- top\n\t- foo\n\t  bar\n');
    expect(await h.getCursor()).toEqual({ line: 1, ch: 6 });
  });

  it('Tab into a tab-indented list carries a child and its continuation in tabs', async function () {
    await outlineNote('- top\n\t- sib\n- foo\n  bar\n  - kid\n', 2, 5);
    await h.keys.tab();
    expect(await h.getBuffer()).toBe('- top\n\t- sib\n\t- foo\n\t  bar\n\t  - kid\n');
    expect(await h.getCursor()).toEqual({ line: 2, ch: 6 });
  });

  it('Shift+Tab back out restores the lines exactly', async function () {
    await outlineNote('- top\n\t- foo\n\t  bar\n', 1, 6);
    await h.keys.shiftTab();
    expect(await h.getBuffer()).toBe('- top\n- foo\n  bar\n');
    expect(await h.getCursor()).toEqual({ line: 1, ch: 5 });
  });

  it('Tab over several nodes writes the tab on every line of each', async function () {
    await outlineNote('- top\n- foo\n  bar\n- baz\n  qux\n', 1, 2);
    await h.setSelection({ line: 1, ch: 2 }, { line: 4, ch: 5 });
    await h.keys.tab();
    expect(await h.getBuffer()).toBe('- top\n\t- foo\n\t  bar\n\t- baz\n\t  qux\n');
  });

  it('a normalized marker run keeps its lines on tabs', async function () {
    // `-  foo`'s surplus space is dropped on the way, which moves its content
    // column one to the left; the lines below it move with the column and
    // still open with the tab.
    await outlineNote('- top\n\t- sib\n-  foo\n   bar\n   - kid\n', 2, 6);
    await h.keys.tab();
    expect(await h.getBuffer()).toBe('- top\n\t- sib\n\t- foo\n\t  bar\n\t  - kid\n');
  });

  it('one undo restores the note an indent rewrote', async function () {
    const before = '- top\n\t- sib\n- foo\n  bar\n  - kid\n';
    await outlineNote(before, 2, 5);
    await h.keys.tab();
    expect(await h.getBuffer()).not.toBe(before);
    await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Ctrl, 'z']);
    expect(await h.getBuffer()).toBe(before);
  });

  // A clipboard from outside the vault indents with spaces, and every level
  // below the pasted root used to keep them (#216).
  it('a two-space list pasted into a tab list lands in tabs at every level', async function () {
    await outlineNote('- top\n\t- sib\n', 1, 6);
    await h.pasteText('- a\n  - b\n    - c\n');
    expect(await h.getBuffer()).toBe('- top\n\t- sib\n\t- a\n\t\t- b\n\t\t\t- c\n');
    expect(await h.getCursor()).toEqual({ line: 4, ch: 6 });
  });

  it('a four-space list pasted at the root lands in tabs below its root', async function () {
    await outlineNote('- top\n\t- sib\n- end\n', 2, 5);
    await h.pasteText('- a\n    - b\n        - c\n');
    expect(await h.getBuffer()).toBe('- top\n\t- sib\n- end\n- a\n\t- b\n\t\t- c\n');
    expect(await h.getCursor()).toEqual({ line: 5, ch: 5 });
  });
});
