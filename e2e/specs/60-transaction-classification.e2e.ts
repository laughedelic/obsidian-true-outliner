/**
 * Phase A evidence suite (openspec/changes/outline-selection-enforcement):
 * falsifiable checks for the choke-point assumptions the enforcement
 * architecture rests on (design.md D1-D8) — every mutation path flows
 * through the transactionFilter funnel, programmatic/remote transactions
 * are reliably distinguished and passed through untouched, nested per-cell
 * editors are safe by construction, classification stays within its
 * latency budget, and the document is never altered by this layer. These
 * are permanent regression tests, not one-off manual observations — see
 * D8 and tasks.md 3.8.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { Key } from 'webdriverio';
import * as h from '../helpers.js';

const NOTE = 'Scratch/classification.md';
const PRIMARY_MOD = process.platform === 'darwin' ? Key.Command : Key.Ctrl;

async function outlineNote(content: string): Promise<void> {
  await h.createNote(NOTE, content);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
  await h.resetStats();
}

describe('transaction classification: Phase A evidence', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('coverage matrix: every mutation path is observed by the funnel with the expected class', async function () {
    // --- typing → within-node-edit ---
    await outlineNote('First paragraph.\n\nSecond paragraph.\n');
    await h.setCursor(0, 5);
    await h.keys.type('X');
    let snap = await h.getStats();
    expect(snap.counts['within-node-edit']).toBeGreaterThan(0);

    // --- mouse drag selection → selection-only ---
    await outlineNote('First paragraph.\n\nSecond paragraph.\n');
    await h.setCursor(0, 0);
    await h.mouseDragSelect({ line: 0, ch: 2 }, { line: 0, ch: 8 });
    await browser.pause(50);
    snap = await h.getStats();
    expect(snap.counts['selection-only']).toBeGreaterThan(0);

    // --- keyboard selection → selection-only ---
    await outlineNote('First paragraph.\n\nSecond paragraph.\n');
    await h.setCursor(0, 0);
    await browser.keys([Key.Shift, Key.ArrowRight]);
    await browser.pause(50);
    snap = await h.getStats();
    expect(snap.counts['selection-only']).toBeGreaterThan(0);

    // --- paste → an edit class (within-node, since pasted into one node) ---
    await outlineNote('First paragraph.\n\nSecond paragraph.\n');
    await h.setCursor(0, 5);
    await h.pasteText('PASTED');
    await browser.pause(50);
    snap = await h.getStats();
    expect(snap.counts['within-node-edit']).toBeGreaterThan(0);
    expect(await h.getBuffer()).toContain('PASTED');

    // --- programmatic edit (setValue) → programmatic ---
    await outlineNote('First paragraph.\n\nSecond paragraph.\n');
    await h.setBuffer('Replaced entirely.\n');
    snap = await h.getStats();
    expect(snap.counts.programmatic).toBeGreaterThan(0);

    // --- programmatic edit (external Vault.process) → programmatic ---
    // Phase A finding (tasks.md 3.8, see classify.ts's isProgrammatic doc
    // comment): confirmed live that this path dispatches a real transaction
    // annotated userEvent "set" — not annotation-less as D3 originally
    // hypothesized. classify.ts recognizes it explicitly.
    await outlineNote('First paragraph.\n\nSecond paragraph.\n');
    await h.resetStats();
    await h.processFileExternally(NOTE, 'Externally rewritten.\n');
    await browser.waitUntil(async () => (await h.getBuffer()) === 'Externally rewritten.\n', {
      timeout: 4000,
      timeoutMsg: 'external edit never reached the open editor',
    });
    snap = await h.getStats();
    expect(snap.counts.programmatic).toBeGreaterThan(0);
    expect(snap.counts['boundary-crossing-edit']).toBe(0);
  });

  it('boundary-crossing edits are counted (not rewritten) — headline Phase A metric', async function () {
    await outlineNote('First paragraph.\n\nSecond paragraph.\n');
    // Select from mid-first-paragraph through mid-second-paragraph, then
    // delete — a genuine boundary-crossing change range.
    await h.setSelection({ line: 0, ch: 6 }, { line: 2, ch: 6 });
    await browser.keys(Key.Backspace);
    const snap = await h.getStats();
    expect(snap.counts['boundary-crossing-edit']).toBeGreaterThan(0);
  });

  it('setValue-style and external replacements are programmatic and byte-identical', async function () {
    await outlineNote('Original content.\n');
    await h.setBuffer('Completely different.\n');
    expect(await h.getBuffer()).toBe('Completely different.\n'); // untouched by the filter

    await h.processFileExternally(NOTE, 'From outside.\n');
    await browser.waitUntil(async () => (await h.getBuffer()) === 'From outside.\n', { timeout: 4000 });
    expect(await h.getBuffer()).toBe('From outside.\n');
  });

  it('undo restores state exactly and never reaches the filter at all', async function () {
    // Phase A finding (tasks.md 3.8): confirmed live that Obsidian's undo
    // does not dispatch through the CM6 transaction pipeline this filter
    // observes at all (zero classifications recorded, not even
    // "programmatic") — restoring prior editor state some other way. An
    // even stronger safety guarantee than D3's "classified programmatic,
    // never re-normalized": there is no transaction here to touch.
    await outlineNote('Alpha.\n\nBeta.\n');
    await h.setCursor(0, 6); // end of "Alpha."
    await h.keys.type(' more');
    const edited = await h.getBuffer();
    expect(edited).toContain('Alpha. more');

    await h.resetStats();
    await h.keys.undo();
    expect(await h.getBuffer()).toBe('Alpha.\n\nBeta.\n');
    const snap = await h.getStats();
    expect(Object.values(snap.counts).every((n) => n === 0)).toBe(true);
  });

  it('grammar/structural-command transactions are plugin-own and byte-identical to the grammar\'s own output', async function () {
    await outlineNote('- alpha\n- beta\n');
    await h.setCursor(1, 4);
    await h.resetStats();
    await h.keys.tab();
    // Same assertion 30-keyboard-grammar.e2e.ts makes for this exact
    // scenario — the filter must not change what the grammar produced.
    const buf = await h.getBuffer();
    expect(buf).not.toBe('- alpha\n- beta\n');
    const snap = await h.getStats();
    expect(snap.counts['plugin-own']).toBeGreaterThan(0);
  });

  it('nested per-cell table editor: typing, selecting, and dragging inside a cell has no enforcement effect', async function () {
    const note = 'Scratch/classification-nested.md';
    await h.createNote(note, '# Section\n\n| a | b |\n| --- | --- |\n| word | two |\n');
    if (!(await h.isOutlineMode(note))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    await browser.pause(150);
    await h.resetStats();

    await browser.$('.markdown-source-view .cm-table-widget td').click();
    await h.waitForContentChildCount('.cm-embed-block .cm-editor', 1);

    // Type inside the cell — must not disturb the outer note's structure,
    // and (D6) the state-level filter has no way to distinguish this from
    // a real top-level paragraph except degeneracy: a one-block cell
    // document can only ever classify within-node, never boundary-crossing.
    await browser.keys('!');
    await browser.pause(100);

    const cellText = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const editor = cm.contentDOM.querySelector('.cm-embed-block .cm-editor') as HTMLElement;
      return editor.querySelector('.cm-line')?.textContent ?? '';
    });
    expect(cellText).toBe('word!');

    const snap = await h.getStats();
    expect(snap.counts['boundary-crossing-edit']).toBe(0);
    // The outer note's own paragraph/heading structure must be untouched.
    expect(await h.getBuffer()).toContain('# Section');
  });

  it('a boundary-crossing edit sequence is byte-identical whether outline mode is on or off', async function () {
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    const onNote = 'Scratch/mutation-on.md';
    const offNote = 'Scratch/mutation-off.md';

    await h.createNote(onNote, md);
    if (!(await h.isOutlineMode(onNote))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    await h.setSelection({ line: 0, ch: 6 }, { line: 2, ch: 6 });
    await browser.keys(Key.Backspace);
    const onResult = await h.getBuffer();

    await h.createNote(offNote, md);
    expect(await h.isOutlineMode(offNote)).toBe(false);
    await h.setSelection({ line: 0, ch: 6 }, { line: 2, ch: 6 });
    await browser.keys(Key.Backspace);
    const offResult = await h.getBuffer();

    expect(onResult).toBe(offResult);
  });

  it('a decoration/classification recompute has no undo-stack side effect', async function () {
    await outlineNote('Alpha.\n\nBeta.\n');
    await h.setCursor(0, 5);
    await h.keys.type(' more');
    const edited = await h.getBuffer();

    // Several selection-only and within-node transactions (none of which
    // may push a history entry of their own).
    await h.setCursor(2, 2);
    await browser.keys([Key.Shift, Key.ArrowRight]);
    await h.setCursor(0, 0);

    await h.keys.undo(); // must revert exactly the " more" edit, one step
    expect(await h.getBuffer()).toBe('Alpha.\n\nBeta.\n');
    void edited;
  });

  it('performance: classification stays within budget on a ~2000-line stress note', async function () {
    const lines: string[] = [];
    for (let i = 0; i < 400; i++) {
      lines.push(`## Section ${i}`, '', `Paragraph text for section ${i}, some words here.`, '');
    }
    const stress = lines.join('\n') + '\n';
    await outlineNote(stress);
    await browser.pause(200); // let the initial parse/cache settle

    // Drive typing across several sections.
    for (let i = 0; i < 20; i++) {
      await h.setCursor(i * 4 + 2, 5);
      await h.keys.type('x');
    }
    // Drive selection across several sections (including boundary-crossing
    // drags, which also exercise escalation).
    for (let i = 0; i < 10; i++) {
      await h.mouseDragSelect({ line: i * 40 + 2, ch: 2 }, { line: i * 40 + 2, ch: 8 });
    }

    const snap = await h.getStats();
    for (const cls of Object.keys(snap.timing)) {
      const t = snap.timing[cls]!;
      if (t.count === 0) continue;
      expect(t.median).toBeLessThanOrEqual(1); // budget: median ≤ 1ms (D7)
      expect(t.p95).toBeLessThanOrEqual(8); // budget: p95 ≤ 8ms (D7)
    }
  });
});
