/**
 * Spike S5 (docs/research/19): what the footer actually costs on a hub note.
 *
 * The numbers `backlinks-controls` needs before it can choose cap defaults —
 * D10 defers them to this spike precisely so the caps are set from measurement
 * rather than from a guess about what "a lot of references" means.
 *
 * Four costs, because they are paid at different times and only one of them is
 * on the path the reader waits for:
 *
 * - **index build** — every markdown file's cached metadata, once, at startup.
 *   No file reads; the cache is already in memory.
 * - **summaries** — which notes reference this one and how many each. Also no
 *   reads, and it is what the header paints from on the first frame.
 * - **place** — read plus parse plus locate, per source note. The expensive one,
 *   and the reason groups resolve independently (D-G).
 * - **first paint** — from the widget mounting to the header being on screen.
 *   What the reader experiences; the group bodies fill in behind it.
 *
 * Reported, not asserted. A budget here would be a number invented before the
 * feature has a cap, and `backlinks-controls` is where it belongs — this spike
 * exists to hand that change its input. The one assertion is the shape of the
 * design: the no-read half must be far cheaper than the per-source half, or
 * progressive paint buys nothing.
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const HUB = 'Projects/Aurora Dashboard.md';

interface Cost {
  readonly files: number;
  readonly sources: number;
  readonly references: number;
  readonly buildMs: number;
  readonly summariesMs: number;
  readonly placeTotalMs: number;
  readonly placeMedianMs: number;
  readonly placeMaxMs: number;
}

describe('spike S5: what a hub note costs', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  it('measures index build, summaries and per-source placement', async function () {
    await h.openNote(HUB);

    const cost = await browser.executeObsidian(async ({ app, plugins }, target: string) => {
      const backlinks = (
        plugins.trueOutliner as never as {
          backlinks: {
            rebuild(): void;
            summaries(p: string): { path: string; count: number }[];
            place(t: string, s: string): Promise<unknown>;
            clearTrees(): void;
          };
        }
      ).backlinks;

      const t0 = performance.now();
      backlinks.rebuild();
      const buildMs = performance.now() - t0;

      const t1 = performance.now();
      const summaries = backlinks.summaries(target);
      const summariesMs = performance.now() - t1;

      // Cold: a cached tree would measure the cache, not the work.
      backlinks.clearTrees();
      const each: number[] = [];
      const t2 = performance.now();
      for (const s of summaries) {
        const t = performance.now();
        await backlinks.place(target, s.path);
        each.push(performance.now() - t);
      }
      const placeTotalMs = performance.now() - t2;
      each.sort((a, b) => a - b);

      return {
        files: app.vault.getMarkdownFiles().length,
        sources: summaries.length,
        references: summaries.reduce((n, s) => n + s.count, 0),
        buildMs,
        summariesMs,
        placeTotalMs,
        placeMedianMs: each[Math.floor(each.length / 2)] ?? 0,
        placeMaxMs: each[each.length - 1] ?? 0,
      } satisfies Cost;
    }, HUB);

    console.log(
      [
        '',
        '[S5] hub-note cost',
        `  vault              ${cost.files} markdown files`,
        `  target             ${cost.sources} sources, ${cost.references} references`,
        `  index build        ${cost.buildMs.toFixed(1)}ms   (whole vault, no file reads)`,
        `  summaries          ${cost.summariesMs.toFixed(2)}ms  (first frame's input, no reads)`,
        `  place, all sources ${cost.placeTotalMs.toFixed(1)}ms`,
        `  place, per source  median ${cost.placeMedianMs.toFixed(2)}ms, max ${cost.placeMaxMs.toFixed(2)}ms`,
      ].join('\n'),
    );

    // Enough sources that the measurement is of a hub rather than of a note
    // with a handful of backlinks. Not a threshold on the fixture's exact size,
    // which is generated and may be regenerated at another scale.
    expect(cost.sources).toBeGreaterThan(10);

    // The shape progressive paint depends on: what the header needs must be
    // negligible beside what the bodies need. If these ever converge, D-G stops
    // buying anything and the design should be revisited rather than the number.
    expect(cost.summariesMs).toBeLessThan(cost.placeTotalMs);
  });

  it('measures first paint — mount to header on screen', async function () {
    await h.openNote(HUB);
    if (!(await h.isOutlineMode(HUB))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }

    // Away from the end, so the widget is genuinely unmounted: CodeMirror
    // virtualises, and a footer already in the DOM would measure nothing.
    await browser.executeObsidian(() => {
      const scroller = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
      if (scroller) scroller.scrollTop = 0;
    });
    await browser.pause(400);

    const paint = await browser.executeObsidian(async () => {
      const leaf = document.querySelector('.workspace-leaf.mod-active');
      const scroller = leaf?.querySelector('.cm-scroller');
      if (!scroller) return null;

      const t0 = performance.now();
      scroller.scrollTop = scroller.scrollHeight;

      const headerAt = await new Promise<number>((resolve) => {
        const deadline = performance.now() + 5000;
        const tick = (): void => {
          const totals = leaf?.querySelector('.to-backlinks-totals')?.textContent ?? '';
          if (/\d+ reference/.test(totals)) resolve(performance.now() - t0);
          else if (performance.now() > deadline) resolve(-1);
          else requestAnimationFrame(tick);
        };
        tick();
      });

      const rowsAt = await new Promise<number>((resolve) => {
        const deadline = performance.now() + 10000;
        const tick = (): void => {
          const resolving = leaf?.querySelectorAll('.to-backlinks-resolving').length ?? 1;
          const rows = leaf?.querySelectorAll('.to-backlinks-row').length ?? 0;
          if (resolving === 0 && rows > 0) resolve(performance.now() - t0);
          else if (performance.now() > deadline) resolve(-1);
          else requestAnimationFrame(tick);
        };
        tick();
      });

      return { headerAt, rowsAt };
    });

    expect(paint).not.toBeNull();
    console.log(
      [
        '',
        '[S5] first paint, from the scroll that mounts the footer',
        `  header (counts)  ${paint!.headerAt.toFixed(0)}ms`,
        `  every group resolved ${paint!.rowsAt.toFixed(0)}ms`,
      ].join('\n'),
    );

    // The promise D-G makes: counts are on screen before context is.
    expect(paint!.headerAt).toBeGreaterThanOrEqual(0);
    expect(paint!.rowsAt).toBeGreaterThanOrEqual(paint!.headerAt);
  });
});
