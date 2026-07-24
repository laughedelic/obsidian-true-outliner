/**
 * structural-history-integration: redo after a structural op restores that
 * op's OWN cursor (docs/research/04 Q21).
 *
 * ## Two deliberate constraints on every scenario here
 *
 * 1. **Nothing may touch the cursor between the op and the undo.** Any
 *    selection-only transaction populates CM6 history's `selectionsAfter[0]`
 *    with the correct cursor all by itself, which hides the bug completely —
 *    that is precisely why three manual reports never reproduced in this
 *    harness. So: no `setCursor`, no `setSelection`, no `getSelection`, no
 *    helper that calls `editor.focus()`, between the structural keystroke and
 *    Cmd/Ctrl+Z. Reading the BUFFER is safe (it dispatches nothing); reading
 *    the selection is not worth the risk. Do not "helpfully" add a cursor
 *    assertion in the middle of these — it would silently make them vacuous.
 *
 * 2. **The cursor is observed by TYPING, not by reading state.** Earlier
 *    attempts asserted `editor.getCursor()` and passed while the bug was
 *    live. Typing a character and checking where it lands in the buffer is
 *    the observation a user actually makes, and it cannot be satisfied by a
 *    correct-looking state with a stale DOM selection.
 *
 * ## IMPORTANT: these cannot currently fail for the bug's own reason
 *
 * The wrong-cursor behavior entered `@codemirror/commands` in 6.10.2, and the
 * Obsidian build this harness runs (1.12.7, the newest wdio-obsidian-service
 * offers) bundles an older CM6 that restores the cursor correctly on its own.
 * Verified directly: with the fix's extension unregistered, the two redo
 * scenarios below still PASS here, while the same scenarios fail against
 * CM6 >= 6.10.2 (tests/history-cursor.test.ts, which bisects the boundary).
 *
 * So these are **forward guards, not current ones**: they assert the correct
 * end-to-end behavior on real keystrokes, and they will start genuinely
 * guarding the moment Obsidian ships a CM6 >= 6.10.2. The executable guard
 * TODAY is the unit test. Do not read a green run here as evidence the bug is
 * fixed — check tests/history-cursor.test.ts for that.
 *
 * The last scenario (plugin-own classification) DOES fail without the fix
 * here, since it observes the re-assertion directly rather than its effect.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { Key } from 'webdriverio';
import * as h from '../helpers.js';

const NOTE = 'Scratch/history-cursor.md';
const PRIMARY_MOD = process.platform === 'darwin' ? Key.Command : Key.Ctrl;

async function outlineNote(content: string): Promise<void> {
  await h.createNote(NOTE, content);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

const undoKeys = () => browser.keys([PRIMARY_MOD, 'z']);
const redoKeys = () => browser.keys([PRIMARY_MOD, Key.Shift, 'z']);

describe('structural-history-integration: redo cursor', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('redo after a merge restores the join point, not the following gap line', async function () {
    await outlineNote('paragraph A\n\nparagraph B\n');
    // Cursor at "paragraph B"'s content start, then Backspace to merge.
    await h.setCursor(2, 0);
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('paragraph Aparagraph B\n');

    // --- nothing may touch the cursor from here until after redo ---
    await undoKeys();
    expect(await h.getBuffer()).toBe('paragraph A\n\nparagraph B\n');
    await redoKeys();
    expect(await h.getBuffer()).toBe('paragraph Aparagraph B\n');

    // Type: the character must land AT the join point, between "A" and
    // "paragraph B". Before the fix it landed on the line below.
    await browser.keys('X');
    expect(await h.getBuffer()).toBe('paragraph AXparagraph B\n');
  });

  // The exact indentation `indent` synthesizes for the shifted descendant
  // depends on the vault's indent settings and on `shiftLine`'s numeric-delta
  // path, neither of which this spec is about. So the Tab scenarios capture
  // the post-Tab buffer and assert against THAT, rather than hardcoding an
  // indent unit — what's under test is only where the cursor ends up.
  const TAB_FIXTURE = '- alpha\n- beta\n\t- beta child\n- gamma\n';

  it('redo after Tab restores the indented node’s content start', async function () {
    await outlineNote(TAB_FIXTURE);
    await h.setCursor(1, 2); // content start of "- beta"
    await browser.keys(Key.Tab);
    const afterTab = await h.getBuffer();
    expect(afterTab).not.toBe(TAB_FIXTURE); // the indent actually happened

    // --- nothing may touch the cursor from here until after redo ---
    await undoKeys();
    expect(await h.getBuffer()).toBe(TAB_FIXTURE);
    await redoKeys();
    expect(await h.getBuffer()).toBe(afterTab);

    // The character must land at the indented "beta"'s content start. Before
    // the fix it landed at the start of "- gamma", past the whole rewritten
    // subtree. ("- beta\n" occurs once — "beta child" is a distinct string.)
    await browser.keys('X');
    expect(await h.getBuffer()).toBe(afterTab.replace('- beta\n', '- Xbeta\n'));
  });

  it('one structural op is still exactly one undo step', async function () {
    await outlineNote(TAB_FIXTURE);
    await h.setCursor(1, 2);
    await browser.keys(Key.Tab);
    expect(await h.getBuffer()).not.toBe(TAB_FIXTURE);
    // A single undo must fully revert — the cursor re-assertion must not have
    // added a second history entry (Q11).
    await undoKeys();
    expect(await h.getBuffer()).toBe(TAB_FIXTURE);
  });

  it('the cursor re-assertion classifies plugin-own, not selection-only', async function () {
    await outlineNote('- alpha\n- beta\n\t- beta child\n- gamma\n');
    await h.setCursor(1, 2);
    await h.resetStats();
    await browser.keys(Key.Tab);
    // The op itself plus its re-assertion both classify plugin-own; neither
    // may show up as an enforced edit class (D4 — a `selection-only`
    // classification would run the re-asserted cursor through escalation and
    // marker-transparent clamping).
    await browser.waitUntil(
      async () => ((await h.getStats()).counts['plugin-own'] ?? 0) >= 2,
      { timeout: 3000, timeoutMsg: 'expected the op and its cursor re-assertion to classify plugin-own' },
    );
    const snap = await h.getStats();
    expect(snap.counts['boundary-crossing-edit'] ?? 0).toBe(0);
  });
});
