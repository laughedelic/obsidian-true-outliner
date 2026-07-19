/**
 * Outline-decorations Experiment 5a (per-kind block markers — icons, new
 * DOM-element mechanism) — see
 * docs/research/10-experiment-5-block-markers.md (Experiment 5's design and results).
 * Head-to-head alternative to Experiment 5b (CSS-shape markers, worked on a
 * sibling branch), NOT a fallback: screenshots every fixture in the shared
 * corpus (quote fixture included, promoted here), in both bundled themes,
 * plus targeted DOM/computed-style assertions — mirroring
 * 51-guides-gradient.e2e.ts's own discipline (read the browser's own
 * *resolved* values, not just the raw fact/class the code set, so a silent
 * cascade/clip override can't slip past unnoticed the way DOM-attribute-only
 * checks did in the original postmortem).
 *
 * Markers render via two mechanisms, split the same way indentation/guides
 * already are: a CM6 `Decoration.widget` for plain `.cm-line`s (heading/
 * paragraph/code/quote), and a direct DOM child injected by
 * `MarginCompensation` for widget-replaced atoms (table/callout/html/hr),
 * since a CM6 decoration has zero effect on those (confirmed by Experiment
 * 1/2b). List items are excluded entirely — native bullet/number only.
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { ALL_DECORATION_FIXTURES } from '../fixtures/decorations.js';

const SCREENSHOT_DIR = path.join(process.cwd(), '.obsidian-cache', 'block-markers-icons-screenshots');
const MARKER_ICON_SELECTOR = '.to-decor-marker-icon';

async function ensureOutlineMode(notePath: string): Promise<void> {
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

describe('outline decorations: experiment 5a (block markers, icon widgets)', function () {
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
    const note = 'Scratch/markers-mode-off.md';
    await h.createNote(note, '# Heading\n\nPara.\n');
    if (await h.isOutlineMode(note)) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode off');
      await h.dismissNotices();
    }
    const rects = await h.getContentChildRect(MARKER_ICON_SELECTOR, 0).catch(() => null);
    expect(rects).toBeNull();
  });

  it('plain-line kinds (heading/paragraph/code/quote) each get exactly one marker, on the first line only', async function () {
    const note = 'Scratch/markers-plain-lines.md';
    const md = [
      '# A heading',
      '',
      'A paragraph that keeps going',
      'onto a second visual line via a soft break.',
      '',
      '```js',
      'code line',
      '```',
      '',
      '> A quoted line',
      '> continuation',
      '',
    ].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    // Lines: 0 heading, 2 para first, 3 para continuation, 5 code opener,
    // 6 code body, 7 code closer, 9 quote first, 10 quote continuation.
    for (const line of [0, 2, 5, 9]) {
      const rects = await h.getLineChildRects(line, MARKER_ICON_SELECTOR);
      expect(rects.length).toBe(1);
    }
    // Continuation lines never repeat the marker.
    for (const line of [3, 6, 7, 10]) {
      const rects = await h.getLineChildRects(line, MARKER_ICON_SELECTOR);
      expect(rects.length).toBe(0);
    }
  });

  it('widget-replaced atom kinds (table/callout/html/hr) each get exactly one marker child', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'widget-atoms')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(150);

    for (const selector of [
      '.cm-embed-block.cm-table-widget',
      '.cm-embed-block.cm-callout',
      '.cm-embed-block.cm-html-embed',
      '.cm-line.hr',
    ]) {
      const rect = await h.getContentChildRect(`${selector} ${MARKER_ICON_SELECTOR}`, 0);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });

  it('list items get no marker at all (native bullet/number only)', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'heading-then-list')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(150);

    // Lines 2/3/4 are all list items; only line 0 ("# Section") should
    // carry a marker.
    expect((await h.getLineChildRects(0, MARKER_ICON_SELECTOR)).length).toBe(1);
    for (const line of [2, 3, 4]) {
      expect((await h.getLineChildRects(line, MARKER_ICON_SELECTOR)).length).toBe(0);
    }
  });

  it('marker doesn’t repeat/duplicate across a live document edit (idempotent DOM patch)', async function () {
    const note = 'Scratch/markers-live-edit.md';
    await h.createNote(note, '| a | b |\n| --- | --- |\n| 1 | 2 |\n\nfirst\n');
    await ensureOutlineMode(note);
    await browser.pause(150);
    expect(
      (await h.getContentChildRect('.cm-embed-block.cm-table-widget .to-decor-marker-icon', 0).then(
        () => 1,
        () => 0,
      )),
    ).toBe(1);

    await h.setCursor(4, 5); // end of "first"
    await h.keys.enter();
    await h.keys.type('second');
    await browser.pause(150);

    const markers = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const table = cm.contentDOM.querySelector('.cm-embed-block.cm-table-widget') as HTMLElement;
      return table.querySelectorAll(':scope > .to-decor-marker-icon').length;
    });
    expect(markers).toBe(1); // never duplicated by a re-render
  });

  it('blockquote: native colored bar and the marker widget coexist (DOM widget, not a pseudo-element — no clobber by construction)', async function () {
    const fixture = ALL_DECORATION_FIXTURES.find((f) => f.label === 'quote')!;
    await h.createNote(fixture.note, fixture.md);
    await ensureOutlineMode(fixture.note);
    await browser.pause(150);

    // Line 2 is "> A quoted line" in QUOTE_MD.
    const nativeBorder = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const quoteLine = cm.contentDOM.querySelectorAll(':scope > .cm-line')[2] as HTMLElement;
      return getComputedStyle(quoteLine, '::before').borderLeft;
    });
    expect(nativeBorder).toContain('solid');
    expect(nativeBorder).not.toContain('none');

    const markerRects = await h.getLineChildRects(2, MARKER_ICON_SELECTOR);
    expect(markerRects.length).toBe(1);
  });

  it('marker size is fixed (rem), NOT font-size-dependent — identical width/height on a heading vs. a paragraph line', async function () {
    // The exact historical marker-size bug class (see the postmortem):
    // an em-based size resolves against each line's own font-size, so a
    // heading's larger font would inflate its marker relative to a
    // paragraph's. Track 5's own suggested single automated check: diff
    // every decoration-related computed style between a heading and a
    // paragraph at once.
    const note = 'Scratch/markers-size-check.md';
    await h.createNote(note, '# A heading\n\nA paragraph.\n');
    await ensureOutlineMode(note);
    await browser.pause(150);

    const headingSize = await h.getContentChildComputedStyle(MARKER_ICON_SELECTOR, 0, 'width');
    const paraSize = await h.getContentChildComputedStyle(MARKER_ICON_SELECTOR, 1, 'width');
    expect(headingSize).toBe(paraSize);
    expect(headingSize).not.toBe('0px');
  });

  it('multi-line continuation: a code fence’s marker sits only on the opener line, indentation stays consistent across all its lines', async function () {
    const note = 'Scratch/markers-code-multiline.md';
    const md = ['# Section', '', '```js', 'line one', 'line two', '```', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    // Lines: 0 heading, 2 ``` opener, 3/4 body, 5 ``` closer.
    expect((await h.getLineChildRects(2, MARKER_ICON_SELECTOR)).length).toBe(1);
    for (const line of [3, 4, 5]) {
      expect((await h.getLineChildRects(line, MARKER_ICON_SELECTOR)).length).toBe(0);
    }
    // All four code lines share the same margin-left (alignment preserved
    // across the whole atom, marker gutter included), not just the opener.
    const lefts = await Promise.all([2, 3, 4, 5].map((line) => h.getLineRect(line)));
    for (const rect of lefts) expect(rect.left).toBeCloseTo(lefts[0]!.left, 0);
  });

  it('no !important/specificity or contain:paint regression: a depth-0 table (no ancestor guide) still shows its marker unclipped', async function () {
    // A widget atom with NO guide (no ancestor at all) still always gets a
    // marker — the contain:paint/overflow override can't stay gated on
    // `.to-decor-guides` alone, or this exact case would silently clip the
    // marker. Regression test for that specific gating gap.
    const note = 'Scratch/markers-depth0-table.md';
    await h.createNote(note, '| a | b |\n| --- | --- |\n| 1 | 2 |\n');
    await ensureOutlineMode(note);
    await browser.pause(150);

    const contain = await h.getContentChildComputedStyle(
      '.cm-embed-block.cm-table-widget',
      0,
      'contain',
    );
    expect(contain).not.toContain('paint');

    const rect = await h.getContentChildRect(
      '.cm-embed-block.cm-table-widget .to-decor-marker-icon',
      0,
    );
    expect(rect.width).toBeGreaterThan(0);
  });

  it('code fence and blockquote markers align horizontally with a same-depth paragraph’s (native padding/text-indent compensation)', async function () {
    // Two real bugs found in review, both "a native property our own
    // formula didn't know about" — same class as the widget-atom table
    // fix, just on PLAIN lines this time:
    // 1. A code fence's own opener line (`.HyperMD-codeblock-begin`)
    //    carries native `padding-left` (confirmed live: 16px in bundled
    //    themes) with no offsetting `text-indent` — shifted its marker
    //    right of every other kind's at the same depth.
    // 2. A blockquote's own line carries the SAME hanging-indent PAIR the
    //    original postmortem flagged for list-item bullets (`text-indent:
    //    -13px` matched with `padding-left: 13px`) — naively subtracting
    //    `padding-left` alone overcorrected by the full padding amount in
    //    the wrong direction, since the negative text-indent already
    //    cancels it for the line's own first inline position.
    const note = 'Scratch/markers-horizontal-alignment.md';
    const md = ['A paragraph.', '', '```js', 'code line', '```', '', '> a quote', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    const centers = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      const codeLine = cm.contentDOM.querySelector('.HyperMD-codeblock-begin') as HTMLElement;
      const centerOf = (el: HTMLElement | null) => {
        const icon = el?.querySelector('.to-decor-marker-icon') as HTMLElement | null;
        if (!icon) return null;
        const r = icon.getBoundingClientRect();
        return r.left + r.width / 2;
      };
      return {
        para: centerOf(lines[0] as HTMLElement),
        code: centerOf(codeLine),
        quote: centerOf(lines[6] as HTMLElement),
      };
    });

    expect(centers.code).not.toBeNull();
    expect(centers.quote).not.toBeNull();
    expect(Math.abs(centers.code! - centers.para!)).toBeLessThan(1);
    expect(Math.abs(centers.quote! - centers.para!)).toBeLessThan(1);
  });

  it('heading marker vertical offset from the line’s own center is small and doesn’t grow with heading level (H1 vs H3)', async function () {
    // Real bug found in review: an earlier version centered the marker
    // within the LINE's own (padded) box via `top: 0; bottom: 0` — a
    // heading's real, level-scaling top spacing (breathing room from the
    // preceding block) pushed the icon visibly above the text, worse for a
    // bigger heading. Fixed by aligning the marker INLINE
    // (`vertical-align: middle`) against the actual text run instead of
    // the block's own padded box — see MarkerWidget's doc comment. This
    // guards specifically against the offset growing with heading level,
    // not against some fixed small gap (which is expected and harmless).
    const note = 'Scratch/markers-heading-levels.md';
    const md = '# H1 heading\n\n### H3 heading\n';
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    const offsets = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      const measure = (lineEl: HTMLElement) => {
        const icon = lineEl.querySelector('.to-decor-marker-icon')!;
        const iconRect = icon.getBoundingClientRect();
        const lineRect = lineEl.getBoundingClientRect();
        return iconRect.top + iconRect.height / 2 - (lineRect.top + lineRect.height / 2);
      };
      return { h1: measure(lines[0] as HTMLElement), h3: measure(lines[2] as HTMLElement) };
    });

    // A small residual is expected and NOT the bug this guards against:
    // `vertical-align: middle` aligns half an x-height above the baseline,
    // and x-height itself scales with font-size, so an H1/H3 gap of a few
    // px is inherent to the technique. The bug this test would catch is a
    // MUCH larger gap (tens of px) from the line's own margin/padding
    // scaling with heading level, which is what the old `position:
    // absolute` + line-box-relative centering produced.
    expect(Math.abs(offsets.h1 - offsets.h3)).toBeLessThan(15);
  });

  it('native fold chevron glyph sits between the marker and an ancestor’s guide line, clear of both', async function () {
    // Real usability issue found in review: the native collapse chevron
    // (`.cm-fold-indicator .collapse-indicator`) is inserted at essentially
    // the same "text start" anchor our own marker's target column is
    // defined relative to, so its default position overlapped our marker
    // at every heading level — and unlike list items (where the native
    // chevron already sits well left of the bullet), a heading's chevron
    // rendered to the marker's right, an inconsistent layout.
    //
    // Two rounds of live correction went into the fix this asserts:
    // 1. Measuring against `.collapse-indicator` (the WRAPPER, 22px wide)
    //    instead of the actual painted `<svg>` glyph (~10px, centered
    //    inside that wrapper with ~6px of invisible hit-area padding on
    //    each side) made a real fit look impossible at deeper nesting,
    //    where an ancestor's own guide column also passes through this
    //    line. It wasn't — the WRAPPER can't avoid both the guide and the
    //    marker in the available space, but the GLYPH comfortably can.
    // 2. Nested headings need testing, not just a flat 2-level fixture —
    //    the collision this guards against only appears when a shallower
    //    ancestor's guide line is also active on the same row.
    //
    // This checks the glyph (not the wrapper) against BOTH neighbors: the
    // marker on its right, and the nearest ancestor's guide column on its
    // left. Wrapper-vs-marker overlap is explicitly NOT asserted against —
    // our own marker has `pointer-events: none`, so hit-area overlap with
    // it is harmless; only the visible glyph's position matters here.
    const note = 'Scratch/markers-fold-chevron.md';
    const md = ['# A', '', '## B', '', '### C with a child', '', 'child', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    // Force the chevron visible for measurement — real behavior is
    // hover/collapsed-only, but opacity doesn't affect layout/position.
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const style = document.createElement('style');
      style.textContent = '.collapse-indicator { opacity: 1 !important; }';
      cm.dom.appendChild(style);
    });
    await browser.pause(150);

    const info = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const lines = cm.contentDOM.querySelectorAll(':scope > .cm-line');
      // Lines: 0 "# A", 2 "## B", 4 "### C with a child" (depth 2, with
      // ancestor guides from A [depth 0] and B [depth 1] both active).
      const cLine = lines[4] as HTMLElement;
      const glyph = cLine.querySelector('.collapse-indicator svg') as SVGSVGElement | null;
      const marker = cLine.querySelector('.to-decor-marker-icon') as HTMLElement | null;
      const contentRect = cm.contentDOM.getBoundingClientRect();
      const unitPx = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.5;
      return {
        glyphRect: glyph?.getBoundingClientRect(),
        markerRect: marker?.getBoundingClientRect(),
        // B's own guide column (depth 1) — the nearest ancestor guide to a
        // depth-2 node, and the one the chevron has the least room against.
        ancestorGuideCol: contentRect.left + 1 * unitPx,
      };
    });

    expect(info.glyphRect).toBeDefined();
    expect(info.markerRect).toBeDefined();
    // Glyph clears the marker (to its right) with a real, positive gap.
    expect(info.markerRect!.left - info.glyphRect!.right).toBeGreaterThan(0.5);
    // Glyph clears the ancestor guide column (to its left) too.
    expect(info.glyphRect!.left - info.ancestorGuideCol).toBeGreaterThan(0.5);
    // Sanity bound on both gaps — not precise pixel assertions, just
    // guarding against a future regression ballooning the spacing.
    expect(info.markerRect!.left - info.glyphRect!.right).toBeLessThan(10);
    expect(info.glyphRect!.left - info.ancestorGuideCol).toBeLessThan(10);

    // Hardening 5.1: the chevron shift's dead-space term is measured live
    // (MarginCompensation.measureChevron), not hardcoded. Assert the
    // measured property actually landed — on `view.dom`, the outer
    // `.cm-editor`, NOT `contentDOM`: writing an attribute on contentDOM
    // itself sits inside CM6's own mutation-observer scope and looped (see
    // measureChevron's doc comment) — with a sane value; otherwise the CSS
    // fallback could silently be the only thing ever in effect, which is
    // exactly the drift the live path exists to prevent. (The geometry
    // assertions above already prove the RESULT is right; this proves the
    // live mechanism produced it.)
    const deadRight = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      return (cm.dom as HTMLElement).style.getPropertyValue('--to-chevron-dead-right');
    });
    expect(deadRight).toMatch(/^\d+(\.\d+)?px$/);
    expect(parseFloat(deadRight)).toBeGreaterThan(0);
    expect(parseFloat(deadRight)).toBeLessThan(15);
  });

  it('marker SVGs are aria-hidden on both delivery mechanisms (decorative — screen readers skip them)', async function () {
    // Hardening 5.6. A DOM-attribute check is the right rigor here, unlike
    // for visual assertions: the attribute IS the accessibility behavior
    // (there's no separate "resolved" value a cascade could override).
    const note = 'Scratch/markers-aria-hidden.md';
    await h.createNote(note, '# Heading\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n');
    await ensureOutlineMode(note);
    await browser.pause(150);

    const ariaValues = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      return Array.from(
        cm.contentDOM.querySelectorAll('.to-decor-marker-icon svg') as NodeListOf<SVGSVGElement>,
      ).map((svg) => svg.getAttribute('aria-hidden'));
    });
    // One marker per mechanism: the heading (CM6 widget) and the table
    // (direct DOM injection).
    expect(ariaValues.length).toBe(2);
    for (const value of ariaValues) expect(value).toBe('true');
  });

  it('RTL text: markers, indentation, and guides still render (verification pass)', async function () {
    // Hardening 5.6's RTL verification pass. Obsidian auto-detects per-line
    // direction from the text itself, so Hebrew content exercises the RTL
    // rendering path with no settings change. Deliberately asserts only
    // conservative invariants (decorations present, hierarchy indentation
    // applied, guide painted) — RTL *placement polish* (whether physical
    // left-side indentation is the right visual language for RTL outlines)
    // is a design question recorded in the research docs, not something to
    // freeze into an assertion here. The screenshot is the reviewable
    // artifact for that.
    const note = 'Scratch/markers-rtl.md';
    const md = ['# כותרת עברית', '', 'פסקה בעברית מתחת לכותרת.', '', '- פריט רשימה', ''].join('\n');
    await h.createNote(note, md);
    await ensureOutlineMode(note);
    await browser.pause(150);

    // Heading (line 0) and its child paragraph (line 2) each carry exactly
    // one marker; the list item (line 4) none — same rules as LTR.
    expect((await h.getLineChildRects(0, MARKER_ICON_SELECTOR)).length).toBe(1);
    expect((await h.getLineChildRects(2, MARKER_ICON_SELECTOR)).length).toBe(1);
    expect((await h.getLineChildRects(4, MARKER_ICON_SELECTOR)).length).toBe(0);

    // Depth-based indentation still applies: the child paragraph's
    // padding-left exceeds the depth-0 heading's (which reserves only the
    // marker gutter).
    const headingPad = parseFloat(await h.getLineComputedStyle(0, 'padding-left'));
    const paraPad = parseFloat(await h.getLineComputedStyle(2, 'padding-left'));
    expect(paraPad).toBeGreaterThan(headingPad);

    // The heading's guide still paints through its child.
    const guideBg = await h.getLinePseudoComputedStyle(2, 'background-image');
    expect(guideBg).toContain('repeating-linear-gradient');

    await h.screenshotFull(SCREENSHOT_DIR, 'rtl-verification');
  });

  describe('marker visibility setting', function () {
    // Markers read well as "a crown on the guide line" for a branch node,
    // but add little for a leaf — most leaf atom kinds already carry their
    // own native visual style. `markerVisibility` (mode-registry.ts) is a
    // real, persisted, live setting so it's triable against a real vault
    // without a rebuild.
    async function setVisibilityAndNudge(visibility: string): Promise<void> {
      await browser.executeObsidian(async ({ plugins }, v) => {
        await (plugins.trueOutliner as any).setMarkerVisibility(v);
      }, visibility);
      await browser.pause(150);
    }

    afterEach(async function () {
      await setVisibilityAndNudge('all'); // leave the vault on the default for other specs
    });

    it("'with-children': only branch nodes get a marker, regardless of kind", async function () {
      const note = 'Scratch/markers-visibility-with-children.md';
      const md = [
        '# Heading with a child',
        '',
        'child para (this heading is a branch)',
        '',
        'Leaf paragraph, no children.',
        '',
        '```js',
        'code line',
        '```',
        '',
      ].join('\n');
      await h.createNote(note, md);
      await ensureOutlineMode(note);
      await setVisibilityAndNudge('with-children');
      await browser.pause(150);

      // Lines: 0 heading (branch), 2 child para (leaf), 4 leaf para (leaf),
      // 6 code opener (leaf — atoms can never have children).
      expect((await h.getLineChildRects(0, MARKER_ICON_SELECTOR)).length).toBe(1);
      expect((await h.getLineChildRects(2, MARKER_ICON_SELECTOR)).length).toBe(0);
      expect((await h.getLineChildRects(4, MARKER_ICON_SELECTOR)).length).toBe(0);
      expect((await h.getLineChildRects(6, MARKER_ICON_SELECTOR)).length).toBe(0);
    });

    it("'with-children': a widget-replaced atom (table) with children obviously still gets no marker — atoms are always leaves", async function () {
      const note = 'Scratch/markers-visibility-table-leaf.md';
      await h.createNote(note, '| a | b |\n| --- | --- |\n| 1 | 2 |\n');
      await ensureOutlineMode(note);
      await setVisibilityAndNudge('with-children');
      await browser.pause(150);

      const rect = await h
        .getContentChildRect('.cm-embed-block.cm-table-widget .to-decor-marker-icon', 0)
        .catch(() => null);
      expect(rect).toBeNull();
    });

    it("'headings-and-paragraphs': only those two kinds get a marker, leaf or not — atoms never do", async function () {
      const note = 'Scratch/markers-visibility-headings-paragraphs.md';
      const md = [
        '# Heading, no children of its own text',
        '',
        'A paragraph.',
        '',
        '> A quoted line',
        '',
      ].join('\n');
      await h.createNote(note, md);
      await ensureOutlineMode(note);
      await setVisibilityAndNudge('headings-and-paragraphs');
      await browser.pause(150);

      // Lines: 0 heading, 2 paragraph, 4 quote (an atom — excluded even
      // though it's a leaf, same as every other atom kind).
      expect((await h.getLineChildRects(0, MARKER_ICON_SELECTOR)).length).toBe(1);
      expect((await h.getLineChildRects(2, MARKER_ICON_SELECTOR)).length).toBe(1);
      expect((await h.getLineChildRects(4, MARKER_ICON_SELECTOR)).length).toBe(0);

      const tableNote = 'Scratch/markers-visibility-headings-paragraphs-table.md';
      await h.createNote(tableNote, '| a | b |\n| --- | --- |\n| 1 | 2 |\n');
      await ensureOutlineMode(tableNote);
      // Explicit re-nudge on the newly-active note, not just relying on the
      // setting's own persistence across the note switch — keeps this
      // assertion unambiguous about what triggered the recompute.
      await setVisibilityAndNudge('headings-and-paragraphs');
      // Poll rather than sleep a fixed duration: the table widget's own DOM
      // can settle asynchronously after our decoration patch runs, and a
      // fixed pause is a race against however long that happens to take
      // (worse under system load) — see waitForContentChildCount's own doc
      // comment in helpers.ts.
      await h.waitForContentChildCount(
        '.cm-embed-block.cm-table-widget .to-decor-marker-icon',
        0,
      );
    });

    it('changing marker visibility live (no rebuild) toggles a leaf marker on the very next edit', async function () {
      const note = 'Scratch/markers-visibility-live-switch.md';
      await h.createNote(note, '# Heading\n\nLeaf paragraph.\n');
      await ensureOutlineMode(note);
      await browser.pause(150);

      await setVisibilityAndNudge('all');
      expect((await h.getLineChildRects(2, MARKER_ICON_SELECTOR)).length).toBe(1);

      await setVisibilityAndNudge('with-children');
      expect((await h.getLineChildRects(2, MARKER_ICON_SELECTOR)).length).toBe(0);
      // The branch heading keeps its marker throughout.
      expect((await h.getLineChildRects(0, MARKER_ICON_SELECTOR)).length).toBe(1);
    });

    it('hiding a marker never reflows the reserved gutter — text position is unaffected', async function () {
      // Real design decision this guards: markerVisibility only gates
      // whether the icon is DRAWN, never the gutter reservation itself —
      // otherwise toggling the setting would shift indentation/text
      // position, not just show/hide an icon.
      const note = 'Scratch/markers-visibility-gutter-stable.md';
      await h.createNote(note, 'Leaf paragraph.\n');
      await ensureOutlineMode(note);
      await browser.pause(150);

      const paddingWithMarker = await h.getLineComputedStyle(0, 'padding-left');
      await setVisibilityAndNudge('with-children'); // this leaf loses its marker
      await browser.pause(150);
      const paddingWithoutMarker = await h.getLineComputedStyle(0, 'padding-left');

      expect((await h.getLineChildRects(0, MARKER_ICON_SELECTOR)).length).toBe(0);
      expect(paddingWithoutMarker).toBe(paddingWithMarker);
    });
  });
});
