/**
 * selection-aware-structural-ops e2e: a structural operation acts on every
 * covered subtree, and a block selection survives it.
 *
 * Its own spec file, matching the per-change convention 61–67 use, rather than
 * being split across `20-structural-commands` and `30-keyboard-grammar` — the
 * change's coverage reads together, and both entry points are asserted against
 * the same fixtures so a divergence between them is visible in one place.
 *
 * The covers are built with Shift+ArrowDown rather than dispatched
 * programmatically: that is the gesture a user actually makes, it exercises
 * `node-selection-extension` and the escalation filter on the way in, and a
 * cover dispatched by hand would not prove the two features compose.
 */

import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { REJECTION_MESSAGES } from '../../src/plugin/messages';

const NOTE = 'Scratch/selection-structural-ops.md';

async function outlineNote(content: string): Promise<void> {
  await h.createNote(NOTE, content);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
  await h.setBuffer(content);
}

const extendDown = (): Promise<void> => browser.keys([Key.Shift, Key.ArrowDown]);

/** The selection as an inclusive line span plus orientation — the same
 * observable form `67-node-selection-extension` asserts in. */
async function span(): Promise<string> {
  const sel = await h.getSelection();
  const backward =
    sel.head.line < sel.anchor.line ||
    (sel.head.line === sel.anchor.line && sel.head.ch < sel.anchor.ch);
  const lo = backward ? sel.head : sel.anchor;
  const hi = backward ? sel.anchor : sel.head;
  return `${lo.line}..${hi.line} ${backward ? 'back' : 'fwd'}`;
}

/** A cover over `count` sibling subtrees starting at `line`. */
async function coverFrom(line: number, count: number): Promise<void> {
  await h.setCursor(line, 2);
  for (let i = 0; i < count; i++) await extendDown();
}

describe('selection-aware structural ops: the keyboard path', () => {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('Tab indents every covered subtree, not just the one under the head', async () => {
    await outlineNote('- p\n- a\n- b\n- c\n');
    await coverFrom(1, 3);
    expect(await span()).toBe('1..4 fwd');
    await h.keys.tab();
    expect(await h.getBuffer()).toBe('- p\n\t- a\n\t- b\n\t- c\n');
  });

  it('the selection survives, so a second Tab acts on the same nodes', async () => {
    await outlineNote('- p\n\t- q\n- a\n- b\n');
    await coverFrom(2, 2);
    await h.keys.tab();
    expect(await h.getBuffer()).toBe('- p\n\t- q\n\t- a\n\t- b\n');
    // No intervening selection change: the second press must find the same
    // two nodes still selected.
    await h.keys.tab();
    expect(await h.getBuffer()).toBe('- p\n\t- q\n\t\t- a\n\t\t- b\n');
  });

  it('Shift+Tab outdents every covered subtree', async () => {
    await outlineNote('- p\n\t- a\n\t- b\n');
    await coverFrom(1, 2);
    await h.keys.shiftTab();
    expect(await h.getBuffer()).toBe('- p\n- a\n- b\n');
  });

  it('one undo reverts the whole group', async () => {
    const before = '- p\n- a\n- b\n- c\n';
    await outlineNote(before);
    await coverFrom(1, 3);
    await h.keys.tab();
    expect(await h.getBuffer()).not.toBe(before);
    await h.keys.undo();
    expect(await h.getBuffer()).toBe(before);
  });
});

describe('selection-aware structural ops: the command path', () => {
  afterEach(async function () {
    await h.dismissNotices();
  });

  it('Mod+Shift+Arrow moves a multi-node cover as a unit', async () => {
    await outlineNote('- p\n- a\n- b\n');
    await coverFrom(1, 2);
    await h.keys.moveNodeUp();
    expect(await h.getBuffer()).toBe('- a\n- b\n- p\n');
  });

  it('the palette command agrees with the hotkey on the same cover', async () => {
    await outlineNote('- p\n- a\n- b\n');
    await coverFrom(1, 2);
    await h.runCommand('move-node-up');
    expect(await h.getBuffer()).toBe('- a\n- b\n- p\n');
  });

  it('a reorder across scopes shows one cue and changes nothing', async () => {
    const before = '- p\n\t- q\n\t- r\n- t\n';
    await outlineNote(before);
    // A cover spanning `- r` (under p) and `- t` (top level): two scopes.
    await coverFrom(2, 2);
    await h.armNoticeRecorder();
    await h.keys.moveNodeUp();
    expect(await h.getBuffer()).toBe(before);
    const notices = await h.recordedNoticeTexts();
    expect(notices.filter((n) => n === REJECTION_MESSAGES['cannot-reorder-across-scopes']))
      .toHaveLength(1);
  });

  it('indent accepts the same two-scope cover the reorder refuses', async () => {
    await outlineNote('- p\n\t- q\n\t- r\n- s\n- t\n');
    await coverFrom(2, 2);
    await h.runCommand('indent-node');
    expect(await h.getBuffer()).toBe('- p\n\t- q\n\t\t- r\n\t- s\n- t\n');
  });
});
