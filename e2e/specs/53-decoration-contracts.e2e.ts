/**
 * Direct e2e coverage for two spec requirements that previously had only
 * indirect evidence (openspec/changes/outline-decorations tasks.md §4,
 * "traceability gaps found during the 0.6 backfill"):
 *
 * - 4.1 Nested per-cell editor decoration state: Obsidian renders an
 *   actively-edited table cell as its own separate CM6 instance mounted
 *   inside the table widget's DOM, and `registerEditorExtension` applies
 *   this plugin's whole extension there too. The `isNestedEditor()`
 *   DOM-ancestry gate (decorations.ts) is what keeps a bare cell text line
 *   from classifying as a top-level paragraph and picking up indentation +
 *   a marker inside the cell. Until now the only evidence was indirect (a
 *   marker-visibility test's flake traced to this leak); this asserts it
 *   head-on, with computed styles rather than DOM attributes.
 *
 * - 4.2 The non-mutation contract: a decoration recompute (triggered here
 *   by mode toggles, the recompute path with no document change of its
 *   own) must have no transaction/cursor/undo-stack side effect. Asserted
 *   by snapshotting the buffer and cursor across a double toggle, then
 *   undoing ONCE and checking a prior real edit reverts cleanly — if the
 *   recompute had pushed any change-bearing transaction, that single undo
 *   would consume the interposed entry instead of the edit.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

async function ensureOutlineMode(notePath: string): Promise<void> {
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

describe('outline decorations: contracts (nested editors, non-mutation)', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('a nested per-cell table editor carries no decoration state at all (isNestedEditor gate)', async function () {
    const note = 'Scratch/contracts-nested-editor.md';
    // A heading above the table so the note has real outline structure —
    // the table sits at depth 1, so a leaked decoration would be visibly
    // nonzero (depth indentation + marker gutter), not a lucky 0.
    await h.createNote(note, '# Section\n\n| a | b |\n| --- | --- |\n| word | 2 |\n');
    await ensureOutlineMode(note);
    await browser.pause(150);

    // Click into a cell to make Obsidian mount its nested editor.
    await browser.$('.markdown-source-view .cm-table-widget td').click();
    await h.waitForContentChildCount('.cm-embed-block .cm-editor', 1);

    const nested = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const editor = cm.contentDOM.querySelector('.cm-embed-block .cm-editor') as HTMLElement;
      const line = editor.querySelector('.cm-line') as HTMLElement | null;
      const cs = line ? getComputedStyle(line) : null;
      return {
        lineFound: line !== null,
        classes: line ? Array.from(line.classList) : [],
        // Computed styles, not class/attribute checks — the postmortem's
        // false-confidence lesson: prove what actually rendered.
        paddingLeft: cs?.paddingLeft ?? null,
        marginLeft: cs?.marginLeft ?? null,
        markers: editor.querySelectorAll('.to-decor-marker-icon').length,
      };
    });

    expect(nested.lineFound).toBe(true);
    expect(nested.markers).toBe(0);
    expect(nested.classes.filter((c) => c.startsWith('to-decor'))).toEqual([]);
    expect(nested.paddingLeft).toBe('0px');
    expect(nested.marginLeft).toBe('0px');

    // The OUTER note's own decorations must still be active throughout —
    // this test is about the leak, not about decorations shutting off.
    expect((await h.getLineChildRects(0, '.to-decor-marker-icon')).length).toBe(1);
  });

  it('a decoration recompute mutates nothing: buffer, cursor, and undo stack all unchanged', async function () {
    const note = 'Scratch/contracts-non-mutation.md';
    const original = '# Heading\n\nA paragraph.\n';
    await h.createNote(note, original);
    await ensureOutlineMode(note);
    await browser.pause(150);

    // One real edit first, so the undo stack has exactly one known entry
    // on top.
    await h.setCursor(2, 12); // end of "A paragraph."
    await h.keys.type(' xyz');
    await browser.pause(150);
    const editedBuffer = await h.getBuffer();
    expect(editedBuffer).toContain('A paragraph. xyz');

    const cursorBefore = await h.getCursor();

    // Two full recomputes (off → on), the exact path with no document
    // change of its own — only the cursor-nudge dispatch.
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode off');
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
    await browser.pause(150);

    // No document mutation and no cursor movement from the recomputes.
    expect(await h.getBuffer()).toBe(editedBuffer);
    expect(await h.getCursor()).toEqual(cursorBefore);

    // No undo-stack side effect: a SINGLE undo reverts the real edit. If
    // any recompute had dispatched a change-bearing (history-recorded)
    // transaction, this undo would consume that entry instead and " xyz"
    // would survive.
    await h.keys.undo();
    await browser.pause(150);
    expect(await h.getBuffer()).toBe(original);
  });
});
