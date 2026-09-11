/**
 * Outline-decorations Experiment 2b (guide lines via CSS stacked-gradient)
 * — see docs/research/09-experiment-2-guide-lines.md. Head-to-head
 * alternative to Experiment 2a (pixel-measured overlay), NOT a fallback:
 * screenshots every fixture in the shared corpus, in both bundled themes
 * (ground rule #2), plus targeted computed-style assertions — reading the
 * `::after` pseudo-element's *resolved* background, not just the raw
 * `--to-guides` custom property we set, so a silent cascade override
 * couldn't slip past unnoticed the way DOM-attribute-only checks did in
 * the original postmortem.
 *
 * Guides render on every kind (block, atom, list item, and — after
 * overriding Obsidian's native `contain: paint` — widget-replaced atoms,
 * table included via a second, `.table-wrapper`-decoupling fix, see
 * styles.css's doc comment). See styles.css's doc comments for the full
 * reasoning — an earlier version of this code wrongly concluded margin-
 * shifted lines could never render a guide at all; that was a real bug in
 * the reasoning, corrected after empirical pushback, not a structural CSS
 * limitation. Three further real bugs were found the same way (user
 * pushback → live verification, not assumption): the guide's own
 * `::before` was clobbering a blockquote's native colored bar (also
 * `::before`) — fixed by moving to `::after`; margin-based lines were
 * replacing, not adding to, Obsidian's own native "readable line width"
 * centering margin — fixed by `MarginCompensation` reading that native
 * base live and combining it; and the table's guide-vs-scroll conflict
 * (see styles.css) — fixed, confirmed both by computed style and by a
 * human actually using the table's scrollbar in a real running vault.
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { ALL_DECORATION_FIXTURES, createFixture } from '../fixtures/decorations.js';

const SCREENSHOT_DIR = path.join(process.cwd(), '.obsidian-cache', 'guides-gradient-screenshots');

async function ensureOutlineMode(notePath: string): Promise<void> {
  await h.setOutlineMode(true);
}

/** Number of `repeating-linear-gradient(` layers in a resolved background-image. */
function gradientLayerCount(backgroundImage: string): number {
  if (backgroundImage === 'none' || backgroundImage === '') return 0;
  return (backgroundImage.match(/repeating-linear-gradient\(/g) ?? []).length;
}

describe('outline decorations: experiment 2b (guide lines, CSS stacked-gradient)', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    // Base-layer spec: the caret-derived accents stay off so a guide/marker
    // assertion measures what it was written to measure (see the helper).
    await h.pinPositionIndicatorsOff();
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
      await createFixture(fixture, h.createNote);
      await ensureOutlineMode(fixture.note);
      // `settleMs` covers a fixture whose own rendering is ASYNCHRONOUS —
      // an embed resolves its link and renders another note, and a shorter
      // wait screenshots the pre-embed line instead.
      await browser.pause(150 + (fixture.settleMs ?? 0));

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
      await browser.pause(150);

      const slug = note.replace(/[\/ ]/g, '-').replace(/\.md$/, '');
      await h.setTheme(false);
      await browser.pause(150);
      await h.screenshotFull(SCREENSHOT_DIR, `real-${slug}-light`);
      await h.setTheme(true);
      await browser.pause(150);
      await h.screenshotFull(SCREENSHOT_DIR, `real-${slug}-dark`);

      await h.setOutlineMode(false);
    }
  });

  it('draws no guides with outline mode off', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'heading-then-list')!;
    await h.createNote(fixture.note, fixture.md);
    await h.setOutlineMode(false);
    expect(await h.getLineClassList(0)).not.toContain('to-decor-guides');
  });

  it('a non-list ancestor’s guide sets a resolved gradient background on its own descendant BLOCK lines', async function () {
    const note = 'Scratch/decorations-guide-heading-para.md';
    const md = ['# Parent', '', 'A child paragraph.', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    // "# Parent" (line 0) is the owner, not its own descendant — no guide
    // class on its own line.
    expect(await h.getLineClassList(0)).not.toContain('to-decor-guides');
    // "A child paragraph." (line 2) is a descendant block line — one active
    // ancestor guide (depth 0).
    expect(await h.getLineClassList(2)).toContain('to-decor-guides');
    const bg = await h.getLinePseudoComputedStyle(2, 'background-image');
    expect(gradientLayerCount(bg)).toBe(1);
    expect(await h.getLineComputedStyle(2, 'position')).toBe('relative');
  });

  it('heading-then-list: the bridging guide DOES render through list-item lines too', async function () {
    // A list-item line's own box IS shifted by margin-left (not padding-
    // left), which an earlier version of this code wrongly assumed made a
    // guide impossible there. Fix: widen the pseudo's own box leftward by
    // --to-own-shift (the line's own known margin, e.g. supplementalDepth
    // * unit for list items) instead of matching the line's box exactly —
    // confirmed live (screenshot + computed style) that nothing clips
    // that leftward overflow on a plain `.cm-line`.
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'heading-then-list')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(150);

    // Lines: 0 "# Section", 2 "- top item", 3 "  - nested item",
    // 4 "    - deeply nested item". Every one is a descendant of the heading,
    // so every one carries its bridging guide — AND, since
    // lists-on-the-outline-grid, each list level draws its own on the same
    // grid. Layer counts therefore step with depth instead of staying at the
    // heading's single layer: the item at 2 has only the heading above it, the
    // one at 3 has the heading and the item at 2, and so on.
    const expectedLayers: Record<number, number> = { 2: 1, 3: 2, 4: 3 };
    for (const line of [2, 3, 4]) {
      const classes = await h.getLineClassList(line);
      expect(classes).toContain('to-decor-guides');
      const bg = await h.getLinePseudoComputedStyle(line, 'background-image');
      expect(gradientLayerCount(bg)).toBe(expectedLayers[line]);
    }
  });

  it('widget-replaced atoms: callout/hr/html/table all get the guide after overriding Obsidian’s native contain:paint', async function () {
    // Obsidian's own app.css sets `contain: paint !important` on
    // `.cm-content > [contenteditable="false"]` (all four widget-replaced
    // atom kinds) — paint containment clips ALL descendant painting to
    // the element's own box regardless of `overflow`, independently of
    // the padding/margin cascade fight Experiment 1 already solved.
    // styles.css overrides it by matching Obsidian's own selector
    // specificity (same lesson: matching beats escalating `!important`).
    //
    // Table additionally needed its own `overflow-x: auto` (for horizontal
    // scroll of wide tables) decoupled from the outer element the guide's
    // pseudo lives on: Obsidian's table widget already wraps the actual
    // `<table>` in an inner `.table-wrapper` div, so moving overflow-x:auto
    // onto THAT (while the outer stays `overflow: visible`) lets the guide
    // bleed left unclipped while the wrapper independently still scrolls
    // the wide content. This computed-style check confirms both conditions
    // hold simultaneously; a human has also confirmed live, in a real
    // running vault, that the scrollbar itself (trackpad swipe,
    // click-drag) still works with no visual or usability defects — see
    // docs/research/09-experiment-2-guide-lines.md.
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'widget-atoms')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(150);

    const calloutBg = await h.getContentChildPseudoComputedStyle(
      '.cm-embed-block.cm-callout',
      0,
      'background-image',
    );
    expect(gradientLayerCount(calloutBg)).toBe(1);
    const hrBg = await h.getContentChildPseudoComputedStyle('.cm-line.hr', 0, 'background-image');
    expect(gradientLayerCount(hrBg)).toBe(1);
    const htmlBg = await h.getContentChildPseudoComputedStyle(
      '.cm-embed-block.cm-html-embed',
      0,
      'background-image',
    );
    expect(gradientLayerCount(htmlBg)).toBe(1);

    const tableBg = await h.getContentChildPseudoComputedStyle(
      '.cm-embed-block.cm-table-widget',
      0,
      'background-image',
    );
    expect(gradientLayerCount(tableBg)).toBe(1);

    // The outer table element no longer overflows anything itself (its
    // .table-wrapper child now scrolls internally instead), so the guide's
    // leftward-widened pseudo is unclipped.
    const outerOverflows = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const outer = cm.contentDOM.querySelector('.cm-embed-block.cm-table-widget') as HTMLElement;
      return { scrollWidth: outer.scrollWidth, clientWidth: outer.clientWidth };
    });
    expect(outerOverflows.scrollWidth).toBe(outerOverflows.clientWidth);
  });

  it('wide-table fixture: guide renders AND the table keeps its own real horizontal scroll (not the whole document)', async function () {
    // Regression test for the specific real-vault finding: forcing
    // `overflow: visible` on the table widget's outer element alone (to
    // let the guide's pseudo bleed left) breaks its own wide-content
    // scrolling — confirmed live that a 15-column table's content spills
    // off the pane with no scrollbar, AND the whole document becomes
    // horizontally scrollable instead of just the table. Fixed by moving
    // `overflow-x: auto` onto Obsidian's own inner `.table-wrapper` div
    // (distinct from the outer element) instead — confirmed live, by a
    // human using the actual scrollbar, that this restores real, contained
    // scrolling with no visual/usability defects. This fixture is wide
    // enough (scrollWidth far exceeding clientWidth) to actually exercise
    // that scroll, not just assert computed styles that could pass
    // trivially on a table that never needed to scroll in the first place.
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'wide-table')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(150);

    const info = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const outer = cm.contentDOM.querySelector('.cm-embed-block.cm-table-widget') as HTMLElement;
      const wrapper = outer.querySelector('.table-wrapper') as HTMLElement;
      const scroller = cm.scrollDOM as HTMLElement;
      return {
        outerScrollWidth: outer.scrollWidth,
        outerClientWidth: outer.clientWidth,
        wrapperScrollWidth: wrapper.scrollWidth,
        wrapperClientWidth: wrapper.clientWidth,
        scrollerScrollWidth: scroller.scrollWidth,
        scrollerClientWidth: scroller.clientWidth,
      };
    });

    // The outer widget element itself no longer overflows (nothing for
    // the guide's pseudo to be clipped by).
    expect(info.outerScrollWidth).toBe(info.outerClientWidth);
    // The inner .table-wrapper DOES genuinely overflow — this fixture is
    // wide enough to need real scrolling, confirming the test isn't
    // vacuously true.
    expect(info.wrapperScrollWidth).toBeGreaterThan(info.wrapperClientWidth + 500);
    // The EDITOR's own scroller must NOT be forced to scroll horizontally
    // by the table — that was the actual regression (whole document
    // scrolling instead of just the table).
    expect(info.scrollerScrollWidth).toBeLessThanOrEqual(info.scrollerClientWidth + 2);

    // The guide itself is still present on the table.
    const tableBg = await h.getContentChildPseudoComputedStyle(
      '.cm-embed-block.cm-table-widget',
      0,
      'background-image',
    );
    expect(gradientLayerCount(tableBg)).toBe(1);

    // And the wrapper's own scrollLeft is genuinely functional (not inert,
    // as it was when overflow was forced visible on the wrong element).
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const outer = cm.contentDOM.querySelector('.cm-embed-block.cm-table-widget') as HTMLElement;
      const wrapper = outer.querySelector('.table-wrapper') as HTMLElement;
      wrapper.scrollLeft = 300;
    });
    const scrollLeftAfter = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const outer = cm.contentDOM.querySelector('.cm-embed-block.cm-table-widget') as HTMLElement;
      const wrapper = outer.querySelector('.table-wrapper') as HTMLElement;
      return wrapper.scrollLeft;
    });
    expect(scrollLeftAfter).toBe(300);
  });

  it('a pure list nesting fixture draws one guide per ancestor level', async function () {
    // This used to assert NO guide anywhere: a pure list was deferred entirely
    // to Obsidian's own indent guides, on columns our fixed unit did not match.
    // lists-on-the-outline-grid puts every list level on the grid and takes the
    // drawing, so the deepest item now carries one layer per ancestor above it.
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'deep-nesting')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    // Pinned into content space deliberately: a caret resting on a blank line is
    // a PROVISIONAL POSITION, which is a caret-derived layer and may decorate
    // that one line. This assertion is about the base layers, so it measures
    // with the caret where a base-layer assertion means it to be.
    await h.setCursor(0, 1);
    await browser.pause(150);

    // The root item has no ancestor and so no guide; each level below it adds
    // exactly one.
    expect(await h.getLineClassList(0)).not.toContain('to-decor-guides');
    for (let line = 1; line < 4; line++) {
      expect(await h.getLineClassList(line)).toContain('to-decor-guides');
      const bg = await h.getLinePseudoComputedStyle(line, 'background-image');
      expect(gradientLayerCount(bg)).toBe(line);
    }
  });

  it('multiline continuation: a guide renders identically on a BLOCK node’s own first line AND its continuation line', async function () {
    // Unlike Experiment 2a (which needs lineBlockAt's block-level top/bottom
    // to span a multi-line node's full rendered height in ONE overlay div),
    // this needs no special handling at all: each physical source line is
    // its own separate CM6 `.cm-line` with its own `Decoration.line`, so
    // computeLineGuides already assigns the same guideDepths to every one
    // of a node's own lines (see its doc comment) — continuation coverage
    // falls out of the per-line design "for free," never needing to know
    // any pixel height. Verify that isn't secretly wrong, not just assume it.
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
    await browser.pause(150);

    // Lines: 0 "# Parent", 2 first line, 3 continuation line.
    for (const line of [2, 3]) {
      expect(await h.getLineClassList(line)).toContain('to-decor-guides');
      const bg = await h.getLinePseudoComputedStyle(line, 'background-image');
      expect(gradientLayerCount(bg)).toBe(1);
    }
  });

  it('multiline continuation through a LIST-ITEM child: both lines render the bridging guide', async function () {
    const note = 'Scratch/decorations-guide-multiline-list.md';
    const md = ['# Parent', '', '- child first line', '  second line of child', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    for (const line of [2, 3]) {
      expect(await h.getLineClassList(line)).toContain('to-decor-guides');
      const bg = await h.getLinePseudoComputedStyle(line, 'background-image');
      expect(gradientLayerCount(bg)).toBe(1);
    }
  });

  it('nests correctly: each deeper (non-list) ancestor’s descendant carries one more active gradient layer', async function () {
    const note = 'Scratch/decorations-guide-heading-nesting.md';
    const md = ['# A', '', '## B', '', '### C', '', 'para', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    // Lines: 0 "# A" (owner only, 0 layers), 2 "## B" (1: A),
    // 4 "### C" (2: A, B), 6 "para" (3: A, B, C).
    expect(gradientLayerCount(await h.getLinePseudoComputedStyle(0, 'background-image'))).toBe(0);
    expect(gradientLayerCount(await h.getLinePseudoComputedStyle(2, 'background-image'))).toBe(1);
    expect(gradientLayerCount(await h.getLinePseudoComputedStyle(4, 'background-image'))).toBe(2);
    expect(gradientLayerCount(await h.getLinePseudoComputedStyle(6, 'background-image'))).toBe(3);
  });

  it('every blank gap line between "# A"/"## B"/"### C"/"para" also carries the guide — true continuity, no breaks', async function () {
    // Same fixture as the nesting test above, but checking the BLANK LINES
    // in between (1, 3, 5) instead of the content lines. An earlier version
    // left the gap right after a heading with a child ("before its own
    // first child") uncovered, reasoning it matched Experiment 2a's own
    // span (which also starts at the first child's own line) — but real-
    // vault review found this reads as a real, visible break, not
    // acceptable parity, so it's covered now: a genuine improvement over
    // 2a's own behavior, not just matching it.
    const note = 'Scratch/decorations-guide-gap-continuity.md';
    const md = ['# A', '', '## B', '', '### C', '', 'para', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    // Line 1 (gap after "# A", before "## B"): "# A" just became a guide
    // owner, so this gap already carries its one layer.
    expect(await h.getLineClassList(1)).toContain('to-decor-guides');
    expect(gradientLayerCount(await h.getLinePseudoComputedStyle(1, 'background-image'))).toBe(1);
    // Line 3 (gap after "## B", before "### C"): both A and B now own guides.
    expect(gradientLayerCount(await h.getLinePseudoComputedStyle(3, 'background-image'))).toBe(2);
    // Line 5 (gap after "### C", before "para"): A, B, and C all own guides.
    expect(gradientLayerCount(await h.getLinePseudoComputedStyle(5, 'background-image'))).toBe(3);
  });

  it('ends a guide at its section’s last content line, leaving the blanks below it bare', async function () {
    // The other half of the continuity rule above: a gap keeps the guide while
    // the subtree continues below it, and drops it where the subtree is over.
    // 0 "# A"  1 ""  2 "para one"  3 ""  4 "para two"  5 ""  6 ""
    const note = 'Scratch/decorations-guide-tail.md';
    await h.createNote(note, ['# A', '', 'para one', '', 'para two', '', ''].join('\n'));
    await ensureOutlineMode(note);
    await browser.pause(150);

    const layers = async (n: number) =>
      gradientLayerCount(await h.getLinePseudoComputedStyle(n, 'background-image'));
    // The interior gap reads exactly like the content rows around it.
    expect(await layers(3)).toBe(await layers(2));
    expect(await layers(3)).toBe(await layers(4));
    expect(await layers(4)).toBeGreaterThan(0);
    // The rows below the last paragraph carry nothing — not the class either.
    expect(await layers(5)).toBe(0);
    expect(await layers(6)).toBe(0);
    expect(await h.getLineClassList(5)).not.toContain('to-decor-guides');
  });

  it('drops every guide a run of blanks closes on the same row', async function () {
    // 0 "# A"  1 ""  2 "## B"  3 ""  4 "### C"  5 ""  6 "deep"  7 ""  8 ""  9 "## B2"
    const note = 'Scratch/decorations-guide-run.md';
    const md = ['# A', '', '## B', '', '### C', '', 'deep', '', '', '## B2', '', 'x', ''].join(
      '\n',
    );
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    const layers = async (n: number) =>
      gradientLayerCount(await h.getLinePseudoComputedStyle(n, 'background-image'));
    const run = [await layers(7), await layers(8)];
    // Every row of one run has the same content line below it, so they resolve
    // the same count as each other — no staircase inside the run.
    expect(run[0]).toBe(run[1]);
    // Lower than the content row above it, and exactly what the content below
    // it carries, which is the rule stated as a relationship.
    expect(run[0]).toBeLessThan(await layers(6));
    expect(run[0]).toBe(await layers(9));
  });

  it('extends the guide to a caret parked past the end of a section, and back when it leaves', async function () {
    // 0 "# A"  1 ""  2 "para"  3 ""  4 ""
    const note = 'Scratch/decorations-guide-provisional.md';
    await h.createNote(note, ['# A', '', 'para', '', ''].join('\n'));
    await ensureOutlineMode(note);
    await browser.pause(150);

    const layers = async (n: number) =>
      gradientLayerCount(await h.getLinePseudoComputedStyle(n, 'background-image'));
    // With the caret in content space the section is over at "para".
    await h.setCursor(2, 4);
    await browser.pause(150);
    expect(await layers(3)).toBe(0);
    expect(await layers(4)).toBe(0);

    // Parked on the blank line, the position stands for a node the section
    // would contain, so the guide reaches it — and the row between, or the
    // extension would have a hole in it.
    await h.setCursor(4, 0);
    await browser.pause(150);
    expect(await layers(4)).toBeGreaterThan(0);
    expect(await layers(3)).toBe(await layers(4));

    // And leaves with the caret.
    await h.setCursor(2, 4);
    await browser.pause(150);
    expect(await layers(4)).toBe(0);
  });

  it('a position that left a subtree drops its guide, as the typed row will, zoomed or not', async function () {
    // A list whose parent is a paragraph. Enter, Enter at the end of "- b"
    // leaves a position standing for "para"'s sibling, so "para"'s guide is
    // not the position's to carry: the row renders what it renders once a
    // character is typed there. "# Top" sits above the zoomed section, so the
    // zoomed half has hidden rows and runs in the scope's own numbering.
    const md = ['# Top', '', '## H', '', 'para', '', '- a', '- b', ''].join('\n');
    const layers = async (n: number) =>
      gradientLayerCount(await h.getLinePseudoComputedStyle(n, 'background-image'));

    for (const zoomed of [false, true]) {
      const note = `Scratch/decorations-guide-position-left-subtree-${zoomed ? 'zoomed' : 'plain'}.md`;
      await h.createNote(note, md);
      await ensureOutlineMode(note);
      if (zoomed) {
        await h.setCursorSettled(2, 4);
        await h.runCommand('zoom-in'); // into "## H"
        await browser.pause(300);
      }
      await h.setCursorSettled(7, 3);
      await h.keys.enter();
      await h.keys.enter();
      await browser.pause(300);
      expect(await h.getCursor()).toEqual({ line: 8, ch: 0 });

      // Rendered rows, not document lines: a zoom leaves hidden lines out of
      // the DOM, so the rows are found from "para", whose text renders as is.
      const para = (await h.renderedLineTexts()).findIndex((t) => t === 'para');
      expect(para).toBeGreaterThan(-1);
      const item = para + 3;
      const position = para + 4;

      const asPosition = await layers(position);
      expect(asPosition).toBeLessThan(await layers(item));

      await h.keys.type('x');
      await browser.pause(300);
      expect(await layers(position)).toBe(asPosition);

      if (zoomed) {
        await h.runCommand('zoom-clear');
        await browser.pause(200);
      }
    }
  });

  it('updates after a document edit without a mode toggle', async function () {
    const note = 'Scratch/decorations-guide-live-edit.md';
    await h.createNote(note, '# Parent\n\nfirst\n');
    await ensureOutlineMode(note);
    await browser.pause(150);
    expect(gradientLayerCount(await h.getLinePseudoComputedStyle(2, 'background-image'))).toBe(1);

    await h.setCursor(2, 5); // end of "first"
    await h.keys.enter();
    await h.keys.type('second');
    await browser.pause(150);

    // "second" (new line 3) is a new sibling paragraph under the same
    // heading — same single active guide layer, proving the StateField
    // recomputed against the current (not stale) doc.
    expect(gradientLayerCount(await h.getLinePseudoComputedStyle(3, 'background-image'))).toBe(1);
  });

  it('no !important/specificity fight resurrected: position and background resolve as set, unbeaten by Obsidian’s own CSS', async function () {
    // The original postmortem's central cascade bug was Obsidian's own
    // `.cm-content > * { margin: 0px !important }` beating our rules on
    // `margin`/`padding`. Guide-drawing uses `position`/`background`
    // instead — properties no native rule contests, per the plan's own
    // hint — but confirm rather than assume: read the resolved computed
    // values live, the same way Experiment 1's own cascade-fight fix was
    // ultimately verified.
    const note = 'Scratch/decorations-guide-cascade-check.md';
    await h.createNote(note, '# Parent\n\nchild\n');
    await ensureOutlineMode(note);
    await browser.pause(150);

    expect(await h.getLineComputedStyle(2, 'position')).toBe('relative');
    const bg = await h.getLinePseudoComputedStyle(2, 'background-image');
    expect(gradientLayerCount(bg)).toBe(1);
  });

  it('blockquote: native colored bar (::before) and our guide (::after) coexist, neither clobbers the other', async function () {
    // Obsidian implements a blockquote's own left bar via a NATIVE
    // `::before` (border-left) on the same `.cm-line` — an earlier version
    // of this code used `::before` for the guide too, which doesn't double
    // up with the native one, it completely REPLACES it (one `::before`
    // per element), silently deleting the blockquote's own bar. Fixed by
    // moving the guide to `::after` (confirmed unused by every native kind
    // this touches, including all four widget kinds).
    const note = 'Scratch/decorations-guide-blockquote.md';
    const md = ['# Section', '', '> A quoted line', '> continuation', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    const nativeBorder = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const quoteLine = cm.contentDOM.querySelectorAll(':scope > .cm-line')[2] as HTMLElement;
      return getComputedStyle(quoteLine, '::before').borderLeft;
    });
    // Width varies by theme (1px vs 2px seen across bundled variants) —
    // what matters is that it's a real, visible border, not "0px none".
    expect(nativeBorder).toContain('solid');
    expect(nativeBorder).not.toContain('none');

    const afterBg = await h.getLinePseudoComputedStyle(2, 'background-image');
    expect(gradientLayerCount(afterBg)).toBe(1);
  });

  it('margin-based lines compose with Obsidian’s own native base margin instead of replacing it (readable-line-width / community themes)', async function () {
    // Obsidian's "readable line width" feature centers `.cm-line` content
    // via `margin-inline: auto` under a `max-width` — a UNIFORM base
    // margin every `.cm-line` gets, regardless of our own decorations. An
    // earlier version of this code's `margin-left: calc(depth * unit)`
    // rule silently REPLACED that base instead of adding to it, so a
    // depth-1 atom/list line rendered to the LEFT of a depth-0 heading
    // sibling (visually "negative" indentation) whenever the base margin
    // was large enough to notice — reported against a community theme
    // with a narrower reading column than the bundled ones, though the
    // bug itself is present under any theme/viewport where that base is
    // nonzero. `MarginCompensation` fixes this by reading the native base
    // live (from an undecorated reference line) and adding it back.
    const note = 'Scratch/decorations-guide-margin-compensation.md';
    const md = ['# Section', '', '- top item', '', '```js', 'code', '```', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    const info = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const contentRect = cm.contentDOM.getBoundingClientRect();
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      const heading = lines[0] as HTMLElement;
      const listLine = lines[2] as HTMLElement;
      const codeLine = cm.contentDOM.querySelector('.HyperMD-codeblock-begin') as HTMLElement;
      const rel = (el: HTMLElement) => el.getBoundingClientRect().left - contentRect.left;
      return { headingLeft: rel(heading), listLeft: rel(listLine), codeLeft: rel(codeLine) };
    });
    // Whatever the native base margin is (0 under bundled themes at this
    // viewport, nonzero under others), depth-1 lines must sit STRICTLY to
    // the right of the depth-0 heading — never at or left of it.
    expect(info.listLeft).toBeGreaterThan(info.headingLeft);
    expect(info.codeLeft).toBeGreaterThan(info.headingLeft);
    // This branch is built on top of Experiment 5a's block markers: the
    // code fence (an atom) now reserves an additional fixed marker gutter
    // list items never get (native bullet/number only, no icon) — so the
    // two depth-1 lines no longer land at the same column, by design. The
    // code fence sits exactly one marker-gutter further right than the
    // list item at the same nominal depth.
    expect(info.codeLeft).toBeGreaterThan(info.listLeft);
    // Exactly one gutter, read from the published property rather than spelled:
    // it is derived from the marks it holds (docs/research/21-marker-text-gap.md).
    expect(info.codeLeft - info.listLeft).toBeCloseTo(await h.publishedGutter(), 0);
  });

  describe('which guides are drawn', function () {
    // Two sections, each with a child of its own, so depth 0 belongs to two
    // different ancestors — the case that tells "the levels the cursor is
    // inside" apart from "the depths the cursor happens to sit at".
    const NOTE = 'Scratch/decorations-guide-visibility.md';
    const MD = ['# One', '', 'under one', '', '# Two', '', 'under two', ''].join('\n');
    const UNDER_ONE = 2;
    const UNDER_TWO = 6;

    /** Gradient layers on a line's guide overlay. */
    const layers = async (line: number): Promise<number> =>
      gradientLayerCount(await h.getLinePseudoComputedStyle(line, 'background-image'));

    /** Every geometry a visibility change must leave exactly where it was. */
    const geometry = (line: number): Promise<Record<string, string>> =>
      browser.executeObsidian(
        ({ app, obsidian }, line: number) => {
          const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cm = (view.editor as any).cm;
          const el = cm.contentDOM.querySelectorAll(':scope > .cm-line')[line] as HTMLElement;
          const cs = getComputedStyle(el);
          const content = cm.contentDOM.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          const text = range.getClientRects()[0];
          return {
            paddingLeft: cs.paddingLeft,
            marginLeft: cs.marginLeft,
            textIndent: cs.textIndent,
            textX: text ? (text.left - content.left).toFixed(2) : 'none',
          };
        },
        line,
      );

    before(async function () {
      await h.createNote(NOTE, MD);
      await ensureOutlineMode(NOTE);
      await browser.pause(150);
    });

    afterEach(async function () {
      await h.setPluginSetting('guideVisibility', 'all');
      await h.setPluginSetting('guideHideSingleRoot', false);
    });

    it('draws every ancestor level by default', async function () {
      expect(await layers(UNDER_ONE)).toBe(1);
      expect(await layers(UNDER_TWO)).toBe(1);
    });

    it('draws only the levels the cursor is inside, by ancestor and not by depth', async function () {
      await h.setCursorSettled(UNDER_TWO, 3);
      await h.setPluginSetting('guideVisibility', 'ancestors');
      // Both rows carry a guide at depth 0, and only one of those depth-0
      // guides belongs to an ancestor of the caret's own node.
      expect(await layers(UNDER_TWO)).toBe(1);
      expect(await layers(UNDER_ONE)).toBe(0);

      // And it follows the caret, with no setting change in between.
      await h.setCursorSettled(UNDER_ONE, 3);
      await browser.pause(200);
      expect(await layers(UNDER_ONE)).toBe(1);
      expect(await layers(UNDER_TWO)).toBe(0);
    });

    it('draws everything inside the caret’s own node, and nothing above it', async function () {
      // The mode that looks DOWN from the caret rather than up. A note with a
      // level below the caret's own node, so the subtree has depth of its own:
      //
      //   0 # Root        1 ## Mid      2 ### Deep      3 body
      const nested = 'Scratch/decorations-guide-subtree.md';
      await h.createNote(
        nested,
        ['# Root', '', '## Mid', '', '### Deep', '', 'body', '', '## Other', '', 'sibling', ''].join(
          '\n',
        ),
      );
      await ensureOutlineMode(nested);
      await h.setCursorSettled(2, 6); // "## Mid"
      await browser.pause(200);

      const BODY = 6; // inside Deep, inside Mid, inside Root
      const SIBLING = 10; // inside Other, outside Mid
      expect(await layers(BODY)).toBe(3); // Root's, Mid's, Deep's

      // Its own and everything owned inside it — Root's, above, stays out.
      await h.setPluginSetting('guideVisibility', 'subtree');
      expect(await layers(BODY)).toBe(2);
      expect(await layers(SIBLING)).toBe(0);

      // And the dual: what "ancestors" draws on that row is exactly the rest.
      await h.setPluginSetting('guideVisibility', 'ancestors');
      expect(await layers(BODY)).toBe(1);

      // A node with no children owns no guide, so the mode draws nothing.
      await h.setCursorSettled(SIBLING, 3);
      await browser.pause(200);
      await h.setPluginSetting('guideVisibility', 'subtree');
      expect(await layers(BODY)).toBe(0);
      expect(await layers(SIBLING)).toBe(0);

      await h.openNote(NOTE);
      await browser.pause(150);
    });

    it('draws none at all when the layer is off, and still shows no native guide', async function () {
      // Obsidian's own indent guide stays suppressed whatever this layer draws.
      // It sits on the column native list nesting puts it on, and outline mode
      // does not use those columns — a list level renders at `depth × unit`
      // like every other kind — so a native guide here is a ladder that does
      // not match the content. Drawing none of ours is not a reason to show
      // one; it is a reason to show nothing.
      const listNote = 'Scratch/decorations-guide-visibility-list.md';
      await h.createNote(listNote, ['# Section', '', '- top', '\t- nested', ''].join('\n'));
      await ensureOutlineMode(listNote);
      await h.setIndentGuides(true); // the reader's own setting, deliberately ON
      await browser.pause(150);

      const nativeWidth = (line: number): Promise<string> =>
        h.getLineComputedStyle(line, '--indentation-guide-width');
      expect((await nativeWidth(3)).trim()).toBe('0px');

      for (const mode of ['off', 'subtree', 'ancestors'] as const) {
        await h.setPluginSetting('guideVisibility', mode);
        expect((await nativeWidth(3)).trim()).toBe('0px');
      }
      await h.setPluginSetting('guideVisibility', 'off');
      expect(await layers(2)).toBe(0);
      expect(await layers(3)).toBe(0);

      await h.setPluginSetting('guideVisibility', 'all');
      expect((await nativeWidth(3)).trim()).toBe('0px');
      await h.openNote(NOTE);
      await browser.pause(150);
    });

    it('drops the outermost guide only where the note has a single root', async function () {
      // Two roots: the outermost guide names something, so it stays.
      await h.setPluginSetting('guideHideSingleRoot', true);
      expect(await layers(UNDER_TWO)).toBe(1);

      const single = 'Scratch/decorations-guide-single-root.md';
      await h.createNote(single, ['# Title', '', '## Section', '', 'deep', ''].join('\n'));
      await ensureOutlineMode(single);
      await browser.pause(150);
      // "deep" is inside both the title and the section; with one root the
      // title's guide runs down every line and names nothing.
      expect(await layers(4)).toBe(1);
      await h.setPluginSetting('guideHideSingleRoot', false);
      expect(await layers(4)).toBe(2);

      // A second root brings it back, with nothing else changed.
      await h.setPluginSetting('guideHideSingleRoot', true);
      expect(await layers(4)).toBe(1);
      await h.setBuffer(
        ['# Title', '', '## Section', '', 'deep', '', '# Second', '', 'body', ''].join('\n'),
      );
      await browser.pause(300);
      expect(await layers(4)).toBe(2);

      await h.openNote(NOTE);
      await browser.pause(150);
    });

    it('drops the zoom root’s own guide while zoomed, and keeps the levels inside it', async function () {
      // A zoomed view has one root by construction — the scope is re-based so
      // the zoom root renders at depth 0 — so the qualifier applies there for
      // the same reason it applies to a single-rooted note: while zoomed into a
      // node, its own guide down the whole view says nothing.
      const zoomNote = 'Scratch/decorations-guide-zoom.md';
      const md = ['# Root', '', '## Mid', '', 'inner para', '', '# Other', '', 'body', ''].join(
        '\n',
      );
      await h.createNote(zoomNote, md);
      await ensureOutlineMode(zoomNote);
      await h.setCursorSettled(2, 6); // "## Mid"
      await h.runCommand('zoom-in');
      await browser.pause(300);

      // Hidden lines are not rendered at all while zoomed, so the row is
      // indexed among what the view actually draws — "## Mid", its gap, then
      // "inner para".
      const rendered = await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cm = (view.editor as any).cm;
        return Array.from(
          cm.contentDOM.querySelectorAll(':scope > .cm-line'),
          (el) => (el as HTMLElement).textContent ?? '',
        );
      });
      const inner = rendered.findIndex((t) => t.includes('inner para'));
      expect(inner).toBeGreaterThan(-1);

      // Zoomed into "## Mid": "inner para" is inside it, and inside nothing
      // else the view renders.
      expect(await layers(inner)).toBe(1);
      await h.setPluginSetting('guideHideSingleRoot', true);
      expect(await layers(inner)).toBe(0);

      await h.setPluginSetting('guideHideSingleRoot', false);
      expect(await layers(inner)).toBe(1);
      await h.runCommand('zoom-clear');
      await browser.pause(200);
      await h.openNote(NOTE);
      await browser.pause(150);
    });

    it('reads the single-root qualifier from the document its guides came from', async function () {
      // The qualifier answers about the document the view is RENDERING, and a
      // caret resting on a blank row does not change which document that is.
      // It used to: a provisional position's guides came from the whole note
      // while the rest of the zoomed view came from the scope, so the outermost
      // column blinked back on as the caret crossed a blank line and off again
      // when it left. `positions-re-base-with-the-zoom` put both halves in the
      // view's own frame; what this pins now is that they agree.
      const note = 'Scratch/decorations-guide-qualifier-frame.md';
      await h.createNote(
        note,
        ['# One', '', '## Sub', '', 'body', '', '# Two', '', 'other', ''].join('\n'),
      );
      await ensureOutlineMode(note);
      await h.setCursorSettled(0, 5);
      await h.runCommand('zoom-in'); // into "# One", whose subtree has one root
      await browser.pause(300);

      const bodyRow = async (): Promise<number> => {
        const rendered = await browser.executeObsidian(({ app, obsidian }) => {
          const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cm = (view.editor as any).cm;
          return Array.from(
            cm.contentDOM.querySelectorAll(':scope > .cm-line'),
            (el) => (el as HTMLElement).textContent ?? '',
          );
        });
        const i = rendered.findIndex((t) => t.trim() === 'body');
        expect(i).toBeGreaterThan(-1);
        return layers(i);
      };

      // Caret on content: the ordinary zoomed render, both ways round.
      await h.setCursor(4, 2);
      await browser.pause(300);
      const withQualifierOff = await bodyRow();
      expect(withQualifierOff).toBeGreaterThan(1); // "# One" and "## Sub" above it

      await h.setPluginSetting('guideHideSingleRoot', true);
      await browser.pause(200);
      const withQualifierOn = await bodyRow();
      // The scope is re-rooted, so it has exactly one root by construction and
      // that root's column names nothing worth drawing.
      expect(withQualifierOn).toBe(withQualifierOff - 1);

      // A caret on the blank row inside the zoom is a provisional position, and
      // it answers from the same document: the count does not move.
      await h.setCursor(3, 0);
      await browser.pause(300);
      expect(await bodyRow()).toBe(withQualifierOn);

      await h.setPluginSetting('guideHideSingleRoot', false);
      await browser.pause(200);
      expect(await bodyRow()).toBe(withQualifierOff);

      await h.setCursor(4, 2);
      await browser.pause(200);
      await h.runCommand('zoom-clear');
      await browser.pause(200);
      await h.openNote(NOTE);
      await browser.pause(150);
    });

    it('moves no line’s geometry under any visibility mode, or as the caret moves', async function () {
      // Guides are painted, not laid out. Every mode, and every caret position
      // within a mode, has to leave the grid exactly where it was.
      await h.setCursorSettled(UNDER_TWO, 3);
      const base = await geometry(UNDER_ONE);

      for (const mode of ['ancestors', 'subtree', 'off', 'all'] as const) {
        await h.setPluginSetting('guideVisibility', mode);
        expect(await geometry(UNDER_ONE)).toEqual(base);
      }
      await h.setPluginSetting('guideVisibility', 'ancestors');
      await h.setCursorSettled(UNDER_ONE, 3);
      await browser.pause(200);
      expect(await geometry(UNDER_ONE)).toEqual(base);

      await h.setPluginSetting('guideHideSingleRoot', true);
      expect(await geometry(UNDER_ONE)).toEqual(base);
    });
  });

  it('the guide’s width is one declaration: the stripe, the accent and the overlay’s own paint area all follow it', async function () {
    // `GUIDE_WIDTH` used to be a JS literal, which meant the gradient was
    // built at one width while the rules around it assumed another the
    // moment either moved. Now it is a property, and three things have to
    // follow it at once: the stripe the gradient paints, the accent's width
    // (an accent is a change of colour, not of weight), and the overlay's
    // leftward paint bleed — without which a depth-0 stripe, centred on this
    // box's own left edge, loses the half that falls outside it.
    const note = 'Scratch/decorations-guide-width.md';
    await h.createNote(note, '# Parent\n\nchild\n');
    await ensureOutlineMode(note);
    await browser.pause(150);

    /** A length-valued custom property, RESOLVED the way layout resolves it. */
    const resolve = (prop: string): Promise<number> =>
      browser.execute((p: string) => {
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;visibility:hidden;height:0;width:var(${p});`;
        document.body.appendChild(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return +width.toFixed(2);
      }, prop);

    /** The overlay's own border box: `left`, and the transparent bleed border. */
    const overlay = (): Promise<{ left: number; bleed: number; stripeStart: number }> =>
      browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cm = (view.editor as any).cm;
        const line = cm.contentDOM.querySelectorAll(':scope > .cm-line')[2] as HTMLElement;
        const cs = getComputedStyle(line, '::after');
        return {
          left: parseFloat(cs.left) || 0,
          bleed: parseFloat(cs.borderLeftWidth) || 0,
          stripeStart: parseFloat(cs.backgroundPosition) || 0,
        };
      });

    const base = { width: await resolve('--to-guide-width'), trail: await resolve('--to-trail-width') };
    const baseOverlay = await overlay();
    // The accent is the guide's own width, so entering a subtree recolours a
    // column without thickening it.
    expect(base.trail).toBe(base.width);
    // The bleed covers the widest stripe the overlay carries — at minimum the
    // half of a depth-0 stripe that falls left of this box's own edge.
    expect(baseOverlay.bleed).toBeGreaterThanOrEqual(base.width / 2);

    // A snippet thickens the guide. Everything derived from it moves together.
    await h.applyStyleOverride('to-guide-width-probe', 'body { --to-guide-width: 3px; }');
    const thick = { width: await resolve('--to-guide-width'), trail: await resolve('--to-trail-width') };
    const thickOverlay = await overlay();
    expect(thick.width).toBe(3);
    expect(thick.trail).toBe(3);
    expect(thickOverlay.bleed).toBeGreaterThanOrEqual(thick.width / 2);
    // The gradient is built in JS from the same property: a stripe is centred
    // on its column, so widening it by `d` starts it `d / 2` further left.
    // Asserted as the DIFFERENCE, never as a pixel — the column itself depends
    // on the unit and the theme.
    expect(baseOverlay.stripeStart - thickOverlay.stripeStart).toBeCloseTo(
      (thick.width - base.width) / 2,
      1,
    );

    // The negative control for the bleed, and the reason it is stated as a max
    // of EVERY stripe width. With the trail pinned narrow, an accent-only bleed
    // (`max(1px, var(--to-trail-width))`, what this rule used to say) resolves
    // to 1px — less than half the guide — and clips the depth-0 stripe. The
    // guide's own width has to be in the maximum for this to hold; so does the
    // hovered guide's, which is wider than either by design and is what the
    // bleed resolves to.
    await h.applyStyleOverride(
      'to-guide-width-probe',
      'body { --to-guide-width: 3px; --to-trail-width: 1px; }',
    );
    const parted = await overlay();
    expect(await resolve('--to-trail-width')).toBe(1);
    expect(parted.bleed).toBeGreaterThanOrEqual(3);
    expect(parted.bleed).toBe(
      Math.max(3, 1, await resolve('--to-guide-hover-width')),
    );

    await h.applyStyleOverride('to-guide-width-probe', null);
    expect(await resolve('--to-guide-width')).toBe(base.width);
  });
});
