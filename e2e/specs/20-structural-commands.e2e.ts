/**
 * Structural commands by command id — automates the "Structural commands"
 * checklist of openspec/changes/editor-core/verification.md.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { REJECTION_MESSAGES } from '../../src/plugin/messages';

/** Create a scratch note with outline mode on and the cursor placed. */
async function outlineNote(content: string, line: number, ch: number): Promise<void> {
  await h.createNote('Scratch/structural.md', content);
  if (!(await h.isOutlineMode('Scratch/structural.md'))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
  await h.setCursor(line, ch);
}

describe('structural commands', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('indent paragraph under paragraph → list item; outdent restores; one undo step each', async function () {
    const original = 'First.\n\nSecond.\n';
    await outlineNote(original, 2, 3);

    await h.runCommand('indent-node');
    expect(await h.getBuffer()).toBe('First.\n\n- Second.\n');
    expect(await h.getCursor()).toEqual({ line: 2, ch: 2 }); // after "- "

    await h.runCommand('outdent-node');
    expect(await h.getBuffer()).toBe(original);

    // One undo step each way: undo restores the indented text, then the original.
    await h.keys.undo();
    expect(await h.getBuffer()).toBe('First.\n\n- Second.\n');
    await h.keys.undo();
    expect(await h.getBuffer()).toBe(original);
  });

  it('heading demote/promote shifts subtree markers; links still resolve', async function () {
    await h.createNote('Scratch/linker.md', 'See [[structural#Beta]]\n');
    const original = '# Alpha\n\nintro\n\n## Beta\n\nbody line\n';
    await outlineNote(original, 4, 4);

    await h.runCommand('indent-node'); // demote
    expect(await h.getBuffer()).toBe('# Alpha\n\nintro\n\n### Beta\n\nbody line\n');

    // The [[structural#Beta]] link elsewhere still resolves via metadata.
    await h.saveActiveFile();
    await browser.waitUntil(
      async () =>
        browser.executeObsidian(({ app }) => {
          const dest = app.metadataCache.getFirstLinkpathDest('structural', 'Scratch/linker.md');
          if (!dest) return false;
          const headings = app.metadataCache.getFileCache(dest)?.headings ?? [];
          return headings.some((hd) => hd.heading === 'Beta' && hd.level === 3);
        }),
      { timeout: 4000, timeoutMsg: 'metadata cache never saw the demoted heading' },
    );

    await h.runCommand('outdent-node'); // promote back
    expect(await h.getBuffer()).toBe(original);
  });

  it('skip-level outdent: first re-levels in place, second moves to sibling', async function () {
    await outlineNote('# y\n\n### x\n\nbody\n', 2, 4);

    await h.runCommand('outdent-node');
    expect(await h.getBuffer()).toBe('# y\n\n## x\n\nbody\n');

    await h.setCursor(2, 3);
    await h.runCommand('outdent-node');
    expect(await h.getBuffer()).toBe('# y\n\n# x\n\nbody\n');
  });

  it('move up/down: heading sections swap wholesale', async function () {
    const original = '## A\n\na body\n\n## B\n\nb body\n';
    await outlineNote(original, 4, 3);

    await h.runCommand('move-node-up');
    expect(await h.getBuffer()).toBe('## B\n\nb body\n\n## A\n\na body\n');

    await h.runCommand('move-node-down');
    expect(await h.getBuffer()).toBe(original);
  });

  it('move up/down: ordered list runs renumber', async function () {
    await outlineNote('1. one\n2. two\n3. three\n', 1, 3);

    await h.runCommand('move-node-up');
    expect(await h.getBuffer()).toBe('1. two\n2. one\n3. three\n');

    await h.runCommand('move-node-down');
    expect(await h.getBuffer()).toBe('1. one\n2. two\n3. three\n');
  });

  it('each rejection cue fires with the right message; document untouched', async function () {
    const cases: { name: string; content: string; line: number; command: string; message: string }[] = [
      {
        name: 'h6 indent',
        content: '###### deep\n',
        line: 0,
        command: 'indent-node',
        message: REJECTION_MESSAGES['at-h6-bound'],
      },
      {
        name: 'h1 outdent',
        content: '# top\n',
        line: 0,
        command: 'outdent-node',
        message: REJECTION_MESSAGES['at-h1-bound'],
      },
      {
        name: 'top-level outdent',
        content: 'para\n',
        line: 0,
        command: 'outdent-node',
        message: REJECTION_MESSAGES['at-top-level'],
      },
      {
        name: 'indent with nothing above',
        content: 'Only.\n',
        line: 0,
        command: 'indent-node',
        message: REJECTION_MESSAGES['no-previous-sibling'],
      },
      {
        name: 'indent after code fence',
        content: '```\ncode\n```\n\npara\n',
        line: 4,
        command: 'indent-node',
        message: REJECTION_MESSAGES['not-expressible-under-target'],
      },
      {
        name: 'outdent of section content',
        content: '# h\n\npara\n',
        line: 2,
        command: 'outdent-node',
        message: REJECTION_MESSAGES['not-expressible-under-target'],
      },
      {
        name: 'cross-kind move',
        content: '- item\n\n# h\n\nbody\n',
        line: 0,
        command: 'move-node-down',
        message: REJECTION_MESSAGES['cannot-reorder-across-heading-boundary'],
      },
    ];

    for (const c of cases) {
      await outlineNote(c.content, c.line, 1);
      await h.runCommand(c.command);
      await h.waitForNotice(c.message);
      expect(await h.getBuffer()).toBe(c.content); // untouched
      await h.dismissNotices();
    }
  });

  it('multi-line selection: command uses the cursor head line, no crash', async function () {
    await outlineNote('First.\n\nSecond.\n\nThird.\n', 0, 0);
    await h.setSelection({ line: 0, ch: 0 }, { line: 2, ch: 3 });

    await h.runCommand('indent-node');
    // Head is on "Second." → that node indents; the rest is untouched.
    expect(await h.getBuffer()).toBe('First.\n\n- Second.\n\nThird.\n');
  });
});
