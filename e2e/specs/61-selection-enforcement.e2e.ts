/**
 * Phase B e2e (openspec/changes/outline-selection-enforcement, node-
 * selection-enforcement spec): node-boundary selection escalation, driven
 * through real pointer and keyboard input — not `Editor.setSelection`,
 * which would bypass the very `select.pointer`/keyboard userEvent path
 * this capability exists to enforce.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { Key } from 'webdriverio';
import * as h from '../helpers.js';

const NOTE = 'Scratch/selection.md';

async function outlineNote(content: string): Promise<void> {
  await h.createNote(NOTE, content);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

describe('node-selection-enforcement: Phase B', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('forward mouse drag crossing a boundary escalates to both paragraphs in full', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-mouse-drag test: no such gesture under mobile emulation (see IS_MOBILE_RUN)
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    await h.mouseDragSelect({ line: 0, ch: 6 }, { line: 2, ch: 6 });
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    expect(sel.head).toEqual({ line: 2, ch: 'Second paragraph.'.length });
  });

  it('backward mouse drag crossing a boundary escalates with head at the start side', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-mouse-drag test: no such gesture under mobile emulation (see IS_MOBILE_RUN)
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    await h.mouseDragSelect({ line: 2, ch: 6 }, { line: 0, ch: 6 });
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 2, ch: 'Second paragraph.'.length });
    expect(sel.head).toEqual({ line: 0, ch: 0 });
  });

  it('within-node mouse drag stays native (no escalation)', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-mouse-drag test: no such gesture under mobile emulation (see IS_MOBILE_RUN)
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    await h.mouseDragSelect({ line: 0, ch: 2 }, { line: 0, ch: 8 });
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 2 });
    expect(sel.head).toEqual({ line: 0, ch: 8 });
  });

  it('double-click word selection is untouched', async function () {
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    await h.doubleClickAt(0, 2);
    const sel = await h.getSelection();
    expect(sel.anchor.line).toBe(0);
    expect(sel.head.line).toBe(0);
    expect(sel.anchor.ch).not.toBe(sel.head.ch); // a real word got selected
  });

  it('Shift+ArrowDown crossing a boundary escalates both nodes in full', async function () {
    const md = 'First.\n\nSecond.\n';
    await outlineNote(md);
    await h.setCursor(0, 3);
    // Down into the next node, then extend far enough right to guarantee
    // the head lands past the node's own text (clamped by CM6 to EOL).
    await browser.keys([Key.Shift, Key.ArrowDown]);
    await browser.keys([Key.Shift, Key.ArrowDown]);
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    expect(sel.head.line).toBe(2);
    expect(sel.head.ch).toBe('Second.'.length);
  });

  it('selection leaving a heading escalates to the heading\'s entire subtree', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-mouse-drag test: no such gesture under mobile emulation (see IS_MOBILE_RUN)
    const md = '# Head\n\nBody one.\n\nBody two.\n';
    await outlineNote(md);
    // Anchor inside the heading text, head inside the section body.
    await h.mouseDragSelect({ line: 0, ch: 2 }, { line: 4, ch: 3 });
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    expect(sel.head).toEqual({ line: 4, ch: 'Body two.'.length });
  });

  it('live drag stability: each pointer update along a multi-step drag stays escalated, no flicker', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-mouse-drag test: no such gesture under mobile emulation (see IS_MOBILE_RUN)
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    // A drag with several intermediate pointer-move ticks; the FINAL
    // released selection is the assertable outcome (intermediate frames
    // aren't independently observable from outside the browser process),
    // but a jittery/flickering implementation would frequently leave the
    // selection un-escalated at release — this is a regression net for
    // that failure mode, run a few times for stability confidence.
    for (let i = 0; i < 3; i++) {
      await h.setCursor(0, 0);
      await h.mouseDragSelect({ line: 0, ch: 3 }, { line: 2, ch: 3 }, 6);
      const sel = await h.getSelection();
      expect(sel.anchor).toEqual({ line: 0, ch: 0 });
      expect(sel.head).toEqual({ line: 2, ch: 'Second paragraph.'.length });
    }
  });

  it('Select All with frontmatter is stock — spans preamble and all nodes, out of jurisdiction', async function () {
    const md = '---\nkey: value\n---\n\n# Head\n\nBody.\n';
    const offNote = 'Scratch/select-all-off.md';
    await h.createNote(offNote, md);
    await h.setCursor(4, 0);
    await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Ctrl, 'a']);
    const offSel = await h.getSelection();

    await outlineNote(md);
    await h.setCursor(4, 0);
    await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Ctrl, 'a']);
    const sel = await h.getSelection();
    // Whatever stock (off-mode) Select All does with frontmatter present,
    // outline mode must do exactly the same (D5: out of jurisdiction).
    expect(sel).toEqual(offSel);
  });

  it('off-mode drag selection is native (byte-for-byte stock, no escalation)', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-mouse-drag test: no such gesture under mobile emulation (see IS_MOBILE_RUN)
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await h.createNote(NOTE, md);
    expect(await h.isOutlineMode(NOTE)).toBe(false);
    await h.mouseDragSelect({ line: 0, ch: 6 }, { line: 2, ch: 6 });
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 6 });
    expect(sel.head).toEqual({ line: 2, ch: 6 });
  });

  it('a programmatic mid-node-crossing selection restore is untouched', async function () {
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    // Editor.setSelection dispatches with no userEvent → programmatic,
    // never escalated, even though the range crosses a node boundary.
    await h.setSelection({ line: 0, ch: 6 }, { line: 2, ch: 6 });
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 6 });
    expect(sel.head).toEqual({ line: 2, ch: 6 });
  });

  it('multi-range selection escalates uniformly: a crossing range pulls within-node ranges up to whole nodes', async function () {
    const md = 'One.\n\nTwo.\n\nThree.\n\nFour.\n';
    await outlineNote(md);
    // Range 1: within "One." — under the uniform rule (D4 amendment) it
    // must escalate to its own node's whole subtree once range 2 escalates.
    // Range 2: crosses the "Three."/"Four." boundary. Dispatched as one
    // real `select`-annotated transaction — see dispatchSelectOnlyRanges's
    // doc comment for why this replaces a simulated add-range gesture here.
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 3 } },
      { anchor: { line: 4, ch: 2 }, head: { line: 6, ch: 2 } },
    ]);

    const ranges = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const doc = cm.state.doc;
      const toPos = (offset: number) => {
        const line = doc.lineAt(offset);
        return { line: line.number - 1, ch: offset - line.from };
      };
      return cm.state.selection.ranges.map((r: { anchor: number; head: number }) => ({
        anchor: toPos(r.anchor),
        head: toPos(r.head),
      }));
    });

    expect(ranges.length).toBe(2);
    const firstRange = ranges.find((r: any) => r.anchor.line === 0 || r.head.line === 0);
    const secondRange = ranges.find((r: any) => r.anchor.line === 4 || r.head.line === 4);
    expect(firstRange).toBeDefined();
    expect(firstRange.anchor).toEqual({ line: 0, ch: 0 });
    expect(firstRange.head).toEqual({ line: 0, ch: 'One.'.length });
    expect(secondRange).toBeDefined();
    expect(secondRange.anchor).toEqual({ line: 4, ch: 0 });
    expect(secondRange.head).toEqual({ line: 6, ch: 'Four.'.length });
  });

  it('all-within-node multi-range selection stays byte-for-byte native', async function () {
    const md = 'One.\n\nTwo.\n\nThree.\n\nFour.\n';
    await outlineNote(md);
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 3 } },
      { anchor: { line: 2, ch: 0 }, head: { line: 2, ch: 2 } },
    ]);
    const ranges = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const doc = cm.state.doc;
      const toPos = (offset: number) => {
        const line = doc.lineAt(offset);
        return { line: line.number - 1, ch: offset - line.from };
      };
      return cm.state.selection.ranges.map((r: { anchor: number; head: number }) => ({
        anchor: toPos(r.anchor),
        head: toPos(r.head),
      }));
    });
    expect(ranges).toEqual([
      { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 3 } },
      { anchor: { line: 2, ch: 0 }, head: { line: 2, ch: 2 } },
    ]);
  });

  it('dragging past a node\'s end onto its gap line selects exactly that node whole', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-mouse-drag test: no such gesture under mobile emulation (see IS_MOBILE_RUN)
    const md = 'First paragraph.\n\nSecond paragraph.\n';
    await outlineNote(md);
    // Drag from mid-node down onto the blank line below it — short of the
    // next node. The gap-line trigger (D4 amendment) escalates to just this
    // node; expand-only keeps the head where the user dragged it.
    await h.mouseDragSelect({ line: 0, ch: 6 }, { line: 1, ch: 0 });
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    expect(sel.head).toEqual({ line: 1, ch: 0 });
  });

  it('Select All without frontmatter is byte-identical to stock (expand-only)', async function () {
    const md = 'Alpha.\n\nBeta.\n';
    const offNote = 'Scratch/select-all-nofm-off.md';
    await h.createNote(offNote, md);
    await h.setCursor(0, 0);
    await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Ctrl, 'a']);
    const offSel = await h.getSelection();

    await outlineNote(md);
    await h.setCursor(0, 0);
    await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Ctrl, 'a']);
    const sel = await h.getSelection();
    expect(sel).toEqual(offSel);
    // And concretely: the trailing newline stays selected (the head sits on
    // the document's final empty line, not pulled back to "Beta."'s end).
    expect(sel.head).toEqual({ line: 3, ch: 0 });
  });
});
