/**
 * THROWAWAY — `outline-zoom` task 1, the mechanism spike (design D2).
 *
 * Answers the questions the change is gated on, against a real Obsidian:
 * whether two block-level replace decorations hide content in Live Preview
 * while three established decoration sources and the backlinks footer are
 * mounted, what happens to the footer's own block widget, and how much
 * confinement CM6 gives for free.
 *
 * Not a regression suite — it MEASURES and reports. Delete with
 * `src/plugin/zoom-spike.ts` once doc 23 records the verdict.
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { MIXED_MD, WIDGET_ATOMS_MD } from '../fixtures/decorations.js';

const SCREENSHOT_DIR = path.join(process.cwd(), '.obsidian-cache', 'zoom-spike-screenshots');

const NOTE = 'Scratch/zoom-spike.md';
const FRONTMATTER_MD = ['---', 'tag: spike', '---', '', ...MIXED_MD.split('\n')].join('\n');

/** Findings accumulate here and are printed as one block at the end, so the
 * verdict doc is transcribed from measurements rather than from memory. */
const findings: string[] = [];
function record(label: string, value: unknown): void {
  const text = `${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`;
  findings.push(text);
  console.log(`[spike] ${text}`);
}

/** The text of every rendered `.cm-line`, in order. Hidden lines are absent
 * from this list if block replacement works as D2 assumes. */
function renderedLines(): Promise<string[]> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    const content = view.containerEl.querySelector('.cm-content');
    if (!content) throw new Error('no .cm-content');
    return Array.from(content.querySelectorAll('.cm-line')).map((el) =>
      (el as HTMLElement).innerText.replace(/​/g, ''),
    );
  });
}

/** Height of the editor's content box, for the "hidden lines occupy no space"
 * question — a `display:none` that keeps line boxes would show up here. */
function contentHeight(): Promise<number> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const el = view?.containerEl.querySelector('.cm-content') as HTMLElement | null;
    return el ? Math.round(el.getBoundingClientRect().height) : -1;
  });
}

/** What is actually mounted in the content area, by kind. `.cm-line` is the
 * wrong instrument for a span made only of widget-rendered atoms: Obsidian
 * replaces those lines wholesale, so a correct render reports zero cm-lines. */
function mountedKinds(): Promise<Record<string, number>> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const content = view?.containerEl.querySelector('.cm-content');
    if (!content) throw new Error('no .cm-content');
    return {
      cmLine: content.querySelectorAll('.cm-line').length,
      table: content.querySelectorAll('table').length,
      callout: content.querySelectorAll('.callout').length,
      hr: content.querySelectorAll('hr').length,
      embedBlock: content.querySelectorAll('.cm-embed-block').length,
      children: content.children.length,
    };
  });
}

function footerPresent(): Promise<boolean> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    return !!view?.containerEl.querySelector('.to-backlinks');
  });
}

function setSpike(
  span: { fromLine: number; toLine: number; tailMode?: 'doc-end' | 'last-line-start' } | null,
): Promise<void> {
  return browser.executeObsidian(
    ({ plugins }, s) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (plugins.trueOutliner as any).setZoomSpike(s);
    },
    span,
  );
}

async function openWith(md: string): Promise<void> {
  await h.createNote(NOTE, md);
  await h.openNote(NOTE);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
  }
  await h.dismissNotices();
}

describe('zoom spike: block-replace hiding (throwaway)', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
    await fsp.mkdir(SCREENSHOT_DIR, { recursive: true });
  });

  afterEach(async function () {
    await setSpike(null);
    await h.dismissNotices();
  });

  after(function () {
    console.log(`\n[spike] ===== FINDINGS =====\n${findings.join('\n')}\n[spike] =====\n`);
  });

  it('1.2 hides content outside the span, with no stray blank line', async function () {
    await openWith(MIXED_MD);
    const before = await renderedLines();
    const heightBefore = await contentHeight();
    record('1.2 unzoomed line count', before.length);

    // `## Mid` and its list, lines 2..5 of MIXED_MD.
    await setSpike({ fromLine: 2, toLine: 5 });
    await browser.pause(150);
    const after = await renderedLines();
    const heightAfter = await contentHeight();
    record('1.2 rendered lines while hidden', after);
    record('1.2 content height before/after', `${heightBefore} -> ${heightAfter}`);

    await h.screenshotFull(SCREENSHOT_DIR, 'mixed-hidden');

    expect(after.length).toBeLessThan(before.length);
    expect(heightAfter).toBeLessThan(heightBefore);
    // The artefact D2 warns about: an empty line where a replacement ends.
    record('1.2 first rendered line', JSON.stringify(after[0]));
    record('1.2 last rendered line', JSON.stringify(after[after.length - 1]));
  });

  it('1.2 hides a first-line span with only a trailing range', async function () {
    await openWith(MIXED_MD);
    await setSpike({ fromLine: 0, toLine: 0 });
    await browser.pause(150);
    const lines = await renderedLines();
    record('1.2 top-of-document span', lines);
    await h.screenshotFull(SCREENSHOT_DIR, 'mixed-first-line');
  });

  it('1.2 hides around frontmatter', async function () {
    await openWith(FRONTMATTER_MD);
    await setSpike({ fromLine: 6, toLine: 9 });
    await browser.pause(150);
    const lines = await renderedLines();
    record('1.2 with frontmatter above', lines);
    await h.screenshotFull(SCREENSHOT_DIR, 'frontmatter-hidden');
  });

  it('1.2 hides widget-rendered atoms, and survives one inside the span', async function () {
    await openWith(WIDGET_ATOMS_MD);
    const before = await renderedLines();
    record('1.2 widget-atoms unzoomed', before.length);

    record('1.2 widget-atoms mounted unzoomed', await mountedKinds());

    // Keep the callout (lines 6..7); table, hr and html are outside.
    await setSpike({ fromLine: 6, toLine: 7 });
    await browser.pause(250);
    record('1.2 widget-atoms callout-only mounted', await mountedKinds());
    await h.screenshotFull(SCREENSHOT_DIR, 'widget-atoms-callout');

    // Keep the table (lines 2..4) — a widget INSIDE the span.
    await setSpike({ fromLine: 2, toLine: 4 });
    await browser.pause(250);
    record('1.2 widget-atoms table-only mounted', await mountedKinds());
    await h.screenshotFull(SCREENSHOT_DIR, 'widget-atoms-table');
  });

  it('1.3 leaves visible-line chrome intact', async function () {
    await openWith(MIXED_MD);
    // A NON-BOUNDARY visible line, with the caret parked elsewhere. Both
    // constraints are findings in their own right: the caret on a line makes
    // Live Preview render the source beside the widget, and a block
    // decoration anchored at the last visible line's end is attributed to
    // that line by `posAtDOM` — so the span's own edges are not measurable
    // through this helper.
    await h.setCursor(0, 1);
    await browser.pause(150);
    const before = await h.getLineElementInfo(4);

    await setSpike({ fromLine: 2, toLine: 5 });
    await browser.pause(200);
    await h.setCursor(2, 3);
    await browser.pause(150);
    const after = await h.getLineElementInfo(4);

    const fmt = (i: typeof before) =>
      `cls="${i.cls}" alignedLeft=${i.alignedLeft} marker=${i.hasMarker} markerLeft=${i.markerLeft} guides=${i.hasGuides}`;
    record('1.3 list item unzoomed', fmt(before));
    record('1.3 list item while hidden', fmt(after));
    record(
      '1.3 chrome identical',
      before.cls === after.cls &&
        before.alignedLeft === after.alignedLeft &&
        before.hasMarker === after.hasMarker &&
        before.hasGuides === after.hasGuides,
    );
    await h.screenshotFull(SCREENSHOT_DIR, 'chrome-intact');

    expect(after.cls).toBe(before.cls);
    expect(after.alignedLeft).toBe(before.alignedLeft);
    expect(after.hasMarker).toBe(before.hasMarker);
  });

  it('1.4 reports what the trailing range does to the footer', async function () {
    await openWith(MIXED_MD);
    // A note the footer answers for: give it an inbound link.
    await h.createNote('Scratch/zoom-spike-source.md', `See [[zoom-spike]] for the thing.\n`);
    await h.openNote(NOTE);
    await browser.pause(600);
    const withoutSpike = await footerPresent();
    record('1.4 footer present unzoomed', withoutSpike);

    await setSpike({ fromLine: 2, toLine: 5 });
    await browser.pause(400);
    record('1.4 footer present with trailing range to doc end', await footerPresent());
    await h.screenshotFull(SCREENSHOT_DIR, 'footer-hidden-range');

    // Candidate fix A: the trailing range stops at the final line's START, so
    // the widget's anchor at doc.length sits outside the replaced range.
    await setSpike({ fromLine: 2, toLine: 5, tailMode: 'last-line-start' });
    await browser.pause(400);
    record('1.4 footer present with tail stopping at last-line start', await footerPresent());
    record('1.4 mounted with tail stopping short', await mountedKinds());
    record('1.4 rendered lines with tail stopping short', await renderedLines());
    await h.screenshotFull(SCREENSHOT_DIR, 'footer-tail-short');

    // Control: no trailing range at all.
    const lastLine = MIXED_MD.split('\n').length - 1;
    await setSpike({ fromLine: 2, toLine: lastLine });
    await browser.pause(400);
    record('1.4 footer present when span reaches the last line', await footerPresent());

    // Option B, asked as a mechanism question: a block widget anchored at the
    // visible end rather than at doc.length, just outside the trailing range.
    await setSpike({ fromLine: 2, toLine: 5 });
    await browser.pause(400);
    const probe = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      const el = view?.containerEl.querySelector('.to-zoom-spike-footer') as HTMLElement | null;
      return {
        present: !!el,
        text: el?.textContent ?? null,
        top: el ? Math.round(el.getBoundingClientRect().top) : null,
      };
    });
    record('1.4 block widget anchored at the visible end', probe);
  });

  it('1.5 reports how much confinement CM6 gives for free', async function () {
    await openWith(MIXED_MD);
    await setSpike({ fromLine: 4, toLine: 5 });
    await browser.pause(150);

    await h.setCursor(5, 3);
    const start = await h.getCursor();
    record('1.5 cursor placed inside span', start);

    await browser.keys(['ArrowDown']);
    await browser.pause(120);
    record('1.5 after ArrowDown at last visible line', await h.getCursor());

    await h.setCursor(4, 0);
    await browser.keys(['ArrowUp']);
    await browser.pause(120);
    record('1.5 after ArrowUp at first visible line', await h.getCursor());

    await h.pressSelectAll();
    await browser.pause(150);
    record('1.5 selection after one Mod-A', await h.getSelection());
    await h.pressSelectAll();
    await browser.pause(150);
    await h.pressSelectAll();
    await browser.pause(150);
    record('1.5 selection after three Mod-A', await h.getSelection());

    const scroll = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      const el = view?.containerEl.querySelector('.cm-scroller') as HTMLElement | null;
      return el ? { top: Math.round(el.scrollTop), height: Math.round(el.scrollHeight) } : null;
    });
    record('1.5 scroller after hiding', scroll);
  });

  it('1.5 reports whether a CM6 panel renders in the markdown view', async function () {
    await openWith(MIXED_MD);
    const probe = () =>
      browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const root = view?.containerEl;
        const panel = root?.querySelector('.to-zoom-spike-panel') as HTMLElement | null;
        return {
          panelsContainer: !!root?.querySelector('.cm-panels'),
          spikePanel: !!panel,
          panelText: panel?.textContent ?? null,
          panelTop: panel ? Math.round(panel.getBoundingClientRect().top) : null,
          panelHeight: panel ? Math.round(panel.getBoundingClientRect().height) : null,
        };
      });
    record('1.5 panel with no spike active', await probe());
    await setSpike({ fromLine: 2, toLine: 5 });
    await browser.pause(250);
    record('1.5 panel with spike active', await probe());
    await h.screenshotFull(SCREENSHOT_DIR, 'panel-active');
  });
});
