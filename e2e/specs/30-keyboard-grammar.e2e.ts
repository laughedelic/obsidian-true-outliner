/**
 * Keyboard grammar with real key events — automates the "Keyboard grammar"
 * checklist of openspec/changes/editor-core/verification.md. Structure-level
 * assertions reuse the plugin's own pure parser on the buffer text.
 */

import { expect } from '@wdio/globals';
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
    // Cursor sits at content start of the moved node.
    const cursor = await h.getCursor();
    const betaLine = indented.split('\n')[1]!;
    expect(cursor.line).toBe(1);
    expect(betaLine.slice(cursor.ch)).toBe('beta');

    await h.keys.shiftTab();
    expect(await h.getBuffer()).toBe('- alpha\n- beta\n');
  });

  it('Alt+Up/Down move nodes with their children; ordered runs renumber', async function () {
    await grammarNote('- a\n\t- a1\n- b\n', 0, 2);
    await h.keys.altDown();
    expect(await h.getBuffer()).toBe('- b\n- a\n\t- a1\n');
    await h.keys.altUp();
    expect(await h.getBuffer()).toBe('- a\n\t- a1\n- b\n');

    await grammarNote('1. one\n2. two\n3. three\n', 1, 3);
    await h.keys.altUp();
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

  it('Enter on a heading: empty line below; typed text becomes a child paragraph', async function () {
    await grammarNote('# Head\n\nBody.\n', 0, 3);
    await h.keys.enter();
    expect(await h.getBuffer()).toBe('# Head\n\n\nBody.\n');
    expect(await h.getCursor()).toEqual({ line: 1, ch: 0 });

    await h.keys.type('note');
    const doc = parse(await h.getBuffer());
    const head = doc.children[0]!;
    expect(head.lines[0]).toBe('# Head');
    expect(head.children.some((c) => c.lines[0] === 'note')).toBe(true);
  });

  it('Shift+Enter: aligned continuation, still one node under structural ops', async function () {
    await grammarNote('- note text\n- z\n', 0, 6);
    await h.keys.shiftEnter();
    expect(await h.getBuffer()).toBe('- note\n   text\n- z\n');
    const doc = parse(await h.getBuffer());
    expect(doc.children[0]!.lines).toEqual(['- note', '   text']);

    // A structural op treats item + continuation as one node.
    await h.setCursor(0, 2);
    await h.keys.altDown();
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
