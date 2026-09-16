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
  clickPanelClose,
  filterReport,
  lineChromeFor,
  markedTexts,
  panelState,
  renderedLines,
  typeInPanel,
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

  it('the caret skips the hidden lines between two matches', async function () {
    await openProbe();
    await applyFilterQuery(TOKEN);
    await browser.pause(150);

    // On the first match, then Down: the next line the view draws is the second
    // match, nineteen hidden lines below it in the document.
    const first = PREAMBLE.length;
    await h.setCursorSettled(first, 2);
    await browser.keys(['ArrowDown']);
    await browser.pause(100);
    expect((await h.getCursor()).line).toBe(first + STRIDE);

    // And back up again, to the line it came from rather than into the gap.
    await browser.keys(['ArrowUp']);
    await browser.pause(100);
    expect((await h.getCursor()).line).toBe(first);
  });

  it('a selection refuses to reach across a gap, and says so once', async function () {
    await openProbe();
    await applyFilterQuery(TOKEN);
    await browser.pause(150);

    const first = PREAMBLE.length;
    await h.setCursorSettled(first, 2);
    const before = await h.getSelection();
    await h.armNoticeRecorder();

    // Held Shift+Down: the first press would reach the next match across
    // nineteen hidden lines, and every repeat after it would do the same.
    await browser.keys(['Shift', 'ArrowDown', 'ArrowDown', 'ArrowDown']);
    await browser.pause(200);
    await browser.keys(['Shift']);

    expect(await h.getSelection()).toEqual(before);
    const notices = (await h.recordedNoticeTexts()).filter((t) => t.includes('filter'));
    // Said once for the gesture, not once per repeat — a refused press leaves
    // the selection where it was, so auto-repeat asks the same question again.
    expect(notices).toHaveLength(1);
  });

  it('Select All escalates within the visible run and stops there', async function () {
    await openProbe();
    await applyFilterQuery(TOKEN);
    await browser.pause(150);
    await h.setCursorSettled(PREAMBLE.length, 2);

    // Enough presses to exhaust the ladder several times over.
    for (let n = 0; n < 5; n++) {
      await h.pressSelectAll();
      await browser.pause(60);
    }
    const selection = await h.getSelection();
    // Never past the one line the filter is showing there.
    expect(selection.anchor.line).toBe(PREAMBLE.length);
    expect(selection.head.line).toBe(PREAMBLE.length);
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

describe('outline filter: the panel and its command', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await applyFilterQuery(null);
    await h.dismissNotices();
  });

  it('the command is absent outside outline mode', async function () {
    await h.createNote(NOTE, DOC.join('\n'));
    await h.openNote(NOTE);
    await h.setOutlineMode(false);
    expect(await h.commandAvailable('filter-outline')).toBe(false);
    await h.setOutlineMode(true);
    expect(await h.commandAvailable('filter-outline')).toBe(true);
  });

  it('opens with the field focused and nothing filtered yet', async function () {
    await openProbe();
    await h.runCommand('filter-outline');
    await browser.pause(200);
    expect(await panelState()).toMatchObject({ open: true, query: '', status: '', focused: true });
    // Nothing typed, so nothing hidden.
    expect(await renderedLines()).toContain('- item 1');
  });

  it('typing filters the note and the panel counts what it found', async function () {
    await openProbe();
    await h.runCommand('filter-outline');
    await browser.pause(150);
    await typeInPanel(TOKEN);
    await browser.pause(200);

    expect(await panelState()).toMatchObject({ query: TOKEN, status: `${ISLANDS} matches` });
    expect(await renderedLines()).not.toContain('- item 1');
    expect((await markedTexts()).every((text) => text === TOKEN)).toBe(true);
  });

  it('the field says so when the query stops matching, and the view holds', async function () {
    await openProbe();
    await h.runCommand('filter-outline');
    await browser.pause(150);
    await typeInPanel(TOKEN);
    await browser.pause(200);
    const held = await renderedLines();

    await typeInPanel(`${TOKEN}x`);
    await browser.pause(200);
    expect(await panelState()).toMatchObject({ missed: true, status: 'no matches' });
    expect(await renderedLines()).toEqual(held);
    // The marks stay the standing query's, since the view is its answer.
    expect((await markedTexts()).every((text) => text === TOKEN)).toBe(true);
  });

  it('the command toggles the panel shut, restoring the note', async function () {
    await openProbe();
    await h.runCommand('filter-outline');
    await browser.pause(150);
    await typeInPanel(TOKEN);
    await browser.pause(200);

    await h.runCommand('filter-outline');
    await browser.pause(200);
    expect((await panelState())?.open).toBe(false);
    expect(await renderedLines()).toContain('- item 1');
    expect(await markedTexts()).toEqual([]);
  });

  it('the close control puts it away too', async function () {
    await openProbe();
    await h.runCommand('filter-outline');
    await browser.pause(150);
    await typeInPanel(TOKEN);
    await browser.pause(200);

    await clickPanelClose();
    await browser.pause(200);
    expect((await panelState())?.open).toBe(false);
    expect(await renderedLines()).toContain('- item 1');
  });
});

/**
 * A small note for the behavioural half: a match with a path above it, a
 * sibling subtree to hide, and a second section so a zoom has something to
 * exclude. The thousand-line fixture above is for the hiding builder; these
 * cases are about what the filter decides, which reads better at this size.
 */
const SMALL = 'Scratch/filter-small.md';
const SMALL_DOC = [
  '# Top',
  '',
  '## Mid',
  '',
  '- alpha',
  '  - alpha kid',
  '- zqtarget',
  '  - target kid',
  '',
  '## Other',
  '',
  '- zqtarget too',
  '',
].join('\n');

async function openSmall(): Promise<void> {
  await h.createNote(SMALL, SMALL_DOC);
  await h.openNote(SMALL);
  await h.setOutlineMode(true);
  await h.setCursorSettled(0, 1);
}

describe('outline filter: what the query decides, in a real editor', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await applyFilterQuery(null);
    await h.runCommand('zoom-clear');
    await h.dismissNotices();
  });

  it('a deep match keeps its path and hides every sibling', async function () {
    await openSmall();
    await applyFilterQuery('zqtarget');
    await browser.pause(200);
    // Both matches, each with the heading path that leads to it, and neither
    // `- alpha` nor any child.
    expect(await renderedLines()).toEqual([
      '# Top',
      '## Mid',
      '- zqtarget',
      '## Other',
      '- zqtarget too',
    ]);
  });

  it('editing the query out of a match keeps it visible', async function () {
    await openSmall();
    await applyFilterQuery('zqtarget');
    await browser.pause(200);
    await h.setCursorSettled(6, 10);
    await browser.keys(['Backspace', 'Backspace']);
    await browser.pause(200);
    expect(await renderedLines()).toContain('- zqtarg');
  });

  it('Enter at the end of a visible match makes a visible node', async function () {
    await openSmall();
    await applyFilterQuery('zqtarget');
    await browser.pause(200);
    await h.setCursorSettled(6, 10);
    await browser.keys(['End', 'Enter']);
    await h.setBuffer(await h.getBuffer());
    await browser.pause(200);
    const cursor = await h.getCursor();
    // Whatever the new node is, the caret is on a line the view draws.
    expect(await renderedLines()).toContain((await h.getBuffer()).split('\n')[cursor.line]);
  });

  it('re-running the query re-decides from the document as it then is', async function () {
    await openSmall();
    await applyFilterQuery('zqtarget');
    await browser.pause(200);
    await h.setCursorSettled(6, 10);
    await browser.keys(['Backspace', 'Backspace']);
    await browser.pause(150);
    expect(await renderedLines()).toContain('- zqtarg');

    await applyFilterQuery('zqtargetx');
    await applyFilterQuery('zqtarget');
    await browser.pause(200);
    expect(await renderedLines()).not.toContain('- zqtarg');
  });
});

describe('outline filter: composed with a zoom', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await applyFilterQuery(null);
    await h.runCommand('zoom-clear');
    await h.dismissNotices();
  });

  it('a filter inside a zoom shows only the matches within the scope', async function () {
    await openSmall();
    // Zoom to `## Mid`, whose subtree holds one of the two matches.
    await h.setCursorSettled(2, 3);
    await h.runCommand('zoom-in');
    await browser.pause(200);

    await applyFilterQuery('zqtarget');
    await browser.pause(200);
    const rendered = await renderedLines();
    expect(rendered).toContain('- zqtarget');
    expect(rendered).not.toContain('- zqtarget too');
    expect(rendered).not.toContain('## Other');
  });

  it('zooming while filtered keeps the filter', async function () {
    await openSmall();
    await applyFilterQuery('zqtarget');
    await browser.pause(200);
    await h.setCursorSettled(2, 3);
    await h.runCommand('zoom-in');
    await browser.pause(200);

    const rendered = await renderedLines();
    expect(rendered).toContain('- zqtarget');
    expect(rendered).not.toContain('- alpha');
    expect(rendered).not.toContain('- zqtarget too');
  });

  it('clearing the filter leaves the zoom as it was', async function () {
    await openSmall();
    await h.setCursorSettled(2, 3);
    await h.runCommand('zoom-in');
    await applyFilterQuery('zqtarget');
    await browser.pause(200);
    await applyFilterQuery(null);
    await browser.pause(200);

    const rendered = await renderedLines();
    // The scope renders whole, and nothing outside it comes back.
    expect(rendered).toContain('- alpha');
    expect(rendered).not.toContain('## Other');
  });

  it('zooming out brings back the matches the scope excluded', async function () {
    await openSmall();
    await h.setCursorSettled(2, 3);
    await h.runCommand('zoom-in');
    await applyFilterQuery('zqtarget');
    await browser.pause(200);
    expect(await renderedLines()).not.toContain('- zqtarget too');

    await h.runCommand('zoom-clear');
    await browser.pause(200);
    expect(await renderedLines()).toContain('- zqtarget too');
  });
});
