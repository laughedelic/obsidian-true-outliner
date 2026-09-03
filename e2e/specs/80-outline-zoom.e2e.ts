/**
 * `outline-zoom` in a real Obsidian: the scope, the trail, the commands, and the
 * two things the task-1 spike was carrying until the real feature existed —
 * that a visible line's chrome survives the hiding, and that the backlinks
 * footer does too.
 *
 * Three harness facts the spike paid for (docs/research/23), which every
 * assertion here is written around:
 *
 * - Park the caret OFF a line before reading it. With the caret on it, Live
 *   Preview renders the raw source beside the widget and `getLineElementInfo`
 *   refuses the ambiguity — correctly.
 * - Never measure the span's BOUNDARY lines through that helper: a block
 *   decoration anchored at the last visible line's end is attributed to that
 *   line by `posAtDOM`.
 * - Count widgets, not `.cm-line`s, for a span of widget-rendered atoms. A
 *   correct render reports zero cm-lines there, which looks like total failure
 *   through the obvious probe.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'Scratch/zoom.md';
const SOURCE = 'Scratch/zoom-source.md';

const DOC = [
  '# Top',
  '',
  '## Mid',
  '',
  '- one',
  '  - nested',
  '- two',
  '',
  'Trailing para.',
  '',
].join('\n');

/**
 * Everything `## Mid` owns, as Live Preview renders it.
 *
 * Longer than it first looks, and the tests were written wrong twice before
 * this constant existed. A list item keeps its own marker in the rendered text
 * while a heading loses its `##`. And the trailing paragraph is INSIDE this
 * section — a paragraph after a list is still the heading's descendant — so
 * zooming to `## Mid` keeps it. The final empty string is the cover's own
 * trailing gap, which D3 includes on purpose.
 */
const MID_SUBTREE = ['Mid', '', '- one', '- nested', '- two', '', 'Trailing para.', ''];

/** Every rendered line's text, in order. Hidden lines are absent. */
function renderedLines(): Promise<string[]> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const content = view?.containerEl.querySelector('.cm-content');
    if (!content) throw new Error('no .cm-content');
    return Array.from(content.querySelectorAll('.cm-line')).map((el) =>
      (el as HTMLElement).innerText.replace(/​/g, '').trim(),
    );
  });
}

/** The breadcrumb trail's crumb labels, in order. */
function trail(): Promise<string[]> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const panel = view?.containerEl.querySelector('.to-zoom-trail');
    if (!panel) return [];
    return Array.from(panel.querySelectorAll('.to-zoom-crumb')).map(
      (el) => (el as HTMLElement).innerText.trim(),
    );
  });
}

function clickCrumb(index: number): Promise<void> {
  return browser.executeObsidian(({ app, obsidian }, i) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const crumbs = view?.containerEl.querySelectorAll('.to-zoom-crumb');
    const el = crumbs?.[i] as HTMLElement | undefined;
    if (!el) throw new Error(`no crumb at ${i}`);
    el.click();
  }, index);
}

function footerPresent(): Promise<boolean> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    return !!view?.containerEl.querySelector('.to-backlinks');
  });
}

async function openZoomable(md = DOC): Promise<void> {
  await h.createNote(NOTE, md);
  await h.openNote(NOTE);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
  }
  await h.dismissNotices();
}

/** Put the caret on the line containing `needle`, then zoom. */
async function zoomAt(md: string, needle: string): Promise<void> {
  const line = md.split('\n').findIndex((l) => l.includes(needle));
  await h.setCursorSettled(line, md.split('\n')[line]!.length);
  await h.runCommand('zoom-in');
  await browser.pause(150);
}

describe('outline zoom', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await h.runCommand('zoom-clear');
    await h.dismissNotices();
  });

  it('zooms to the node at the caret, hiding everything else', async function () {
    await openZoomable();
    await zoomAt(DOC, '## Mid');
    // Live Preview keeps a list item's own marker in the rendered text; the
    // heading's `##` is the part it hides.
    expect(await renderedLines()).toEqual(MID_SUBTREE);
  });

  it('zooms into a list item, keeping only its own subtree', async function () {
    await openZoomable();
    await zoomAt(DOC, '- one');
    expect(await renderedLines()).toEqual(['- one', '- nested']);
  });

  it('leaves the file untouched across a zoom in and out', async function () {
    await openZoomable();
    const before = await h.readVaultFile(NOTE);
    await zoomAt(DOC, '## Mid');
    await h.runCommand('zoom-clear');
    await browser.pause(150);
    await h.saveActiveFile();
    expect(await h.readVaultFile(NOTE)).toBe(before);
  });

  it('shows the ancestor trail, outermost first, without the root itself', async function () {
    await openZoomable();
    await zoomAt(DOC, '  - nested');
    expect(await trail()).toEqual(['zoom', 'Top', 'Mid', 'one']);
  });

  it('has a file-only trail for a top-level root', async function () {
    await openZoomable();
    // `# Top`, and not the trailing paragraph — which is NOT top-level: a
    // paragraph after the list is still inside `## Mid`'s section, so its trail
    // is two crumbs long. Getting that wrong here would have asserted the tree
    // model backwards rather than the trail.
    await zoomAt(DOC, '# Top');
    expect(await trail()).toEqual(['zoom']);
  });

  it('zooms to an ancestor when its crumb is activated', async function () {
    await openZoomable();
    await zoomAt(DOC, '  - nested');
    await clickCrumb(2); // 'Mid'
    await browser.pause(200);
    expect(await renderedLines()).toEqual(MID_SUBTREE);
    expect(await trail()).toEqual(['zoom', 'Top']);
  });

  it('clears the zoom when the file crumb is activated', async function () {
    await openZoomable();
    await zoomAt(DOC, '- one');
    await clickCrumb(0);
    await browser.pause(200);
    expect(await trail()).toEqual([]);
    expect((await renderedLines()).length).toBeGreaterThan(2);
  });

  it('steps out one level, and clears from the top level', async function () {
    await openZoomable();
    await zoomAt(DOC, '  - nested');
    await h.runCommand('zoom-out');
    await browser.pause(200);
    expect(await trail()).toEqual(['zoom', 'Top', 'Mid']);

    await h.runCommand('zoom-out');
    await browser.pause(200);
    expect(await trail()).toEqual(['zoom', 'Top']);

    await h.runCommand('zoom-out');
    await browser.pause(200);
    // Now rooted at `# Top`, which is top-level — the zoom is still ACTIVE, with
    // only the file crumb. Clearing is what the NEXT step out does.
    expect(await trail()).toEqual(['zoom']);

    await h.runCommand('zoom-out');
    await browser.pause(200);
    expect(await trail()).toEqual([]);
  });

  it('re-bases indentation so the root sits at the left margin', async function () {
    await openZoomable();
    // Park the caret off the line being measured, and off the span's edges.
    await zoomAt(DOC, '## Mid');
    await h.setCursorSettled(2, 0);
    await browser.pause(150);
    const nested = await h.getLineElementInfo(5); // '  - nested', interior
    await h.runCommand('zoom-clear');
    await browser.pause(200);
    await h.setCursorSettled(2, 0);
    await browser.pause(150);
    const unzoomed = await h.getLineElementInfo(5);
    // `## Mid` is one level deep, so everything under it moves one unit left.
    expect(nested.alignedLeft).toBeLessThan(unzoomed.alignedLeft);
  });

  it('keeps a visible line chrome intact while hiding', async function () {
    await openZoomable();
    await zoomAt(DOC, '## Mid');
    await h.setCursorSettled(2, 0);
    await browser.pause(150);
    const info = await h.getLineElementInfo(5);
    expect(info.cls).toContain('to-decor-list');
    expect(info.hasGuides).toBe(true);
  });

  it('keeps the backlinks footer rendering below the zoomed content', async function () {
    await h.createNote(SOURCE, `See [[zoom]] for the thing.\n`);
    await openZoomable();
    await browser.pause(700);
    expect(await footerPresent()).toBe(true);
    await zoomAt(DOC, '## Mid');
    await browser.pause(400);
    // The trailing hidden range ends at doc.length, where the footer used to
    // anchor; it now anchors at the visible end (D12, docs/research/23).
    expect(await footerPresent()).toBe(true);
  });

  it('exits when the zoom root is deleted', async function () {
    await openZoomable();
    await zoomAt(DOC, '- one');
    expect(await trail()).not.toEqual([]);
    await h.setBuffer(DOC.replace('- one\n  - nested\n', ''));
    await browser.pause(300);
    expect(await trail()).toEqual([]);
  });

  it('exits when a change reaches outside the visible range', async function () {
    await openZoomable();
    await zoomAt(DOC, '- one');
    expect(await trail()).not.toEqual([]);
    // Rewriting the whole buffer touches positions above and below the scope —
    // the shape a history transaction, a sync write or another pane produces,
    // none of which pass through the clamps.
    await h.setBuffer(DOC.replace('# Top', '# Renamed'));
    await browser.pause(300);
    expect(await trail()).toEqual([]);
  });

  it('keeps the zoom while the root own text is edited', async function () {
    await openZoomable();
    await zoomAt(DOC, '## Mid');
    const before = await trail();
    await h.setCursorSettled(2, 6);
    await browser.keys(['!']);
    await browser.pause(250);
    expect(await trail()).toEqual(before);
  });

  it('exits when outline mode is switched off', async function () {
    await openZoomable();
    await zoomAt(DOC, '## Mid');
    expect(await trail()).not.toEqual([]);
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode off');
    await h.dismissNotices();
    expect(await trail()).toEqual([]);
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  });

  it('does nothing when the caret is in the preamble', async function () {
    const withFrontmatter = `---\ntag: x\n---\n\n${DOC}`;
    await openZoomable(withFrontmatter);
    await h.setCursorSettled(1, 0);
    await h.runCommand('zoom-in');
    await browser.pause(200);
    expect(await trail()).toEqual([]);
  });

  it('offers its commands only in outline mode', async function () {
    await openZoomable();
    expect(await h.commandAvailable('zoom-in')).toBe(true);
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode off');
    await h.dismissNotices();
    expect(await h.commandAvailable('zoom-in')).toBe(false);
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  });
});
