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
import {
  FOOTER,
  chooseFacetValue,
  clickIn,
  focusSearch,
  groupNames,
  openFilters,
  openFooter,
  readStable,
  setSearchTerm,
  settle,
} from '../footer.js';

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
    // metadata cache then indexes asynchronously. Waited on the PLUGIN's OWN
    // rebuilt index reaching the hub's real ~128-source scale, not on
    // Obsidian's file discovery settling — that only proves every file was
    // found, not that its links were parsed, and rebuilding against a cache
    // that has discovered but not yet parsed reports the eight tracked
    // fixtures instead (measured, and the reason 76 waits the same way).
    await h.waitForBacklinkIndexReady(HUB, 100);
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

    // The tranche this loaded is a per-note OVERRIDE with no UI of its own to
    // undo it — no filter went active, so the reset button stays in its
    // row-closing mode and does not touch it. Left alone, it would silently
    // widen every later case in this file that also runs at cap 25. Typing
    // into (and so past) the search field is the one path that always resets
    // it regardless of whether a value actually changes.
    await openFilters();
    await setSearchTerm('');
    await settle();
  });

  /**
   * "Load more" enlarges the per-note cap OVERRIDE, and every other filter
   * change resets that override back to zero — a narrowed set should not stay
   * behind a tranche the WIDER set consumed. Escape and the search field's own
   * clear button were the two paths that missed this: both cleared the term
   * but left the enlarged override in place.
   */
  /** The sum of every rendered group's own count badge — the cap's own
   * invariant (D2): at or under whatever the cap currently is. */
  const sumOfGroupCounts = (): Promise<number> =>
    browser.executeObsidian(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '.workspace-leaf.mod-active .to-backlinks-group-count',
        ),
      ).reduce((sum, el) => sum + Number((el.textContent ?? '0').replace(/\D+/g, '')), 0),
    );

  it('resets the loaded tranche when Escape clears the search', async function () {
    await setCap('25');
    const before = await readStable(sumOfGroupCounts);
    expect(before).toBeLessThanOrEqual(25);

    await openFilters();
    await clickIn(`${FOOTER} .to-backlinks-load-more`);
    await settle();
    const loaded = await readStable(sumOfGroupCounts);
    expect(loaded).toBeGreaterThan(before);

    // Escape with nothing TYPED — the override is what this clears, not a
    // term. Focusing is enough to reach the field's own keydown handler.
    await focusSearch();
    await browser.keys('Escape');
    await settle();

    // Back under the CONFIGURED cap, not the tranche "Load more" added.
    expect(await readStable(sumOfGroupCounts)).toBeLessThanOrEqual(25);
  });

  it('resets the loaded tranche when the search field’s own clear button is used', async function () {
    await setCap('25');

    // Typing itself already resets the override (the `input` handler does,
    // and that path was never the bug) — so the override has to be raised
    // WHILE a term is active, by loading more against the NARROWED view
    // rather than the plain one. "2025-01" keeps the whole month of generated
    // hub notes (~28 of them, several references apiece), comfortably past
    // the 25-cap on its own, which is what guarantees a "Load more" exists to
    // press here.
    await openFilters();
    await setSearchTerm('2025-01');
    await settle();
    expect(await readStable(sumOfGroupCounts)).toBeLessThanOrEqual(25);

    const hasLoadMore = await browser.executeObsidian(
      () => document.querySelector('.workspace-leaf.mod-active .to-backlinks-load-more') !== null,
    );
    expect(hasLoadMore).toBe(true);
    await clickIn(`${FOOTER} .to-backlinks-load-more`);
    await settle();
    const narrowedLoaded = await readStable(sumOfGroupCounts);
    expect(narrowedLoaded).toBeGreaterThan(25);

    await clickIn(`${FOOTER} .to-backlinks-search-clear`);
    await settle();

    // Back under the plain 25-cap. Without the fix the tranche the narrowed
    // view loaded stays in effect, and the cleared, unfiltered view keeps
    // admitting up to 25-plus-that-tranche references instead of 25.
    expect(await readStable(sumOfGroupCounts)).toBeLessThanOrEqual(25);
  });

  it('draws the rung as a row inside the card, not as a pill on its edge', async function () {
    await setCap('none');
    await browser.executeObsidian(async ({ plugins }) => {
      await (plugins.trueOutliner as any).setBacklinksGroupHeight('compact');
    });
    await settle();

    const geometry = await readStable(() =>
      browser.executeObsidian(() => {
        const card = document.querySelector<HTMLElement>(
          '.workspace-leaf.mod-active .to-backlinks-group',
        );
        const rung = card?.querySelector<HTMLElement>('.to-backlinks-more.to-backlinks-rung');
        const body = card?.querySelector<HTMLElement>('.to-backlinks-rows');
        if (!card || !rung || !body) return null;
        const c = card.getBoundingClientRect();
        const r = rung.getBoundingClientRect();
        const b = body.getBoundingClientRect();
        return {
          insideCard: r.top >= c.top && r.bottom <= c.bottom,
          belowBody: r.top >= b.bottom - 1,
          startsWithinCard: r.left >= c.left && r.right <= c.right,
          border: getComputedStyle(rung).borderTopWidth,
        };
      }),
    );
    expect(geometry).not.toBeNull();

    // The rung inherits the bare chevron's element, and the chevron is a pill
    // that STRADDLES the card's bottom edge from `position: absolute`. A rung
    // that kept that was a full-width box centred on half a card's width, lying
    // across the last line of text. It is a row: inside the card, after the
    // body, and within the card's own bounds.
    expect(geometry!.insideCard).toBe(true);
    expect(geometry!.belowBody).toBe(true);
    expect(geometry!.startsWithinCard).toBe(true);
    expect(geometry!.border).toBe('0px');

    // And no box appears under the pointer. The pill's border came back on
    // hover, because the rung had only turned it off in its resting state.
    //
    // Brought on screen first: the geometry above is viewport-independent, but
    // a pointer cannot be moved to a point outside the window.
    await browser.executeObsidian(() => {
      document
        .querySelector('.workspace-leaf.mod-active .to-backlinks-group')
        ?.scrollIntoView({ block: 'center' });
    });
    await settle();
    const point = await browser.executeObsidian(() => {
      const el = document.querySelector(
        '.workspace-leaf.mod-active .to-backlinks-more.to-backlinks-rung',
      );
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    });
    expect(point).not.toBeNull();
    await browser
      .action('pointer', { parameters: { pointerType: 'mouse' } })
      .move({ x: point!.x, y: point!.y, origin: 'viewport' })
      .perform();
    await browser.pause(400);
    const hovered = await browser.executeObsidian(() => {
      const el = document.querySelector<HTMLElement>(
        '.workspace-leaf.mod-active .to-backlinks-more.to-backlinks-rung',
      );
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { border: cs.borderTopWidth, background: cs.backgroundColor };
    });
    expect(hovered).not.toBeNull();
    expect(hovered!.border).toBe('0px');
    expect(hovered!.background).toBe('rgba(0, 0, 0, 0)');

    await browser.executeObsidian(async ({ plugins }) => {
      await (plugins.trueOutliner as any).setBacklinksGroupHeight('standard');
    });
    await settle();
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

/**
 * "Load more" has to admit at least the next whole group, not just add one
 * fixed tranche.
 *
 * In its own `describe`, with two fixture notes built to an exact reference
 * count rather than relying on the generated hub's own numbers — the point
 * being tested is a size RELATIONSHIP (a source bigger than one tranche,
 * sitting right past the cap), which is easiest to state exactly rather than
 * to go looking for in a fixture built for other purposes.
 */
describe('"Load more" against a group larger than one tranche', function () {
  const TARGET = 'Scratch/Tranche Target.md';
  /** Twenty references — admitted first regardless of size (D2's own
   * exception), and small enough to fit under a 25-reference cap alone. */
  const SMALL_SOURCE = 'Scratch/Tranche A.md';
  /** Forty references — bigger than one 25-reference tranche on its own, so
   * a single "Load more" click has to raise the cap by more than one tranche
   * to admit it at all. */
  const BIG_SOURCE = 'Scratch/Tranche B.md';

  const mentions = (n: number): string =>
    Array.from({ length: n }, (_, i) => `- mention ${i + 1} of [[Tranche Target]]`).join('\n') +
    '\n';

  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.createNote(TARGET, '# Tranche Target\n');
    await h.createNote(SMALL_SOURCE, mentions(20));
    await h.createNote(BIG_SOURCE, mentions(40));

    // Waited on the INDEX directly rather than on the footer: both fixture
    // notes are fresh writes, and confirming the plugin has already seen both
    // before the footer is ever opened removes the whole class of
    // reindex-timing race this file's other `describe` had to work around.
    await browser.waitUntil(
      async () => {
        const paths = await browser.executeObsidian(
          ({ plugins }, target: string) =>
            (
              plugins.trueOutliner as never as {
                backlinks: { summaries(p: string): { path: string }[] };
              }
            ).backlinks
              .summaries(target)
              .map((s) => s.path),
          TARGET,
        );
        return paths.includes(SMALL_SOURCE) && paths.includes(BIG_SOURCE);
      },
      { timeout: h.waitBudget(10_000), timeoutMsg: 'the two fixture sources never indexed' },
    );

    await browser.executeObsidian(async ({ plugins }) => {
      await (plugins.trueOutliner as any).setBacklinksSort('name');
    });
    await openFooter(TARGET);
    await setCap('25');
  });

  it('admits the next group in one click even though it exceeds one tranche', async function () {
    const before = await readStable(groupNames);
    // A (20 refs) fits under 25 and sorts first; B (40 refs) does not fit
    // behind it (20 + 40 > 25) and is held back.
    expect(before).toEqual(['Tranche A']);

    await clickIn(`${FOOTER} .to-backlinks-load-more`);
    await settle();

    // ONE click, not several: 25 (one tranche) would raise the cap to 50,
    // and 20 + 40 = 60 still would not fit — a fixed tranche alone leaves
    // this click looking like it did nothing.
    const after = await readStable(groupNames);
    expect(after).toEqual(['Tranche A', 'Tranche B']);
  });
});

/**
 * A node holding references of MORE than one kind: the group's own count and
 * the rendered row have to agree on whether it counts as, say, an embed.
 *
 * `place()` keeps only the FIRST reference per node for its marker/quote
 * choice — a node can hold several, and deciding a marker for each would be
 * a different feature. A kind filter that read only that first choice would
 * disagree with the group's own count, which is taken from the raw,
 * undeduplicated reference list: selecting Embed would count this node (it
 * has one) while the row for it vanished, because the FIRST reference the
 * node happened to record was a plain link. Recorded as a known gap in
 * `docs/research/12-decoration-follow-ups.md` before `backlinks-controls`
 * existed to resolve it; found again in review once a kind filter existed
 * to expose it.
 */
describe('a node carrying references of more than one kind', function () {
  const TARGET = 'Scratch/Multi-kind Target.md';
  const SOURCE = 'Scratch/Multi-kind Source.md';

  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.createNote(TARGET, '# Multi-kind Target\n');
    // ONE line, so both references land on the SAME node — a plain link
    // (recorded first, per `place()`'s own rule) and an embed of the same
    // target right after it.
    await h.createNote(
      SOURCE,
      '- mentions [[Multi-kind Target]] and embeds ![[Multi-kind Target]]\n',
    );

    await browser.waitUntil(
      async () => {
        const refs = await browser.executeObsidian(
          ({ plugins }, [target, source]: [string, string]) =>
            (
              plugins.trueOutliner as never as {
                backlinks: { referencesFrom(t: string, s: string): { kind: string }[] };
              }
            ).backlinks.referencesFrom(target, source),
          [TARGET, SOURCE] as [string, string],
        );
        return refs.length === 2;
      },
      { timeout: h.waitBudget(10_000), timeoutMsg: 'the two references on one line never indexed' },
    );

    await openFooter(TARGET);
  });

  it('keeps the row when the node’s non-first reference is the selected kind', async function () {
    const shape = (): Promise<{ count: string; rows: number } | null> =>
      browser.executeObsidian(() => {
        const card = document.querySelector<HTMLElement>(
          '.workspace-leaf.mod-active .to-backlinks-group',
        );
        if (!card) return null;
        return {
          count: card.querySelector('.to-backlinks-group-count')?.textContent ?? '',
          rows: card.querySelectorAll('.to-backlinks-row').length,
        };
      });

    const unfiltered = await readStable(shape);
    expect(unfiltered).not.toBeNull();
    expect(unfiltered!.count).toBe('2');
    expect(unfiltered!.rows).toBe(1);

    await openFilters();
    await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="kind"]`);
    await chooseFacetValue('Embed');

    const embedOnly = await readStable(shape);
    expect(embedOnly).not.toBeNull();
    // The count says one embed reference exists here...
    expect(embedOnly!.count).toBe('1');
    // ...and the row for it is still there — not dropped because the FIRST
    // reference `place()` recorded for this node happened to be the link.
    expect(embedOnly!.rows).toBe(1);
  });
});
