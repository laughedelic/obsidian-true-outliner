/**
 * A marker with no whitespace after it is not a marker
 * (docs/research/marker-without-trailing-space): the mode Live Preview runs
 * gates every list token on a marker followed by whitespace, so the line it
 * draws is ordinary text — and the outline reads it the same way, as a
 * paragraph carrying the block marker every other paragraph carries.
 *
 * The space is what declares the intent to make an item, and the line does not
 * move until it arrives. What DOES move is the list around one that lands
 * inside it: the marker line ends the list and the items below attach to the
 * paragraph it makes, which is the feedback the shape is for.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'Scratch/bare-marker.md';
const BULLET = '.list-bullet';
const OUR_MARKER = '.to-decor-marker-icon';
const LIST_LINE = 'to-decor-list';

/** The class list and the glyph start of the Nth rendered line. */
function lineShape(lineIndex: number) {
  return browser.executeObsidian(({ app, obsidian }, lineIndex) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    const cm = (view.editor as any).cm;
    const el = cm.contentDOM.querySelectorAll(':scope > .cm-line')[lineIndex] as
      | HTMLElement
      | undefined;
    if (!el) throw new Error(`no .cm-line at index ${lineIndex}`);
    const contentLeft = cm.contentDOM.getBoundingClientRect().left;
    const range = document.createRange();
    range.selectNodeContents(el);
    return {
      cls: el.className,
      glyphsLeft: +(range.getBoundingClientRect().left - contentLeft).toFixed(2),
    };
  }, lineIndex);
}

describe('a marker with no whitespace after it', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('renders as a paragraph, with the marker every paragraph carries', async function () {
    await h.createNote(NOTE, '- foo\n-\n- bar\n');
    await h.setOutlineMode(true);

    // The items keep Obsidian's own bullet; the bare marker has none, which is
    // Obsidian's own reading of that line and now ours too.
    expect(await h.getLineChildRects(0, BULLET)).toHaveLength(1);
    expect(await h.getLineChildRects(2, BULLET)).toHaveLength(1);
    expect(await h.getLineChildRects(1, BULLET)).toHaveLength(0);

    // It is not a list line to us either, and it carries a paragraph's own
    // block marker rather than being left with no node chrome at all.
    expect((await lineShape(0)).cls).toContain(LIST_LINE);
    expect((await lineShape(1)).cls).not.toContain(LIST_LINE);
    expect(await h.getLineChildRects(1, OUR_MARKER)).toHaveLength(1);
  });

  it('does not move until the space declares the intent', async function () {
    await h.createNote(NOTE, '- foo\n\nbar\n');
    await h.setOutlineMode(true);
    await h.setCursorSettled(1, 0);

    const blank = await lineShape(1);
    await browser.keys('-');
    const dash = await lineShape(1);
    // Typing the dash alone changes nothing about the line's shape: no list
    // treatment, and the glyphs stay on the column they were already on. The
    // reading that made this an item shifted the line right and drew a bullet,
    // then took both back on the next keystroke of `-42`.
    expect(dash.cls).not.toContain(LIST_LINE);
    expect(dash.glyphsLeft).toBeCloseTo(blank.glyphsLeft, 1);

    await browser.keys('4');
    const digit = await lineShape(1);
    expect(await h.getBuffer()).toBe('- foo\n-4\nbar\n');
    expect(digit.cls).not.toContain(LIST_LINE);
    expect(digit.glyphsLeft).toBeCloseTo(blank.glyphsLeft, 1);
  });

  it('says so in the outline when one lands inside a list', async function () {
    // The feedback the shape is for. A marker line inside a list ends it, and
    // the items below attach to the paragraph it makes — one level in, under a
    // paragraph's block marker — so an imported note says where it is
    // unfinished instead of concealing it. The space puts the list back.
    await h.createNote(NOTE, '- a\n- b\n\n- c\n- d\n');
    await h.setOutlineMode(true);

    const before = await lineShape(3);
    await h.setCursorSettled(2, 0);
    await browser.keys('-');

    const marker = await lineShape(2);
    expect(marker.cls).not.toContain(LIST_LINE);
    expect(await h.getLineChildRects(2, OUR_MARKER)).toHaveLength(1);

    // The items below moved in, and kept their own bullets while doing it.
    const after = await lineShape(3);
    expect(after.glyphsLeft).toBeGreaterThan(before.glyphsLeft);
    expect(await h.getLineChildRects(3, BULLET)).toHaveLength(1);

    await browser.keys(' ');
    expect(await h.getBuffer()).toBe('- a\n- b\n- \n- c\n- d\n');
    const restored = await lineShape(3);
    expect(restored.glyphsLeft).toBeCloseTo(before.glyphsLeft, 1);
    expect((await lineShape(2)).cls).toContain(LIST_LINE);
  });

  it('becomes an item the moment the space arrives', async function () {
    await h.createNote(NOTE, '- foo\n\nbar\n');
    await h.setOutlineMode(true);
    await h.setCursorSettled(1, 0);

    const blank = await lineShape(1);
    await browser.keys('-');
    await browser.keys(' ');
    const item = await lineShape(1);

    expect(await h.getBuffer()).toBe('- foo\n- \nbar\n');
    expect(item.cls).toContain(LIST_LINE);
    expect(await h.getLineChildRects(1, BULLET)).toHaveLength(1);
    // One shift, at the keystroke that meant it.
    expect(item.glyphsLeft).toBeGreaterThan(blank.glyphsLeft);
  });
});
