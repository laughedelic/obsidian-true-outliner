/**
 * Decoration coverage for lines Obsidian renders as opaque replacement
 * elements rather than plain `.cm-line`s, whatever their node kind
 * (openspec change decorate-widget-rendered-lines).
 *
 * The atom kinds — table, callout, raw HTML, horizontal rule — are always
 * widget-rendered and were already covered by 50/51/52. A wiki embed is the
 * case that broke the old assumption twice over: it is not a node kind at
 * all (the parser sees a paragraph, or a list item), and it carries none of
 * the CSS classes the old selector enumerated. Measured live before the fix
 * (see the change's tasks.md Findings): `.cm-embed-block, .cm-line.hr`
 * matched ZERO elements in this fixture, so the DOM-patch loop never even
 * visited the embed — it was not decorated and then discarded, it was never
 * decorated at all.
 *
 * Every assertion here compares against a same-depth PLAIN sibling in the
 * same document rather than a hardcoded pixel value. That is deliberate on
 * two counts: it survives theme/viewport differences, and it asserts the
 * property that actually matters (the line sits in the outline geometry)
 * instead of a self-consistency that would hold just as well if everything
 * were equally wrong. The obvious alternative — compare the line's widget
 * rendering against its own cursor-on plain rendering — is not available:
 * measurement showed a whole-line embed stays a widget with the cursor
 * anywhere on it.
 *
 * Fixture line map (EMBED_MD):
 *   0  `# Section`                         heading, depth 0
 *   2  `Plain sibling paragraph.`          paragraph, depth 1  <- control
 *   4  `![[…]]`                            paragraph, depth 1  <- widget
 *   6  `Some paragraph text.`              paragraph, depth 1, first line
 *   7  `![[…]]`                            same node, continuation <- widget
 *   8  `More text after.`                  same node, continuation <- control
 *   10 `- plain list item`                 list item            <- control
 *   11 `- ![[…]]`                          list item, embed nested inside
 *   13 `An inline embed ![[…]] among text.` paragraph, embed nested inside
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { ALL_DECORATION_FIXTURES, createFixture } from '../fixtures/decorations.js';

const EMBED = ALL_DECORATION_FIXTURES.find((f) => f.label === 'embed')!;

// Sub-pixel differences are expected between a padding-shifted plain line
// and a margin-shifted widget box; anything under a pixel is alignment.
const ALIGN_TOLERANCE_PX = 1;

async function openEmbedFixture(): Promise<void> {
  await createFixture(EMBED, h.createNote);
  if (!(await h.isOutlineMode(EMBED.note))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
  // Embeds resolve and render asynchronously; without this the widget may
  // not exist yet and the assertions would read the pre-embed line. The
  // fixture declares how long that takes, so the corpus screenshot loops
  // and this spec cannot drift apart on it.
  await browser.pause(EMBED.settleMs ?? 0);
  // Park the cursor on the heading so no line is in an edit-revealed state.
  await h.setCursor(0, 0);
  await browser.pause(200);
}

describe('outline decorations: widget-rendered lines (wiki embeds)', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await openEmbedFixture();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('the fixture really does render embeds as non-`.cm-line` elements', async function () {
    // Guards every other assertion in this file: if Obsidian ever renders
    // these as plain lines, the tests below would pass trivially and prove
    // nothing about the widget path.
    const wholeLine = await h.getLineElementInfo(4);
    const continuation = await h.getLineElementInfo(7);
    expect(wholeLine.isCmLine).toBe(false);
    expect(continuation.isCmLine).toBe(false);
    // ...while the placements that keep their host line really do keep it.
    expect((await h.getLineElementInfo(11)).isCmLine).toBe(true);
    expect((await h.getLineElementInfo(13)).isCmLine).toBe(true);
  });

  it('a whole-line embed aligns with its same-depth plain sibling', async function () {
    const control = await h.getLineElementInfo(2); // plain paragraph, depth 1
    const embed = await h.getLineElementInfo(4); // embed paragraph, depth 1

    expect(control.alignedLeft).toBeGreaterThan(0);
    expect(embed.alignedLeft).toBeCloseTo(control.alignedLeft, ALIGN_TOLERANCE_PX);
  });

  it('a whole-line embed gets its paragraph marker, in the same column', async function () {
    const control = await h.getLineElementInfo(2);
    const embed = await h.getLineElementInfo(4);

    expect(control.hasMarker).toBe(true); // the control's own marker must exist
    expect(embed.hasMarker).toBe(true);
    expect(embed.markerLeft).toBeCloseTo(control.markerLeft!, ALIGN_TOLERANCE_PX);
  });

  it("a whole-line embed carries its ancestors' guides", async function () {
    const control = await h.getLineElementInfo(2);
    const embed = await h.getLineElementInfo(4);

    // Both sit under the same `# Section`, so both render exactly its guide.
    expect(control.guideBackground).not.toBe('');
    expect(embed.hasGuides).toBe(true);
    expect(embed.guideBackground).not.toBe('');
  });

  it('an embed on a continuation line takes the node indentation and NO marker', async function () {
    const firstLine = await h.getLineElementInfo(6); // node's own first line
    const embedLine = await h.getLineElementInfo(7); // widget continuation
    const plainContinuation = await h.getLineElementInfo(8); // plain continuation

    expect(embedLine.alignedLeft).toBeCloseTo(firstLine.alignedLeft, ALIGN_TOLERANCE_PX);
    expect(embedLine.alignedLeft).toBeCloseTo(plainContinuation.alignedLeft, ALIGN_TOLERANCE_PX);

    // A marker belongs to a node's first line only — the plain continuation
    // proves that rule is live in this very fixture, so the widget
    // continuation having none is the same rule, not a missing patch.
    expect(firstLine.hasMarker).toBe(true);
    expect(plainContinuation.hasMarker).toBe(false);
    expect(embedLine.hasMarker).toBe(false);
  });

  it('a list-item line containing an embed keeps native list rendering', async function () {
    const control = await h.getLineElementInfo(10); // plain list item
    const withEmbed = await h.getLineElementInfo(11); // list item + embed

    expect(withEmbed.isCmLine).toBe(true);
    expect(withEmbed.marginLeft).toBeCloseTo(control.marginLeft, ALIGN_TOLERANCE_PX);
    expect(withEmbed.alignedLeft).toBeCloseTo(control.alignedLeft, ALIGN_TOLERANCE_PX);
    // List items never take a synthetic marker, whatever they contain.
    expect(control.hasMarker).toBe(false);
    expect(withEmbed.hasMarker).toBe(false);
  });

  it('an inline embed among text leaves its host line decorated exactly once', async function () {
    const control = await h.getLineElementInfo(2); // plain paragraph, depth 1
    const inline = await h.getLineElementInfo(13); // paragraph w/ inline embed, depth 1

    // No doubled shift: the host `.cm-line` is decorated declaratively, and
    // the element nested inside it must not be patched a second time.
    expect(inline.alignedLeft).toBeCloseTo(control.alignedLeft, ALIGN_TOLERANCE_PX);
    expect(inline.hasMarker).toBe(true);
    expect(inline.markerLeft).toBeCloseTo(control.markerLeft!, ALIGN_TOLERANCE_PX);

    const nestedPatched = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const content: HTMLElement = cm.contentDOM;
      // Every embed element that is NOT a direct child of contentDOM — i.e.
      // rendered inside a real line. None may carry our own patch.
      return Array.from(content.querySelectorAll<HTMLElement>('.internal-embed'))
        .filter((el) => el.parentElement !== content)
        .map((el) => ({
          inlineMargin: el.style.marginLeft,
          markerChildren: el.querySelectorAll(':scope > .to-decor-marker-icon').length,
          guides: el.classList.contains('to-decor-guides'),
        }));
    });
    expect(nestedPatched.length).toBeGreaterThan(0); // the nested embeds exist
    for (const n of nestedPatched) {
      expect(n.inlineMargin).toBe('');
      expect(n.markerChildren).toBe(0);
      expect(n.guides).toBe(false);
    }
  });

  it('markers stay single after an embed re-render (idempotent patch)', async function () {
    // Embeds are Obsidian-rendered subtrees that can re-render on their own,
    // unlike the CM6-owned widget subtrees the injection site was designed
    // against. A duplicated or lost marker is the failure mode to catch.
    await h.setCursor(6, 0);
    await browser.pause(150);
    await h.setCursor(0, 0);
    await browser.pause(400);

    const markerCounts = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const content: HTMLElement = cm.contentDOM;
      return Array.from(content.children).map(
        (el) => el.querySelectorAll(':scope > .to-decor-marker-icon').length,
      );
    });
    for (const count of markerCounts) expect(count).toBeLessThanOrEqual(1);
    expect((await h.getLineElementInfo(4)).hasMarker).toBe(true);
  });

  it('an escalated selection covering an embed line gives it the same chrome', async function () {
    // The chrome reaches the covered ROOT's shared column, so every covered
    // line's `::before` starts at the same absolute X — a widget-rendered
    // line included, or it would visibly step out of the highlight.
    // `# Section` at line 0 roots a subtree covering the whole document.
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 0, ch: 2 }, head: { line: 4, ch: 0 } },
    ]);
    await browser.pause(250);

    const control = await h.getLineElementInfo(2); // plain paragraph in the cover
    const embed = await h.getLineElementInfo(4); // widget-rendered line in the cover
    expect(control.hasSelectedChrome).toBe(true);
    expect(embed.hasSelectedChrome).toBe(true);

    const chromeLeft = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const content: HTMLElement = cm.contentDOM;
      // Resolved geometry of each covered element's own chrome pseudo:
      // its own box left edge plus the pseudo's resolved `left`, which is
      // where the highlight actually starts on screen.
      return Array.from(content.children)
        .filter((el) => el.classList.contains('to-decor-node-selected'))
        .map((el) => {
          const he = el as HTMLElement;
          const before = getComputedStyle(he, '::before');
          const border = parseFloat(getComputedStyle(he).borderLeftWidth) || 0;
          return (
            he.getBoundingClientRect().left + border + (parseFloat(before.left) || 0)
          );
        });
    });
    expect(chromeLeft.length).toBeGreaterThan(1);
    for (const left of chromeLeft) expect(left).toBeCloseTo(chromeLeft[0]!, ALIGN_TOLERANCE_PX);

    await h.setCursor(0, 0);
    await browser.pause(150);
  });

  it('marker visibility never reflows a widget-rendered line', async function () {
    // The reserved gutter is unconditional; only whether the icon is drawn
    // may change. Asserted on the embed specifically, because its gutter
    // now comes from the shared shift formula rather than an atom-only one.
    const setVisibility = async (v: string): Promise<void> => {
      await browser.executeObsidian(async ({ plugins }, visibility) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (plugins.trueOutliner as any).setMarkerVisibility(visibility);
      }, v);
      await browser.pause(200);
    };
    try {
      const baseline = await h.getLineElementInfo(4);
      expect(baseline.hasMarker).toBe(true); // 'all'

      // The embed's node is a childless paragraph, so 'with-children' hides
      // its marker while 'headings-and-paragraphs' keeps it (kind, not
      // instance state) — the same two answers a plain paragraph gets.
      await setVisibility('with-children');
      const hidden = await h.getLineElementInfo(4);
      expect(hidden.hasMarker).toBe(false);
      expect(hidden.alignedLeft).toBeCloseTo(baseline.alignedLeft, ALIGN_TOLERANCE_PX);

      await setVisibility('headings-and-paragraphs');
      const shown = await h.getLineElementInfo(4);
      expect(shown.hasMarker).toBe(true);
      expect(shown.alignedLeft).toBeCloseTo(baseline.alignedLeft, ALIGN_TOLERANCE_PX);
    } finally {
      await setVisibility('all'); // leave the vault on the default
    }
  });

  describe('live edits that change how a line renders', function () {
    // All three reported against the first version of this fix, which
    // decided cleanup by "does the selector still match this element"
    // rather than "did we patch this element". Obsidian REUSES a rendered
    // embed's element across renders and RE-PARENTS it into a `.cm-line`
    // when the line stops being a whole-line replacement, so a patched
    // element can walk out of the selector's reach carrying our styles.
    const LIVE_NOTE = 'Scratch/decorations-embed-live.md';
    const LIVE_MD = '# Section\n\nAnchor paragraph.\n\n![[decorations-embed-target]]\n';

    /** Every marker icon anywhere under the given document line's elements. */
    async function markersForLine(lineIndex: number): Promise<number> {
      return browser.executeObsidian(
        ({ app, obsidian }, lineIndex) => {
          const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
          if (!view) throw new Error('no active markdown view');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cm = (view.editor as any).cm;
          const content: HTMLElement = cm.contentDOM;
          // Deliberately counts markers at ANY depth, across EVERY element
          // that renders this line. A per-element `:scope >` count cannot
          // see a second marker on a second element for the same line —
          // which is exactly how the double marker went unnoticed.
          let total = 0;
          for (const child of Array.from(content.children)) {
            try {
              if (cm.state.doc.lineAt(cm.posAtDOM(child)).number - 1 !== lineIndex) continue;
            } catch {
              continue;
            }
            total += child.querySelectorAll('.to-decor-marker-icon').length;
          }
          return total;
        },
        lineIndex,
      );
    }

    /** Elements anywhere still carrying our widget patch. */
    function strandedPatches(): Promise<string[]> {
      return browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) throw new Error('no active markdown view');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cm = (view.editor as any).cm;
        const content: HTMLElement = cm.contentDOM;
        return Array.from(content.querySelectorAll<HTMLElement>('*'))
          .filter((el) => el.parentElement !== content)
          .filter(
            (el) =>
              el.style.marginLeft ||
              el.classList.contains('to-decor-guides') ||
              el.classList.contains('to-decor-marker'),
          )
          .map((el) => `${el.className} ml=${el.style.marginLeft}`);
      });
    }

    beforeEach(async function () {
      await h.createNote(LIVE_NOTE, LIVE_MD);
      if (!(await h.isOutlineMode(LIVE_NOTE))) {
        await h.toggleOutlineMode();
        await h.waitForNotice('Outline mode on');
        await h.dismissNotices();
      }
      await h.setCursor(0, 0);
      await browser.pause(700);
    });

    it('an embed line under the cursor shows exactly ONE marker, not two', async function () {
      // With the cursor on it, Obsidian reveals the raw source as a real
      // `.cm-line` AND keeps the rendered embed block — two elements, one
      // document line. Only the source line may carry a marker; a second
      // one floated in the middle of the embed block.
      expect(await markersForLine(4)).toBe(1); // cursor away: the widget's own

      await h.setCursor(4, 2);
      await browser.pause(400);
      expect(await markersForLine(4)).toBe(1); // cursor on: the source line's

      await h.setCursor(0, 0);
      await browser.pause(400);
      expect(await markersForLine(4)).toBe(1);
    });

    it('indenting an embed into a list item strands no patch and does not double its indent', async function () {
      await h.setCursor(4, 2);
      await browser.pause(300);
      await h.runCommand('indent-node');
      await browser.pause(600);
      expect(await h.getBuffer()).toContain('- ![[decorations-embed-target]]');

      expect(await strandedPatches()).toEqual([]);
      // A list item takes no synthetic marker, whatever it contains.
      expect(await markersForLine(4)).toBe(0);

      // The live result must equal the from-scratch result. Anything left
      // over from the paragraph rendering would show up as extra offset.
      const live = await h.getLineElementInfo(4);
      await h.saveActiveFile();
      await h.openNote(EMBED.note);
      await browser.pause(200);
      await h.openNote(LIVE_NOTE);
      await h.setCursor(0, 0);
      await browser.pause(800);
      const reopened = await h.getLineElementInfo(4);

      expect(live.alignedLeft).toBeCloseTo(reopened.alignedLeft, ALIGN_TOLERANCE_PX);
      expect(live.marginLeft).toBeCloseTo(reopened.marginLeft, ALIGN_TOLERANCE_PX);
      expect(await markersForLine(4)).toBe(0);
      expect(await strandedPatches()).toEqual([]);
    });

    it('outdenting back to a paragraph restores the widget-line decoration', async function () {
      await h.setCursor(4, 2);
      await browser.pause(300);
      await h.runCommand('indent-node');
      await browser.pause(500);
      await h.runCommand('outdent-node');
      await browser.pause(500);
      expect(await h.getBuffer()).toContain('\n![[decorations-embed-target]]');

      await h.setCursor(0, 0);
      await browser.pause(500);
      expect(await strandedPatches()).toEqual([]);
      expect(await markersForLine(4)).toBe(1);
      const control = await h.getLineElementInfo(2);
      const embed = await h.getLineElementInfo(4);
      expect(embed.alignedLeft).toBeCloseTo(control.alignedLeft, ALIGN_TOLERANCE_PX);
    });
  });

  it('outline mode off leaves no patch behind on a widget-rendered line', async function () {
    // The live-edit block above left a different note open.
    await openEmbedFixture();
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode off');
    await h.dismissNotices();
    await browser.pause(300);

    const embed = await h.getLineElementInfo(4);
    expect(embed.hasMarker).toBe(false);
    expect(embed.hasGuides).toBe(false);
    expect(embed.marginLeft).toBe(0);

    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
    await browser.pause(300);
    expect((await h.getLineElementInfo(4)).hasMarker).toBe(true);
  });
});
