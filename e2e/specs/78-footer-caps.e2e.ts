/**
 * The two caps, which bound two different things and are not the same
 * mechanism (design D2, D3).
 *
 * The OVERALL cap is a count of references, applied by the pure model before
 * anything is read. That ordering is the point: a group the model does not
 * admit is one `place()` is never called for, so the cap bounds the WORK and
 * not only the length. The first case here counts those calls, because a cap
 * that merely hid what it had already read would pass every visible assertion.
 *
 * The PER-NOTE bound is a height, measured after the markdown renders settle,
 * and the rung that reports it is a consequence of that same measurement rather
 * than a second truncation. So its assertions are relationships — a rung exists
 * where content was clipped, at the depth of the first clipped row — never a
 * row count, which is exactly the thing a height cap does not fix.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { FOOTER, clickIn, groupNames, openFooter, readStable, settle } from '../footer.js';

/** The generated hub: far more sources than any cap on offer. */
const HUB = 'Projects/Aurora Dashboard.md';

type Cap = '25' | '50' | '100' | 'none';

async function setCap(value: Cap): Promise<void> {
  await browser.executeObsidian(async ({ plugins }, next: string) => {
    await (plugins.trueOutliner as any).setBacklinksOverallCap(next);
  }, value);
  await settle();
}

/** The header's own sentence, which reports TRUE totals whatever the cap. */
function totals(): Promise<{ references: number; notes: number } | null> {
  return browser.executeObsidian(() => {
    const text =
      document.querySelector('.workspace-leaf.mod-active .to-backlinks-totals')?.textContent ?? '';
    const refs = /(\d+)\s+references?/.exec(text);
    const notes = /(\d+)\s+notes?/.exec(text);
    if (!refs) return null;
    return { references: Number(refs[1]), notes: notes ? Number(notes[1]) : 1 };
  });
}

/** The footer-level tail: the rung, its sentence, and the fade on the last card. */
function tail(): Promise<{ rung: boolean; shortfall: string; fading: number }> {
  return browser.executeObsidian(() => {
    const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
    return {
      rung: root?.querySelector('.to-backlinks-load-more') !== null,
      shortfall: root?.querySelector('.to-backlinks-shortfall')?.textContent ?? '',
      fading: root?.querySelectorAll('.to-backlinks-group.is-fading').length ?? -1,
    };
  });
}

describe('the overall cap and the per-note bound', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    // The hub is generated, and `resetVault` hands the worker a fresh copy the
    // metadata cache then indexes asynchronously. Rebuilding against a cache
    // that has not taken it in yet reports the eight tracked fixtures instead
    // of ~128 sources — measured, and the reason 76 waits the same way.
    let seen = -1;
    await browser.waitUntil(
      async () => {
        const now = await browser.executeObsidian(({ app }) => app.vault.getMarkdownFiles().length);
        if (now === seen) return true;
        seen = now;
        return false;
      },
      {
        timeout: h.waitBudget(20_000),
        interval: 250,
        timeoutMsg: 'vault file count never settled',
      },
    );
    await browser.executeObsidian(({ plugins }) => {
      (plugins.trueOutliner as never as { backlinks: { rebuild(): void } }).backlinks.rebuild();
    });
    // Sorted by NAME for this whole spec, which is about the caps and never
    // about the order. The default sort is by mtime, and a vault the harness
    // has just copied is still having its mtimes written — so two renders can
    // admit genuinely different sets, and a note the first one read is not one
    // the second still shows. CI reported exactly that: six placed notes the
    // final DOM had dropped, all adjacent in the order. It would bite the
    // additive "Load more" case the same way, since a stable prefix is the
    // whole of what that one asserts. Name is a total order over the fixture
    // and does not move under the harness.
    await browser.executeObsidian(async ({ plugins }) => {
      await (plugins.trueOutliner as any).setBacklinksSort('name');
    });
    await openFooter(HUB);
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  after(async function () {
    await setCap('50');
    await browser.executeObsidian(async ({ plugins }) => {
      await (plugins.trueOutliner as any).setBacklinksSort('recent');
    });
  });

  /**
   * The spec's own scenario, and the only way to tell the design apart from one
   * that filters after placement: a note beyond the cap is not READ, not merely
   * not shown.
   */
  it('never places a note the cap did not admit', async function () {
    // The cap is already where it needs to be, with the footer settled at
    // it, BEFORE the spy goes on. Measuring the repaint that narrows the cap
    // looks tighter and is not: the wider render's own fills are still
    // resolving as the narrower one starts, so the window catches both and
    // reports the notes the wide cap read. Seen on CI as eighteen placements
    // behind eight groups — eighteen being the group count at the previous cap.
    await setCap('25');
    await readStable(groupNames);

    const counted = await browser.executeObsidian(async ({ plugins }, target: string) => {
      const plugin = plugins.trueOutliner as any;
      const index = plugin.backlinks;
      const placed: string[] = [];
      const original = index.place.bind(index);
      index.place = (t: string, s: string) => {
        placed.push(s);
        return original(t, s);
      };
      try {
        // A whole repaint at the cap already in force, provoked through a
        // setting rather than through the module function that performs it —
        // which is not on the plugin, and reaching past what a caller can
        // actually call would test a path the product does not have.
        await plugin.setBacklinksGroupHeight('compact');
        await new Promise((resolve) => setTimeout(resolve, 6000));
        const shownPaths = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.workspace-leaf.mod-active .to-backlinks-group-head',
          ),
        ).map((head) => {
          const name = head.querySelector('.to-backlinks-group-name')?.textContent ?? '';
          const folder = head.querySelector('.to-backlinks-group-folder')?.textContent ?? '';
          return folder ? `${folder}/${name}.md` : `${name}.md`;
        });
        return {
          placed: Array.from(new Set(placed)),
          shownPaths,
          sources: index.summaries(target).length,
        };
      } finally {
        index.place = original;
        await plugin.setBacklinksGroupHeight('standard');
      }
    }, HUB);

    // The fixture has to be several times the cap, or this case proves nothing.
    expect(counted.sources).toBeGreaterThan(40);
    expect(counted.shownPaths.length).toBeGreaterThan(0);
    expect(counted.shownPaths.length).toBeLessThan(counted.sources);

    // Every note READ is a note SHOWN, and nothing beyond the cap was touched.
    // Without the model applying the cap before `place()`, every source in the
    // fixture would appear here.
    expect([...counted.placed].sort()).toEqual([...counted.shownPaths].sort());
    await settle();
  });

  it('admits whole groups, so it is a bound rather than a quota', async function () {
    await setCap('25');
    const shown = await readStable(() =>
      browser.executeObsidian(({ plugins }, target: string) => {
        const index = (
          plugins.trueOutliner as never as {
            backlinks: { summaries(p: string): { path: string; count: number }[] };
          }
        ).backlinks;
        const truth = new Map(index.summaries(target).map((s) => [s.path, s.count]));
        return Array.from(
          document.querySelectorAll<HTMLElement>(
            '.workspace-leaf.mod-active .to-backlinks-group-head',
          ),
        ).map((head) => {
          const name = head.querySelector('.to-backlinks-group-name')?.textContent ?? '';
          const folder = head.querySelector('.to-backlinks-group-folder')?.textContent ?? '';
          const path = folder ? `${folder}/${name}.md` : `${name}.md`;
          return {
            drawn: Number(head.querySelector('.to-backlinks-group-count')?.textContent ?? '0'),
            actual: truth.get(path) ?? -1,
          };
        });
      }, HUB),
    );

    expect(shown.length).toBeGreaterThan(1);
    // Every admitted group is WHOLE. A cap that cut at exactly N references
    // would leave the last group drawing fewer than the note actually has —
    // the failure this asserts against, and the reason the cap is a bound.
    for (const group of shown) expect(group.drawn).toBe(group.actual);
    expect(shown.reduce((sum, g) => sum + g.drawn, 0)).toBeLessThanOrEqual(25);
  });

  it('reports the true totals whatever the cap admits', async function () {
    await setCap('25');
    const tight = await readStable(totals);
    const tightGroups = (await readStable(groupNames)).length;

    await setCap('100');
    const loose = await readStable(totals);
    const looseGroups = (await readStable(groupNames)).length;

    expect(tight).not.toBeNull();
    expect(loose).not.toBeNull();
    // The header counts the whole FILTERED set, so raising the cap changes what
    // is on screen and not what the header says. A header that moved with the
    // cap would be a footer implying it is showing everything.
    expect(tight).toEqual(loose);
    expect(looseGroups).toBeGreaterThan(tightGroups);
    expect(tight!.references).toBeGreaterThan(100);
  });

  it('marks an incomplete list with a rung, a sentence and a fade — and a complete one with none', async function () {
    await setCap('25');
    const capped = await readStable(tail);
    expect(capped.rung).toBe(true);
    expect(capped.shortfall).toMatch(/\d+ references? across \d+ notes? not shown/);
    // Exactly one card fades, and it is the last: the cue is the list
    // dissolving, not every card being marked.
    expect(capped.fading).toBe(1);
    const lastFades = await browser.executeObsidian(() => {
      const cards = document.querySelectorAll('.workspace-leaf.mod-active .to-backlinks-group');
      return cards.item(cards.length - 1)?.classList.contains('is-fading') ?? false;
    });
    expect(lastFades).toBe(true);

    // The negative control the task asks for, run as a case rather than by
    // hand: with no cap the footer is complete, and all three cues must go. If
    // they were unconditional the assertions above would pass on any footer.
    await setCap('none');
    const complete = await readStable(tail);
    expect(complete.rung).toBe(false);
    expect(complete.shortfall).toBe('');
    expect(complete.fading).toBe(0);
  });

  it('loads more additively, adding to the end and moving nothing', async function () {
    await setCap('25');
    const before = await readStable(groupNames);
    expect(before.length).toBeGreaterThan(0);

    await clickIn(`${FOOTER} .to-backlinks-load-more`);
    await settle();
    const after = await readStable(groupNames);

    expect(after.length).toBeGreaterThan(before.length);
    // A PREFIX, not merely a superset: the model is a pure function of the
    // controls and its order is stable, so a larger cap yields the same groups
    // in the same order with more after them. Nothing already read moves.
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('caps a tall group by height and says what the height hid', async function () {
    await setCap('none');
    // `compact` guarantees the fixture overflows whatever CI's font metrics are
    // — the height cap is the thing under test, and a bound tall enough for the
    // content would test nothing.
    await browser.executeObsidian(async ({ plugins }) => {
      await (plugins.trueOutliner as any).setBacklinksGroupHeight('compact');
    });
    await settle();

    /**
     * What the rung says, beside what the clip actually did.
     *
     * The expectation is re-derived from the settled GEOMETRY rather than read
     * from the code that drew the rung: a row is clipped when its bottom falls
     * past the body's visible limit, the first such row names the depth, and
     * the reference rows among them are the count. Two independent readings of
     * the same layout, which is what makes the comparison worth making.
     */
    const rungs = await readStable(() =>
      browser.executeObsidian(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>('.workspace-leaf.mod-active .to-backlinks-group'),
        )
          .map((card) => {
            const rung = card.querySelector<HTMLElement>('.to-backlinks-more.to-backlinks-rung');
            const body = card.querySelector<HTMLElement>('.to-backlinks-rows.is-capped');
            if (!rung || !body) return null;
            const limit = body.getBoundingClientRect().top + body.clientHeight;
            const clipped = Array.from(body.children as HTMLCollectionOf<HTMLElement>).filter(
              (row) => row.getBoundingClientRect().bottom > limit,
            );
            if (clipped.length === 0) return null;
            const references = clipped.filter((r) => r.classList.contains('is-reference'));
            return {
              label: rung.getAttribute('aria-label') ?? '',
              depth: rung.style.getPropertyValue('--to-depth'),
              firstHiddenDepth: clipped[0]?.style.getPropertyValue('--to-depth') ?? '',
              expected: references.length > 0 ? references.length : clipped.length,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null),
      ),
    );

    expect(rungs.length).toBeGreaterThan(0);
    for (const rung of rungs) {
      // Never "0 more": `omissionBelow` falls back to the clipped ROW count
      // when a clip caught only lineage context.
      expect(rung.label).toBe(`Show ${rung.expected} more`);
      // The depth the hidden rows would have occupied, which is what makes it a
      // rung in the tree rather than a button under it.
      expect(rung.depth).toBe(rung.firstHiddenDepth);
    }

    // And it folds the group open: the same control, in the other direction.
    const heightOf = (): Promise<number> =>
      browser.executeObsidian(() =>
        Math.round(
          document
            .querySelector('.workspace-leaf.mod-active .to-backlinks-group')
            ?.getBoundingClientRect().height ?? 0,
        ),
      );
    const closed = await heightOf();
    await clickIn(`${FOOTER} .to-backlinks-more.to-backlinks-rung`);
    await settle();
    const opened = await heightOf();
    expect(opened).toBeGreaterThan(closed);

    await browser.executeObsidian(async ({ plugins }) => {
      await (plugins.trueOutliner as any).setBacklinksGroupHeight('standard');
    });
    await settle();
  });
});
