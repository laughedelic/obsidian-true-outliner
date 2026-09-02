/**
 * The outline unit is ONE declaration, and overriding it retargets the whole
 * grid on every surface.
 *
 * That has been true since the grid was built — every column on both surfaces is
 * `depth * var(--to-decor-unit)` — but nothing held it, so the next change to
 * touch a column could take it away silently. This spec is what holds it: a
 * reader who wants a wider or narrower outline gets one from a stylesheet alone,
 * with no plugin setting, and both surfaces move together or the guarantee is
 * worthless.
 *
 * The override is applied the way a snippet applies one — a `<style>` element
 * setting the property at the scope the plugin declares it at, loaded after the
 * plugin's own sheet. Not by writing an inline style on some element, which
 * would prove only that `var()` works.
 *
 * Every assertion is stated against the value the document PUBLISHES, never
 * against a pixel: the point is that the grid follows whatever unit is in force,
 * and a spelled number would assert the default instead.
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

/** A stylesheet's override, or its removal. */
async function override(value: string | null): Promise<void> {
  await browser.execute((v: string | null) => {
    const id = 'to-unit-override-spec';
    document.getElementById(id)?.remove();
    if (v === null) return;
    const style = document.createElement('style');
    style.id = id;
    // `body` is where the plugin declares it; a snippet's sheet loads later, so
    // equal specificity is enough to win.
    style.textContent = `body { --to-decor-unit: ${v}; }`;
    document.head.appendChild(style);
  }, value);
  await browser.pause(400);
}

interface Row {
  depth: number;
  /** First ink of the row's own text, in the content frame. */
  textX: number;
  /** Centre of the row's block-marker icon, when it draws one. */
  iconX: number | null;
}

function editorRows(): Promise<Row[]> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const content: HTMLElement = cm.contentDOM;
    const cb = content.getBoundingClientRect();
    const out: Row[] = [];
    for (const child of Array.from(content.children)) {
      const el = child as HTMLElement;
      try {
        cm.state.doc.lineAt(cm.posAtDOM(el));
      } catch {
        continue;
      }
      const depth = Number(getComputedStyle(el).getPropertyValue('--to-depth').trim() || '0');

      // First ink, chrome spans excluded — the walk 56-list-grid records at
      // greater length, and for the same reasons.
      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let textX: number | null = null;
      let node: Node | null = walker.nextNode();
      while (node) {
        const chrome = node.parentElement?.closest(
          '.cm-formatting-list, .cm-hmd-list-indent, .task-list-label, .to-decor-marker-icon',
        );
        const raw = node.textContent ?? '';
        if (!chrome && raw.trim() !== '') {
          range.setStart(node, raw.length - raw.trimStart().length);
          range.setEnd(node, raw.length);
          for (const r of Array.from(range.getClientRects())) {
            if (r.width === 0) continue;
            const l = +(r.left - cb.left).toFixed(2);
            if (textX === null || l < textX) textX = l;
          }
        }
        node = walker.nextNode();
      }
      if (textX === null) continue;

      const icon = el.querySelector(':scope > .to-decor-marker-icon');
      const ir = icon?.getBoundingClientRect();
      out.push({
        depth,
        textX,
        iconX: ir ? +(ir.left - cb.left + ir.width / 2).toFixed(2) : null,
      });
    }
    return out;
  });
}

/** A footer row's depth and the padding that places its text. */
function footerRows(): Promise<Array<{ depth: number; paddingLeft: number }>> {
  return browser.executeObsidian(() => {
    const root = document.querySelector<HTMLElement>('.workspace-leaf.mod-active .to-backlinks');
    if (!root) throw new Error('no footer rendered');
    return Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-row')).map((el) => ({
      depth: Number(el.style.getPropertyValue('--to-depth').trim() || '0'),
      paddingLeft: parseFloat(getComputedStyle(el).paddingLeft),
    }));
  });
}

/** Every kind that carries a depth, at several of them. */
const FIXTURE = [
  '# One',
  '',
  'A paragraph.',
  '',
  '- a',
  '\t- b',
  '\t\t- c',
  '',
].join('\n');

const TARGET = 'Backlinks/Reference target.md';

describe('the outline unit is one declaration the whole grid follows', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await override(null);
    await h.dismissNotices();
  });

  it('places every editor row at its own depth’s column, at whatever unit is in force', async function () {
    const note = 'Scratch/unit-override.md';
    await h.createNote(note, FIXTURE);
    if (!(await h.isOutlineMode(note))) {
      await h.toggleOutlineMode();
      await browser.pause(200);
      await h.dismissNotices();
    }
    await browser.pause(300);

    // One relation covers the whole grid: a row's text begins one gutter right
    // of `depth * unit`. Asserting it at two different units is what says the
    // columns FOLLOW the declaration rather than happening to match it once.
    const check = async (label: string): Promise<number> => {
      const unit = await h.publishedUnit();
      const gutter = await h.publishedGutter();
      const rows = await editorRows();
      expect(rows.length).toBeGreaterThan(3);
      // The fixture has to exercise more than one depth, or a unit change moves
      // nothing and the assertion passes vacuously.
      expect(new Set(rows.map((r) => r.depth)).size).toBeGreaterThan(2);
      // Collected rather than asserted one at a time, so a failure names the row
      // and the column it should have been on instead of just two numbers.
      const off: string[] = [];
      const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.05;
      for (const row of rows) {
        if (!near(row.textX, row.depth * unit + gutter)) {
          off.push(`${label} d${row.depth} text ${row.textX} != ${row.depth * unit + gutter}`);
        }
        if (row.iconX !== null && !near(row.iconX, row.depth * unit)) {
          off.push(`${label} d${row.depth} marker ${row.iconX} != ${row.depth * unit}`);
        }
      }
      expect(off).toEqual([]);
      return unit;
    };

    const before = await check('default');
    await override('2.5rem');
    const after = await check('overridden');
    // Guard against an override that silently did nothing, which would make
    // every assertion above pass twice over the same geometry.
    expect(after).toBeGreaterThan(before);
  });

  it('moves the footer’s rows by the same declaration', async function () {
    await h.openNote(TARGET);
    if (!(await h.isOutlineMode(TARGET))) {
      await h.toggleOutlineMode();
      await browser.pause(200);
      await h.dismissNotices();
    }
    await browser.executeObsidian(({ plugins }) => {
      (plugins.trueOutliner as never as { backlinks: { rebuild(): void } }).backlinks.rebuild();
    });
    await browser.pause(500);
    await browser.executeObsidian(() => {
      const s = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
      if (s) s.scrollTop = s.scrollHeight;
    });
    await browser.pause(500);

    const check = async (label: string): Promise<number> => {
      const unit = await h.publishedUnit();
      const gutter = await h.publishedGutter();
      const rows = await footerRows();
      expect(rows.length).toBeGreaterThan(3);
      expect(new Set(rows.map((r) => r.depth)).size).toBeGreaterThan(2);
      const off = rows
        .filter((r) => Math.abs(r.paddingLeft - (r.depth * unit + gutter)) >= 0.05)
        .map((r) => `${label} d${r.depth} pad ${r.paddingLeft} != ${r.depth * unit + gutter}`);
      expect(off).toEqual([]);
      return unit;
    };

    const before = await check('default');
    await override('2.5rem');
    const after = await check('overridden');
    expect(after).toBeGreaterThan(before);
  });

  it('leaves a mark’s distance from its own text alone', async function () {
    // The gutter is derived from the marks it holds, not from the unit
    // (docs/research/21). Widening a level must not touch it — the two are
    // independent, and a change that moved both would be an indentation change
    // wearing a gutter change's clothes.
    const note = 'Scratch/unit-override-gap.md';
    await h.createNote(note, FIXTURE);
    if (!(await h.isOutlineMode(note))) {
      await h.toggleOutlineMode();
      await browser.pause(200);
      await h.dismissNotices();
    }
    await browser.pause(300);

    const gaps = async (): Promise<number[]> => {
      const unit = await h.publishedUnit();
      return (await editorRows()).map((r) => +(r.textX - r.depth * unit).toFixed(2));
    };

    const before = await gaps();
    await override('2.5rem');
    const after = await gaps();
    expect(after.length).toBe(before.length);
    after.forEach((g, i) => expect(g).toBeCloseTo(before[i]!, 1));
  });
});
