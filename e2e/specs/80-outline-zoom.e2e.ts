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

/**
 * The `.cm-line` rendering a document line, ignoring any widget attributed to
 * the same position.
 *
 * `getLineElementInfo` refuses a line rendered by more than one element, which
 * is the right refusal for it and the wrong question here: the trail widget is
 * anchored at the zoom ROOT's own line start and `posAtDOM` attributes it to
 * that line, so the root is permanently ambiguous through that helper. This
 * asks for the rendering it means.
 */
function rootLine(lineIndex: number): Promise<{
  cls: string;
  /** Left edge plus padding — the column this line's text starts on. */
  alignedLeft: number;
  /** Centre of the marker icon, or null when the line has none. */
  markerCentre: number | null;
  /** Width of the native list marker run, or null when there is none. */
  bulletWidth: number | null;
}> {
  return browser.executeObsidian(({ app, obsidian }, lineIndex) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const content: HTMLElement = cm.contentDOM;
    const found = Array.from(content.querySelectorAll<HTMLElement>(':scope > .cm-line')).find(
      (el) => {
        try {
          return cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1 === lineIndex;
        } catch {
          return false;
        }
      },
    );
    if (!found) throw new Error(`no .cm-line renders document line ${lineIndex}`);
    const cs = getComputedStyle(found);
    const r = found.getBoundingClientRect();
    const marker = found.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
    const mr = marker?.getBoundingClientRect();
    const bullet = found.querySelector<HTMLElement>('.cm-formatting-list');
    return {
      cls: found.className,
      alignedLeft: r.left + (parseFloat(cs.paddingLeft) || 0),
      markerCentre: mr ? mr.left + mr.width / 2 : null,
      bulletWidth: bullet ? bullet.getBoundingClientRect().width : null,
    };
  }, lineIndex);
}

/** Centre of the trail's zoom-out mark, the column it should share with a
 * top-level marker. */
function trailMarkCentre(): Promise<number> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const mark = view?.containerEl.querySelector('.to-zoom-trail .to-zoom-out') as HTMLElement | null;
    if (!mark) throw new Error('no zoom-out mark');
    const r = mark.getBoundingClientRect();
    return r.left + r.width / 2;
  });
}

/**
 * Presses the Nth mark matching `selector`, the way a pointer would.
 *
 * Hit-tested, then dispatched — two instruments, because half of what this
 * gesture needed was hit-testing and the other half is what the handler does
 * with the press.
 *
 * The press goes to whatever `elementFromPoint` returns at the mark's own
 * centre, NOT to the mark itself. That is what makes it a real test of the half
 * this change had to fix: with `pointer-events: none` still in force the topmost
 * element there is the line behind the mark, and the press lands on the line and
 * zooms nothing. It is also how the fold indicator's invisible box was caught
 * covering a list bullet outright.
 *
 * Driven in the page rather than through WebDriver's own pointer, whose viewport
 * coordinates do not survive mobile emulation — measured: a press aimed at a
 * marker's centre landed on the line behind it, and every click test failed on
 * mobile while every command test passed. `element.click()` is no better: it
 * demands the element be "interactable", which a mark inside a widget atom and a
 * zero-width bullet span both fail while being perfectly clickable by a person.
 *
 * Waited for, too. Marks arrive with the decoration pass rather than with the
 * note, and a mark read before it is either absent or, worse, present at the
 * wrong INDEX — so the press lands on a different node and the assertion fails
 * somewhere else entirely.
 */
async function clickMark(selector: string, index = 0, modifier = false): Promise<string> {
  const all = `.cm-content ${selector}`;
  await browser.waitUntil(
    async () =>
      (await browser.executeObsidian(
        ({ app, obsidian }, all) => {
          const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
          if (!view) return 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cm = (view.editor as any).cm;
          return (cm.dom as HTMLElement).querySelectorAll(all).length as number;
        },
        all,
      )) > index,
    { timeout: 5000, interval: 100, timeoutMsg: `no ${all}[${index}] rendered` },
  );
  const hit = await browser.executeObsidian(
    ({ app, obsidian }, all, index, modifier, MARKS) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const mark = (cm.dom as HTMLElement).querySelectorAll(all)[index] as HTMLElement | undefined;
      if (!mark) throw new Error(`no element ${all}[${index}]`);
      const r = mark.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const target = mark.ownerDocument.elementFromPoint(x, y) as HTMLElement | null;
      if (!target) throw new Error('nothing at the mark');
      // Read BEFORE dispatching. The press re-roots the view synchronously, so
      // `target` is detached by the time the handler returns and no longer has
      // the ancestors a selector could match against.
      const reached = target.closest(MARKS)
        ? 'mark'
        : typeof target.className === 'string'
          ? target.className
          : target.tagName;
      const opts = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: 1,
        metaKey: modifier,
        ctrlKey: modifier,
      };
      target.dispatchEvent(new PointerEvent('pointerdown', opts));
      target.dispatchEvent(new MouseEvent('mousedown', opts));
      target.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
      target.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
      // What the pointer would actually have reached, for a caller that wants
      // to assert the hit-testing rather than only its consequence.
      return reached;
    },
    all,
    index,
    modifier,
    // The handler's own set, not the queried selector: two marks can overlap —
    // an ordered item's digits sit under Obsidian's own `.list-number` — and the
    // question this answers is whether a pointer reaches A mark, not which.
    '.to-decor-marker-icon, .list-bullet, .list-number, .to-decor-ol-digits',
  );
  await browser.pause(250);
  return hit;
}

async function openZoomable(md = DOC): Promise<void> {
  await h.createNote(NOTE, md);
  await h.openNote(NOTE);
  await h.setOutlineMode(true);
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

  it('keeps the zoom root own chrome — it is a visible line, not the replacement edge', async function () {
    await openZoomable();
    await zoomAt(DOC, '## Mid');
    await h.setCursorSettled(4, 0);
    await browser.pause(150);
    const root = await rootLine(2);
    // Ours and Obsidian's alike, and both went missing together: the head
    // hidden range used to end ON this line's start, and a line decoration
    // sorts before the position it marks, so the replacement swallowed every
    // one of them and the root rendered as a bare `.cm-line`.
    expect(root.cls).toContain('to-decor-block');
    expect(root.cls).toContain('HyperMD-header-2');
    expect(root.markerCentre).not.toBeNull();
  });

  it('zooms into a list item without indenting it or shrinking its bullet', async function () {
    await openZoomable();
    const unit = await h.publishedUnit();
    await zoomAt(DOC, '- one');
    await h.setCursorSettled(5, 0);
    await browser.pause(150);
    const zoomed = await rootLine(4);
    await h.runCommand('zoom-clear');
    await browser.pause(200);
    await h.setCursorSettled(5, 0);
    await browser.pause(150);
    const unzoomed = await rootLine(4);

    expect(zoomed.cls).toContain('HyperMD-list-line');
    // The SAME bullet, not a raw `- ` drawn as text: what sizes it is the
    // native list rendering, which is one of the decorations the root lost.
    expect(zoomed.bulletWidth).toBeCloseTo(unzoomed.bulletWidth!, 0);
    // And exactly its own depth left of where it sits unzoomed — `# Top` >
    // `## Mid` > `- one`, so two levels — with no extra indent of its own. A
    // relationship, never a pixel count: CI's font is not this machine's.
    expect(unzoomed.alignedLeft - zoomed.alignedLeft).toBeCloseTo(2 * unit, 0);
  });

  it('puts the trail mark on the column a top-level marker sits on', async function () {
    await openZoomable();
    await zoomAt(DOC, '## Mid');
    await h.setCursorSettled(4, 0);
    await browser.pause(150);
    const root = await rootLine(2);
    expect(await trailMarkCentre()).toBeCloseTo(root.markerCentre!, 0);
  });

  it('keeps the cover trailing gap line inside the visible range', async function () {
    // The only fixture here with a tail hidden range AND a cover that ends on a
    // gap. `## Mid` reaches the end of `DOC`, so its zoom has no tail range at
    // all — which is why the tail edge could swallow this line unnoticed.
    const md = ['# A', '', 'body', '', '# B', ''].join('\n');
    await openZoomable(md);
    await zoomAt(md, '# A');
    expect(await renderedLines()).toEqual(['# A', '', 'body', '']);
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

  it('exits rather than retargets when the root is deleted and a sibling slides into its line', async function () {
    // `setBuffer`, above, replaces the WHOLE document; this one deletes ONLY
    // the root's own two lines in place, leaving everything before and after
    // untouched. `- two` — the following sibling — then starts on the exact
    // line `- one` used to, which is a real node and would satisfy "does some
    // node start here" on its own. The end-to-end behaviour this asserts
    // (exit, not a silent retarget) holds either way here, through the
    // outside-range trigger; `tests/zoom-state-triggers.test.ts` isolates the
    // deletion-identity check itself (`zoom-state.ts`'s own trigger 1a) from
    // that one, against a resolver contract rather than this geometry.
    await openZoomable();
    await zoomAt(DOC, '- one');
    expect(await trail()).toEqual(['zoom', 'Top', 'Mid']);
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const text: string = cm.state.doc.toString();
      const from = text.indexOf('- one');
      const to = text.indexOf('- two');
      cm.dispatch({ changes: { from, to, insert: '' } });
    });
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

  it('exits when outline mode is switched off, and stays cleared on re-enable', async function () {
    await openZoomable();
    await zoomAt(DOC, '## Mid');
    expect(await trail()).not.toEqual([]);
    await h.setOutlineMode(false);
    expect(await trail()).toEqual([]);
    // The stored anchor, not only the scope it would otherwise derive: gating
    // the DERIVED scope on outline mode is not the same as clearing what it is
    // derived FROM, and re-enabling mode used to walk straight back into the
    // zoom the user had already left.
    await h.setOutlineMode(true);
    expect(await trail()).toEqual([]);
  });

  it('turning a pane off clears ITS zoom and leaves the other pane’s alone', async function () {
    await openZoomable();
    await zoomAt(DOC, '## Mid');
    expect(await trail()).not.toEqual([]);

    // A second leaf on the SAME file, zoomed to a DIFFERENT node — proves the
    // first pane's scope survives independently and is not merely along for
    // the ride on whatever the active pane does.
    await browser.executeObsidian(async ({ app }) => {
      const leaf = app.workspace.getLeaf('split');
      const file = app.vault.getAbstractFileByPath('Scratch/zoom.md');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await leaf.openFile(file as any);
      app.workspace.setActiveLeaf(leaf, { focus: true });
    });
    await browser.pause(500);
    await zoomAt(DOC, '- one');
    expect(await trail()).not.toEqual([]);

    // The toggle acts on the ACTIVE tab — here the second pane. Outline mode
    // is per view now, so exit trigger 3 fires for the view whose mode turned
    // off and for no other: the first pane is still in outline mode, still
    // zoomed, and has been asked for nothing.
    await h.setOutlineMode(false);
    const readTrails = () =>
      browser.executeObsidian(({ app, obsidian }) => {
        return app.workspace
          .getLeavesOfType('markdown')
          .filter(
            (leaf) =>
              leaf.view instanceof obsidian.MarkdownView &&
              leaf.view.file?.path === 'Scratch/zoom.md',
          )
          .map((leaf) => {
            const el = leaf.view.containerEl.querySelector('.to-zoom-trail');
            if (!el) return [];
            return Array.from(el.querySelectorAll('.to-backlinks-seg')).map((seg) =>
              (seg as HTMLElement).innerText.trim(),
            );
          });
      });
    const trailsOff = await readTrails();
    expect(trailsOff.length).toBeGreaterThanOrEqual(2);
    // Exactly one pane still shows a trail: the one nobody toggled.
    expect(trailsOff.filter((t) => t.length > 0).length).toBe(1);
    expect(await trail()).toEqual([]); // the active pane, the one turned off

    // The stored anchor, not only what the shared gate hides while mode is off.
    // The toggled pane's anchor was CLEARED, not merely ungated, so turning it
    // back on revives nothing — while the untouched pane, which never lost its
    // scope, still has it.
    await h.setOutlineMode(true);
    expect(await trail()).toEqual([]);
    expect((await readTrails()).filter((t) => t.length > 0).length).toBe(1);

    await browser.executeObsidian(({ app }) => {
      app.workspace.detachLeavesOfType('markdown');
    });
    await browser.pause(200);
  });

  it('does nothing when the caret is in the preamble', async function () {
    const withFrontmatter = `---\ntag: x\n---\n\n${DOC}`;
    await openZoomable(withFrontmatter);
    await h.setCursorSettled(1, 0);
    await h.runCommand('zoom-in');
    await browser.pause(200);
    expect(await trail()).toEqual([]);
  });

  it('zooms into the node whose mark is clicked', async function () {
    await openZoomable();
    // `## Mid` is the second block marker in the document — `# Top` has the
    // first, and the list items below carry Obsidian's bullets instead.
    // `'mark'` is the hit test: a pointer aimed at the mark's own centre
    // actually reaches it, which `pointer-events: none` used to prevent.
    expect(await clickMark('.cm-line > .to-decor-marker-icon', 1)).toBe('mark');
    expect(await trail()).toEqual(['zoom', 'Top']);
  });

  it('zooms from a list item bullet, which is the mark Obsidian draws', async function () {
    await openZoomable();
    // The fold indicator's own box covers the bullet outright, so this reaching
    // the bullet is the whole of what the stacking order buys.
    expect(await clickMark('.to-decor-list .list-bullet', 0)).toBe('mark');
    expect(await trail()).toEqual(['zoom', 'Top', 'Mid']);
  });

  it('zooms from a widget atom mark, which is injected rather than decorated', async function () {
    // A different code path from both of the above: this marker is prepended to
    // Obsidian's own table widget by the DOM patch, and the widget's
    // `ignoreEvent` is what made CM6's registered handlers unreachable there.
    const md = ['# T', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', '- after', ''].join('\n');
    await openZoomable(md);
    await browser.pause(250);
    expect(await clickMark('.cm-table-widget > .to-decor-marker-icon', 0)).toBe('mark');
    expect(await trail()).toEqual(['zoom', 'T']);
    // Counted, not read as lines: a widget-rendered span reports no `.cm-line`s
    // at all (this spec's header), and Obsidian rewrites a table's own source
    // when it loads the note, so the text is not ours to assert either.
    expect(
      await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cm = (view!.editor as any).cm;
        return {
          tables: cm.contentDOM.querySelectorAll('.cm-table-widget').length,
          headings: cm.contentDOM.querySelectorAll('.HyperMD-header').length,
        };
      }),
    ).toEqual({ tables: 1, headings: 0 });
  });

  it('leaves a modified click to whoever else owns it', async function () {
    await openZoomable();
    expect(await clickMark('.cm-line > .to-decor-marker-icon', 1, true)).toBe('mark');
    expect(await trail()).toEqual([]);
    // The same mark, unmodified, DOES zoom — otherwise this passes whenever the
    // press misses, which is how a version of it driven by viewport coordinates
    // hid a real mobile failure.
    await clickMark('.cm-line > .to-decor-marker-icon', 1);
    expect(await trail()).toEqual(['zoom', 'Top']);
  });

  it('consumes the whole gesture, click included, not only the press that started it', async function () {
    // `mousedown`, `mouseup` and `click` arrive as three SEPARATE events, in
    // that order, and `preventDefault()` on one does nothing to the others —
    // each has to be caught on its own. A version of the listener that
    // stopped tracking the gesture after `mouseup` left `click` to run
    // uncaught: the guard for it saw the gesture as already over and returned
    // before touching the event at all. Checked directly, on the event
    // itself, rather than through a side effect a later mechanism (zooming
    // into a folded node auto-opens it) could otherwise paper over.
    //
    // The trailing three are dispatched on `contentDOM`, NOT on the marker
    // `pointerdown` itself targeted: the zoom that `pointerdown` triggers
    // re-roots the view and replaces the marker's own line synchronously, so
    // a reference to the marker element is already detached by the time a
    // second event would be dispatched on it — and an event dispatched on a
    // detached node never reaches a capture-phase listener bound to the
    // (still-attached) editor above it. `contentDOM` survives every
    // re-render; only its children are replaced. `swallow()` reads only
    // `consuming`, never `event.target`, so where exactly a trailing event
    // originates does not matter to the mechanism this proves.
    await openZoomable();
    const defaultPrevented = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const mark = cm.contentDOM.querySelectorAll('.cm-line > .to-decor-marker-icon')[1] as
        | HTMLElement
        | undefined;
      if (!mark) throw new Error('no marker[1] rendered');
      const r = mark.getBoundingClientRect();
      const opts = {
        bubbles: true,
        cancelable: true,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
        button: 0,
      };
      mark.dispatchEvent(new PointerEvent('pointerdown', { ...opts, buttons: 1 }));
      const contentDom = cm.contentDOM as HTMLElement;
      contentDom.dispatchEvent(new MouseEvent('mousedown', { ...opts, buttons: 1 }));
      contentDom.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
      const click = new MouseEvent('click', { ...opts, buttons: 0 });
      contentDom.dispatchEvent(click);
      return click.defaultPrevented;
    });
    expect(defaultPrevented).toBe(true);
    expect(await trail()).toEqual(['zoom', 'Top']);
  });

  it('zooms into a table from the command, and the note still zooms afterwards', async function () {
    // The regression underneath a report that zooming into a table did nothing
    // AND broke zoom everywhere else in that note: putting the caret on a table
    // line focuses a nested per-cell editor, which used to register itself over
    // its host in the view registry, so every later command dispatched into the
    // cell. Both halves are asserted, because only the second one persisted.
    const md = ['# T', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', '- after', ''].join('\n');
    await openZoomable(md);
    await zoomAt(md, '| a | b |');
    expect(await trail()).toEqual(['zoom', 'T']);
    await h.runCommand('zoom-clear');
    await browser.pause(200);
    await zoomAt(md, '- after');
    expect(await trail()).toEqual(['zoom', 'T']);
  });

  it('hides a sibling widget atom on the far side of the tail range', async function () {
    // The tail range used to begin exactly where the next node's own block
    // replacement begins. Two replacements starting at one position is a tie
    // resolved by decoration precedence, and Obsidian's table widget won it:
    // zooming into the fence rendered the table below the footer, editable.
    const md = ['## Atoms', '', '```py', 'x = 1', '```', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', '## After', ''].join('\n');
    await openZoomable(md);
    await browser.pause(250);
    await zoomAt(md, '```py');
    expect(
      await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cm = (view!.editor as any).cm;
        return cm.contentDOM.querySelectorAll('.cm-table-widget').length;
      }),
    ).toBe(0);
    expect(await renderedLines()).toEqual(['```py', 'x = 1', '```', '']);
  });

  it('opens at the top, however far down the note the root was', async function () {
    const md = [
      '# Top',
      '',
      ...Array.from({ length: 40 }, (_, i) => `filler ${i}`).flatMap((t) => [t, '']),
      '## Target',
      '',
      '- one',
      '',
    ].join('\n');
    await openZoomable(md);
    await zoomAt(md, '## Target');
    await browser.pause(300);
    const read = (): Promise<{ scrollTop: number; trailVisible: boolean; focused: boolean }> =>
      browser.executeObsidian(({ app, obsidian }) => {
        const v = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cm = (v.editor as any).cm;
        const scroller = cm.scrollDOM as HTMLElement;
        const trail = v.containerEl.querySelector('.to-zoom-trail') as HTMLElement | null;
        return {
          scrollTop: Math.round(scroller.scrollTop),
          trailVisible:
            !!trail && trail.getBoundingClientRect().top >= scroller.getBoundingClientRect().top,
          focused: cm.hasFocus as boolean,
        };
      });
    // Settled, not sampled: both halves land a frame after the scope change, and
    // focus lands after whatever ran the gesture has finished with it.
    await browser.waitUntil(async () => (await read()).focused, {
      timeout: 3000,
      interval: 100,
      timeoutMsg: 'the editor never took focus after the zoom',
    });
    const view = await read();
    // The zoomed subtree starts at the top whatever its length, so there is no
    // other position the view could sensibly be left at — and the trail is the
    // first thing in it.
    expect(view.scrollTop).toBe(0);
    expect(view.trailVisible).toBe(true);
    // Focus is the other half of the same rule: the node accent is drawn from
    // the selection whether or not the editor is focused, so without this the
    // node lit up with no caret in it.
    expect(view.focused).toBe(true);
  });

  it('keeps the caret inside the scope, and out from under the footer', async function () {
    await h.createNote(SOURCE, `See [[zoom]] for the thing.\n`);
    await openZoomable();
    await browser.pause(700);
    await zoomAt(DOC, '- one');
    await browser.pause(300);
    // Click into the empty space below the zoomed content, where the footer is.
    const below = await browser.executeObsidian(({ app, obsidian }) => {
      const v = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (v.editor as any).cm;
      const footer = cm.contentDOM.querySelector('.to-backlinks') as HTMLElement;
      const r = footer.getBoundingClientRect();
      return { x: r.left + 200, y: r.top + r.height / 2 };
    });
    await h.clickAtPoint(below.x, below.y);
    await browser.pause(300);
    const at = await h.getCursor();
    // Lines 4 and 5 are the zoom root and its child — the whole visible range.
    expect(at.line).toBeGreaterThanOrEqual(4);
    expect(at.line).toBeLessThanOrEqual(5);
  });

  it('leaves no rendered line below the footer to catch a click', async function () {
    await h.createNote(SOURCE, `See [[zoom]] for the thing.\n`);
    await openZoomable();
    await browser.pause(700);
    await zoomAt(DOC, '- one');
    await browser.pause(300);
    // The footer's own property (`73-footer-render`), asserted here against the
    // moved anchor: while zoomed the footer sits after the last VISIBLE line
    // rather than at the document's end, which is the case a zoom composes.
    expect(
      await browser.executeObsidian(({ app, obsidian }) => {
        const v = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cm = (v.editor as any).cm;
        const kids = Array.from(cm.contentDOM.children) as HTMLElement[];
        const footer = kids.findIndex((el) => el.classList.contains('to-backlinks'));
        return kids.slice(footer + 1).filter((el) => el.classList.contains('cm-line')).length;
      }),
    ).toBe(0);
  });

  it('zooms from an ordered item mark, whose digits are ours to supply', async function () {
    // Obsidian does not always emit `.list-number`; the decoration layer
    // supplies a span around the digits for the lines where it is missing, and
    // without that in the target set the first items of a nested ordered list
    // had no reachable mark while their siblings did.
    const md = ['# Top', '', '1. first', '2. second', '   1. nested one', '   2. nested two', ''].join('\n');
    await openZoomable(md);
    await browser.pause(250);
    expect(await clickMark('.to-decor-list .to-decor-ol-digits', 2)).toBe('mark');
    expect(await trail()).toEqual(['zoom', 'Top', 'second']);
  });

  it('leaves a task’s checkbox to its own click, not this gesture', async function () {
    // A task's mark is Obsidian's own checkbox, and its click already means
    // something — toggling the task. This gesture does not contest it: the
    // click reaches the checkbox exactly as it always has, and no zoom
    // happens (design D15, spec's task-exception scenario). The command, the
    // context menu, and a hotkey remain how a task is zoomed by the pointer.
    const md = ['# Top', '', '- [ ] an open task', ''].join('\n');
    await openZoomable(md);
    await browser.pause(250);
    await clickMark('.task-list-item-checkbox', 0);
    await browser.pause(250);
    expect(await trail()).toEqual([]);
    expect(await h.getBuffer()).toContain('- [x] an open task');
  });

  it('marks a crumb whose node has more lines than the one it shows', async function () {
    const md = ['- an item', '  that wraps', '\t- child', ''].join('\n');
    await openZoomable(md);
    await zoomAt(md, '- child');
    // The label is the node's first line; the ellipsis is what stops it from
    // claiming to BE the node's text.
    expect(await trail()).toEqual(['zoom', 'an item…']);
  });

  it('reaches an ordered item mark past the fold indicator that covers it', async function () {
    // The indicator's box swallows the whole marker run, and its z-index beats a
    // mark's own — an ordered run carries a transform, which makes its own
    // stacking context, so a z-index INSIDE it can never outrank a sibling of
    // the run. Only the FOLDABLE items were affected, which is why some numbers
    // in a nested ordered list worked and others did not.
    const md = ['# Top', '', '1. first', '\t1. nested first', '\t\t1. nested deeper', '9. ninth', ''].join('\n');
    await openZoomable(md);
    await browser.pause(300);
    // `1. first` has a child, so it has an indicator; index 0 is its own mark.
    expect(await clickMark('.to-decor-list .to-decor-ol-digits', 0)).toBe('mark');
    expect(await trail()).toEqual(['zoom', 'Top']);
  });

  it('opens a folded root, so the focus view is not of a collapsed node', async function () {
    const md = ['# Top', '', '- parent', '\t- child', '\t- second child', ''].join('\n');
    await openZoomable(md);
    await h.setCursorSettled(2, 3);
    await browser.pause(200);
    await browser.executeObsidian(({ app }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (app as any).commands.executeCommandById('editor:toggle-fold');
    });
    await browser.pause(400);
    const foldedLines = await renderedLines();
    expect(foldedLines).not.toContain('\t- child');

    await zoomAt(md, '- parent');
    await browser.pause(300);
    // The whole subtree, not the one line a fold left of it.
    expect(await renderedLines()).toEqual(['- parent', '\t- child', '\t- second child', '']);
  });

  it('offers its commands only in outline mode', async function () {
    await openZoomable();
    expect(await h.commandAvailable('zoom-in')).toBe(true);
    await h.setOutlineMode(false);
    expect(await h.commandAvailable('zoom-in')).toBe(false);
    await h.setOutlineMode(true);
  });

  it('offers zoom-out and zoom-clear only while zoomed', async function () {
    // Unlike zoom-in, which is always meaningful in outline mode, stepping out
    // or clearing a zoom that is not there is a pure no-op — the palette should
    // not offer either. `editorCheckCallback`'s CHECKING pass has to answer
    // this without dispatching anything, which is why it is a separate
    // predicate from the action rather than a dry run of it.
    await openZoomable();
    expect(await h.commandAvailable('zoom-out')).toBe(false);
    expect(await h.commandAvailable('zoom-clear')).toBe(false);
    await zoomAt(DOC, '## Mid');
    expect(await h.commandAvailable('zoom-out')).toBe(true);
    expect(await h.commandAvailable('zoom-clear')).toBe(true);
    await h.runCommand('zoom-clear');
    await browser.pause(150);
    expect(await h.commandAvailable('zoom-out')).toBe(false);
    expect(await h.commandAvailable('zoom-clear')).toBe(false);
  });

  /**
   * A crumb carries none of the block syntax that encodes its node's place.
   *
   * The reachable kinds only. An atom — callout, table, fenced code — never has
   * children in this model (measured: `parse` gives a callout its inner lines as
   * its OWN lines, not as a subtree), so it can never be an ancestor and never a
   * crumb. What CAN be one is a heading, a quote, a task and an ordered item,
   * and each of those carries syntax the label must not.
   */
  it('leaves no block syntax in a crumb, whatever the ancestor kind', async function () {
    const md = [
      '# A heading ancestor',
      '',
      '> a quoted ancestor',
      '',
      '- [x] a task ancestor',
      '  1. an ordered ancestor',
      '     - the leaf',
      '',
    ].join('\n');
    await openZoomable(md);
    await zoomAt(md, 'the leaf');
    const crumbs = await trail();
    expect(crumbs.length).toBeGreaterThan(1);
    const joined = crumbs.join(' ');
    // The heading's hashes, the task's box and the ordered item's number are
    // notation: they belong to the marker, never to the text.
    expect(joined).not.toContain('#');
    expect(joined).not.toContain('[x]');
    expect(joined).not.toContain('[ ]');
    expect(joined).not.toMatch(/(^|\s)1\.\s/);
    // What the ancestors SAY still survives the stripping.
    expect(joined).toContain('a task ancestor');
  });

  /**
   * The crumb renders its markdown, and does not show its source. Asserted on
   * the DOM, because `**bold**` and a `<strong>` have the same `textContent`.
   */
  it('renders a crumb as inline content, not as markdown source', async function () {
    const md = [
      '- ancestor **bold** with `code` and [a link](https://example.com)',
      '\t- the leaf',
      '',
    ].join('\n');
    await openZoomable(md);
    await zoomAt(md, 'the leaf');
    const shape = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      const el = view?.containerEl.querySelector('.to-zoom-trail');
      if (!el) return null;
      return {
        strong: el.querySelector('.to-backlinks-seg strong') !== null,
        code: el.querySelector('.to-backlinks-seg code') !== null,
        anchor: el.querySelector('.to-backlinks-seg a') !== null,
        blocks: el.querySelectorAll('.to-backlinks-seg p, .to-backlinks-seg ul, .to-backlinks-seg li').length,
        text: (el as HTMLElement).innerText,
      };
    });
    expect(shape).not.toBe(null);
    expect(shape!.strong).toBe(true);
    expect(shape!.code).toBe(true);
    expect(shape!.anchor).toBe(true);
    // A row may hold no block-level element, and the renderer's own `<p>` is one.
    expect(shape!.blocks).toBe(0);
    expect(shape!.text).not.toContain('**');
    expect(shape!.text).not.toContain('](http');
  });

  /**
   * A link inside a crumb is a second destination competing with the crumb's
   * own. The link wins where the event starts on it; the crumb wins everywhere
   * else. Asserted as BEHAVIOUR — did the view re-root — rather than by reading
   * the guard, because the guard the design first relied on lived on the
   * footer's row and never ran here at all (design D8).
   */
  it('lets a link inside a crumb take its own click, without re-rooting', async function () {
    const md = [
      '# Top',
      '',
      '- ancestor with [a link](https://example.com)',
      '\t- the leaf',
      '',
    ].join('\n');
    await openZoomable(md);
    await zoomAt(md, 'the leaf');
    const before = await trail();

    // The anchor itself. Its own navigation is Obsidian's business and is
    // suppressed here; what this asserts is that the SEGMENT did not also act.
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      const a = view?.containerEl.querySelector('.to-zoom-trail .to-backlinks-seg a') as HTMLElement | null;
      if (!a) throw new Error('no link inside a crumb');
      a.addEventListener('click', (e) => e.preventDefault(), { once: true });
      a.click();
    });
    await browser.pause(250);
    expect(await trail()).toEqual(before);

    // The same segment's own text still activates it, so the guard has not
    // made the crumb inert — which is the failure mode a target check invites.
    await clickCrumb(1);
    await browser.pause(250);
    expect((await trail()).length).toBeLessThan(before.length);
  });

  it('lets a link inside a crumb take its own Enter, without re-rooting', async function () {
    const md = [
      '# Top',
      '',
      '- ancestor with [a link](https://example.com)',
      '\t- the leaf',
      '',
    ].join('\n');
    await openZoomable(md);
    await zoomAt(md, 'the leaf');
    const before = await trail();

    // A rendered anchor is focusable, and its own Enter bubbles to the segment
    // around it — so keydown needs the same guard the click has.
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      const a = view?.containerEl.querySelector('.to-zoom-trail .to-backlinks-seg a') as HTMLElement | null;
      if (!a) throw new Error('no link inside a crumb');
      a.focus();
      a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    await browser.pause(250);
    expect(await trail()).toEqual(before);
  });
});

/**
 * Editing at the scope's boundary (`outline-zoom`, docs/research/26).
 *
 * Every case is a row of that note, named by its label there. The refusals and
 * the allowances carry equal weight on purpose: before this change the failure
 * mode was losing the zoom, and the failure mode it could be replaced by is
 * refusing an edit the user is entitled to make.
 */
describe('outline zoom: editing at the boundary', function () {
  const LIST = ['- alpha', '- beta', '  - beta child', '- gamma', ''].join('\n');
  const HEAD = ['# One', '', 'para one', '', '## Two', '', 'para two', '', '## Three', ''].join('\n');
  const ZOOM_CUE = 'That would move it outside the zoomed view.';

  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await h.runCommand('zoom-clear');
    await h.dismissNotices();
  });

  /** Fresh fixture, zoomed to the line whose trimmed text is `root`. */
  async function zoomedTo(md: string, root: string): Promise<void> {
    await h.createNote(NOTE, md);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await h.setBuffer(md);
    await browser.pause(120);
    const line = md.split('\n').findIndex((l) => l.trim() === root.trim());
    if (line < 0) throw new Error(`no line ${root}`);
    await h.setCursorSettled(line, md.split('\n')[line]!.length);
    await h.runCommand('zoom-in');
    await browser.pause(200);
    await h.dismissNotices();
  }

  /** `ch` counted from the end when negative, so a fixture edit cannot
   * silently move a caret off the end of its line. */
  function at(md: string, line: number, ch: number): { line: number; ch: number } {
    const text = md.split('\n')[line] ?? '';
    return { line, ch: ch < 0 ? text.length + 1 + ch : ch };
  }

  /** The document is untouched, the zoom is intact, and the cue named the
   * zoomed view — the three things a refusal has to be. */
  async function expectRefused(md: string, trailBefore: string[]): Promise<void> {
    expect(await h.getBuffer()).toBe(md);
    expect(await trail()).toEqual(trailBefore);
    expect(await h.recordedNoticeTexts()).toContain(ZOOM_CUE);
  }

  describe('an edit that would leave the scope is refused', function () {
    it('Backspace at the zoom root’s content start (A1)', async function () {
      await zoomedTo(LIST, '- beta');
      const before = await trail();
      const c = at(LIST, 1, 2);
      await h.setCursorSettled(c.line, c.ch);
      await browser.keys(['Backspace']);
      await browser.pause(300);
      await expectRefused(LIST, before);
    });

    it('Delete at the end of the last visible line (B1)', async function () {
      await zoomedTo(LIST, '- beta');
      const before = await trail();
      const c = at(LIST, 2, -1);
      await h.setCursorSettled(c.line, c.ch);
      await browser.keys(['Delete']);
      await browser.pause(300);
      await expectRefused(LIST, before);
    });


    it('Backspace at a nested root’s content start, into its hidden parent (R8)', async function () {
      // The root is a paragraph INSIDE a section; the node it would merge into
      // is its own parent, which the zoom hides just as it hides a sibling.
      await zoomedTo(HEAD, 'para two');
      const before = await trail();
      await h.setCursorSettled(6, 0);
      await browser.keys(['Backspace']);
      await browser.pause(300);
      await expectRefused(HEAD, before);
    });

    it('a paste that would splice beside the root (G1)', async function () {
      await zoomedTo(LIST, '- beta');
      const before = await trail();
      const c = at(LIST, 1, 2);
      await h.setCursorSettled(c.line, c.ch);
      await h.pasteText('- p\n  - q');
      await browser.pause(400);
      await expectRefused(LIST, before);
    });

    it('a Backspace that would unwrap an emptied list root (R4)', async function () {
      await zoomedTo(LIST, '- beta');
      const before = await trail();
      const c = at(LIST, 1, -1);
      await h.setCursorSettled(c.line, c.ch);
      // Four to empty `beta`, all of them ordinary in-scope edits; the fifth is
      // the one that would move the root itself.
      await browser.keys(['Backspace', 'Backspace', 'Backspace', 'Backspace']);
      await browser.pause(250);
      await h.dismissNotices();
      expect(await h.getBuffer()).toBe(LIST.replace('- beta', '- '));
      await browser.keys(['Backspace']);
      await browser.pause(300);
      await expectRefused(LIST.replace('- beta', '- '), before);
    });
  });

  describe('an edit that stays inside the scope is untouched, and keeps the zoom', function () {
    /** The edit landed AND the view did not change out from under it. */
    async function expectApplied(md: string, trailBefore: string[]): Promise<void> {
      expect(await h.getBuffer()).not.toBe(md);
      expect(await trail()).toEqual(trailBefore);
      expect(await h.recordedNoticeTexts()).not.toContain(ZOOM_CUE);
    }

    it('appends a last child, with no trailing gap in the cover (X2)', async function () {
      await zoomedTo(LIST, '- beta');
      const before = await trail();
      const c = at(LIST, 2, -1);
      await h.setCursorSettled(c.line, c.ch);
      await browser.keys(['Enter']);
      await browser.pause(350);
      await expectApplied(LIST, before);
    });

    it('appends a last child when the cover ENDS on a trailing gap (X1)', async function () {
      // `## Two`'s cover ends on the blank line after `para two`, so the
      // insertion lands past the cover's last offset either way. The trailing
      // gap is what made this look like a special case; it is not one.
      await zoomedTo(HEAD, '## Two');
      const before = await trail();
      const c = at(HEAD, 6, -1);
      await h.setCursorSettled(c.line, c.ch);
      await browser.keys(['Enter']);
      await browser.pause(350);
      await expectApplied(HEAD, before);
    });

    it('pastes a block inside the subtree (G2)', async function () {
      await zoomedTo(LIST, '- beta');
      const before = await trail();
      const c = at(LIST, 2, -1);
      await h.setCursorSettled(c.line, c.ch);
      await h.pasteText('- p\n  - q');
      await browser.pause(400);
      await expectApplied(LIST, before);
    });

    it('deletes the cover’s own trailing gap line (R6)', async function () {
      await zoomedTo(HEAD, '## Two');
      const before = await trail();
      await h.setCursorSettled(7, 0);
      await browser.keys(['Delete']);
      await browser.pause(350);
      await expectApplied(HEAD, before);
    });

    it('merges two visible nodes (A5)', async function () {
      await zoomedTo(LIST, '- beta');
      const before = await trail();
      const c = at(LIST, 2, 4);
      await h.setCursorSettled(c.line, c.ch);
      await browser.keys(['Backspace']);
      await browser.pause(350);
      await expectApplied(LIST, before);
    });

    it('types into the root (X5)', async function () {
      await zoomedTo(LIST, '- beta');
      const before = await trail();
      const c = at(LIST, 1, -1);
      await h.setCursorSettled(c.line, c.ch);
      await browser.keys(['X']);
      await browser.pause(300);
      await expectApplied(LIST, before);
    });
  });

  describe('an unenforced change that dissolves the root exits cleanly', function () {
    it('emptying the root’s own line leaves no zoom, not a retargeted one (R7)', async function () {
      // Clearing the root's whole line — marker included — is WITHIN-NODE
      // authoring: one line, one owner, so the classifier never asks for a
      // verdict and the refusal never sees it. `node-edit-enforcement` states
      // that limit deliberately: such an edit cannot reach content the user
      // cannot see. What it CAN do is dissolve the root, and the exit trigger
      // is what answers for it.
      //
      // Driven by selecting the line and deleting, not by Mod-Backspace. That
      // key is two different gestures: Cmd+Backspace deletes to the line start
      // on macOS and Ctrl+Backspace deletes the previous WORD everywhere else,
      // so the same test measured an emptied line locally and a surviving `- `
      // marker on CI — where the root is still a list item at the same
      // position, the edit is in scope, and the zoom correctly stays. The
      // selection reaches the state this row is about on every platform.
      //
      // The measured defect was never that the edit applied. It was that the
      // zoom stayed ACTIVE, rooted on whatever node inherited the line, with
      // the trail still claiming otherwise. Hence the trail is asserted EMPTY,
      // not merely changed.
      await zoomedTo(LIST, '- beta');
      await h.setSelection({ line: 1, ch: 0 }, { line: 1, ch: '- beta'.length });
      await browser.keys(['Backspace']);
      await browser.pause(350);
      expect(await h.getBuffer()).toBe('- alpha\n\n  - beta child\n- gamma\n');
      expect(await trail()).toEqual([]);
    });
  });

  describe('a refusal that is not the zoom’s keeps its own reason', function () {
    it('a heading root’s trailing edge still reports the inexpressible merge', async function () {
      // A heading's trailing neighbour is always another heading, so markdown's
      // own algebra refuses this before the zoom has anything to say. The cue
      // has to stay that one: it tells the user WHY, and "outside the zoomed
      // view" would be both less useful and untrue.
      await zoomedTo(HEAD, '## Two');
      const c = at(HEAD, 6, -1);
      await h.setCursorSettled(c.line, c.ch);
      await browser.keys(['Delete']);
      await browser.pause(350);
      expect(await h.getBuffer()).toBe(HEAD);
      const notices = await h.recordedNoticeTexts();
      expect(notices).toContain("These blocks can't be joined into one.");
      expect(notices).not.toContain(ZOOM_CUE);
    });

    it('a first-node zoom root reports the first-node veto', async function () {
      await zoomedTo(LIST, '- alpha');
      const c = at(LIST, 0, 2);
      await h.setCursorSettled(c.line, c.ch);
      await browser.keys(['Backspace']);
      await browser.pause(350);
      expect(await h.getBuffer()).toBe(LIST);
      const notices = await h.recordedNoticeTexts();
      expect(notices).toContain('Nothing here to join with.');
      expect(notices).not.toContain(ZOOM_CUE);
    });
  });
});

/**
 * The cost of judging the invariant on the enforced path
 * (`node-edit-enforcement`'s budget, applied with a zoom active).
 *
 * Design D5 deliberately removed the offset shortcut that would have kept this
 * off the common path, on the grounds that no textual shape can decide tree
 * membership. The argument that the parse is affordable is that
 * `parsed-doc.ts` caches on CM6's immutable `Text`, so parsing the after-state
 * is a parse the NEXT transaction would have paid anyway. This is the test that
 * settles the argument; the shape mirrors 62's own perf case so the two numbers
 * are comparable.
 */
describe('outline zoom: the enforced path with a zoom active', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  it('stays within the enforcement budget on a ~2000-line note', async function () {
    const lines: string[] = [];
    for (let i = 0; i < 400; i++) {
      lines.push(`## Section ${i}`, '', `Paragraph text for section ${i}, some words here.`, '');
    }
    const stress = lines.join('\n') + '\n';
    await h.createNote(NOTE, stress);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await h.setBuffer(stress);
    await browser.pause(200);

    // Zoom into a section near the MIDDLE, so both hidden spans are large —
    // clause 2 compares the text on either side of the cover, and a zoom at
    // either end would leave one of them empty and measure the easy case.
    // Every edit below is INSIDE the zoomed section, so each one runs the whole
    // invariant and is allowed — the expensive path, not the short-circuit.
    async function driveOneRound(): Promise<void> {
      for (let i = 0; i < 8; i++) {
        await h.setCursorSettled(802, 0);
        await browser.keys(['Backspace']); // merges the paragraph into its heading
        await h.keys.undo();
        await browser.pause(20);
      }
      for (let i = 0; i < 5; i++) {
        await h.setCursorSettled(802, 5);
        await h.pasteText('Pasted one.\n\nPasted two.');
        await h.keys.undo();
        await browser.pause(20);
      }
    }

    /** Four measured rounds, for the reason 62's own perf case records: at two,
     * p95 sits close enough to the maximum that one GC pause becomes the
     * statistic. One unmeasured round first, to settle JIT and GC. */
    async function measure(): Promise<h.StatsSnapshot> {
      await driveOneRound();
      await h.resetStats();
      await driveOneRound();
      await driveOneRound();
      await driveOneRound();
      await driveOneRound();
      return h.getStats();
    }

    // The baseline is the SAME note and the SAME edits with no zoom, so the two
    // numbers differ in one thing only. Without it a single figure inside the
    // budget says nothing about what the invariant costs, which is the question
    // D5 left open.
    const unzoomed = await measure();

    // Zoom into a section near the MIDDLE, so both hidden spans are large —
    // clause 2 compares the text on either side of the cover, and a zoom at
    // either end would leave one of them empty and measure the easy case.
    await h.setCursorSettled(800, 0);
    await h.runCommand('zoom-in');
    await browser.pause(200);
    expect((await trail()).length).toBeGreaterThan(0);

    // Every edit is INSIDE the zoomed section, so each one runs the whole
    // invariant and is allowed — the expensive path, not the short-circuit.
    const zoomed = await measure();

    for (const snap of [unzoomed, zoomed]) {
      const t = snap.timing['boundary-crossing-edit'];
      if (t && t.count > 0) {
        expect(t.median).toBeLessThanOrEqual(3);
        expect(t.p95).toBeLessThanOrEqual(8);
      }
      for (const kind of ['pass', 'rewrite', 'veto']) {
        const vt = snap.verdictTiming[kind];
        if (!vt || vt.count === 0) continue;
        expect(vt.median).toBeLessThanOrEqual(3);
        expect(vt.p95).toBeLessThanOrEqual(8);
      }
    }

    // Recorded rather than only asserted, so docs/research/26 carries figures a
    // run reproduces instead of a claim. Deliberately NOT asserted as a delta:
    // the difference between the two is well inside this harness's run-to-run
    // spread, and a test that failed on it would be measuring the runner.
    // eslint-disable-next-line no-console
    console.log('[zoom-budget]', JSON.stringify({
      unzoomed: unzoomed.timing['boundary-crossing-edit'],
      zoomed: zoomed.timing['boundary-crossing-edit'],
    }));
  });
});
