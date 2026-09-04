/**
 * `outline-zoom` in a real Obsidian: the scope, the trail, the commands, and the
 * two things the task-1 spike was carrying until the real feature existed —
 * that a visible line's chrome survives the hiding, and that the backlinks
 * footer does too.
 *
 * Three harness facts the spike paid for (docs/research/23), which every
 * assertion here is written around:
 *
 * - Park the caret OFF a line before reading it. With the caret on it, Live
 *   Preview renders the raw source beside the widget and `getLineElementInfo`
 *   refuses the ambiguity — correctly.
 * - Never measure the span's BOUNDARY lines through that helper: a block
 *   decoration anchored at the last visible line's end is attributed to that
 *   line by `posAtDOM`.
 * - Count widgets, not `.cm-line`s, for a span of widget-rendered atoms. A
 *   correct render reports zero cm-lines there, which looks like total failure
 *   through the obvious probe.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'Scratch/zoom.md';
const SOURCE = 'Scratch/zoom-source.md';

const DOC = [
  '# Top',
  '',
  '## Mid',
  '',
  '- one',
  '  - nested',
  '- two',
  '',
  'Trailing para.',
  '',
].join('\n');

/**
 * Every SOURCE line `## Mid` owns.
 *
 * Longer than it first looks, and the tests were written wrong twice before
 * this constant existed. The trailing paragraph is INSIDE this section — a
 * paragraph after a list is still the heading's descendant — so zooming to
 * `## Mid` keeps it, and that paragraph is not a top-level node. The final
 * empty string is the cover's own trailing gap, which D3 includes on purpose.
 */
const MID_SUBTREE = ['## Mid', '', '- one', '  - nested', '- two', '', 'Trailing para.', ''];

/**
 * The SOURCE text of every line the editor currently renders, in order.
 *
 * Read by mapping each rendered element back to its document position rather
 * than by taking its `innerText`, because rendered text is not caret-independent
 * and this assertion must be. Live Preview reveals a line's raw markdown while
 * the caret is on it — `## Mid` instead of `Mid` — so an innerText comparison
 * silently depends on where the caret happened to land. It passed locally and
 * failed on CI for exactly that reason, which is the harness rule this spec's
 * own header states and the first version of this helper ignored.
 *
 * Which LINES are visible is what zoom controls; how Obsidian renders each one
 * is Obsidian's business and is asserted elsewhere.
 */
function renderedLines(): Promise<string[]> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const content: HTMLElement = cm.contentDOM;
    const lines = new Set<number>();
    // `.cm-line` only. A block replacement is a child of `.cm-content` too and
    // `posAtDOM` happily resolves it — to the first position of the range it
    // HIDES, which put `# Top` in this list on the first attempt. Filtering to
    // real lines is also why this spec's fixtures carry no widget-rendered
    // atoms: a span of those reports zero cm-lines (docs/research/23), and the
    // assertion for that case counts widgets instead.
    for (const child of Array.from(content.querySelectorAll('.cm-line'))) {
      try {
        lines.add(cm.state.doc.lineAt(cm.posAtDOM(child as HTMLElement)).number);
      } catch {
        // Scaffolding (a viewport gap placeholder) has no document position.
      }
    }
    return [...lines]
      .sort((a, b) => a - b)
      .map((n) => cm.state.doc.line(n).text as string);
  });
}

/**
 * The trail's segment labels, in order.
 *
 * Read through the FOOTER's own classes, because the trail is a footer lineage
 * row: same markup, same marker gutter, same separators. If this selector ever
 * has to change to something zoom-specific, the shared visual language has been
 * broken and that is the thing to fix.
 */
function trail(): Promise<string[]> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const el = view?.containerEl.querySelector('.to-zoom-trail');
    if (!el) return [];
    return Array.from(el.querySelectorAll('.to-backlinks-seg')).map(
      (seg) => (seg as HTMLElement).innerText.trim(),
    );
  });
}

/** Is the trail rendered as a footer-style lineage row? */
function trailIsLineageRow(): Promise<boolean> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const row = view?.containerEl.querySelector('.to-zoom-trail .to-backlinks-row');
    return !!row && row.classList.contains('is-lineage');
  });
}

/** Are the note title and properties visible? */
function chromeVisible(): Promise<{ title: boolean; properties: boolean }> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const root = view?.containerEl;
    const shown = (sel: string): boolean => {
      const el = root?.querySelector(sel) as HTMLElement | null;
      return !!el && el.getBoundingClientRect().height > 0;
    };
    return { title: shown('.inline-title'), properties: shown('.metadata-container') };
  });
}

function clickCrumb(index: number): Promise<void> {
  return browser.executeObsidian(({ app, obsidian }, i) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const crumbs = view?.containerEl.querySelectorAll('.to-zoom-trail .to-backlinks-seg');
    const el = crumbs?.[i] as HTMLElement | undefined;
    if (!el) throw new Error(`no crumb at ${i}`);
    el.click();
  }, index);
}

function footerPresent(): Promise<boolean> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    return !!view?.containerEl.querySelector('.to-backlinks');
  });
}

async function openZoomable(md = DOC): Promise<void> {
  await h.createNote(NOTE, md);
  await h.openNote(NOTE);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
  }
  await h.dismissNotices();
}

/** Put the caret on the line containing `needle`, then zoom. */
async function zoomAt(md: string, needle: string): Promise<void> {
  const line = md.split('\n').findIndex((l) => l.includes(needle));
  await h.setCursorSettled(line, md.split('\n')[line]!.length);
  await h.runCommand('zoom-in');
  await browser.pause(150);
}

describe('outline zoom', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await h.runCommand('zoom-clear');
    await h.dismissNotices();
  });

  it('zooms to the node at the caret, hiding everything else', async function () {
    await openZoomable();
    await zoomAt(DOC, '## Mid');
    // Live Preview keeps a list item's own marker in the rendered text; the
    // heading's `##` is the part it hides.
    expect(await renderedLines()).toEqual(MID_SUBTREE);
  });

  it('zooms into a list item, keeping only its own subtree', async function () {
    await openZoomable();
    await zoomAt(DOC, '- one');
    expect(await renderedLines()).toEqual(['- one', '  - nested']);
  });

  it('leaves the file untouched across a zoom in and out', async function () {
    await openZoomable();
    const before = await h.readVaultFile(NOTE);
    await zoomAt(DOC, '## Mid');
    await h.runCommand('zoom-clear');
    await browser.pause(150);
    await h.saveActiveFile();
    expect(await h.readVaultFile(NOTE)).toBe(before);
  });

  it('shows the ancestor trail, outermost first, without the root itself', async function () {
    await openZoomable();
    await zoomAt(DOC, '  - nested');
    expect(await trail()).toEqual(['zoom', 'Top', 'Mid', 'one']);
  });

  it('has a file-only trail for a top-level root', async function () {
    await openZoomable();
    // `# Top`, and not the trailing paragraph — which is NOT top-level: a
    // paragraph after the list is still inside `## Mid`'s section, so its trail
    // is two crumbs long. Getting that wrong here would have asserted the tree
    // model backwards rather than the trail.
    await zoomAt(DOC, '# Top');
    expect(await trail()).toEqual(['zoom']);
  });

  it('zooms to an ancestor when its crumb is activated', async function () {
    await openZoomable();
    await zoomAt(DOC, '  - nested');
    await clickCrumb(2); // 'Mid'
    await browser.pause(200);
    expect(await renderedLines()).toEqual(MID_SUBTREE);
    expect(await trail()).toEqual(['zoom', 'Top']);
  });

  it('clears the zoom when the file crumb is activated', async function () {
    await openZoomable();
    await zoomAt(DOC, '- one');
    await clickCrumb(0);
    await browser.pause(200);
    expect(await trail()).toEqual([]);
    expect((await renderedLines()).length).toBeGreaterThan(2);
  });

  it('steps out one level, and clears from the top level', async function () {
    await openZoomable();
    await zoomAt(DOC, '  - nested');
    await h.runCommand('zoom-out');
    await browser.pause(200);
    expect(await trail()).toEqual(['zoom', 'Top', 'Mid']);

    await h.runCommand('zoom-out');
    await browser.pause(200);
    expect(await trail()).toEqual(['zoom', 'Top']);

    await h.runCommand('zoom-out');
    await browser.pause(200);
    // Now rooted at `# Top`, which is top-level — the zoom is still ACTIVE, with
    // only the file crumb. Clearing is what the NEXT step out does.
    expect(await trail()).toEqual(['zoom']);

    await h.runCommand('zoom-out');
    await browser.pause(200);
    expect(await trail()).toEqual([]);
  });

  it('collapses a selection, and zooms the same way whichever direction it was drawn', async function () {
    await openZoomable();
    // Two sibling subtrees. The ends lie outside the scope the gesture is about
    // to create, so preserving the selection would break confinement on the
    // transition itself.
    await h.setSelection({ line: 4, ch: 0 }, { line: 6, ch: 5 }); // '- one' → '- two'
    await h.runCommand('zoom-in');
    await browser.pause(200);
    const forward = await renderedLines();
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual(sel.head);
    expect(forward).toEqual(['- one', '  - nested']);

    await h.runCommand('zoom-clear');
    await browser.pause(150);
    // The SAME two nodes selected the other way round. Reading either the
    // anchor or the head would zoom to `- two` here; the first covered root in
    // document order is direction-independent, which is the point.
    await h.setSelection({ line: 6, ch: 5 }, { line: 4, ch: 0 });
    await h.runCommand('zoom-in');
    await browser.pause(200);
    expect(await renderedLines()).toEqual(forward);
  });

  it('confines arrow motion, and its own handler is what declines', async function () {
    await openZoomable();
    await zoomAt(DOC, '- one');
    await h.resetMotionCounts();
    // The last visible line of the `- one` subtree.
    await h.setCursorSettled(5, 10);
    await browser.keys(['ArrowDown']);
    await browser.pause(200);
    const after = await h.getCursor();
    expect(after.line).toBeLessThanOrEqual(5);

    // MECHANISM, not outcome: a caret that does not move looks identical
    // whether our handler declined or never ran at all. That blind spot hid a
    // real defect through three rewrites of the Home/End logic.
    const counts = await h.getMotionCounts();
    expect(counts['Down']?.invoked ?? 0).toBeGreaterThan(0);
  });

  it('zooms two panes on one file independently', async function () {
    await openZoomable();
    await zoomAt(DOC, '- one');
    expect(await trail()).not.toEqual([]);

    // A second leaf on the SAME file. The scope lives in that view's own state,
    // so the new pane must open unzoomed — which is also why the registry keys
    // views by their MarkdownFileInfo rather than by file path.
    await browser.executeObsidian(async ({ app }) => {
      const leaf = app.workspace.getLeaf('split');
      const file = app.vault.getAbstractFileByPath('Scratch/zoom.md');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await leaf.openFile(file as any);
      app.workspace.setActiveLeaf(leaf, { focus: true });
    });
    await browser.pause(500);
    expect(await trail()).toEqual([]);
    expect((await renderedLines()).length).toBeGreaterThan(2);

    await browser.executeObsidian(({ app }) => {
      app.workspace.detachLeavesOfType('markdown');
    });
    await browser.pause(200);
  });

  it('renders the trail as a footer lineage row, not a primitive of its own', async function () {
    await openZoomable();
    await zoomAt(DOC, '  - nested');
    // The row IS `.to-backlinks-row.is-lineage` — the same markup the footer's
    // squashed ancestor chains use, so the two surfaces cannot drift apart
    // visually. A zoom-specific class here would mean the shared language broke.
    expect(await trailIsLineageRow()).toBe(true);
    const marks = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      const el = view?.containerEl.querySelector('.to-zoom-trail');
      return {
        gutterMarker: !!el?.querySelector('.to-backlinks-marker, .to-backlinks-ord'),
        content: !!el?.querySelector('.to-backlinks-content'),
        segments: el?.querySelectorAll('.to-backlinks-seg').length ?? 0,
      };
    });
    expect(marks.content).toBe(true);
    expect(marks.segments).toBe(4); // the file plus three ancestors
  });

  it('puts a zoom-out control in the trail marker gutter, not a kind glyph', async function () {
    await openZoomable();
    await zoomAt(DOC, '  - nested');
    const mark = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      const el = view?.containerEl.querySelector('.to-zoom-trail .to-zoom-out') as HTMLElement | null;
      return {
        present: !!el,
        role: el?.getAttribute('role') ?? null,
        label: el?.getAttribute('aria-label') ?? null,
        focusable: el?.tabIndex ?? -1,
        arms: !!el?.querySelector('.to-zoom-out-tl') && !!el.querySelector('.to-zoom-out-br'),
      };
    });
    expect(mark.present).toBe(true);
    expect(mark.role).toBe('button');
    expect(mark.focusable).toBe(0);
    expect(mark.arms).toBe(true);
  });

  it('clears the zoom when the trail marker is activated', async function () {
    await openZoomable();
    await zoomAt(DOC, '  - nested');
    expect(await trail()).not.toEqual([]);
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      (view?.containerEl.querySelector('.to-zoom-trail .to-zoom-out') as HTMLElement).click();
    });
    await browser.pause(250);
    expect(await trail()).toEqual([]);
  });

  it('separates its segments whatever the footer setting says', async function () {
    // The footer's own separator defaults to none; the trail is separated
    // regardless, because the join is the only thing telling two ancestors
    // apart on a single horizontal path.
    await openZoomable();
    await zoomAt(DOC, '  - nested');
    const seps = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      const el = view?.containerEl.querySelector('.to-zoom-trail');
      return el?.querySelectorAll('.to-backlinks-seg-sep').length ?? 0;
    });
    // Four segments (file plus three ancestors) means three joins.
    expect(seps).toBe(3);
  });

  it('keeps the zoomed node on column 0 — the subtree is not pushed right for the trail', async function () {
    await openZoomable();
    const unit = await h.publishedUnit();

    // A NON-boundary line: the trail widget is attributed to the zoom root's
    // own line by `posAtDOM` (docs/research/23), so the root itself cannot be
    // measured through this helper. `- one` is the root's first child.
    await zoomAt(DOC, '## Mid');
    await h.setCursorSettled(6, 0);
    await browser.pause(150);
    const zoomed = await h.getLineElementInfo(4);

    await h.runCommand('zoom-clear');
    await browser.pause(200);
    await h.setCursorSettled(6, 0);
    await browser.pause(150);
    const unzoomed = await h.getLineElementInfo(4);

    // Unzoomed `- one` is two levels in (Top > Mid > one); zoomed it is ONE,
    // because the root holds column 0. Were the trail the root instead, the
    // subtree would sit a level further right and this delta would be zero.
    // Asserted as a relationship, never as a pixel count — CI's font is not
    // this machine's.
    expect(unzoomed.alignedLeft - zoomed.alignedLeft).toBeCloseTo(unit, 0);
  });

  it('shows only the lineage, the subtree and the footer', async function () {
    await h.createNote(SOURCE, `See [[zoom]] for the thing.\n`);
    const withFrontmatter = `---\ntag: x\n---\n\n${DOC}`;
    await openZoomable(withFrontmatter);
    await browser.pause(600);
    const before = await chromeVisible();
    expect(before.title).toBe(true);
    expect(before.properties).toBe(true);

    await zoomAt(withFrontmatter, '## Mid');
    await browser.pause(250);
    // The title and the properties block are siblings of the content inside
    // `.cm-sizer`, not document lines, so the block replacements cannot reach
    // them — they are hidden by the editor's own zoomed class instead.
    const after = await chromeVisible();
    expect(after.title).toBe(false);
    expect(after.properties).toBe(false);
    expect(await footerPresent()).toBe(true);

    await h.runCommand('zoom-clear');
    await browser.pause(250);
    const restored = await chromeVisible();
    expect(restored.title).toBe(true);
    expect(restored.properties).toBe(true);
  });

  it('re-bases indentation so the root sits at the left margin', async function () {
    await openZoomable();
    // Park the caret off the line being measured, and off the span's edges.
    await zoomAt(DOC, '## Mid');
    await h.setCursorSettled(2, 0);
    await browser.pause(150);
    const nested = await h.getLineElementInfo(5); // '  - nested', interior
    await h.runCommand('zoom-clear');
    await browser.pause(200);
    await h.setCursorSettled(2, 0);
    await browser.pause(150);
    const unzoomed = await h.getLineElementInfo(5);
    // `## Mid` is one level deep, so everything under it moves one unit left.
    expect(nested.alignedLeft).toBeLessThan(unzoomed.alignedLeft);
  });

  it('keeps a visible line chrome intact while hiding', async function () {
    await openZoomable();
    await zoomAt(DOC, '## Mid');
    await h.setCursorSettled(2, 0);
    await browser.pause(150);
    const info = await h.getLineElementInfo(5);
    expect(info.cls).toContain('to-decor-list');
    expect(info.hasGuides).toBe(true);
  });

  it('keeps the backlinks footer rendering below the zoomed content', async function () {
    await h.createNote(SOURCE, `See [[zoom]] for the thing.\n`);
    await openZoomable();
    await browser.pause(700);
    expect(await footerPresent()).toBe(true);
    await zoomAt(DOC, '## Mid');
    await browser.pause(400);
    // The trailing hidden range ends at doc.length, where the footer used to
    // anchor; it now anchors at the visible end (D12, docs/research/23).
    expect(await footerPresent()).toBe(true);
  });

  it('exits when the zoom root is deleted', async function () {
    await openZoomable();
    await zoomAt(DOC, '- one');
    expect(await trail()).not.toEqual([]);
    await h.setBuffer(DOC.replace('- one\n  - nested\n', ''));
    await browser.pause(300);
    expect(await trail()).toEqual([]);
  });

  it('exits when a change reaches outside the visible range', async function () {
    await openZoomable();
    await zoomAt(DOC, '- one');
    expect(await trail()).not.toEqual([]);
    // Rewriting the whole buffer touches positions above and below the scope —
    // the shape a history transaction, a sync write or another pane produces,
    // none of which pass through the clamps.
    await h.setBuffer(DOC.replace('# Top', '# Renamed'));
    await browser.pause(300);
    expect(await trail()).toEqual([]);
  });

  it('keeps the zoom while the root own text is edited', async function () {
    await openZoomable();
    await zoomAt(DOC, '## Mid');
    const before = await trail();
    await h.setCursorSettled(2, 6);
    await browser.keys(['!']);
    await browser.pause(250);
    expect(await trail()).toEqual(before);
  });

  it('exits when outline mode is switched off', async function () {
    await openZoomable();
    await zoomAt(DOC, '## Mid');
    expect(await trail()).not.toEqual([]);
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode off');
    await h.dismissNotices();
    expect(await trail()).toEqual([]);
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  });

  it('does nothing when the caret is in the preamble', async function () {
    const withFrontmatter = `---\ntag: x\n---\n\n${DOC}`;
    await openZoomable(withFrontmatter);
    await h.setCursorSettled(1, 0);
    await h.runCommand('zoom-in');
    await browser.pause(200);
    expect(await trail()).toEqual([]);
  });

  it('offers its commands only in outline mode', async function () {
    await openZoomable();
    expect(await h.commandAvailable('zoom-in')).toBe(true);
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode off');
    await h.dismissNotices();
    expect(await h.commandAvailable('zoom-in')).toBe(false);
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  });
});
