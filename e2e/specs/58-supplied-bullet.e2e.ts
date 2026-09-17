/**
 * The bullet Live Preview declines to draw (`SUPPLIED_BULLET_CLASS`,
 * decorations.ts): the mode Obsidian runs gates every list token on a marker
 * with whitespace after it, so a line holding nothing but `-` shows a raw dash
 * where our tree, CommonMark and Obsidian's own reading mode all read an empty
 * item (docs/research/marker-without-trailing-space).
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'Scratch/supplied-bullet.md';
const BULLET = '.list-bullet';
const SUPPLIED = '.to-decor-supplied-bullet';

/** `- foo` / `-` / `- bar`: a bare marker between two ordinary items. */
const SOURCE = '- foo\n-\n- bar\n';

describe('a marker Live Preview draws no bullet for', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('is left bare by Obsidian itself, which is the shape being covered', async function () {
    await h.createNote(NOTE, SOURCE);
    await h.setOutlineMode(false);

    // Stock Obsidian, no outline mode: the siblings carry a native bullet and
    // the bare marker carries none. Asserted rather than argued — the whole
    // change rests on this being Obsidian's behaviour and not ours.
    expect(await h.getLineChildRects(0, BULLET)).toHaveLength(1);
    expect(await h.getLineChildRects(2, BULLET)).toHaveLength(1);
    expect(await h.getLineChildRects(1, BULLET)).toHaveLength(0);
  });

  it('gets one from us in outline mode, on the column its siblings sit on', async function () {
    await h.createNote(NOTE, SOURCE);
    await h.setOutlineMode(true);

    const [foo] = await h.getLineChildRects(0, BULLET);
    const [bare] = await h.getLineChildRects(1, BULLET);
    const [bar] = await h.getLineChildRects(2, BULLET);
    expect(foo).toBeDefined();
    expect(bare).toBeDefined();
    expect(bar).toBeDefined();

    // Only the middle one is ours; the outer two are Obsidian's own.
    expect(await h.getLineChildRects(1, SUPPLIED)).toHaveLength(1);
    expect(await h.getLineChildRects(0, SUPPLIED)).toHaveLength(0);
    expect(await h.getLineChildRects(2, SUPPLIED)).toHaveLength(0);

    // A relationship, never an absolute column: the three sit on one column,
    // which is the point — the bare marker no longer reads as body text beside
    // its siblings. A sub-pixel tolerance, since the supplied span wraps the
    // marker character where Obsidian's wraps its own.
    expect(Math.abs(bare!.left - foo!.left)).toBeLessThan(1);
    expect(Math.abs(bare!.left - bar!.left)).toBeLessThan(1);
  });

  it('gives way the moment the marker earns Obsidian’s own', async function () {
    await h.createNote(NOTE, SOURCE);
    await h.setOutlineMode(true);
    expect(await h.getLineChildRects(1, SUPPLIED)).toHaveLength(1);

    // One space is all the mode asks for. Ours goes, Obsidian's arrives, and
    // the line keeps exactly one bullet through the swap.
    await h.setCursorSettled(1, 1);
    await browser.keys(' ');
    expect(await h.getBuffer()).toBe('- foo\n- \n- bar\n');

    expect(await h.getLineChildRects(1, SUPPLIED)).toHaveLength(0);
    expect(await h.getLineChildRects(1, BULLET)).toHaveLength(1);
  });
});
