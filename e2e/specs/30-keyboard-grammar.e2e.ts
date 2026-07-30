/**
 * Keyboard grammar with real key events — automates the "Keyboard grammar"
 * checklist of openspec/changes/editor-core/verification.md. Structure-level
 * assertions reuse the plugin's own pure parser on the buffer text.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { REJECTION_MESSAGES } from '../../src/plugin/messages';
import { parse } from '../../src/parse';
import { walkNodes } from '../../src/model';

const NOTE = 'Scratch/grammar.md';

/** Scratch note with outline mode ON, buffer + cursor arranged. */
async function grammarNote(content: string, line: number, ch: number): Promise<void> {
  await h.createNote(NOTE, content);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
  await h.setCursor(line, ch);
}

async function modeOff(): Promise<void> {
  if (await h.isOutlineMode(NOTE)) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode off');
    await h.dismissNotices();
  }
}

describe('keyboard grammar', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('off-mode: keys behave stock — no grammar transforms, no notices', async function () {
    await h.createNote(NOTE, 'Only.\n');
    await modeOff();
    await h.setCursor(0, 5);

    // In outline mode this exact position rejects Tab with a notice and no
    // change; stock behavior inserts whitespace silently.
    await h.keys.tab();
    const after = await h.getBuffer();
    // Stock behavior inserts whitespace somewhere (exact placement is
    // Obsidian's business); grammar would have rejected with a cue instead.
    expect(after).not.toBe('Only.\n');
    expect(after).toContain('Only.');
    expect(await h.noticeTexts()).toEqual([]);
  });

  it('toggling mode applies to the very next keypress', async function () {
    await grammarNote('Only.\n', 0, 5);

    await h.keys.tab(); // grammar: nothing above to indent under → cue, inert
    await h.waitForNotice(REJECTION_MESSAGES['no-previous-sibling']);
    expect(await h.getBuffer()).toBe('Only.\n');
    await h.dismissNotices();

    await h.toggleOutlineMode(); // off
    await h.waitForNotice('Outline mode off');
    await h.dismissNotices();
    await h.setCursor(0, 5);
    await h.keys.tab(); // stock: inserts whitespace
    expect(await h.getBuffer()).not.toBe('Only.\n');

    await h.toggleOutlineMode(); // on again
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
    await h.setBuffer('Only.\n');
    await h.setCursor(0, 5);
    await h.keys.tab(); // grammar governs the very next keypress
    await h.waitForNotice(REJECTION_MESSAGES['no-previous-sibling']);
    expect(await h.getBuffer()).toBe('Only.\n');
  });

  it('structural key bindings decline inside a nested table-cell editor', async function () {
    await grammarNote('# Section\n\n| a | b |\n| --- | --- |\n| word | 2 |\n', 0, 0);
    await h.clickTableCell();

    const focusedCell = await browser.execute(() => {
      const embed = document.activeElement?.closest('.cm-embed-block');
      return {
        nested: embed !== null,
        text: embed?.querySelector('.cm-content')?.textContent ?? null,
      };
    });
    expect(focusedCell).toEqual({ nested: true, text: 'word' });
    const beforeKey = await h.getBuffer();

    // Draw the line before the keypress: `grammarNote` only dismisses notices
    // when it had to toggle the mode, and an earlier test in this file
    // legitimately produces this very message. Clearing resets the recorder as
    // well as the DOM, so anything `recordedNoticeTexts` reports below was
    // produced by our Tab and nothing else.
    await h.dismissNotices();

    await h.keys.tab();
    await browser.pause(100);

    // The nested editor owns the key. If makeHandler sees the cell's tiny
    // document as the outline, it consumes Tab and emits this exact toast
    // (the cell text `word` parses as one paragraph with no previous sibling).
    //
    // Tab is used here rather than the originally-reported Alt+Up because
    // Alt+Arrow is no longer bound in our keymap at all — move up/down now ship
    // as a default hotkey on the commands, whose `editorCheckCallback` reads
    // the host note through the public Editor API and so was never affected.
    // Tab exercises the same shared `outlinePathOf` gate that Alt+Up did.
    //
    // `recordedNoticeTexts` rather than `noticeTexts`: a notice lives ~1500ms,
    // so polling the live DOM can miss one entirely and turn this negative
    // assertion into a false pass. The recorder catches it however briefly it
    // showed.
    //
    // CAVEAT — this remains a symptom-documenting test, NOT the regression net.
    // The load-bearing guard for this shared gate is the Mod-A test in
    // 64-progressive-select-all.e2e.ts, whose negative control fails on the
    // 1.13 base (docs/research/04 Q28: a test that cannot fail is worse than
    // no test).
    expect(await h.recordedNoticeTexts()).not.toContain(
      REJECTION_MESSAGES['no-previous-sibling'],
    );
    expect(await h.getBuffer()).toBe(beforeKey);
  });

  it('Tab/Shift+Tab indent and outdent the node at the cursor', async function () {
    await grammarNote('- alpha\n- beta\n', 1, 4);

    await h.keys.tab();
    const indented = await h.getBuffer();
    // beta is now a child of alpha (indentation string is vault-dependent).
    const nodes = [...walkNodes(parse(indented))];
    expect(nodes.length).toBe(2);
    const alpha = parse(indented).children[0]!;
    expect(alpha.children.length).toBe(1);
    expect(alpha.children[0]!.lines[0]!.trim()).toBe('- beta');
    // minimal-changesets-for-structural-ops: cursor preserves the user's
    // column (2 chars into "beta", from ch 4 = 2 chars past "- ") rather
    // than resetting to the moved node's content start.
    const cursor = await h.getCursor();
    const betaLine = indented.split('\n')[1]!;
    expect(cursor.line).toBe(1);
    expect(betaLine.slice(cursor.ch)).toBe('ta');

    await h.keys.shiftTab();
    expect(await h.getBuffer()).toBe('- alpha\n- beta\n');
  });

  it('Tab respects the vault\'s "Indent using tabs" setting for brand-new indentation', async function () {
    // A note with no existing indented list item: the unit for this first
    // Tab has nothing in the document to infer from, so it must come from
    // Obsidian's own editor setting instead of a hardcoded default.
    try {
      await h.setIndentUsingTabs(true);
      await grammarNote('- alpha\n- beta\n', 1, 4);
      await h.keys.tab();
      const withTabs = await h.getBuffer();
      expect(withTabs).toBe('- alpha\n\t- beta\n');

      await h.setIndentUsingTabs(false);
      await grammarNote('- alpha\n- beta\n', 1, 4);
      await h.keys.tab();
      const withSpaces = await h.getBuffer();
      expect(withSpaces.split('\n')[1]).toMatch(/^ +- beta$/);
      expect(withSpaces).not.toContain('\t');
    } finally {
      await h.setIndentUsingTabs(false); // restore the vault's default for later specs
    }
  });

  it('Alt+Arrow is not claimed by the plugin (move ships as a command hotkey)', async function () {
    // Locks in the decision to drop the hardcoded `Alt-ArrowUp/Down` CM6
    // bindings. If someone re-adds them, this buffer WILL change and this
    // fails. Stock Obsidian leaves Alt+Arrow unbound — measured on 1.13.3 it
    // only moves the caret — so an unchanged buffer means the key is ours to
    // leave alone, not ours to claim.
    await grammarNote('- a\n\t- a1\n- b\n', 2, 2);
    await h.keys.altUp();
    await browser.pause(50);
    expect(await h.getBuffer()).toBe('- a\n\t- a1\n- b\n');
    await h.keys.altDown();
    await browser.pause(50);
    expect(await h.getBuffer()).toBe('- a\n\t- a1\n- b\n');
  });

  it('the move-node hotkey acts on the HOST node even from inside a table cell', async function () {
    // The other half of the nested-editor story, and the resolution of the
    // design question the gate fix raised: our CM6 keymap DECLINES in a nested
    // cell, but move now ships on the command path, whose editorCheckCallback
    // resolves `ctx.file` and whose runOp reads `editor.getValue()` through the
    // public Editor API — both of which resolve to the HOST note regardless of
    // where focus is. So the move hotkey keeps working while editing a cell,
    // and moves the whole table as one node.
    await grammarNote('para\n\n| a | b |\n| --- | --- |\n| word | 2 |\n', 0, 0);
    await h.clickTableCell();
    const nested = await browser.execute(
      () => document.activeElement?.closest('.cm-embed-block') !== null,
    );
    expect(nested).toBe(true);

    await h.keys.moveNodeUp();
    await browser.pause(100);

    const after = await h.getBuffer();
    expect(after.startsWith('|')).toBe(true); // table is now the first node
    expect(after.trimEnd().endsWith('para')).toBe(true);
  });

  it('the move-node default hotkey moves nodes with their children; ordered runs renumber', async function () {
    await grammarNote('- a\n\t- a1\n- b\n', 0, 2);
    await h.keys.moveNodeDown();
    expect(await h.getBuffer()).toBe('- b\n- a\n\t- a1\n');
    await h.keys.moveNodeUp();
    expect(await h.getBuffer()).toBe('- a\n\t- a1\n- b\n');

    await grammarNote('1. one\n2. two\n3. three\n', 1, 3);
    await h.keys.moveNodeUp();
    expect(await h.getBuffer()).toBe('1. two\n2. one\n3. three\n');
  });

  it('Enter mid-item splits into two items (childless)', async function () {
    await grammarNote('- alpha beta\n', 0, 8);
    await h.keys.enter();
    expect(await h.getBuffer()).toBe('- alpha \n- beta\n');
    expect(await h.getCursor()).toEqual({ line: 1, ch: 2 });
  });

  it('Enter mid-item WITH children lands the remainder as the new first child (amendment 2026-07-21)', async function () {
    // Content-adjacent split: the remainder sits directly below the split
    // point, above the existing children — not a sibling past the subtree.
    await grammarNote('- parent text\n\t- child\n', 0, 9);
    await h.keys.enter();
    expect(await h.getBuffer()).toBe('- parent \n\t- text\n\t- child\n');
    expect(await h.getCursor()).toEqual({ line: 1, ch: 3 });
  });

  it('Enter at item end creates an empty sibling, cursor after marker', async function () {
    await grammarNote('- alpha\n- omega\n', 0, 7);
    await h.keys.enter();
    expect(await h.getBuffer()).toBe('- alpha\n- \n- omega\n');
    expect(await h.getCursor()).toEqual({ line: 1, ch: 2 });
  });

  it('Enter at paragraph end: blank line + cursor; typing creates the sibling', async function () {
    await grammarNote('thought\n\nnext\n', 0, 7);
    await h.keys.enter();
    expect(await h.getBuffer()).toBe('thought\n\n\n\nnext\n');
    expect(await h.getCursor()).toEqual({ line: 2, ch: 0 });

    await h.keys.type('new');
    const doc = parse(await h.getBuffer());
    const texts = [...walkNodes(doc)].map((n) => n.lines.join('|'));
    expect(texts).toContain('new'); // its own sibling node, not part of "thought"
    expect(texts).toContain('thought');
  });

  it('Enter mid-heading-text splits the title into the heading and a new paragraph child', async function () {
    await grammarNote('# Head\n\nBody.\n', 0, 3);
    await h.keys.enter();
    expect(await h.getBuffer()).toBe('# H\n\nead\n\nBody.\n');
    expect(await h.getCursor()).toEqual({ line: 2, ch: 0 });

    const doc = parse(await h.getBuffer());
    const head = doc.children[0]!;
    expect(head.lines[0]).toBe('# H');
    expect(head.children.map((c) => c.lines[0])).toEqual(['ead', 'Body.']);
  });

  it('Enter at the end of a heading widens the gap; typed text becomes a child paragraph', async function () {
    await grammarNote('# Head\n\nBody.\n', 0, 6);
    await h.keys.enter();
    expect(await h.getBuffer()).toBe('# Head\n\n\n\nBody.\n');
    expect(await h.getCursor()).toEqual({ line: 2, ch: 0 });

    await h.keys.type('note');
    const doc = parse(await h.getBuffer());
    const head = doc.children[0]!;
    expect(head.lines[0]).toBe('# Head');
    expect(head.children.some((c) => c.lines[0] === 'note')).toBe(true);
  });

  it('Enter mid-title of a setext heading splits it, underline stays with the heading', async function () {
    await grammarNote('Hello world\n====\n', 0, 6);
    await h.keys.enter();
    expect(await h.getBuffer()).toBe('Hello \n====\nworld\n');

    const doc = parse(await h.getBuffer());
    const head = doc.children[0]!;
    expect(head.setext).toBe(true);
    expect(head.lines).toEqual(['Hello ', '====']);
    expect(head.children.map((c) => c.lines[0])).toEqual(['world']);
  });

  it('Shift+Enter: aligned continuation, still one node under structural ops', async function () {
    await grammarNote('- note text\n- z\n', 0, 6);
    await h.keys.shiftEnter();
    expect(await h.getBuffer()).toBe('- note\n   text\n- z\n');
    const doc = parse(await h.getBuffer());
    expect(doc.children[0]!.lines).toEqual(['- note', '   text']);

    // A structural op treats item + continuation as one node.
    await h.setCursor(0, 2);
    await h.keys.moveNodeDown();
    expect(await h.getBuffer()).toBe('- z\n- note\n   text\n');
  });

  it('atom interiors behave stock; whole-fence ops from the first line', async function () {
    await grammarNote('- host\n\n```\ncode\n```\n', 3, 2);
    await h.keys.tab(); // inside the fence: stock tab insertion
    const inside = await h.getBuffer();
    expect(inside).not.toBe('- host\n\n```\ncode\n```\n');
    expect(inside).toContain('```'); // fence intact
    expect(await h.noticeTexts()).toEqual([]);

    await h.keys.undo();
    expect(await h.getBuffer()).toBe('- host\n\n```\ncode\n```\n');

    await h.setCursor(2, 0); // fence first line: whole-fence indent
    await h.keys.tab();
    const doc = parse(await h.getBuffer());
    const host = doc.children[0]!;
    expect(host.lines[0]).toBe('- host');
    expect(host.children.some((c) => c.kind === 'code')).toBe(true);
  });

  it('grammar ops are single undo steps; rejections change nothing', async function () {
    await grammarNote('- alpha\n- beta\n', 1, 4);
    await h.keys.tab();
    expect((await h.getBuffer())).not.toBe('- alpha\n- beta\n');
    await h.keys.undo(); // exactly one step back
    expect(await h.getBuffer()).toBe('- alpha\n- beta\n');
  });
});
