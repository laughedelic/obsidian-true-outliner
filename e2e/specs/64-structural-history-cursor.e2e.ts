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
 * ## These are unconditional guards now
 *
 * `minimal-changesets-for-structural-ops` replaced the whole-region dispatch
 * these scenarios were guarding against with minimal, character-level change
 * sets — correctness now comes from the change set itself (plus an explicit
 * assoc-1 cursor mapping, `src/plugin/dispatch.ts`'s `mapCursorForward`), not
 * from a recording mechanism reacting to a CM6 version-specific regression.
 * These scenarios previously could not fail for the right reason against the
 * older CM6 this harness's Obsidian build bundles (see git history for that
 * caveat); that version dependency is gone along with the mechanism it was
 * about. `tests/minimal-change-history.test.ts` is the unit-level guard for
 * the underlying cursor mapping, including the one narrow residual case
 * (outdent, cursor inside the removed marker) it pins explicitly — these
 * e2e scenarios exercise the same guarantee end-to-end, on real keystrokes.
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
    // A single undo must fully revert — the op's cursor is part of its one
    // transaction now (no follow-up transaction to add a second entry).
    await undoKeys();
    expect(await h.getBuffer()).toBe(TAB_FIXTURE);
  });
});
