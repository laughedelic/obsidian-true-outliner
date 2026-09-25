/**
 * A heading's marker names its level (`heading-level-markers`): in the editor,
 * in every open pane, in the backlinks footer and in the zoom trail, in the
 * style the two appearance settings choose.
 *
 * Each case finds a mark by the `data-level` its wrapper states, then asserts on
 * the drawing itself — the `<svg>` markup — so no case trusts the label alone.
 * Every assertion is a relationship between two drawings or two rects, never a
 * pixel value, because CI's fonts are not macOS's.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { readStable, scrollToFooter, settle } from '../footer.js';

const NOTE = 'Scratch/heading-levels.md';
const LEVELS_MD = [
  '# One',
  '',
  'A paragraph under one.',
  '',
  '## Two',
  '',
  '### Three',
  '',
  '#### Four',
  '',
  '##### Five',
  '',
  '###### Six',
  '',
  'A paragraph under six.',
  '',
].join('\n');

interface Mark {
  readonly kind: string | null;
  readonly level: string | null;
  readonly svg: string;
  readonly w: number;
  readonly h: number;
}

/**
 * The editor's own node marks in every visible pane, pane by pane: the footer's
 * and the trail's marks share the wrapper class and are left out, since each
 * case compares them to these on purpose.
 */
function editorMarks(): Promise<Mark[][]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.workspace-leaf .cm-content'))
      .filter((pane) => pane.getBoundingClientRect().width > 0)
      .map((pane) =>
        Array.from(pane.querySelectorAll<HTMLElement>('.to-decor-marker-icon[data-kind]'))
          .filter((el) => el.closest('.to-backlinks, .to-zoom-trail') === null)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              kind: el.dataset.kind ?? null,
              level: el.dataset.level ?? null,
              svg: el.querySelector('svg')?.innerHTML ?? '',
              w: +r.width.toFixed(2),
              h: +r.height.toFixed(2),
            };
          }),
      ),
  );
}

async function activeMarks(): Promise<Mark[]> {
  const panes = await editorMarks();
  return panes[0] ?? [];
}

const headingsOf = (marks: readonly Mark[]) => marks.filter((m) => m.kind === 'heading');

/**
 * Where each line's text actually starts, pane by pane, relative to that pane's
 * own left edge: the first ink that is not chrome, measured as a range over the
 * text node — the walker `57-marker-gap.e2e.ts` reads a row's text column with.
 *
 * Not `padding-inline-start`, which is the line's COLUMN and not its text
 * origin (`lineBoxes` in helpers.ts records the difference, measured): a
 * marker's own width, margin or offset could move the text while the column
 * stood still, and this case exists to catch exactly that.
 *
 * The caret is parked off every heading before a reading is taken
 * (`parkedTextStarts`), because Live Preview reveals a heading's `#` syntax on
 * the caret's own line, and a revealed `## ` moves that line's words with no
 * chrome moving at all. CI read that as a change.
 */
function textStarts(): Promise<number[][]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.workspace-leaf .cm-content'))
      .filter((pane) => pane.getBoundingClientRect().width > 0)
      .map((pane) => {
        const base = pane.getBoundingClientRect().left;
        const starts: number[] = [];
        for (const line of Array.from(pane.querySelectorAll<HTMLElement>('.cm-line'))) {
          const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          const range = document.createRange();
          let x: number | null = null;
          let node: Node | null = walker.nextNode();
          while (node) {
            const chrome = node.parentElement?.closest(
              '.to-decor-marker-icon, .cm-formatting, .cm-hmd-list-indent, .task-list-label',
            );
            const raw = node.textContent ?? '';
            if (!chrome && raw.trim() !== '') {
              range.setStart(node, raw.length - raw.trimStart().length);
              range.setEnd(node, raw.length);
              for (const r of Array.from(range.getClientRects())) {
                if (r.width === 0) continue;
                const left = +(r.left - base).toFixed(2);
                if (x === null || left < x) x = left;
              }
            }
            node = walker.nextNode();
          }
          if (x !== null) starts.push(x);
        }
        return starts;
      }),
  );
}

/** The line a text-origin reading parks the caret on: a paragraph, so no
 * heading is showing its `#` syntax while the reading is taken. */
const PARK_LINE = 14;

async function parkedTextStarts(): Promise<number[][]> {
  await h.setCursorSettled(PARK_LINE, 0);
  return textStarts();
}

/**
 * Read until the value holds still across two samples — and, where `was` is
 * given, until it has also left the value it started from.
 *
 * A settings write repaints every open editor and every footer, and those
 * repaints land on render passes this side cannot see. A fixed pause reads
 * whatever they have got to — enough on a developer machine, and not on a CI
 * runner with fifteen spec files in flight, where the trail was still drawing
 * the style before the change.
 *
 * Both halves are needed. Holding still alone can hold still at the OLD value,
 * two samples taken before the repaint; leaving the old value alone can return
 * a half-drawn state, one pane repainted and the other not.
 */
async function readSettled<T>(read: () => Promise<T>, was?: T): Promise<T> {
  const target = was === undefined ? undefined : JSON.stringify(was);
  let last = await read();
  let previous = JSON.stringify(last);
  await browser.waitUntil(
    async () => {
      last = await read();
      const now = JSON.stringify(last);
      const held = now === previous;
      const moved = target === undefined || now !== target;
      previous = now;
      return held && moved;
    },
    {
      timeout: h.waitBudget(8000),
      interval: 150,
      timeoutMsg:
        `never settled${target === undefined ? '' : ` away from ${target}`}, last read: ${previous}`,
    },
  );
  return last;
}

/** The zoom trail's inline heading glyphs, in every visible pane. */
function trailGlyphs(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.to-zoom-trail .to-lineage-seg-icon svg'))
      .filter((svg) => svg.getBoundingClientRect().width > 0)
      .map((svg) => svg.innerHTML),
  );
}

async function openLevels(md = LEVELS_MD): Promise<void> {
  await h.createNote(NOTE, md);
  await h.openNote(NOTE);
  await h.setOutlineMode(true);
  await browser.pause(300);
}

async function setStyle(glyph: 'H' | 'hash', level: 'beside' | 'subscript' | 'none'): Promise<void> {
  await h.setPluginSetting('headingMarkerGlyph', glyph);
  await h.setPluginSetting('headingMarkerLevel', level);
}

describe('heading level markers', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    // Base-layer spec: the caret-derived accents stay off, so two drawings of
    // the same level are not told apart by an accent colour.
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await setStyle('H', 'beside');
    await h.dismissNotices();
  });

  it('draws one mark per level, each naming its own, in the paragraph mark’s box', async function () {
    await openLevels();
    for (const style of [
      ['H', 'beside'],
      ['H', 'subscript'],
      ['hash', 'beside'],
      ['hash', 'subscript'],
    ] as const) {
      await setStyle(style[0], style[1]);
      const marks = await readSettled(activeMarks);
      const headings = headingsOf(marks);
      expect({ style, levels: headings.map((m) => m.level) }).toEqual({
        style,
        levels: ['1', '2', '3', '4', '5', '6'],
      });
      expect({ style, distinct: new Set(headings.map((m) => m.svg)).size }).toEqual({ style, distinct: 6 });

      const paragraph = marks.find((m) => m.kind === 'paragraph');
      expect(paragraph).toBeDefined();
      for (const m of headings) expect({ level: m.level, w: m.w, h: m.h }).toEqual({ level: m.level, w: paragraph!.w, h: paragraph!.h });
    }
  });

  it('draws the glyph alone on every level with no digit, still stating each level', async function () {
    await openLevels();
    for (const glyph of ['H', 'hash'] as const) {
      await setStyle(glyph, 'none');
      const headings = headingsOf(await readSettled(activeMarks));
      expect(headings.map((m) => m.level)).toEqual(['1', '2', '3', '4', '5', '6']);
      expect({ glyph, distinct: new Set(headings.map((m) => m.svg)).size }).toEqual({ glyph, distinct: 1 });
    }
  });

  /**
   * Negative control: compare only the kind in `MarkerWidget.eq`, and the
   * retyped heading keeps its level-2 widget — label and drawing both.
   */
  it('redraws a heading’s mark when its level is retyped', async function () {
    await openLevels('## Title\n\nBody.\n\n### Other\n');
    const before = headingsOf(await activeMarks());
    expect(before.map((m) => m.level)).toEqual(['2', '3']);
    const levelThree = before[1]!.svg;
    expect(before[0]!.svg).not.toBe(levelThree);

    // A `#` typed inside the `#` run, which is ordinary editing. Dispatched with
    // the user event typed input carries, rather than sent as a keystroke: in a
    // window without focus a keystroke lands wherever the DOM selection sits,
    // which CodeMirror does not keep in step with its own, and CI saw it land at
    // content start as `## #Title` on either platform.
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const cm = (view.editor as unknown as {
        cm: { dispatch(spec: object): void };
      }).cm;
      cm.dispatch({ changes: { from: 1, insert: '#' }, selection: { anchor: 2 }, userEvent: 'input.type' });
    });
    await browser.pause(300);
    expect((await h.getBuffer()).split('\n')[0]).toBe('### Title');

    const after = headingsOf(await readSettled(activeMarks));
    expect(after[0]!.level).toBe('3');
    expect(after[0]!.svg).toBe(levelThree);
  });

  /**
   * The settings tab previews one heading's mark in the chosen style, beside the
   * two settings, with the editor's own builder, and follows a change made while
   * it is open — through the tab's own write path, the one its dropdowns take.
   * It is drawn larger than the editor's own mark, so only the drawing is
   * compared, not the box.
   *
   * Negative control: drop the preview redraw from the tab's `setControlValue`,
   * and the open preview keeps the style it opened with.
   */
  it('previews the chosen style in the settings tab, as the editor draws it, across a change', async function () {
    await openLevels();
    const previewMark = (): Promise<{ level: string | null; svg: string; size: number } | null> =>
      browser.executeObsidian(({ app }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tab = (app as any).setting.pluginTabs.find((t: any) => t.id === 'true-outliner');
        const marks = tab.containerEl.querySelectorAll(
          '.to-heading-marker-preview',
        ) as NodeListOf<HTMLElement>;
        if (marks.length !== 1) return null;
        const el = marks[0]!;
        return {
          level: el.dataset.level ?? null,
          svg: el.querySelector('svg')?.innerHTML ?? '',
          size: +el.getBoundingClientRect().width.toFixed(2),
        };
      });

    await browser.executeObsidian(({ app }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setting = (app as any).setting;
      setting.open();
      setting.openTabById('true-outliner');
    });
    await browser.pause(300);
    try {
      for (const style of [
        ['H', 'beside'],
        ['hash', 'subscript'],
        ['hash', 'none'],
      ] as const) {
        await setStyle(style[0], style[1]);
        const editor = headingsOf(await readSettled(activeMarks));
        const preview = await readSettled(previewMark);
        const level = preview?.level ?? '';
        expect({ style, svg: preview?.svg }).toEqual({
          style,
          svg: editor.find((m) => m.level === level)?.svg,
        });
        // Bigger than the mark it previews, which is the point of drawing it
        // in a settings row rather than beside a line of text.
        expect(preview!.size).toBeGreaterThan(editor[0]!.w);
      }
    } finally {
      await browser.executeObsidian(({ app }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (app as any).setting.close();
      });
    }
  });

  /**
   * Both settings are global, so a change has to reach a pane that is not the
   * active one, and the trail that pane shows.
   *
   * Negative control: write the setting and repaint through `forceRedraw`
   * alone, and the inactive pane keeps its old marks.
   */
  it('switches every heading mark in every pane, the inactive one and its trail included, and moves no text', async function () {
    // A phone's workspace has no split to open.
    if (h.IS_MOBILE_RUN) this.skip();
    await openLevels();

    // A second pane on the same note, zoomed into `## Two`, so it shows a trail
    // naming `# One`.
    await browser.executeObsidian(async ({ app, obsidian }, path: string) => {
      const leaf = app.workspace.getLeaf('split');
      const file = app.vault.getAbstractFileByPath(path);
      if (file instanceof obsidian.TFile) await leaf.openFile(file);
      app.workspace.setActiveLeaf(leaf, { focus: true });
    }, NOTE);
    await browser.pause(600);
    await h.setOutlineMode(true);
    await h.setCursorSettled(4, 6);
    await h.runCommand('zoom-in');
    await browser.pause(300);

    // Back to the first pane: the zoomed one is now inactive.
    await browser.executeObsidian(({ app }) => {
      const leaves = app.workspace.getLeavesOfType('markdown');
      app.workspace.setActiveLeaf(leaves[0]!, { focus: true });
    });
    await browser.pause(300);

    const marksBefore = await readSettled(editorMarks);
    const trailBefore = await readSettled(trailGlyphs);
    const textBefore = await parkedTextStarts();
    expect(marksBefore.length).toBe(2); // two panes, or this proves nothing
    expect(trailBefore.length).toBeGreaterThan(0);

    await setStyle('hash', 'subscript');

    const marksAfter = await readSettled(editorMarks, marksBefore);
    for (const [pane, marks] of marksAfter.entries()) {
      const before = headingsOf(marksBefore[pane]!);
      const after = headingsOf(marks);
      expect(after.map((m) => m.level)).toEqual(before.map((m) => m.level));
      for (const [i, mark] of after.entries()) {
        expect({ pane, level: mark.level, changed: mark.svg !== before[i]!.svg }).toEqual({
          pane,
          level: mark.level,
          changed: true,
        });
      }
    }
    // The trail's `# One` is drawn as the first pane now draws its own level 1.
    const levelOne = headingsOf(marksAfter[0]!).find((m) => m.level === '1')!.svg;
    expect(await readSettled(trailGlyphs, trailBefore)).toEqual(trailBefore.map(() => levelOne));
    expect(await parkedTextStarts()).toEqual(textBefore);

    await browser.executeObsidian(({ app }) => {
      const leaves = app.workspace.getLeavesOfType('markdown');
      if (leaves.length > 1) leaves[leaves.length - 1]!.detach();
    });
    await browser.pause(300);
  });

  /**
   * The footer and the trail each draw a heading's mark from the same builder,
   * so each has to match the editor's drawing of that level — and has to follow
   * a style change while it is on screen, which is what can go stale.
   *
   * Negative control: drop `repaintFooters` from the setter, and the mounted
   * footer keeps the old style while the editor's marks move.
   */
  it('draws the footer’s and the trail’s heading marks as the editor draws them, across a change', async function () {
    const target = 'Scratch/heading-target.md';
    await h.createNote(target, '# Target\n\n## Two\n\nBody under two.\n');
    await h.createNote('Scratch/heading-source.md', '## Source section\n\n- a reference to [[heading-target]]\n');
    await h.waitForMetadataCache();

    const footerLineageMark = (): Promise<string | null> =>
      browser.execute(() => {
        const svg = document.querySelector(
          '.workspace-leaf.mod-active .to-backlinks .to-lineage-row[data-kind="lineage"] .to-decor-marker-icon svg',
        );
        return svg?.innerHTML ?? null;
      });
    const editorLevel = async (level: string): Promise<string> =>
      headingsOf(await readSettled(activeMarks)).find((m) => m.level === level)!.svg;

    await h.openNote(target);
    await h.setOutlineMode(true);
    await scrollToFooter();
    await settle();

    // The source's `## Source section` leads the footer's lineage row.
    const oldTwo = await editorLevel('2');
    expect(await readStable(footerLineageMark)).toBe(oldTwo);

    await setStyle('hash', 'subscript');
    const newTwo = await editorLevel('2');
    expect(newTwo).not.toBe(oldTwo);
    expect(await readStable(footerLineageMark)).toBe(newTwo);

    // Zoomed into `## Two`, the trail names `# Target` — and follows a change
    // made while it is on screen. The editor's own `# Target` is hidden by the
    // zoom, so the trail is compared with it once the zoom is cleared.
    await setStyle('H', 'beside');
    const oldOne = await editorLevel('1');
    await h.setCursorSettled(2, 6);
    await h.runCommand('zoom-in');
    await browser.pause(300);
    expect(await readSettled(trailGlyphs)).toEqual([oldOne]);

    await setStyle('hash', 'beside');
    const trailAfter = await readSettled(trailGlyphs, [oldOne]);
    await h.runCommand('zoom-clear');
    await browser.pause(300);
    expect(trailAfter).toEqual([await editorLevel('1')]);
  });
});
