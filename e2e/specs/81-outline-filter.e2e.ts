/**
 * `outline-filter`'s gate: the hiding mechanism measured against MANY visible
 * spans on a real instance, before the design that assumes it is built on.
 *
 * Zoom's spike (docs/research/zoom-hiding-mechanism) measured one visible range
 * with a gap on either side. A filter's visible set is dozens of islands, and
 * every property that spike established has to be re-asked of an interior gap:
 * a gap that both begins and ends beside a line the view keeps, which zoom
 * could never produce. What is new here is the MIDDLE, so that is what these
 * cases are about.
 *
 * The findings go to docs/research/outline-filter-spike.md. The spans are
 * dispatched directly through the plugin's own state — the query that will
 * compute them arrives with the matcher, and what is being probed is the
 * builder underneath it either way.
 *
 * The harness facts zoom's spike paid for hold here and are written around the
 * same way: park the caret off a line before reading it, and never measure a
 * span's boundary line through a helper that resolves DOM to positions.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import {
  applyFilterSpans,
  chromeVisible,
  lineChromeFor,
  renderedLines,
} from '../outline-filter.js';

const NOTE = 'Scratch/filter-probe.md';

/** Frontmatter, so the properties block is a thing the probe can look for. */
const PREAMBLE = ['---', 'tag: probe', '---', ''];

/**
 * A thousand lines of real outline: top-level items with a child each, so a
 * visible line can be a parent, a child, or the only line of its island.
 */
function buildDoc(): string[] {
  const lines = [...PREAMBLE];
  for (let i = 0; lines.length < 1000; i++) {
    lines.push(`- item ${i}`);
    lines.push(`  - child ${i}`);
  }
  return lines.slice(0, 1000);
}

const DOC = buildDoc();

/**
 * Fifty one-line islands, spread the length of the note.
 *
 * One line each, which is the tightest case: a gap closes on the line from both
 * sides at once, so the head-side and tail-side arithmetic are exercised on the
 * same line rather than on opposite ends of the document.
 */
function islandSpans(): { fromLine: number; toLine: number }[] {
  const spans: { fromLine: number; toLine: number }[] = [];
  for (let n = 0; n < 50; n++) {
    const line = PREAMBLE.length + 4 + n * 19;
    if (line >= DOC.length) break;
    spans.push({ fromLine: line, toLine: line + 1 });
  }
  return spans;
}

/**
 * The frontmatter and the blank line after it, as a span.
 *
 * Kept as a constant because whether the filter SHOULD pass it is what the
 * cases below settle, not something they assume.
 */
const PREAMBLE_SPAN = { fromLine: 0, toLine: PREAMBLE.length };

async function openProbe(): Promise<void> {
  await h.createNote(NOTE, DOC.join('\n'));
  await h.openNote(NOTE);
  await h.setOutlineMode(true);
  // Off every line the cases read, per the harness rule above.
  await h.setCursorSettled(PREAMBLE.length, 0);
}

describe('outline filter: many visible spans through the hiding builder', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await applyFilterSpans(null);
    await h.dismissNotices();
  });

  it('renders the visible spans and nothing between them', async function () {
    await openProbe();
    const spans = islandSpans();
    await applyFilterSpans(spans);
    await browser.pause(150);

    const rendered = await renderedLines();
    const islands = spans.map((s) => DOC[s.fromLine]!);
    // A prefix, not the whole set: the replacements collapse a thousand lines
    // to fifty, and CodeMirror still renders only the viewport's worth of what
    // is left. What matters is that every line it DOES draw is an island and
    // that they arrive in document order with nothing in between.
    expect(rendered.length).toBeGreaterThan(20);
    expect(islands.slice(0, rendered.length)).toEqual(rendered);
  });

  it('a one-line island between two gaps keeps its own chrome', async function () {
    await openProbe();
    const spans = islandSpans();
    await applyFilterSpans(spans);
    await browser.pause(150);

    // The fifth island, so the gaps close on it from both sides — the first
    // island's head-side gap starts at offset 0 and is the case zoom already
    // measured.
    const chrome = await lineChromeFor(DOC[spans[4]!.fromLine]!);
    expect(chrome.found).toBe(true);
    expect(chrome.isListLine).toBe(true);
    expect(chrome.isOurListLine).toBe(true);
    expect(chrome.hasDepth).toBe(true);
    expect(chrome.hasMarkerGutter).toBe(true);
  });

  it('keeps the title and the properties block, which a zoom hides', async function () {
    await openProbe();
    await applyFilterSpans(islandSpans());
    await browser.pause(150);
    expect(await chromeVisible()).toEqual({ title: true, properties: true });
  });

  it('keeps them with the preamble hidden, because they are not document lines', async function () {
    // The preamble span turns out to decide nothing here: the title and the
    // properties block are siblings of the content, so only `ZOOMED_CLASS`
    // reaches them, and a filter does not carry it. Asserted both ways so the
    // rule is pinned to its real cause rather than to a span that happens to
    // be passed alongside it.
    await openProbe();
    await applyFilterSpans([PREAMBLE_SPAN, ...islandSpans()]);
    await browser.pause(150);
    expect(await chromeVisible()).toEqual({ title: true, properties: true });
  });

  it('passing the preamble keeps its trailing blank line as a rendered line', async function () {
    // What the span actually buys, which is a stray empty line above the first
    // match: the frontmatter's own three lines render as the properties widget
    // rather than as `.cm-line`s, and only the blank after them is a real line.
    await openProbe();
    await applyFilterSpans([PREAMBLE_SPAN, ...islandSpans()]);
    await browser.pause(150);
    expect((await renderedLines())[0]).toBe('');

    await applyFilterSpans(islandSpans());
    await browser.pause(150);
    expect((await renderedLines())[0]).toBe(DOC[islandSpans()[0]!.fromLine]);
  });

  it('clearing the filter renders the hidden lines again', async function () {
    await openProbe();
    await applyFilterSpans(islandSpans());
    await browser.pause(150);
    expect(await renderedLines()).not.toContain('- item 0');

    await applyFilterSpans(null);
    await browser.pause(150);
    const rendered = await renderedLines();
    expect(rendered).toContain('- item 0');
    expect(rendered).toContain('  - child 0');
  });

  it('leaves the file untouched', async function () {
    await openProbe();
    const before = await h.readVaultFile(NOTE);
    await applyFilterSpans(islandSpans());
    await browser.pause(150);
    await applyFilterSpans(null);
    await h.saveActiveFile();
    expect(await h.readVaultFile(NOTE)).toEqual(before);
  });
});

