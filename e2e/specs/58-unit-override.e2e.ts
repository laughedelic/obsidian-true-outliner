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
 * EVERY INDEPENDENTLY POSITIONED LAYER is measured, not just the one that is
 * easiest to see. A block line's padding, an atom's margin, a list's
 * supplemental margin, its stated hanging indent, the guide gradient's period
 * and stripe positions, and the `--list-indent` bridge into Obsidian's own list
 * geometry each derive from the unit through a rule of their own. An earlier
 * version of this spec watched only row text and marker centres; pinning any of
 * the others to a literal left it green, which is the failure it exists to
 * catch. Each was pinned in turn to confirm this one does not.
 *
 * They are not all in the stylesheet, which is worth knowing before trying to
 * pin one: an atom's margin and a list item's supplemental margin are written
 * INLINE from JS, so the CSS rules that look like their source are overridden
 * and editing those changes nothing.
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
  kind: 'block' | 'atom' | 'list';
  depth: number;
  suppDepth: number;
  /** First ink of the row's own text, in the content frame. */
  textX: number | null;
  /** Centre of the row's block-marker icon, when it draws one. */
  iconX: number | null;
  /** Resolved box metrics — each one a separate rule deriving from the unit. */
  marginLeft: number;
  paddingLeft: number;
  textIndent: number;
  /** `tab-size`, which the `--list-indent` bridge drives on a list line. */
  tabSize: string;
  /** Per background layer: the gradient's period, and where its stripe starts. */
  guideSizes: number[];
  guideStarts: number[];
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
      const cs = getComputedStyle(el);
      const kind = el.classList.contains('to-decor-atom')
        ? 'atom'
        : el.classList.contains('to-decor-list')
          ? 'list'
          : el.classList.contains('to-decor-block')
            ? 'block'
            : null;
      if (!kind) continue;

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

      const icon = el.querySelector(':scope > .to-decor-marker-icon');
      const ir = icon?.getBoundingClientRect();

      // The guide overlay is painted by a `::after`, not by the line itself —
      // `::before` belongs to Obsidian's own blockquote bar, which the rule's own
      // comment records. Its gradients resolve to real lengths in the computed
      // style even though they are authored as a custom property — so the
      // gradient's PERIOD and each stripe's START are readable without sampling
      // pixels.
      const guide = getComputedStyle(el, '::after');
      const firstLength = (v: string): number[] =>
        v
          .split(',')
          .map((part) => parseFloat(part.trim().split(/\s+/)[0] ?? ''))
          .filter((n) => !Number.isNaN(n));
      const sizes = firstLength(guide.backgroundSize);
      const starts = firstLength(guide.backgroundPosition);

      out.push({
        kind,
        depth: Number(cs.getPropertyValue('--to-depth').trim() || '0'),
        suppDepth: Number(cs.getPropertyValue('--to-supp-depth').trim() || '0'),
        textX,
        iconX: ir ? +(ir.left - cb.left + ir.width / 2).toFixed(2) : null,
        marginLeft: parseFloat(cs.marginLeft) || 0,
        paddingLeft: parseFloat(cs.paddingLeft) || 0,
        textIndent: parseFloat(cs.textIndent) || 0,
        tabSize: cs.tabSize,
        guideSizes: sizes,
        guideStarts: starts,
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

/** Every layer that positions itself from the unit, at more than one depth. */
const FIXTURE = [
  '# One',
  '',
  'A paragraph.',
  '',
  '- a',
  '\t- b',
  '\t\t- c',
  '',
  '```js',
  'code line',
  '```',
  '',
].join('\n');

const TARGET = 'Backlinks/Reference target.md';

/** Whether a value is within a subpixel of where the unit in force puts it. */
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.05;

async function openFixture(name: string): Promise<void> {
  await h.createNote(`Scratch/${name}.md`, FIXTURE);
  if (!(await h.isOutlineMode(`Scratch/${name}.md`))) {
    await h.toggleOutlineMode();
    await browser.pause(200);
    await h.dismissNotices();
  }
  await browser.pause(300);
}

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

  it('moves every independently positioned layer, at whatever unit is in force', async function () {
    await openFixture('unit-override');

    const check = async (label: string): Promise<number> => {
      const unit = await h.publishedUnit();
      const gutter = await h.publishedGutter();
      const rows = await editorRows();

      // Fixture guards: an assertion over layers the fixture never renders
      // passes without measuring anything.
      const kinds = new Set(rows.map((r) => r.kind));
      expect(kinds).toEqual(new Set(['block', 'atom', 'list']));
      expect(new Set(rows.map((r) => r.depth)).size).toBeGreaterThan(2);
      expect(rows.some((r) => r.kind === 'list' && r.suppDepth > 0)).toBe(true);
      expect(rows.some((r) => r.guideSizes.length > 0)).toBe(true);

      // Collected rather than asserted one at a time, so a failure names the
      // layer and the row instead of just two numbers.
      const off: string[] = [];
      const at = (r: Row, what: string, got: number, want: number): void => {
        if (!near(got, want)) off.push(`${label} ${r.kind} d${r.depth} ${what} ${got} != ${want}`);
      };

      for (const row of rows) {
        const column = row.depth * unit;

        // The two the earlier version of this spec watched.
        if (row.textX !== null && row.kind !== 'atom') at(row, 'text', row.textX, column + gutter);
        if (row.iconX !== null) at(row, 'marker', row.iconX, column);

        // A block line carries its depth as padding; an atom as margin, its own
        // box having to move; a list item as the margin down to its list's root.
        if (row.kind === 'block') at(row, 'padding', row.paddingLeft, column + gutter);
        if (row.kind === 'atom') at(row, 'margin', row.marginLeft, column + gutter);
        if (row.kind === 'list') {
          at(row, 'supp-margin', row.marginLeft, row.suppDepth * unit);
          // The STATED hanging indent, and its own negation as text-indent.
          const hang = (row.depth - row.suppDepth) * unit + gutter;
          at(row, 'hang', row.paddingLeft, hang);
          at(row, 'text-indent', row.textIndent, -hang);
          // The bridge into Obsidian's own list geometry. `--list-indent` is set
          // to the unit and Obsidian derives `tab-size` from it, applying its
          // own multiplier — so what holds on any multiplier is that the result
          // is a whole number of units. Pin the bridge to a literal and the
          // ratio stops being whole the moment the unit is overridden.
          const tabs = parseFloat(row.tabSize) / unit;
          if (!near(tabs, Math.round(tabs)) || tabs <= 0) {
            off.push(`${label} list d${row.depth} tab-size ${row.tabSize} is not a whole unit`);
          }
        }

        // Each guide layer repeats at the unit, and each stripe starts half its
        // own width left of some depth's column — so the start plus that half is
        // a whole number of units.
        for (const size of row.guideSizes) at(row, 'guide-period', size, unit);
        for (const start of row.guideStarts) {
          const levels = (start + 0.5) / unit;
          if (!near(levels, Math.round(levels))) {
            off.push(`${label} ${row.kind} d${row.depth} guide-start ${start} is not on a column`);
          }
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
        .filter((r) => !near(r.paddingLeft, r.depth * unit + gutter))
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
    await openFixture('unit-override-gap');

    const gaps = async (): Promise<number[]> => {
      const unit = await h.publishedUnit();
      return (await editorRows())
        .filter((r) => r.textX !== null && r.kind !== 'atom')
        .map((r) => +(r.textX! - r.depth * unit).toFixed(2));
    };

    const before = await gaps();
    await override('2.5rem');
    const after = await gaps();
    expect(after.length).toBe(before.length);
    after.forEach((g, i) => expect(g).toBeCloseTo(before[i]!, 1));
  });
});
