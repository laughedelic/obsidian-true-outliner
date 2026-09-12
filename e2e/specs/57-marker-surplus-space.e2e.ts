/**
 * The mark on a list marker's surplus whitespace (`SURPLUS_MARKER_SPACE_CLASS`,
 * decorations.ts) and the Backspace that removes the run
 * (`crossesViaChromeDeletion`, classify.ts): a bullet followed by two spaces
 * renders exactly as one followed by one, while its content column sits one
 * further right (docs/research/list-marker-content-column).
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { Key } from 'webdriverio';
import * as h from '../helpers.js';

const NOTE = 'Scratch/marker-surplus.md';
const MARK = '.to-decor-marker-surplus';

function markTitles(lineIndex: number): Promise<string[]> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex, selector) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      const el = lines[lineIndex] as HTMLElement | undefined;
      if (!el) throw new Error(`no .cm-line at index ${lineIndex}`);
      return Array.from(el.querySelectorAll(selector)).map((n) => n.getAttribute('title') ?? '');
    },
    lineIndex,
    MARK,
  );
}

describe('a list marker\'s surplus whitespace', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('is marked on every marker shape, and a one-space marker is not', async function () {
    await h.createNote(NOTE, '- a\n-  b\n1.  c\n- [ ]  d\n-   e\n');
    await h.setOutlineMode(true);
    await h.setCursor(4, 4);

    expect(await h.getLineChildRects(0, MARK)).toHaveLength(0);
    for (const line of [1, 2, 3, 4]) {
      const rects = await h.getLineChildRects(line, MARK);
      expect(rects).toHaveLength(1);
      // A whitespace-only span has to keep its width to be seen at all.
      expect(rects[0]!.width).toBeGreaterThan(0);
    }
    // Two surplus spaces are one mark, not two.
    const twoSpaces = await h.getLineChildRects(4, MARK);
    const oneSpace = await h.getLineChildRects(1, MARK);
    expect(twoSpaces[0]!.width).toBeGreaterThan(oneSpace[0]!.width);
    // The title says what the mark is and what removes it.
    expect((await markTitles(1))[0]).toContain('Backspace');
  });

  it('sits between the gutter and the text, never inside the gutter', async function () {
    // The bullet and its own space fill the gutter as on a one-space line, so
    // the mark begins where a one-space item's text begins, and the text begins
    // where the mark ends: `- ` then the highlight then the text.
    await h.createNote(NOTE, '- a\n-  b\n-    e\n');
    await h.setOutlineMode(true);
    await h.setCursor(2, 6);
    const textLeft = async (line: number): Promise<number> =>
      (await h.getLineChildRects(line, '.cm-list-1:not(.cm-formatting)'))[0]!.left;
    const oneSpaceText = await textLeft(0);
    for (const line of [1, 2]) {
      const [mark] = await h.getLineChildRects(line, MARK);
      expect(mark!.left).toBeCloseTo(oneSpaceText, 0);
      expect(await textLeft(line)).toBeCloseTo(mark!.left + mark!.width, 0);
    }
  });

  it('a press on the mark removes the run and leaves the caret at the content start', async function () {
    await h.createNote(NOTE, '- a\n-    e\n');
    await h.setOutlineMode(true);
    await h.setCursorSettled(0, 3);
    const [mark] = await h.getLineChildRects(1, MARK);
    await h.clickAtPoint(mark!.left + mark!.width / 2, mark!.top + mark!.height / 2);
    await browser.waitUntil(async () => (await h.getBuffer()) === '- a\n- e\n', {
      timeout: 2000,
      timeoutMsg: 'the press did not remove the surplus',
    });
    // The caret is where the text begins, not where the press landed, and the
    // trailing mouse events of the press did not move it.
    await browser.pause(150);
    expect(await h.getCursor()).toEqual({ line: 1, ch: 2 });
    expect(await h.getLineChildRects(1, MARK)).toHaveLength(0);
    // One undo step.
    await h.keys.undo();
    expect(await h.getBuffer()).toBe('- a\n-    e\n');
  });

  it('is an outline-mode decoration', async function () {
    await h.createNote(NOTE, '-  b\n');
    await h.setOutlineMode(false);
    expect(await h.getLineChildRects(0, MARK)).toHaveLength(0);
    await h.setOutlineMode(true);
    expect(await h.getLineChildRects(0, MARK)).toHaveLength(1);
  });

  it('Backspace at the content start removes the surplus, and only then merges', async function () {
    await h.createNote(NOTE, '- a\n-  b\n');
    await h.setOutlineMode(true);
    // Column 3 is `b`'s content start; the run's inner column is not
    // addressable, so a caret set inside the run lands there.
    await h.setCursorSettled(1, 1);
    expect(await h.getCursor()).toEqual({ line: 1, ch: 3 });

    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('- a\n- b\n');
    expect(await h.getCursor()).toEqual({ line: 1, ch: 2 });
    expect(await h.getLineChildRects(1, MARK)).toHaveLength(0);

    // The same keypress on the one-space marker is the merge it always was.
    await browser.keys(Key.Backspace);
    expect(await h.getBuffer()).toBe('- ab\n');
  });

  it('the shape Cmd-Left dispatches, a select to column 0, resolves to the content start', async function () {
    // CodeMirror's `cursorLineBoundaryLeft` dispatches a `select` transaction
    // to the visual row's start; the placement filter then resolves the
    // column, which is what puts the caret at the run's end rather than inside
    // it. Dispatched directly, since the key itself is bound on macOS only.
    await h.createNote(NOTE, '-  b\n');
    await h.setOutlineMode(true);
    await h.setCursorSettled(0, 4);
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as any).cm;
      cm.dispatch({ selection: { anchor: 0 }, scrollIntoView: true, userEvent: 'select' });
    });
    expect(await h.getCursor()).toEqual({ line: 0, ch: 3 });
  });
});
