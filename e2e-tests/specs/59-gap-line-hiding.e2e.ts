/**
 * Collapsing the blank separator rows between nodes (`hideGapLines`).
 *
 * The mechanism was measured before the setting was built — see
 * docs/research/gap-line-hiding for the figures and for why a collapsed row is
 * a line decoration rather than the zoom's block replacement. What this spec
 * pins is the part of that measurement the feature has to keep true: the
 * separator rows go to zero and nothing else moves, the caret's own row is
 * never one of them, and the three mechanisms that already end on a gap line —
 * the footer's anchor at the document end, a fold cover, a zoom's hidden range
 * — are untouched.
 *
 * Every assertion here is a RELATIONSHIP (a row against its own unhidden
 * rendering, a row against its neighbour), never an absolute height: CI's fonts
 * are not macOS's.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import * as f from '../folding.js';

const NOTE = 'Notes/Gap line hiding.md';

/** A heading, a two-line paragraph, a paragraph and a loose list: every kind of
 * gap the walk produces, including a top-level one that carries no guide. */
const DOC = [
  '# Root',
  '',
  'Alpha one',
  'alpha continuation',
  '',
  'Beta two',
  '',
  '- item a',
  '',
  '- item b',
  '',
].join('\n');

interface Row {
  readonly index: number;
  readonly text: string;
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
  readonly classes: string;
}

/** Every `.cm-line` in DOM order, with its box and its class list. */
function rows(): Promise<Row[]> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const els = Array.from(cm.contentDOM.querySelectorAll(':scope > .cm-line')) as HTMLElement[];
    return els.map((el, index) => {
      const r = el.getBoundingClientRect();
      return {
        index,
        text: el.textContent ?? '',
        top: +r.top.toFixed(2),
        bottom: +r.bottom.toFixed(2),
        height: +r.height.toFixed(2),
        classes: el.className,
      };
    });
  });
}

/**
 * CodeMirror's OWN height map, which is what scrolling and click-to-place read.
 * A row that merely looks collapsed while the map still believes in it would
 * pass every DOM assertion and misplace every click, so the round-trip is
 * measured rather than assumed.
 */
function heightMapIsCoherent(): Promise<boolean> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    for (let n = 1; n <= cm.state.doc.lines; n++) {
      const line = cm.state.doc.line(n);
      if (line.text.trim() === '') continue;
      const coords = cm.coordsAtPos(line.from);
      if (!coords) return false;
      const back = cm.posAtCoords({ x: coords.left + 1, y: (coords.top + coords.bottom) / 2 });
      if (back === null || cm.state.doc.lineAt(back).number !== n) return false;
    }
    return true;
  });
}

async function open(text = DOC): Promise<void> {
  await h.createNote(NOTE, text);
  await h.openNote(NOTE);
  await h.setOutlineMode(true);
}

describe('hiding gap lines', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
    await open();
  });

  afterEach(async function () {
    // Both are global and persisted, so a failed assertion mid-test would
    // otherwise carry its value into the next one.
    await h.setPluginSetting('hideGapLines', false);
    await h.setPluginSetting('backlinksFooter', false);
  });

  after(async function () {
    await h.resetPluginState();
  });

  it('takes every separator row to zero and moves nothing else', async function () {
    await h.setBuffer(DOC);
    await h.setPluginSetting('hideGapLines', false);
    await h.setCursorSettled(0, 1);
    const off = await rows();

    await h.setPluginSetting('hideGapLines', true);
    await h.setCursorSettled(0, 1);
    const on = await rows();

    // The rows survive: a collapse is a height, not a removal.
    expect(on.length).toBe(off.length);

    for (let i = 0; i < off.length; i++) {
      if (off[i]!.text === '') {
        expect(on[i]!.height).toBe(0);
      } else {
        // Every content row keeps the exact chrome and height it had — the
        // composition question, which is the one worth asking first.
        expect(on[i]!.classes).toBe(off[i]!.classes);
        expect(on[i]!.height).toBe(off[i]!.height);
      }
    }

    const contentOff = off.filter((r) => r.text !== '');
    const contentOn = on.filter((r) => r.text !== '');
    const spanOf = (rs: Row[]) => rs[rs.length - 1]!.bottom - rs[0]!.top;
    expect(spanOf(contentOn)).toBeLessThan(spanOf(contentOff));

    expect(await heightMapIsCoherent()).toBe(true);
  });

  it('collapses a top-level gap, which carries no guide to hang on', async function () {
    // The negative control for the widened predicate: while the decoration was
    // emitted only for a gap line carrying a guide, this row stayed open while
    // every nested one closed.
    await h.setBuffer('Alpha\n\nBeta\n');
    await h.setPluginSetting('hideGapLines', true);
    await h.setCursorSettled(0, 1);
    const on = await rows();
    const gap = on.find((r) => r.text === '' && r.index === 1);
    expect(gap).toBeDefined();
    expect(gap!.classes).not.toContain('to-decor-guides');
    expect(gap!.height).toBe(0);
  });

  it('closes the seam, so a guide crosses it unbroken', async function () {
    await h.setBuffer(DOC);
    await h.setPluginSetting('hideGapLines', true);
    await h.setCursorSettled(0, 1);
    const on = await rows();
    for (const gap of on.filter((r) => r.text === '')) {
      const above = on[gap.index - 1];
      const below = on[gap.index + 1];
      if (!above || !below) continue;
      // Adjacent to within a rounding error: there is no row left between them
      // for a guide to break across.
      expect(Math.abs(below.top - above.bottom)).toBeLessThan(1);
    }
  });

  it('keeps the row the caret rests on at full height', async function () {
    await h.setPluginSetting('hideGapLines', true);
    // Two paragraph siblings: Enter at the end of the first opens a provisional
    // position on a blank line rather than an empty list item.
    await h.setBuffer('Alpha\n\nBeta\n');
    await h.setCursorSettled(0, 'Alpha'.length);
    await browser.keys(['Enter']);
    await browser.pause(300);

    const cursor = await h.getCursor();
    const on = await rows();
    const caretRow = on[cursor.line];
    expect(caretRow).toBeDefined();
    expect(caretRow!.text.trim()).toBe('');
    expect(caretRow!.classes).not.toContain('to-decor-gap-hidden');
    expect(caretRow!.height).toBeGreaterThan(0);

    // And the separation that makes it a position collapses either side, so the
    // position reads as exactly one row rather than three.
    for (const neighbour of [on[cursor.line - 1], on[cursor.line + 1]]) {
      if (neighbour && neighbour.text.trim() === '') expect(neighbour.height).toBe(0);
    }
  });

  it('leaves motion and click placement where they were', async function () {
    await h.setBuffer(DOC);
    await h.setPluginSetting('hideGapLines', true);
    await h.setCursorSettled(2, 3);
    await browser.keys(['ArrowDown']);
    await browser.pause(150);
    await browser.keys(['ArrowDown']);
    await browser.pause(150);
    // One press per gap, goal column intact — `content-space-caret`'s own
    // requirement, unchanged by the rows disappearing.
    expect(await h.getCursor()).toEqual({ line: 5, ch: 3 });

    await h.clickAt(7, 4);
    await browser.pause(150);
    expect((await h.getCursor()).line).toBe(7);
  });

  it('keeps the backlinks footer, which anchors past the last gap', async function () {
    // The case a block replacement loses: a range reaching `doc.length` takes
    // the footer's anchor with it (docs/research/zoom-hiding-mechanism).
    await h.setPluginSetting('backlinksFooter', true);
    await h.setBuffer(DOC);
    await h.setPluginSetting('hideGapLines', true);
    await h.setCursorSettled(0, 1);
    await browser.pause(500);
    const footers = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      return cm.dom.querySelectorAll('[class*="backlinks"]').length;
    });
    expect(footers).toBeGreaterThan(0);
  });

  it('composes with a fold, whose cover ends on a gap line', async function () {
    await f.clearFolds();
    await h.setBuffer(DOC);
    await h.setPluginSetting('hideGapLines', true);
    await h.setCursorSettled(0, 1);
    await h.runCommand('fold-node');
    await browser.pause(250);
    const folded = await f.foldedLineRanges();
    expect(folded.length).toBeGreaterThan(0);
    await f.clearFolds();
  });

  it('draws an experimental chip on its own settings row', async function () {
    // The setting is opt-in and still being judged in real use, so the row says
    // so as a chip rather than as the first word of its description. Obsidian's
    // setting definitions carry no badge field, so this is a fragment the tab
    // builds — worth measuring rather than assuming it survives the render.
    const chip = await browser.executeObsidian(({ app }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setting = (app as any).setting;
      setting.open();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tab = setting.pluginTabs.find((t: any) => t.id === 'true-outliner');
      setting.openTabById('true-outliner');
      const chips = Array.from(
        tab.containerEl.querySelectorAll('.to-setting-chip'),
      ) as HTMLElement[];
      const result = {
        count: chips.length,
        text: chips[0]?.textContent ?? null,
        // The row it labels, so the chip cannot be on the wrong setting.
        row: chips[0]?.closest('.setting-item')?.querySelector('.setting-item-name')
          ?.textContent ?? null,
      };
      setting.close();
      return result;
    });
    expect(chip.count).toBe(1);
    expect(chip.text).toBe('Experimental');
    expect(chip.row).toContain('blank lines between nodes');
  });

  it('composes with a node cover, whose background ends on a gap line', async function () {
    // The fourth mechanism that ends on a gap line. The cover's class comes
    // from a separate decoration provider, so what is measured here is that
    // CM6 merges the two same-position line decorations rather than one
    // displacing the other.
    // Two bare paragraph siblings, so a cover is one node and not a subtree —
    // in DOC the list may attach to the paragraph above it (Q34), which would
    // make a cover of that paragraph reach past its own gap.
    await h.setBuffer('Alpha\n\nBeta\n');
    await h.setPluginSetting('hideGapLines', true);
    // A node's bounds include its own trailing gap (escalate-include-owned-gap),
    // so a cover of `Alpha` runs to the start of the gap line below it — the
    // selection head therefore sits ON a collapsed row, which is the case
    // design D3's precondition is about.
    await h.setSelection({ line: 0, ch: 0 }, { line: 1, ch: 0 });
    await browser.pause(250);
    const on = await rows();
    const covered = on.filter((r) => r.classes.includes('to-decor-node-selected'));
    expect(covered.length).toBeGreaterThan(0);
    // The gap row inside the cover keeps BOTH classes: the collapse does not
    // displace the cover, and the cover does not reopen the row.
    const coveredGap = covered.find((r) => r.text === '');
    expect(coveredGap).toBeDefined();
    expect(coveredGap!.classes).toContain('to-decor-gap-hidden');
    expect(coveredGap!.height).toBe(0);
    // And the content row it covers is untouched.
    const coveredContent = covered.find((r) => r.text !== '');
    expect(coveredContent).toBeDefined();
    expect(coveredContent!.height).toBeGreaterThan(0);
  });

  it('composes with a zoom, whose hidden ranges end on a gap line', async function () {
    await h.setBuffer(DOC);
    await h.setPluginSetting('hideGapLines', true);
    await h.setCursorSettled(5, 'Beta two'.length);
    await h.runCommand('zoom-in');
    await browser.pause(200);
    const on = await rows();
    // The zoom root is rendered, everything outside its subtree is gone, and
    // the gaps that remain inside it are still collapsed.
    expect(on.some((r) => r.text === 'Beta two')).toBe(true);
    expect(on.some((r) => r.text === 'Alpha one')).toBe(false);
    for (const gap of on.filter((r) => r.text === '')) expect(gap.height).toBe(0);
    await h.runCommand('zoom-clear');
    await browser.pause(150);
  });
});
