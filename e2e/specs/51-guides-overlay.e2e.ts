/**
 * Outline-decorations Experiment 2a (guide lines via pixel-measured overlay)
 * — see docs/research/07-decoration-experiments-plan.md. Builds on
 * Experiment 1's indentation (branched off it); screenshots every fixture in
 * the shared corpus, in both bundled themes (ground rule #2: never just the
 * fixture for whatever is currently being verified), plus targeted rect
 * assertions for the guide-specific success criteria a screenshot alone
 * can't reliably catch a regression in — especially the multi-line/wrapped
 * continuation case, never even attempted in the prior cycle.
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { ALL_DECORATION_FIXTURES } from '../fixtures/decorations.js';

const SCREENSHOT_DIR = path.join(process.cwd(), '.obsidian-cache', 'guides-screenshots');
// The guide layer's recompute is debounced (50ms, see decorations.ts); every
// pause below clears that plus a safety margin.
const DEBOUNCE_SETTLE_MS = 200;

async function ensureOutlineMode(notePath: string): Promise<void> {
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

describe('outline decorations: experiment 2a (guide lines, overlay-measured)', function () {
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
      await ensureOutlineMode(fixture.note);
      await browser.pause(DEBOUNCE_SETTLE_MS);

      await h.setTheme(false);
      await browser.pause(150);
      await h.screenshotFull(SCREENSHOT_DIR, `${fixture.label}-light`);

      await h.setTheme(true);
      await browser.pause(150);
      await h.screenshotFull(SCREENSHOT_DIR, `${fixture.label}-dark`);
    }
  });

  it('screenshots real (non-synthetic) vault notes with outline mode on', async function () {
    const REAL_NOTES = [
      'Journal/2026-07-12.md', // tab-indented nested lists, multi-line items, a wikilink
      'Notes/Edge Case Zoo.md', // headings, atoms (code/table/callout), ordered list
      'Journal/2026-07-10.md', // a callout (widget-replaced atom) mixed with headings/lists
      'README.md', // a large table (widget-replaced atom)
    ];
    for (const note of REAL_NOTES) {
      await h.openNote(note);
      await ensureOutlineMode(note);
      await browser.pause(DEBOUNCE_SETTLE_MS);

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

  it('draws no guides with outline mode off', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'heading-then-list')!;
    await h.createNote(fixture.note, fixture.md);
    if (await h.isOutlineMode(fixture.note)) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode off');
      await h.dismissNotices();
    }
    await browser.pause(DEBOUNCE_SETTLE_MS);
    expect(await h.getGuideRects()).toHaveLength(0);
  });

  it('heading-then-list: only the non-list ancestor gets a guide, anchored at its own rendered position', async function () {
    // Deliberately no guide for "top item"/"nested item" (both list items):
    // Obsidian's native indent guides already connect one bullet precisely
    // to the next within a list, and a block-level guide of ours alongside
    // them either doubles up or reads as unevenly spaced (real-vault
    // finding — see docs/research/07-decoration-experiments-plan.md).
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'heading-then-list')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(DEBOUNCE_SETTLE_MS);

    // Lines: 0 "# Section", 2 "- top item", 3 "  - nested item",
    // 4 "    - deeply nested item".
    const guides = await h.getGuideRects();
    expect(guides).toHaveLength(1);

    // "# Section" has no native marker to hang from — its own line box
    // edge (padding-left) IS its rendered content start.
    const sectionRect = await h.getLineRect(0);
    expect(guides[0]!.left).toBeCloseTo(sectionRect.left, 0);
    // Its span still reaches the full list subtree, all the way to the
    // deepest descendant — only the *guide itself* is skipped for list
    // items, not the bridging span through them.
    const deepRect = await h.getLineRect(4);
    expect(guides[0]!.top + guides[0]!.height).toBeCloseTo(
      deepRect.top + deepRect.height,
      0,
    );
  });

  it('a pure list nesting fixture (no non-list ancestor) draws no guides at all', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'deep-nesting')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(DEBOUNCE_SETTLE_MS);
    // Every level (bullet and ordered alike) is a list item — all deferred
    // entirely to Obsidian's own native indent guides.
    expect(await h.getGuideRects()).toHaveLength(0);
  });

  it('multiline continuation: a guide through a multi-line child spans its FULL rendered height', async function () {
    // Bespoke note, not the shared corpus's MULTILINE_MD (whose two
    // multi-line nodes are both top-level siblings with no shared ancestor,
    // so neither gets a guide at all) — needs a multi-line node actually
    // nested under something to exercise the guide-through-it case.
    const note = 'Scratch/decorations-guide-multiline.md';
    const md = [
      '# Parent',
      '',
      'A paragraph that keeps going',
      'onto a second visual line via a soft break.',
      '',
    ].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(DEBOUNCE_SETTLE_MS);

    // "# Parent" (line 0) has one child, the 2-line paragraph (lines 2-3) —
    // its guide must reach past the paragraph's own first line into its
    // continuation line, which is what lineBlockAt (block-level) buys for
    // free over coordsAtPos (which would only measure one visual sub-row).
    const guides = await h.getGuideRects();
    expect(guides).toHaveLength(1);

    const firstLineRect = await h.getLineRect(2);
    const contLineRect = await h.getLineRect(3);
    const guide = guides[0]!;
    // The guide's bottom edge must reach at least to the continuation
    // line's own bottom — not stop short at the first line's bottom.
    expect(guide.top + guide.height).toBeGreaterThanOrEqual(
      contLineRect.top + contLineRect.height - 1,
    );
    expect(guide.top).toBeLessThanOrEqual(firstLineRect.top + 1);
  });

  it('multiline continuation: a non-list ancestor’s guide through a multi-line LIST-ITEM child spans its FULL rendered height', async function () {
    // The child being a list item must not matter here — only a list-item
    // *ancestor* (the guide's own anchor) is skipped; a non-list ancestor
    // (heading) still bridges into it exactly as it would into a paragraph.
    const note = 'Scratch/decorations-guide-multiline-list.md';
    const md = ['# Parent', '', '- child first line', '  second line of child', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(DEBOUNCE_SETTLE_MS);

    // Lines: 0 "# Parent", 2 "- child first line", 3 "  second line of child".
    const guides = await h.getGuideRects();
    expect(guides).toHaveLength(1);

    const firstLineRect = await h.getLineRect(2);
    const contLineRect = await h.getLineRect(3);
    const guide = guides[0]!;
    expect(guide.top + guide.height).toBeGreaterThanOrEqual(
      contLineRect.top + contLineRect.height - 1,
    );
    expect(guide.top).toBeLessThanOrEqual(firstLineRect.top + 1);
  });

  it('nests correctly: a deeper (non-list) ancestor’s guide is a strict, narrower subset of its parent’s span', async function () {
    const note = 'Scratch/decorations-guide-heading-nesting.md';
    const md = ['# A', '', '## B', '', '### C', '', 'para', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(DEBOUNCE_SETTLE_MS);

    // 3 heading levels, each nested under the previous, para as C's only
    // child — 3 guides (A's, B's, C's), each strictly narrower (starting
    // lower) than its parent's.
    const guides = await h.getGuideRects();
    expect(guides).toHaveLength(3);
    const byHeight = [...guides].sort((a, b) => b.height - a.height);
    // Each guide's vertical span must contain the next-narrower one's.
    for (let i = 0; i < byHeight.length - 1; i++) {
      const outer = byHeight[i]!;
      const inner = byHeight[i + 1]!;
      expect(outer.top).toBeLessThanOrEqual(inner.top + 1);
      expect(outer.top + outer.height).toBeGreaterThanOrEqual(inner.top + inner.height - 1);
    }
  });

  it('updates after a document edit (docChanged) without a mode toggle', async function () {
    const note = 'Scratch/decorations-guide-live-edit.md';
    await h.createNote(note, '# Parent\n\n- one\n- two\n');
    await ensureOutlineMode(note);
    await browser.pause(DEBOUNCE_SETTLE_MS);
    const before = (await h.getGuideRects())[0]!;
    expect(await h.getGuideRects()).toHaveLength(1); // "# Parent" only

    await h.setCursor(3, 5); // end of "- two"
    await h.keys.enter();
    await h.keys.type('three');
    await h.keys.tab(); // indent "- three" under "- two"
    await browser.pause(DEBOUNCE_SETTLE_MS);

    // "- two" is a list item, so gaining a child adds no guide of its own —
    // the count stays at 1 — but "# Parent"'s existing guide must now
    // reach further down to cover the new "- three" line, proving the
    // layer recomputed against the current (not stale) doc.
    const guidesAfter = await h.getGuideRects();
    expect(guidesAfter).toHaveLength(1);
    const after = guidesAfter[0]!;
    expect(after.top + after.height).toBeGreaterThan(before.top + before.height + 10);
  });
});
