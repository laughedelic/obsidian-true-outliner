/**
 * Outline-decorations Experiment 2b (guide lines via CSS stacked-gradient)
 * — see docs/research/07-decoration-experiments-plan.md. Head-to-head
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
import { ALL_DECORATION_FIXTURES } from '../fixtures/decorations.js';

const SCREENSHOT_DIR = path.join(process.cwd(), '.obsidian-cache', 'guides-gradient-screenshots');

async function ensureOutlineMode(notePath: string): Promise<void> {
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
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
    // 4 "    - deeply nested item" — all three are list items, all three
    // are descendants of "# Section" (depth 0), so all three carry its
    // one bridging guide layer.
    for (const line of [2, 3, 4]) {
      const classes = await h.getLineClassList(line);
      expect(classes).toContain('to-decor-guides');
      const bg = await h.getLinePseudoComputedStyle(line, 'background-image');
      expect(gradientLayerCount(bg)).toBe(1);
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
    // docs/research/07-decoration-experiments-plan.md.
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

  it('a pure list nesting fixture (no non-list ancestor) draws no guides at all', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'deep-nesting')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(150);
    for (let line = 0; line < 4; line++) {
      expect(await h.getLineClassList(line)).not.toContain('to-decor-guides');
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
    expect(info.codeLeft - info.listLeft).toBeCloseTo(20, 0); // --to-marker-gutter default (1.25rem)
  });
});
