/**
 * Outline-decorations Experiment 5b (block markers via reused CSS
 * background-layer mechanism) — see docs/research/07-decoration-
 * experiments-plan.md. Head-to-head alternative to Experiment 5a (new-DOM-
 * element icon markers, worked on a sibling branch), NOT a fallback:
 * screenshots every fixture in the shared corpus (including the newly
 * promoted `quote` fixture), in both bundled themes, plus targeted
 * computed-style assertions reading the `::after` pseudo's *resolved*
 * background-image (not just the raw `--to-marker` custom property we set),
 * same rigor 51-guides-gradient.e2e.ts already established.
 *
 * A first version gave each of the 8 eligible kinds its own distinct
 * shape+color (dot/ring/square/diamond/plus/tick/wedge/cross across 8
 * accent colors) — reviewed live and judged cryptic rather than helpful:
 * variety wasn't legible, it was noise. Replaced with a SINGLE, uniform
 * solid dot (same color as the guide lines, `var(--text-faint)`) for every
 * eligible kind — "a node starts here," not "here's what kind it is."
 *
 * Markers share the exact `::after` pseudo guides already use (see
 * styles.css: `background: var(--to-marker, none), var(--to-guides,
 * none);`) — CSS gives each line exactly two pseudo-elements and both are
 * already spoken for (native blockquote/callout bar uses `::before`; guides
 * use `::after`). The `to-decor-guides` gate (position: relative + the
 * whole ::after rule) now activates on EITHER a guide OR a marker being
 * present, so a depth-0 node with no ancestors (no guide of its own) still
 * shows a marker.
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { ALL_DECORATION_FIXTURES } from '../fixtures/decorations.js';

const SCREENSHOT_DIR = path.join(process.cwd(), '.obsidian-cache', 'block-markers-shapes-screenshots');

async function ensureOutlineMode(notePath: string): Promise<void> {
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

/** Total number of comma-joined image layers in a resolved background-image. */
function layerCount(backgroundImage: string): number {
  if (backgroundImage === 'none' || backgroundImage === '') return 0;
  return (backgroundImage.match(/-gradient\(/g) ?? []).length;
}

describe('outline decorations: experiment 5b (block markers, reused CSS-shape mechanism)', function () {
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
      await browser.pause(150);

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
      'Journal/2026-07-12.md',
      'Notes/Edge Case Zoo.md',
      'Journal/2026-07-10.md',
      'README.md',
    ];
    for (const note of REAL_NOTES) {
      await h.openNote(note);
      await ensureOutlineMode(note);
      await browser.pause(150);

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

  it('draws no markers with outline mode off', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'mixed')!;
    await h.createNote(fixture.note, fixture.md);
    if (await h.isOutlineMode(fixture.note)) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode off');
      await h.dismissNotices();
    }
    expect(await h.getLineClassList(0)).not.toContain('to-decor-guides');
  });

  it('a depth-0 heading with zero ancestors (no guide of its own) still gets a marker', async function () {
    // The real integration wrinkle this experiment introduces: the
    // to-decor-guides gate used to be guide-only (guideDepths.length > 0);
    // now it's `guideDepths.length > 0 || hasMarker`.
    const note = 'Scratch/decorations-marker-depth0.md';
    const md = '# A bare top-level heading\n\nA sibling paragraph.\n';
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    // Line 0 "# A bare..." — no ancestors, so no guide, but IS a marker-
    // eligible kind (heading) on its own first line.
    expect(await h.getLineClassList(0)).toContain('to-decor-guides');
    expect(await h.getLineComputedStyle(0, 'position')).toBe('relative');
    const bg = await h.getLinePseudoComputedStyle(0, 'background-image');
    expect(layerCount(bg)).toBeGreaterThan(0);

    // Line 2 "A sibling paragraph." — also depth 0, no ancestors, also a
    // marker-eligible kind (paragraph).
    const bg2 = await h.getLinePseudoComputedStyle(2, 'background-image');
    expect(layerCount(bg2)).toBeGreaterThan(0);
  });

  it('list items never get a marker — the native bullet/number already does this job', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'heading-then-list')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(150);

    // Lines 2/3/4 are all list items, bridged by "# Section"'s own guide —
    // to-decor-guides IS present (from the guide), but the resolved
    // background must be ONLY the guide's one repeating-linear-gradient
    // layer, never a marker shape layered on top.
    for (const line of [2, 3, 4]) {
      const bg = await h.getLinePseudoComputedStyle(line, 'background-image');
      const guideLayers = (bg.match(/repeating-linear-gradient\(/g) ?? []).length;
      expect(guideLayers).toBe(1);
      expect(layerCount(bg)).toBe(1); // no extra (marker) layers beyond the guide
    }
  });

  it('multiline continuation: the marker renders ONLY on the true first line, never the continuation', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'multiline-continuation')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(150);

    // Lines: 0 "A paragraph that keeps going" (first line, paragraph kind,
    // depth 0 — marker-eligible), 1 continuation (no marker).
    const firstBg = await h.getLinePseudoComputedStyle(0, 'background-image');
    expect(layerCount(firstBg)).toBeGreaterThan(0);

    // Continuation line: not isFirstLine, so no marker — and at depth 0
    // with no ancestors, no guide either, so to-decor-guides is absent
    // entirely (this is the byte-identical-to-off invariant Experiment 1
    // established; a marker on a continuation line would be a regression).
    expect(await h.getLineClassList(1)).not.toContain('to-decor-guides');
  });

  it('gap (blank trailing-separator) lines stay explicitly marker-free', async function () {
    // A leaf's own trailing gap carries a guide fact (see computeLineGuides)
    // but never a decorate() fact — no depth, no kind — so it must never
    // pick up a marker even when it inherits an ancestor's guide.
    const note = 'Scratch/decorations-marker-gap.md';
    const md = ['# Section', '', 'para one', '', 'para two', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    // Line 1 (blank gap right after "# Section", before "para one") carries
    // "# Section"'s guide (one repeating-linear-gradient layer) — and
    // NOTHING else, confirming the gap line's marker-free decoration path
    // (gapLineDecoration) was taken, not the full lineDecoration() one.
    const gapBg = await h.getLinePseudoComputedStyle(1, 'background-image');
    const guideLayers = (gapBg.match(/repeating-linear-gradient\(/g) ?? []).length;
    expect(guideLayers).toBe(1);
    expect(layerCount(gapBg)).toBe(1);
  });

  it('each of the 8 eligible kinds resolves a non-empty marker background-image', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'widget-atoms')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(150);

    // Plain .cm-line kinds: heading (line 0).
    const headingBg = await h.getLinePseudoComputedStyle(0, 'background-image');
    expect(layerCount(headingBg)).toBeGreaterThan(0);

    // Widget-rendered kinds: table, callout, hr, html (same selectors
    // 51-guides-gradient.e2e.ts already uses for these).
    const tableBg = await h.getContentChildPseudoComputedStyle(
      '.cm-embed-block.cm-table-widget',
      0,
      'background-image',
    );
    expect(layerCount(tableBg)).toBeGreaterThan(0);

    const calloutBg = await h.getContentChildPseudoComputedStyle(
      '.cm-embed-block.cm-callout',
      0,
      'background-image',
    );
    expect(layerCount(calloutBg)).toBeGreaterThan(0);

    const hrBg = await h.getContentChildPseudoComputedStyle('.cm-line.hr', 0, 'background-image');
    expect(layerCount(hrBg)).toBeGreaterThan(0);

    const htmlBg = await h.getContentChildPseudoComputedStyle(
      '.cm-embed-block.cm-html-embed',
      0,
      'background-image',
    );
    expect(layerCount(htmlBg)).toBeGreaterThan(0);
  });

  it('code and quote (plain-.cm-line atoms) each get a marker on their own first line only', async function () {
    const note = 'Scratch/decorations-marker-code-quote.md';
    const md = ['# Section', '', '```js', 'line one', 'line two', '```', '', '> quoted', '> continuation', ''].join(
      '\n',
    );
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    // Lines: 0 "# Section", 2 ``` (code opener, first line, gets a marker
    // PLUS "# Section"'s bridging guide), 3/4 body (bridging guide only,
    // no marker — not the first line), 7 "> quoted" (first line, marker
    // plus guide), 8 continuation (guide only, no marker).
    const codeOpenerBg = await h.getLinePseudoComputedStyle(2, 'background-image');
    const codeOpenerGuideLayers = (codeOpenerBg.match(/repeating-linear-gradient\(/g) ?? []).length;
    expect(codeOpenerGuideLayers).toBe(1);
    expect(layerCount(codeOpenerBg)).toBeGreaterThan(codeOpenerGuideLayers); // marker on top

    const codeBodyBg = await h.getLinePseudoComputedStyle(3, 'background-image');
    expect(layerCount(codeBodyBg)).toBe(1); // guide only, no marker

    const quoteFirstBg = await h.getLinePseudoComputedStyle(7, 'background-image');
    const quoteFirstGuideLayers = (quoteFirstBg.match(/repeating-linear-gradient\(/g) ?? []).length;
    expect(quoteFirstGuideLayers).toBe(1);
    expect(layerCount(quoteFirstBg)).toBeGreaterThan(quoteFirstGuideLayers); // marker on top

    const quoteContinuationBg = await h.getLinePseudoComputedStyle(8, 'background-image');
    expect(layerCount(quoteContinuationBg)).toBe(1); // guide only, no marker
  });

  it('quote fixture (newly promoted into the shared corpus): marker AND native colored bar coexist', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'quote')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(150);

    // Line 2 "> A quoted line" — depth 1 under "# Section", first line of a
    // quote-kind node: gets both "# Section"'s bridging guide AND its own
    // marker, composed into the SAME resolved background-image.
    const bg = await h.getLinePseudoComputedStyle(2, 'background-image');
    const guideLayers = (bg.match(/repeating-linear-gradient\(/g) ?? []).length;
    expect(guideLayers).toBe(1);
    expect(layerCount(bg)).toBeGreaterThan(1); // guide layer PLUS marker layer(s)

    // The native colored bar (::before, border-left) must still be intact —
    // same coexistence guides already proved, now re-verified with a
    // marker also active on the same line.
    const nativeBorder = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const quoteLine = cm.contentDOM.querySelectorAll(':scope > .cm-line')[2] as HTMLElement;
      return getComputedStyle(quoteLine, '::before').borderLeft;
    });
    expect(nativeBorder).toContain('solid');
    expect(nativeBorder).not.toContain('none');
  });

  it('updates after a document edit without a mode toggle', async function () {
    const note = 'Scratch/decorations-marker-live-edit.md';
    await h.createNote(note, '# Parent\n\nfirst\n');
    await ensureOutlineMode(note);
    await browser.pause(150);
    expect(layerCount(await h.getLinePseudoComputedStyle(2, 'background-image'))).toBeGreaterThan(0);

    await h.setCursor(2, 5); // end of "first"
    await h.keys.enter();
    await h.keys.type('second');
    await browser.pause(150);

    // "second" (new line 3) is a new sibling paragraph — also marker-
    // eligible, proving the StateField recomputed against the current doc.
    expect(layerCount(await h.getLinePseudoComputedStyle(3, 'background-image'))).toBeGreaterThan(0);
  });

  describe('marker vertical position (live-measured, not guessed)', function () {
    // Regression coverage for real-vault feedback: a first version used
    // CSS-only Y formulas (a plain `%` for most kinds, a fixed length for
    // headings and widget atoms) that got every one of these cases wrong —
    // headings didn't scale with level at all, a single-line paragraph sat
    // at its own top edge (a `calc(50% - HALF)` double-correction bug: `%`
    // in `background-position` already accounts for image size), and a
    // wrapped paragraph/widget atom centered on its ENTIRE height instead
    // of just the first visual row. Fixed by measuring live via
    // `Range.getClientRects()` in `MarginCompensation`, the same
    // "measure, don't guess" discipline `nativeMarginBasePx` already uses.

    async function markerYPx(lineIndex: number): Promise<number> {
      const pos = await h.getLinePseudoComputedStyle(lineIndex, 'background-position');
      // "Xpx Ypx, ..." (marker layer is always listed first) or "Xpx Y%, ...".
      const first = pos.split(',')[0]!.trim();
      const y = first.split(/\s+/)[1]!;
      return parseFloat(y);
    }

    it('scales with heading level instead of using a fixed offset', async function () {
      const note = 'Scratch/decorations-marker-heading-scale.md';
      const md = ['# H1', 'child', '', '###### H6', 'child', ''].join('\n');
      await h.createNote(note, md);
      await ensureOutlineMode(note);
      await browser.pause(150);

      const h1Rect = await h.getLineRect(0);
      const h6Rect = await h.getLineRect(3);
      const h1Y = await markerYPx(0);
      const h6Y = await markerYPx(3);
      // H1's line is meaningfully taller than H6's (bigger font/line-height)
      // — confirms the fixture actually exercises different heading sizes.
      expect(h1Rect.height).toBeGreaterThan(h6Rect.height + 5);
      // A FIXED-length bug (the earlier version) would give H1 and H6 the
      // SAME absolute marker Y regardless of their very different line
      // heights; a correctly scaling one must differ.
      expect(Math.abs(h1Y - h6Y)).toBeGreaterThan(3);
      // And both should land within their own line's rendered height —
      // not near zero (too high) and not past the bottom edge.
      expect(h1Y).toBeGreaterThan(4);
      expect(h1Y).toBeLessThan(h1Rect.height - 2);
      expect(h6Y).toBeGreaterThan(2);
      expect(h6Y).toBeLessThan(h6Rect.height - 1);
    });

    it('centers on a single-line paragraph, not its top edge', async function () {
      const note = 'Scratch/decorations-marker-para-center.md';
      const md = ['# Section', '', 'Short paragraph.', ''].join('\n');
      await h.createNote(note, md);
      await ensureOutlineMode(note);
      await browser.pause(150);

      const rect = await h.getLineRect(2);
      const y = await markerYPx(2);
      // A double-corrected `calc(50% - HALF)` bug put this within a few px
      // of 0 (the top edge); genuinely centered means roughly the middle
      // third of the line's own height.
      expect(y).toBeGreaterThan(rect.height * 0.3);
      expect(y).toBeLessThan(rect.height * 0.7);
    });

    it('a WRAPPED (multi-visual-row) paragraph centers on its FIRST row only, not the whole block', async function () {
      const note = 'Scratch/decorations-marker-para-wrapped.md';
      const md = [
        '# Section',
        '',
        'A paragraph that keeps going onto a second visual line because it is quite long and the pane is narrow enough to force a wrap here for sure this time definitely.',
        '',
      ].join('\n');
      await h.createNote(note, md);
      await ensureOutlineMode(note);
      await browser.pause(150);

      const rect = await h.getLineRect(2);
      const y = await markerYPx(2);
      // This fixture must actually wrap (several visual rows tall) to be a
      // real test of the bug, not a vacuous one.
      expect(rect.height).toBeGreaterThan(35);
      // Centered on the whole (wrapped) block would put Y near half the
      // total height; centered on just the first row keeps it small and
      // close to what a plain single-line paragraph already measured.
      expect(y).toBeLessThan(rect.height * 0.35);
    });

    it('a WRAPPED blockquote centers on its FIRST row only', async function () {
      const note = 'Scratch/decorations-marker-quote-wrapped.md';
      const md = [
        '# Section',
        '',
        '> A quote that keeps going onto a second visual line because it is quite long and the pane is narrow enough to force a wrap here for sure this time definitely too.',
        '',
      ].join('\n');
      await h.createNote(note, md);
      await ensureOutlineMode(note);
      await browser.pause(150);

      const rect = await h.getLineRect(2);
      const y = await markerYPx(2);
      expect(rect.height).toBeGreaterThan(35);
      expect(y).toBeLessThan(rect.height * 0.35);
    });

    it('a callout aligns with its title row, not the literal top of the whole (possibly multi-line) block', async function () {
      const note = 'Scratch/decorations-marker-callout-title.md';
      const md = ['# Section', '', '> [!note] Title', '> body line one', '> body line two', ''].join(
        '\n',
      );
      await h.createNote(note, md);
      await ensureOutlineMode(note);
      await browser.pause(150);

      const rect = await h.getContentChildRect('.cm-embed-block.cm-callout', 0);
      const pos = await h.getContentChildPseudoComputedStyle(
        '.cm-embed-block.cm-callout',
        0,
        'background-position',
      );
      const y = parseFloat(pos.split(',')[0]!.trim().split(/\s+/)[1]!);
      // A body-spanning callout is meaningfully taller than just its title
      // row — centering on the WHOLE block (the pre-fix behavior for a
      // fixed-top-anchor guess, and the failure mode a naive `50%` would
      // also have) would push Y well past a third of the total height.
      expect(rect.height).toBeGreaterThan(50);
      expect(y).toBeLessThan(rect.height * 0.4);
    });

    it('a table aligns with its first row/header, not the literal top of a multi-row table', async function () {
      const note = 'Scratch/decorations-marker-table-row.md';
      const md = [
        '# Section',
        '',
        '| a | b |',
        '| --- | --- |',
        '| 1 | 2 |',
        '| 3 | 4 |',
        '| 5 | 6 |',
        '',
      ].join('\n');
      await h.createNote(note, md);
      await ensureOutlineMode(note);
      await browser.pause(150);

      const rect = await h.getContentChildRect('.cm-embed-block.cm-table-widget', 0);
      const pos = await h.getContentChildPseudoComputedStyle(
        '.cm-embed-block.cm-table-widget',
        0,
        'background-position',
      );
      const y = parseFloat(pos.split(',')[0]!.trim().split(/\s+/)[1]!);
      expect(rect.height).toBeGreaterThan(80);
      expect(y).toBeLessThan(rect.height * 0.4);
    });
  });
});
