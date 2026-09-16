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
  applyFilterQuery,
  chromeVisible,
  filterReport,
  lineChromeFor,
  renderedLines,
} from '../outline-filter.js';

const NOTE = 'Scratch/filter-probe.md';

/** Frontmatter, so the properties block is a thing the probe can look for. */
const PREAMBLE = ['---', 'tag: probe', '---', ''];

/** The token exactly fifty top-level items carry, and nothing else does. */
const TOKEN = 'zqmark';

/**
 * Where the matches sit: every twentieth line from the first.
 *
 * Twenty rather than nineteen so every island lands on a TOP-LEVEL item. A
 * match with a parent would keep that parent visible too, and the case being
 * probed is the one-line island — a gap closing on the same line from both
 * sides, which is the tightest the arithmetic gets.
 */
const STRIDE = 20;
const ISLANDS = 50;

/**
 * A thousand lines of real outline: top-level items with a child each, fifty of
 * the items carrying the token the query looks for.
 */
function buildDoc(): string[] {
  const lines = [...PREAMBLE];
  for (let i = 0; lines.length < 1000; i++) {
    lines.push(`- item ${i}`);
    lines.push(`  - child ${i}`);
  }
  const doc = lines.slice(0, 1000);
  for (let n = 0; n < ISLANDS; n++) {
    const at = PREAMBLE.length + n * STRIDE;
    if (at < doc.length) doc[at] = `${doc[at]} ${TOKEN}`;
  }
  return doc;
}

const DOC = buildDoc();

/** The text of each matched line, in document order. */
function islandTexts(): string[] {
  const out: string[] = [];
  for (let n = 0; n < ISLANDS; n++) {
    const at = PREAMBLE.length + n * STRIDE;
    if (at < DOC.length) out.push(DOC[at]!);
  }
  return out;
}

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
    await applyFilterQuery(null);
    await h.dismissNotices();
  });

  it('matches exactly the fifty tokened items', async function () {
    await openProbe();
    await applyFilterQuery(TOKEN);
    await browser.pause(150);
    expect(await filterReport()).toEqual({ query: TOKEN, matched: true, count: ISLANDS });
  });

  it('renders the matches and nothing between them', async function () {
    await openProbe();
    await applyFilterQuery(TOKEN);
    await browser.pause(150);

    const rendered = await renderedLines();
    // A prefix, not the whole set: the replacements collapse a thousand lines
    // to fifty, and CodeMirror still renders only the viewport's worth of what
    // is left. What matters is that every line it DOES draw is a match and that
    // they arrive in document order with nothing in between.
    expect(rendered.length).toBeGreaterThan(20);
    expect(islandTexts().slice(0, rendered.length)).toEqual(rendered);
  });

  it('a one-line island between two gaps keeps its own chrome', async function () {
    await openProbe();
    await applyFilterQuery(TOKEN);
    await browser.pause(150);

    // The fifth island, so the gaps close on it from both sides — the first
    // island's head-side gap starts at offset 0 and is the case zoom already
    // measured.
    const chrome = await lineChromeFor(islandTexts()[4]!);
    expect(chrome.found).toBe(true);
    expect(chrome.isListLine).toBe(true);
    expect(chrome.isOurListLine).toBe(true);
    expect(chrome.hasDepth).toBe(true);
    expect(chrome.hasMarkerGutter).toBe(true);
  });

  it("hides a match's children", async function () {
    await openProbe();
    await applyFilterQuery(TOKEN);
    await browser.pause(150);
    expect(await renderedLines()).not.toContain('  - child 0');
  });

  it('keeps the title and the properties block, which a zoom hides', async function () {
    // Not because the filter passes the preamble — it passes only matches and
    // their paths — but because neither is a document line, so no hidden range
    // reaches them and only `ZOOMED_CLASS` does
    // (docs/research/outline-filter-spike.md).
    await openProbe();
    await applyFilterQuery(TOKEN);
    await browser.pause(150);
    expect(await chromeVisible()).toEqual({ title: true, properties: true });
  });

  it('renders the note whole below the threshold', async function () {
    await openProbe();
    await applyFilterQuery('z');
    await browser.pause(150);
    expect(await renderedLines()).toContain('- item 1');
  });

  it('a query that matches nothing keeps the last view and reports the miss', async function () {
    await openProbe();
    await applyFilterQuery(TOKEN);
    await browser.pause(150);
    const before = await renderedLines();

    await applyFilterQuery(`${TOKEN}x`);
    await browser.pause(150);
    expect(await renderedLines()).toEqual(before);
    expect(await filterReport()).toMatchObject({ matched: false });

    await applyFilterQuery(TOKEN);
    await browser.pause(150);
    expect(await renderedLines()).toEqual(before);
  });

  it('clearing the filter renders the hidden lines again', async function () {
    await openProbe();
    await applyFilterQuery(TOKEN);
    await browser.pause(150);
    expect(await renderedLines()).not.toContain('- item 1');

    await applyFilterQuery(null);
    await browser.pause(150);
    const rendered = await renderedLines();
    expect(rendered).toContain('- item 1');
    expect(rendered).toContain('  - child 0');
  });

  it('leaves the file untouched', async function () {
    await openProbe();
    const before = await h.readVaultFile(NOTE);
    await applyFilterQuery(TOKEN);
    await browser.pause(150);
    await applyFilterQuery(null);
    await h.saveActiveFile();
    expect(await h.readVaultFile(NOTE)).toEqual(before);
  });
});
