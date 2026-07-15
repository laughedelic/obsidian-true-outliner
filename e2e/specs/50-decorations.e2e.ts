/**
 * Outline-decorations Experiment 1 (additive-only indentation, no synthetic
 * marker) — see docs/research/07-decoration-experiments-plan.md. Screenshots
 * every fixture in the shared corpus, in both bundled themes (ground rule
 * #2: never just the fixture for whatever is currently being verified), plus
 * targeted computed-style/rect assertions for the success criteria that a
 * screenshot alone can't reliably catch a regression in.
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { ALL_DECORATION_FIXTURES } from '../fixtures/decorations.js';

const SCREENSHOT_DIR = path.join(process.cwd(), '.obsidian-cache', 'decorations-screenshots');

describe('outline decorations: experiment 1 (additive indentation)', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await fsp.mkdir(SCREENSHOT_DIR, { recursive: true });
  });

  after(async function () {
    await h.setTheme(false);
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('screenshots every fixture with outline mode on, light and dark', async function () {
    for (const fixture of ALL_DECORATION_FIXTURES) {
      await h.createNote(fixture.note, fixture.md);
      if (!(await h.isOutlineMode(fixture.note))) {
        await h.toggleOutlineMode();
        await h.waitForNotice('Outline mode on');
      }
      await h.dismissNotices();

      await h.setTheme(false);
      await browser.pause(150); // let CSS var recompute settle before capture
      await h.screenshotFull(SCREENSHOT_DIR, `${fixture.label}-light`);

      await h.setTheme(true);
      await browser.pause(150);
      await h.screenshotFull(SCREENSHOT_DIR, `${fixture.label}-dark`);
    }
  });

  // The synthetic corpus is hand-picked; real vault content (tab-indented
  // lists, soft-wrapped continuation via 2-space alignment, wikilinks) is
  // where the prior attempt's regressions actually surfaced. Not a
  // substitute for opening the user's own vault, but the closest available
  // check in this environment — real notes, real Obsidian rendering.
  it('screenshots real (non-synthetic) vault notes with outline mode on', async function () {
    const REAL_NOTES = [
      'Journal/2026-07-12.md', // tab-indented nested lists, multi-line items, a wikilink
      'Notes/Edge Case Zoo.md', // headings, atoms (code/table/callout), ordered list
      'Journal/2026-07-10.md', // a callout (widget-replaced atom) mixed with headings/lists
      'README.md', // a large table (widget-replaced atom)
    ];
    for (const note of REAL_NOTES) {
      await h.openNote(note);
      if (!(await h.isOutlineMode(note))) {
        await h.toggleOutlineMode();
        await h.waitForNotice('Outline mode on');
      }
      await h.dismissNotices();

      const slug = note.replace(/[\/ ]/g, '-').replace(/\.md$/, '');
      await h.setTheme(false);
      await browser.pause(150);
      await h.screenshotFull(SCREENSHOT_DIR, `real-${slug}-light`);
      await h.setTheme(true);
      await browser.pause(150);
      await h.screenshotFull(SCREENSHOT_DIR, `real-${slug}-dark`);

      await h.toggleOutlineMode(); // leave mode off for other specs
      await h.waitForNotice('Outline mode off');
      await h.dismissNotices();
    }
  });

  it('heading-then-list: list shifts right by the heading depth, per-level spacing untouched', async function () {
    await h.setTheme(false);
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'heading-then-list')!;
    await h.createNote(fixture.note, fixture.md);
    if (!(await h.isOutlineMode(fixture.note))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }

    // Lines: 0 "# Section", 1 blank, 2 "- top item", 3 "  - nested item",
    // 4 "    - deeply nested item".
    const headingPadding = await h.getLineComputedStyle(0, 'padding-left');
    expect(headingPadding).toBe('0px'); // depth 0

    const topRect = await h.getLineRect(2);
    const nestedRect = await h.getLineRect(3);
    const deepRect = await h.getLineRect(4);

    const topMargin = parseFloat(await h.getLineComputedStyle(2, 'margin-left'));
    const nestedMargin = parseFloat(await h.getLineComputedStyle(3, 'margin-left'));
    const deepMargin = parseFloat(await h.getLineComputedStyle(4, 'margin-left'));

    // Constant supplemental margin across the whole list chain (all three
    // list items share the same nearest-list-root depth: 1).
    expect(nestedMargin).toBeCloseTo(topMargin, 1);
    expect(deepMargin).toBeCloseTo(topMargin, 1);
    expect(topMargin).toBeGreaterThan(0); // shifted right by the heading

    // Native per-level spacing is untouched: consecutive levels still
    // step by the same delta as they would with outline mode off (the
    // constant margin cancels out of the difference by construction).
    const deltaTopNested = nestedRect.left - topRect.left;
    const deltaNestedDeep = deepRect.left - nestedRect.left;
    expect(deltaNestedDeep).toBeCloseTo(deltaTopNested, 1);

    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode off');
    await h.dismissNotices();
    const topRectOff = await h.getLineRect(2);
    const nestedRectOff = await h.getLineRect(3);
    const deepRectOff = await h.getLineRect(4);
    expect(nestedRectOff.left - topRectOff.left).toBeCloseTo(deltaTopNested, 1);
    expect(deepRectOff.left - nestedRectOff.left).toBeCloseTo(deltaNestedDeep, 1);
  });

  it('wide-numbering: no marker/text overlap across the 9->10 digit-width boundary', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'wide-numbering')!;
    await h.createNote(fixture.note, fixture.md);
    if (!(await h.isOutlineMode(fixture.note))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    // Line 8 is "9. nine", line 9 is "10. ten" — flat list, supplementalDepth
    // 0 for all (no non-list ancestors), so this is a pure native-rendering
    // regression check: our decoration must add nothing that could overlap.
    const nineMarker = await h.getLineChildRects(8, '.cm-formatting-list');
    const tenMarker = await h.getLineChildRects(9, '.cm-formatting-list');
    expect(nineMarker.length).toBeGreaterThan(0);
    expect(tenMarker.length).toBeGreaterThan(0);
    // The marker must not be wider than the text start position allows —
    // i.e. marker's right edge must not exceed the line's own left+margin.
    const nineRect = await h.getLineRect(8);
    const tenRect = await h.getLineRect(9);
    expect(nineMarker[0]!.left).toBeCloseTo(nineRect.left, 0);
    expect(tenMarker[0]!.left).toBeCloseTo(tenRect.left, 0);
  });

  it('multiline continuation: continuation lines indent identically to the node’s first line', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'multiline-continuation')!;
    await h.createNote(fixture.note, fixture.md);
    if (!(await h.isOutlineMode(fixture.note))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    // Lines: 0 "A paragraph that keeps going", 1 "onto a second visual
    // line...", 2 blank, 3 "- A list item that also", 4 "  keeps going...".
    const paraFirst = parseFloat(await h.getLineComputedStyle(0, 'padding-left'));
    const paraCont = parseFloat(await h.getLineComputedStyle(1, 'padding-left'));
    expect(paraCont).toBeCloseTo(paraFirst, 1);

    const listFirst = parseFloat(await h.getLineComputedStyle(3, 'margin-left'));
    const listCont = parseFloat(await h.getLineComputedStyle(4, 'margin-left'));
    expect(listCont).toBeCloseTo(listFirst, 1);
  });

  it('widget-replaced atoms (table, callout, hr, html) get margin-left too', async function () {
    // These four render as `.cm-embed-block` (table/callout/html) or `.hr`
    // (horizontal rule) — opaque replacement widgets in Live Preview, not a
    // plain `.cm-line`. A `Decoration.line` targeting that source line has
    // no effect at all on them (confirmed live); decorations.ts's companion
    // ViewPlugin patches their margin-left directly instead. Regression
    // fixture for the table/callout bug caught in real vault use after this
    // experiment first shipped.
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'widget-atoms')!;
    await h.createNote(fixture.note, fixture.md);
    if (!(await h.isOutlineMode(fixture.note))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    await browser.pause(150);

    const tableWrapperMargin = parseFloat(
      await h.getContentChildComputedStyle('.cm-embed-block.cm-table-widget', 0, 'margin-left'),
    );
    const calloutMargin = parseFloat(
      await h.getContentChildComputedStyle('.cm-embed-block.cm-callout', 0, 'margin-left'),
    );
    const hrMargin = parseFloat(await h.getContentChildComputedStyle('.cm-line.hr', 0, 'margin-left'));
    const htmlMargin = parseFloat(
      await h.getContentChildComputedStyle('.cm-embed-block.cm-html-embed', 0, 'margin-left'),
    );
    for (const value of [tableWrapperMargin, calloutMargin, hrMargin, htmlMargin]) {
      expect(value).toBeGreaterThan(0);
    }

    // The wrapper margins aren't required to match each other — a table's
    // own native left padding (for its row/column drag-handles) is
    // compensated out of its margin so its *visible* content still lines
    // up with everything else's visible box, which is the real invariant.
    const tableGridLeft = (await h.getContentChildRect('table.table-editor', 0)).left;
    const calloutBoxLeft = (await h.getContentChildRect('.callout', 0)).left;
    const hrLineLeft = (await h.getContentChildRect('.cm-line.hr', 0)).left;
    const htmlContentLeft = (
      await h.getContentChildRect('.cm-embed-block.cm-html-embed > div', 0)
    ).left;
    expect(calloutBoxLeft).toBeCloseTo(tableGridLeft, 0);
    expect(hrLineLeft).toBeCloseTo(tableGridLeft, 0);
    expect(htmlContentLeft).toBeCloseTo(tableGridLeft, 0);
  });

  it('fold indicator on a parent list item does not collide with decorated content', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'heading-then-list')!;
    await h.createNote(fixture.note, fixture.md);
    if (!(await h.isOutlineMode(fixture.note))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    // "- top item" (line 2) has a child ("nested item"), so Obsidian renders
    // a fold/collapse indicator on it (`.cm-fold-indicator`, confirmed
    // against a live build — the one native element that already burned an
    // attempt this cycle per the postmortem).
    const foldRects = await h.getLineChildRects(2, '.cm-fold-indicator');
    expect(foldRects.length).toBeGreaterThan(0);
    const textRects = await h.getLineChildRects(2, '.cm-formatting-list');
    expect(textRects.length).toBeGreaterThan(0);
    // Fold icon's right edge must not extend past the marker's left edge.
    expect(foldRects[0]!.left + foldRects[0]!.width).toBeLessThanOrEqual(textRects[0]!.left + 2);
  });
});
