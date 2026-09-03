/**
 * Group 9's verification: what the footer DOES, as opposed to how it draws.
 *
 * `74-footer-chrome-pass` asserts rendering — classes, columns, colours, the
 * per-kind matrix. It is structurally blind to everything here, and that blind
 * spot was demonstrated rather than theorised: a review found seven defects on
 * a green matrix, every one of them interaction or index lifecycle. Clicking a
 * link inside a mention navigated to the wrong note, the fold chevron marked
 * nothing, and a note could sit at "0 references" indefinitely, all while the
 * matrix stayed green.
 *
 * So the split is deliberate. This file asks whether the footer behaves; the
 * other asks whether it looks right.
 */
import { $, browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const TARGET = 'Backlinks/Reference target.md';
const DORMANT = 'Notes/Sourdough Log.md';
const DEEP_SOURCE = 'Backlinks/Deep chain.md';
const HUB = 'Projects/Aurora Dashboard.md';
const FOOTER = '.workspace-leaf.mod-active .to-backlinks';

/** The footer sits at `doc.length`, and CodeMirror virtualises: until the
 * reader reaches the end of a long note, the widget has no DOM at all. */
async function scrollToEnd(): Promise<void> {
  await browser.executeObsidian(() => {
    const scroller = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await browser.pause(400);
}

async function ensureOutlineMode(notePath: string): Promise<void> {
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

async function openFooter(notePath: string): Promise<void> {
  await h.openNote(notePath);
  await ensureOutlineMode(notePath);
  await scrollToEnd();
  // The section's folded state is per note and outlives a test. One test folds
  // it deliberately, and if its unfold does not land, every test after it sees a
  // footer with no rows and fails for a reason that has nothing to do with what
  // it asserts — four cascading failures from one, which hides the one.
  const collapsed = await browser.executeObsidian(
    () =>
      document
        .querySelector('.workspace-leaf.mod-active .to-backlinks-head')
        ?.classList.contains('is-collapsed') ?? false,
  );
  if (collapsed) {
    await h.clickClear(`${FOOTER} .to-backlinks-title`);
    await browser.pause(300);
  }
}

/** The footer's rows, as text — enough to assert shape without asserting pixels. */
function rows(): Promise<string[]> {
  return browser.executeObsidian(() => {
    const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-row')).map((el) => {
      const roles = ['is-lineage', 'is-reference'].filter((c) => el.classList.contains(c));
      const depth = el.style.getPropertyValue('--to-depth') || '0';
      return `${depth}${roles.length ? `:${roles.join(',')}` : ''} ${(
        el.querySelector('.to-backlinks-content')?.textContent ?? ''
      ).trim()}`;
    });
  });
}

function footerExists(): Promise<boolean> {
  return browser.executeObsidian(
    () => document.querySelector('.workspace-leaf.mod-active .to-backlinks') !== null,
  );
}

describe('backlinks footer: behaviour', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    // Not a volume spec: see `pinBacklinksCapOff`.
    await h.pinBacklinksCapOff();
    await browser.executeObsidian(({ plugins }) => {
      (plugins.trueOutliner as never as { backlinks: { rebuild(): void } }).backlinks.rebuild();
    });
  });

  // ---- 9.1 the surface is scoped ------------------------------------------

  /**
   * The footer belongs to outline mode's editing view and nowhere else. Reading
   * view matters on its own: it is a different renderer with a different DOM,
   * and a widget leaking into it would be invisible to every other test here.
   */
  it('renders in outline mode, and not off-mode or in reading view', async function () {
    await openFooter(TARGET);
    expect(await footerExists()).toBe(true);

    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode off');
    await h.dismissNotices();
    await scrollToEnd();
    expect(await footerExists()).toBe(false);

    await ensureOutlineMode(TARGET);
    await scrollToEnd();
    expect(await footerExists()).toBe(true);

    // Reading view is entered through the leaf's own view state rather than a
    // command: `h.runCommand` namespaces to this plugin, and this one is
    // Obsidian's.
    const setMode = async (mode: 'preview' | 'source'): Promise<void> => {
      await browser.executeObsidian(({ app }, m: string) => {
        const leaf = app.workspace.getMostRecentLeaf();
        void leaf?.setViewState({ type: 'markdown', state: { mode: m } });
      }, mode);
    };

    await setMode('preview');
    await browser.pause(600);
    // Two questions, and only the first is about the reading view.
    //
    // Obsidian keeps the source view's DOM alive but hidden when a leaf shows
    // reading view, so the footer element STAYS in the leaf — a bare existence
    // check reports it and means nothing. What matters is that the reading
    // renderer produces none of its own, and that nothing of it is on screen.
    const inReading = await browser.executeObsidian(() => {
      const leaf = document.querySelector('.workspace-leaf.mod-active');
      const rendered = leaf?.querySelector('.markdown-reading-view .to-backlinks') ?? null;
      const any = leaf?.querySelector<HTMLElement>('.to-backlinks') ?? null;
      return {
        reading: leaf?.querySelector('.markdown-reading-view') !== null,
        rendered: rendered !== null,
        visible: any ? any.getClientRects().length > 0 : false,
      };
    });
    expect(inReading.reading).toBe(true);
    expect(inReading.rendered).toBe(false);
    expect(inReading.visible).toBe(false);

    await setMode('source');
    await browser.pause(600);
  });

  // ---- 9.2 reading it is not editing it -----------------------------------

  /**
   * Bytes AND the undo stack. A footer that left the buffer intact but pushed a
   * history entry would still have edited the note as far as the reader is
   * concerned — their next undo would do something they did not ask for.
   */
  it('leaves the note’s bytes and undo stack untouched while being read', async function () {
    await openFooter(TARGET);
    const before = await h.getBuffer();

    try {
      // A real edit first, so there is something on the stack to lose.
      await h.setCursorSettled(0, 0);
      await browser.keys('X');
      await browser.pause(200);
      const edited = await h.getBuffer();
      expect(edited).not.toBe(before);

      // Now read the footer: scroll it, click its header, fold and unfold it.
      await scrollToEnd();
      await h.clickClear(`${FOOTER} .to-backlinks-title`);
      await browser.pause(300);
      await h.clickClear(`${FOOTER} .to-backlinks-title`);
      await browser.pause(300);
      expect(await h.getBuffer()).toBe(edited);

      // One undo must land on the typed character, not on anything the footer
      // did. Waited for rather than paused for: undo is dispatched through the
      // editor and lands a frame or several later, and a fixed pause is a guess
      // that gets it wrong on the slower platform only.
      await h.keys.undo();
      await browser.waitUntil(async () => (await h.getBuffer()) === before, {
        timeout: 4000,
        timeoutMsg: 'undo did not restore the pre-edit buffer',
      });
    } finally {
      // Whatever happened, the next test starts from the fixture as written.
      // Without this, one failure here left an edited note behind and every
      // test after it in this file failed too — four cascading failures from
      // one real one, which hides the real one.
      if ((await h.getBuffer()) !== before) await h.setBuffer(before);
    }
  });

  // ---- 9.3 lineage shape ---------------------------------------------------

  /**
   * The projection's shape, seen through the DOM rather than through
   * `project()`'s own return value — the unit tests already own that. What this
   * adds is that the shape survives rendering.
   */
  it('collapses an unbranching chain to one lineage row above its reference', async function () {
    await openFooter(TARGET);
    const shown = await rows();

    const lineage = shown.filter((r) => r.includes(':is-lineage'));
    const references = shown.filter((r) => r.includes(':is-reference'));
    expect(references.length).toBeGreaterThan(0);

    // A chain is ONE row carrying several ancestors: four ancestors must not
    // become four rows. Counted by segments, which is what "several ancestors"
    // means — not by whatever mark currently divides them, which is a design
    // choice this test has no stake in.
    const chained = await browser.executeObsidian(
      () =>
        Array.from(
          document.querySelectorAll('.workspace-leaf.mod-active .to-backlinks-row.is-lineage'),
        ).filter((row) => row.querySelectorAll('.to-backlinks-seg').length > 1).length,
    );
    expect(chained).toBeGreaterThan(0);

    // Every reference sits under a lineage row or at the root — never orphaned
    // deeper than the row above it.
    for (let i = 0; i < shown.length; i++) {
      const depth = Number(shown[i]!.split(' ')[0]!.split(':')[0]);
      if (depth === 0) continue;
      const prev = Number(shown[i - 1]!.split(' ')[0]!.split(':')[0]);
      expect(depth).toBeLessThanOrEqual(prev + 1);
    }
  });

  it('renders a shared ancestor once, with both references below it', async function () {
    await openFooter(HUB);
    // Per GROUP, not per footer. Two different source notes may legitimately
    // have an ancestor of the same name; what must not happen is one note's
    // ancestor being drawn once per reference beneath it instead of once per
    // branch.
    const repeats = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      if (!root) return ['<no footer>'];
      const out: string[] = [];
      root.querySelectorAll('.to-backlinks-group').forEach((group) => {
        const name = group.querySelector('.to-backlinks-group-name')?.textContent ?? '?';
        const seen = new Set<string>();
        group.querySelectorAll('.to-backlinks-row.is-lineage').forEach((row) => {
          const key = `${row.getAttribute('style') ?? ''}|${(row.textContent ?? '').trim()}`;
          if (seen.has(key)) out.push(`${name}: ${key.slice(0, 60)}`);
          seen.add(key);
        });
      });
      return out;
    });
    expect(repeats).toEqual([]);
  });

  // ---- 9.4 progressive paint ----------------------------------------------

  /**
   * Counts come from the in-memory index and cost no file reads; context needs
   * a read and a parse per source. The header must therefore be complete before
   * any group is, which is the whole point of D-G — and a reader must never see
   * fabricated structure while waiting.
   */
  it('paints counts before context, and never fabricates rows while resolving', async function () {
    await h.openNote(HUB);
    await ensureOutlineMode(HUB);

    // Caught as early as the widget exists, before groups have resolved.
    await browser.executeObsidian(() => {
      const scroller = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });

    const first = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      if (!root) return null;
      return {
        totals: root.querySelector('.to-backlinks-totals')?.textContent ?? '',
        resolving: root.querySelectorAll('.to-backlinks-resolving').length,
        rows: root.querySelectorAll('.to-backlinks-row').length,
      };
    });

    if (first) {
      // Whatever the timing caught, the totals are already real.
      expect(first.totals).toMatch(/\d+ reference/);
      // A resolving group shows a resolving line and NO rows — never a
      // skeleton pretending to be structure.
      if (first.resolving > 0) expect(first.rows).toBe(0);
    }

    await scrollToEnd();
    const settled = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      return {
        resolving: root?.querySelectorAll('.to-backlinks-resolving').length ?? -1,
        rows: root?.querySelectorAll('.to-backlinks-row').length ?? -1,
      };
    });
    expect(settled.resolving).toBe(0);
    expect(settled.rows).toBeGreaterThan(0);
  });

  // ---- the gap the review found -------------------------------------------

  /**
   * A rendered link inside a mention belongs to the link, not to the row.
   * Reported in review: the row's own handler fired for clicks already handled
   * inside it, so following a `[[link]]` in a mention opened the SOURCE note
   * instead of the link's target — the opposite of what was clicked.
   */
  it('follows a link inside a mention to the link’s own target', async function () {
    await openFooter(TARGET);
    const linkSel = `${FOOTER} .to-backlinks-row.is-reference a.internal-link`;
    const href = await (await $(linkSel)).getAttribute('data-href');
    expect(href).toBeTruthy();

    await h.clickClear(linkSel);
    await browser.pause(600);

    const opened = await browser.executeObsidian(
      ({ app }) =>
        (app as unknown as { workspace: { getActiveFile(): { basename: string } | null } }).workspace
          .getActiveFile()?.basename ?? '',
    );
    // The link's target, not the note the row came from.
    expect(opened).toBe(href);
  });

  /**
   * The fold marks the node it belongs to. Reported in review: expansion was
   * stored by `fact.lineNumber`, which is 0 for every synthetic fact, so a
   * descendant row's chevron marked nothing and revealed nothing.
   */
  it('reveals hidden descendants when a row’s fold is used', async function () {
    await openFooter(TARGET);
    expect(await (await $(`${FOOTER} .to-backlinks-fold`)).isExisting()).toBe(true);

    const before = (await rows()).length;
    await h.clickClear(`${FOOTER} .to-backlinks-fold`);
    await browser.pause(400);
    const after = (await rows()).length;

    expect(after).toBeGreaterThan(before);
  });

  /**
   * The index answers about the vault as it is now. Reported in review: a
   * deletion updated the reverse map but left the group on screen, because
   * nothing repainted.
   */
  it('drops a source’s group when that source stops referencing', async function () {
    await openFooter(TARGET);
    const groupsBefore = await browser.executeObsidian(
      () =>
        document.querySelectorAll('.workspace-leaf.mod-active .to-backlinks-group').length,
    );
    expect(groupsBefore).toBeGreaterThan(1);

    // Strip the references out of one source and let the cache settle.
    const source = 'Backlinks/Family tree.md';
    const restore = await browser.executeObsidian(async ({ app }, path: string) => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!file || !('stat' in file)) return '';
      const text = await app.vault.read(file as never);
      await app.vault.modify(file as never, text.replace(/\[\[Reference target\]\]/g, 'nothing'));
      return text;
    }, source);

    try {
      await browser.waitUntil(
        async () =>
          (await browser.executeObsidian(
            () =>
              document.querySelectorAll('.workspace-leaf.mod-active .to-backlinks-group').length,
          )) < groupsBefore,
        { timeout: 8000, timeoutMsg: 'the group never went away' },
      );
    } finally {
      // Put the fixture back. A test that mutates the vault and leaves it
      // mutated makes every later test in the file depend on whether this one
      // passed.
      if (restore) {
        await browser.executeObsidian(
          async ({ app }, [path, text]: [string, string]) => {
            const file = app.vault.getAbstractFileByPath(path);
            if (file && 'stat' in file) await app.vault.modify(file as never, text);
          },
          [source, restore] as [string, string],
        );
      }
    }
  });

/**
   * The promise, not the mechanism: rename a source and the footer says so,
   * without being touched.
   *
   * `72-backlink-index` covers the same rename by asking the INDEX, which is a
   * different question and the one that already had the right answer — the gap
   * that once let a deleted source keep its card on a green suite.
   *
   * NOT a negative control for the `repaintFooters()` call in the rename
   * handler: this passes with that line removed, because a rename re-resolves
   * every other note's links and the `resolved` handler repaints. Review
   * believed otherwise and it was worth measuring. What the test does pin is the
   * user-visible promise, which would survive only one of those two paths
   * disappearing.
   */
  it('repaints a mounted footer when a source is renamed', async function () {
    const from = 'Backlinks/Family tree.md';
    const to = 'Backlinks/Family tree renamed.md';
    const nameOf = (path: string): string => path.split('/').pop()!.replace(/\.md$/, '');

    await openFooter(TARGET);

    const groupNames = (): Promise<string[]> =>
      browser.executeObsidian(() =>
        Array.from(
          document.querySelectorAll('.workspace-leaf.mod-active .to-backlinks-group-name'),
        ).map((el) => el.textContent ?? ''),
      );

    expect(await groupNames()).toContain(nameOf(from));

    const renamed = await browser.executeObsidian(
      async ({ app }, [a, b]: [string, string]) => {
        const file = app.vault.getAbstractFileByPath(a);
        if (!file) return false;
        await app.fileManager.renameFile(file, b);
        return true;
      },
      [from, to] as [string, string],
    );
    expect(renamed).toBe(true);

    try {
      // No scroll, no click, no toggle — the footer has to repaint on its own.
      // A `waitUntil` rather than a fixed pause: the repaint is a render, and
      // what is asserted is that it happens at all, not how fast.
      await browser.waitUntil(async () => (await groupNames()).includes(nameOf(to)), {
        timeout: 8000,
        timeoutMsg: 'the footer kept naming the source by its old path',
      });
      expect(await groupNames()).not.toContain(nameOf(from));
    } finally {
      // Put the fixture back, so no later test depends on this one passing.
      await browser.executeObsidian(
        async ({ app }, [a, b]: [string, string]) => {
          const file = app.vault.getAbstractFileByPath(a);
          if (file) await app.fileManager.renameFile(file, b);
        },
        [to, from] as [string, string],
      );
      await browser.pause(500);
    }
  });

  it('shows no footer chrome for a note nothing links to, beyond its own header', async function () {
    await openFooter(DORMANT);
    const shape = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      if (!root) return null;
      return {
        dormant: root.classList.contains('is-dormant'),
        groups: root.querySelectorAll('.to-backlinks-group').length,
        totals: root.querySelector('.to-backlinks-totals')?.textContent ?? '',
      };
    });
    expect(shape).not.toBeNull();
    expect(shape!.dormant).toBe(true);
    expect(shape!.groups).toBe(0);
    expect(shape!.totals).toContain('0 references');
  });

  it('leaves a note with no outline mode alone entirely', async function () {
    await h.openNote(DEEP_SOURCE);
    if (await h.isOutlineMode(DEEP_SOURCE)) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode off');
      await h.dismissNotices();
    }
    await scrollToEnd();
    expect(await footerExists()).toBe(false);
  });

  /**
   * The one requirement the 10.2 coverage audit found with no test at all: a
   * long group is truncated, and says so.
   *
   * Only measurable on a group that actually overflows. Not the hub fixture,
   * counter-intuitively: it is broad rather than deep — 120 notes contributing a
   * few references each — so every one of its groups fits. The corpus's tallest
   * single group is `Kinds gallery`, one reference per node kind under
   * `Reference target`. The cap is a HEIGHT (`--to-backlinks-group-max`),
   * so "truncated" is a scrollHeight/clientHeight fact rather than a row count,
   * and the control is only offered when more than one line is hidden — an
   * offer to reveal a margin's rounding is a promise it cannot keep.
   *
   * The FADE is not asserted here. It is a gradient over a card's bottom edge,
   * and nothing available to this harness distinguishes it from its absence;
   * it was read on screen in the 9.5 real-vault pass, both themes.
   */
  it('offers a cap control on a group too long to fit, and honours it', async function () {
    await openFooter(TARGET);

    /** The state of the first group whose body overflows its cap. */
    const capState = (): Promise<{
      name: string;
      hidden: number;
      height: number;
      toggles: number;
      expanded: string;
      label: string;
    } | null> =>
      browser.executeObsidian(() => {
        const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
        if (!root) return null;
        const toggle = root.querySelector<HTMLElement>('.to-backlinks-more');
        const card = toggle?.closest('.to-backlinks-group');
        if (!toggle || !card) return null;
        const body = card.querySelector('.to-backlinks-rows');
        return {
          name: card.querySelector('.to-backlinks-group-name')?.textContent ?? '',
          hidden: body ? body.scrollHeight - body.clientHeight : 0,
          height: body?.getBoundingClientRect().height ?? 0,
          toggles: root.querySelectorAll('.to-backlinks-more').length,
          expanded: toggle.getAttribute('aria-expanded') ?? '',
          label: toggle.getAttribute('aria-label') ?? '',
        };
      });

    const before = await capState();
    // The corpus is fixed; if it ever stops producing a group past the cap this
    // must fail rather than pass by finding nothing to check.
    expect(before).not.toBeNull();
    expect(before!.hidden).toBeGreaterThan(0);
    expect(before!.expanded).toBe('false');
    // The control is the omission rung: it says HOW MANY it is hiding, counted
    // off the same measurement that decided the cap was hiding anything at all
    // (backlinks-controls design D3). A bare "Show more" is the regression.
    expect(before!.label).toMatch(/^Show \d+ more$/);

    // Resolved at click time rather than stamped earlier: measuring the cap
    // rebuilds the footer, so an attribute set before the measurement is gone by
    // the time the control exists.
    await h.clickClear(`${FOOTER} .to-backlinks-more`);
    await browser.pause(400);

    const after = await capState();
    expect(after).not.toBeNull();
    expect(after!.name).toBe(before!.name);
    expect(after!.height).toBeGreaterThan(before!.height);
    expect(after!.expanded).toBe('true');
    // The control must SURVIVE being used. An expanded group no longer
    // overflows, so without the `truncatable` set there would be nothing to tell
    // it from one that always fitted, and the way back would vanish.
    expect(after!.label).toBe('Show less');

    // Put it back, so a later test does not inherit an expanded group.
    await h.clickClear(`${FOOTER} .to-backlinks-more`);
    await browser.pause(300);
  });

  /**
   * Reported from real use: the last row of a group cut horizontally through its
   * glyphs, with no fade and no control — which reads as a rendering bug because
   * it is one.
   *
   * The cause was the cap's own threshold. Below one line of overflow it
   * correctly declined to offer a control ("an overflow that small is a margin
   * rounding out") and then left the CLIP in place, so 16px of a 24px line was
   * sliced off eleven groups of the hub fixture at once. The conclusion about the
   * control was right; the conclusion about hiding was not.
   *
   * Stated as the invariant rather than as the arithmetic: a row is never cut
   * through unless the group is visibly offering the rest. That holds however the
   * threshold is later tuned, and it is what a reader actually sees.
   */
  it('never cuts a row in half without offering the rest', async function () {
    await openFooter(HUB);

    const groups = await browser.executeObsidian(() => {
      const cards = document.querySelectorAll('.workspace-leaf.mod-active .to-backlinks-group');
      return Array.from(cards).map((card) => {
        const body = card.querySelector('.to-backlinks-rows');
        const name = card.querySelector('.to-backlinks-group-name')?.textContent ?? '';
        if (!body) return { name, sliced: 0, truncated: false, hasControl: false };
        const edge = body.getBoundingClientRect().bottom;
        return {
          name,
          // Rows the body's own bottom edge passes THROUGH: starting above it and
          // ending below. Half a pixel of tolerance, since a row that merely ends
          // flush with the edge is not cut.
          sliced: Array.from(body.querySelectorAll('.to-backlinks-row')).filter((r) => {
            const rb = r.getBoundingClientRect();
            return rb.top < edge - 0.5 && rb.bottom > edge + 0.5;
          }).length,
          truncated: body.classList.contains('is-truncated'),
          hasControl: card.querySelector('.to-backlinks-more') !== null,
        };
      });
    });

    expect(groups.length).toBeGreaterThan(0);
    const bad = groups.filter((g) => g.sliced > 0 && !(g.truncated && g.hasControl));
    // Named, so a failure says which group rather than only how many.
    expect(bad.map((g) => g.name)).toEqual([]);
  });

  /**
   * The second gap the 10.2 audit found: the embed TAG had no rendering
   * coverage anywhere — `72-backlink-index` asserts the classification, and
   * nothing asserted that the classification reaches the row.
   *
   * `Backlinks/Severity study writeup.md` carries both kinds against the same
   * target: a frontmatter property link and an `![[...#Current sprint]]` embed.
   * So the contrast is inside one group, and a bug that tagged everything or
   * nothing cannot pass.
   */
  it('marks an embed reference as one, and leaves a plain reference unmarked', async function () {
    await openFooter(HUB);

    const shape = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      if (!root) return null;
      const rows = Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-row'));
      return {
        total: rows.length,
        tagged: rows.filter((r) => r.querySelector('.to-backlinks-tag')).length,
        tagText: [
          ...new Set(
            rows
              .map((r) => r.querySelector('.to-backlinks-tag')?.textContent ?? '')
              .filter(Boolean),
          ),
        ],
        // A tag belongs to a reference row, never to a lineage row.
        onLineage: rows.filter(
          (r) => r.classList.contains('is-lineage') && r.querySelector('.to-backlinks-tag'),
        ).length,
      };
    });

    expect(shape).not.toBeNull();
    expect(shape!.total).toBeGreaterThan(0);
    // At least one embed in the corpus, and not every row — the second half is
    // what a "tag everything" bug fails.
    expect(shape!.tagged).toBeGreaterThan(0);
    expect(shape!.tagged).toBeLessThan(shape!.total);
    expect(shape!.tagText).toEqual(['embed']);
    expect(shape!.onLineage).toBe(0);
  });

  /**
   * Review found this: `htmlTextOf` says it leaves entities "to the DOM", but
   * the DOM never saw them — `setText` writes textContent, which escapes rather
   * than decodes, so `A &amp; B` displayed the source of the ampersand.
   *
   * Asserted on the RENDERED text, which is the only place the bug was visible:
   * the model's string legitimately still carries `&amp;`.
   */
  it('shows an HTML block’s entities as characters, not as their source', async function () {
    await openFooter(TARGET);
    const text = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      const row = Array.from(root?.querySelectorAll('.to-backlinks-row') ?? []).find((r) =>
        (r.textContent ?? '').includes('An HTML block mentions'),
      );
      return row?.textContent ?? '<no html row>';
    });
    expect(text).toContain('An HTML block mentions');
    expect(text).toContain('& entities');
    expect(text).not.toContain('&amp;');
  });

  /**
   * Review found this: a node row was clickable and nothing else. A keyboard-only
   * reader could tab to the links inside a mention — which open the LINK's own
   * target — and had no way at all to reach what the row is for, the referencing
   * node. Lineage segments already carried this; node rows did not.
   */
  it('opens a reference from the keyboard, not only from a click', async function () {
    await openFooter(HUB);

    const focused = await browser.executeObsidian((_ctx, groupName: string) => {
      const cards = document.querySelectorAll('.workspace-leaf.mod-active .to-backlinks-group');
      for (const card of Array.from(cards)) {
        if (card.querySelector('.to-backlinks-group-name')?.textContent !== groupName) continue;
        const rows = card.querySelectorAll<HTMLElement>('.to-backlinks-row');
        const row = rows[rows.length - 1];
        if (!row) return null;
        return {
          role: row.getAttribute('role'),
          tabIndex: row.tabIndex,
          // Focused directly: tabbing there from the editor would cross every
          // row above it, and what is under test is the row, not the tab order.
          ok: (row.focus(), document.activeElement === row),
        };
      }
      return null;
    }, 'Deep chain');

    expect(focused).not.toBeNull();
    expect(focused!.role).toBe('link');
    expect(focused!.tabIndex).toBe(0);
    expect(focused!.ok).toBe(true);

    await browser.keys('Enter');
    await browser.pause(700);

    expect(await browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path ?? '')).toBe(
      DEEP_SOURCE,
    );
    // At the node, the same as a click — the keyboard path is the same promise.
    expect((await h.getCursor()).line).toBe(7);
  });

  /**
   * The same promise for a lineage segment, which shipped with `role="link"` and
   * a tab stop and was INERT: its handler prevented the default before calling
   * `open`, whose first guard is `defaultPrevented` — so it vetoed its own call.
   * A focusable control that does nothing is worse than one you cannot reach,
   * and only a keyboard test could see it.
   */
  it('opens a lineage segment from the keyboard', async function () {
    await openFooter(HUB);

    const ready = await browser.executeObsidian((_ctx, groupName: string) => {
      const cards = document.querySelectorAll('.workspace-leaf.mod-active .to-backlinks-group');
      for (const card of Array.from(cards)) {
        if (card.querySelector('.to-backlinks-group-name')?.textContent !== groupName) continue;
        const segs = card.querySelectorAll<HTMLElement>('.to-backlinks-row.is-lineage .to-backlinks-seg');
        const last = segs[segs.length - 1];
        if (!last) return null;
        last.focus();
        return { count: segs.length, focused: document.activeElement === last };
      }
      return null;
    }, 'Deep chain');

    expect(ready).not.toBeNull();
    expect(ready!.count).toBeGreaterThan(1);
    expect(ready!.focused).toBe(true);

    await browser.keys('Enter');
    await browser.pause(700);

    expect(await browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path ?? '')).toBe(
      DEEP_SOURCE,
    );
    // The chain's LAST ancestor, line 6 — the same answer its click gives.
    expect((await h.getCursor()).line).toBe(6);
  });

  // ---- 9b.3 navigation's remaining promises -------------------------------

  /**
   * `Backlinks/Deep chain.md` is the fixture that can tell these apart. Its one
   * reference sits on line 7 under a five-element chain whose elements are on
   * lines 0, 2, 3, 4 and 6 — so "opened the note" (line 0), "opened at the
   * reference" (7) and "opened at THIS ancestor" (0, 2, 3, 4, 6) are all
   * different answers. A shallow fixture would score every one of them correct.
   */
  const DEEP_GROUP = 'Deep chain';

  /** The rows of one named group in the open footer, as element indices. */
  async function groupRowCount(name: string): Promise<number> {
    return browser.executeObsidian((_ctx, groupName: string) => {
      const cards = document.querySelectorAll('.workspace-leaf.mod-active .to-backlinks-group');
      for (const card of Array.from(cards)) {
        if (card.querySelector('.to-backlinks-group-name')?.textContent !== groupName) continue;
        return card.querySelectorAll('.to-backlinks-row').length;
      }
      return 0;
    }, name);
  }

  /**
   * A viewport point inside the nth row of a named group — or inside the nth
   * lineage segment of that row — that lies on text no link or button owns.
   *
   * Not the element's centre. A reference row wraps on a narrow viewport and its
   * centre then lands on the `[[link]]` its text ends with, where `open`
   * correctly declines to act because a nested link owns its own click. The
   * row-level handler is what these tests are about.
   *
   * The point comes from the FIRST client rect of that text, never its bounding
   * rect: a text node that wraps has a union rect whose centre sits between its
   * lines and outside its own glyphs, which clicked the neighbouring segment and
   * opened the wrong ancestor.
   *
   * Computed AFTER scrolling, so the coordinates are the ones the pointer will
   * actually use. Diagnosed from a mobile failure screenshot rather than reasoned
   * about — the numbers said only that nothing had navigated.
   */
  async function pointInGroup(
    name: string,
    rowIndex: number,
    segmentIndex?: number,
  ): Promise<{ x: number; y: number }> {
    // Cleared first, not only on the way out: a test that fails before its own
    // cleanup leaves this attribute behind, and the next `querySelector` matches
    // THAT element — detached, zero-sized, and failing for a reason belonging to
    // another test. One real failure looked like three.
    await clearTargets();

    const stamped = await browser.executeObsidian(
      (_ctx, args: { groupName: string; row: number; seg: number }) => {
        const cards = document.querySelectorAll('.workspace-leaf.mod-active .to-backlinks-group');
        for (const card of Array.from(cards)) {
          if (card.querySelector('.to-backlinks-group-name')?.textContent !== args.groupName)
            continue;
          const row = card.querySelectorAll<HTMLElement>('.to-backlinks-row')[args.row];
          if (!row) return false;
          const el =
            args.seg >= 0
              ? row.querySelectorAll<HTMLElement>('.to-backlinks-seg')[args.seg]
              : row;
          if (!el) return false;
          el.setAttribute('data-e2e-target', 'yes');
          return true;
        }
        return false;
      },
      { groupName: name, row: rowIndex, seg: segmentIndex ?? -1 },
    );
    expect(stamped).toBe(true);

    await (await $('[data-e2e-target="yes"]')).scrollIntoView({ block: 'center' });
    await browser.pause(150);

    const point = await browser.executeObsidian(() => {
      const el = document.querySelector<HTMLElement>('[data-e2e-target="yes"]');
      if (!el) return null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!node.textContent?.trim() || !parent || parent.closest('a, button')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const r = range.getClientRects()[0];
        if (!r || r.width <= 0 || r.height <= 0) continue;
        // Near the start of the run, so a long one that wraps around a link
        // cannot put the point past it.
        const x = r.left + Math.min(r.width / 2, 20);
        const y = r.top + r.height / 2;
        // Only if the pointer would actually reach this element.
        const at = document.elementFromPoint(x, y);
        if (at && (at === el || el.contains(at))) return { x, y };
      }
      return null;
    });

    expect(point).not.toBeNull();
    return point!;
  }

  async function clearTargets(): Promise<void> {
    await browser.executeObsidian(() => {
      document
        .querySelectorAll('[data-e2e-target]')
        .forEach((el) => el.removeAttribute('data-e2e-target'));
    });
  }

  it('opens a reference at its own node, not at the top of its note', async function () {
    await openFooter(HUB);
    const count = await groupRowCount(DEEP_GROUP);
    expect(count).toBeGreaterThan(1);

    // The LAST row of the group is the reference; the rows above it are its
    // lineage. Taken by position rather than by class so the assertion does not
    // depend on how the reference row happens to be marked.
    const spot = await pointInGroup(DEEP_GROUP, count - 1);
    await h.clickAtPoint(spot.x, spot.y);
    await browser.pause(700);

    const opened = await browser.executeObsidian(
      ({ app }) => app.workspace.getActiveFile()?.path ?? '',
    );
    expect(opened).toBe(DEEP_SOURCE);
    // Line 7: the node the reference is in. Line 0 would mean "opened the note".
    expect((await h.getCursor()).line).toBe(7);
    await clearTargets();
  });

  it('opens a lineage segment at THAT ancestor, not at the chain’s first', async function () {
    await openFooter(HUB);
    const count = await groupRowCount(DEEP_GROUP);
    expect(count).toBeGreaterThan(1);

    // The chain's LAST element, which is the one a whole-row handler could not
    // reach: it and the first element differ, so landing on either proves which
    // handler ran.
    const segments = await browser.executeObsidian((_ctx, groupName: string) => {
      const cards = document.querySelectorAll('.workspace-leaf.mod-active .to-backlinks-group');
      for (const card of Array.from(cards)) {
        if (card.querySelector('.to-backlinks-group-name')?.textContent !== groupName) continue;
        const row = card.querySelector('.to-backlinks-row.is-lineage');
        return row?.querySelectorAll('.to-backlinks-seg').length ?? 0;
      }
      return 0;
    }, DEEP_GROUP);
    expect(segments).toBeGreaterThan(1);

    const last = await pointInGroup(DEEP_GROUP, 0, segments - 1);
    await h.clickAtPoint(last.x, last.y);
    await browser.pause(700);
    expect(await browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path ?? '')).toBe(
      DEEP_SOURCE,
    );
    // Line 6 — the chain's last ancestor. Line 0 would be its first, which is
    // what a row-level handler or a first-segment default would give.
    expect((await h.getCursor()).line).toBe(6);
    await clearTargets();

    // And the FIRST segment lands somewhere else, so the previous assertion is
    // about the segment clicked rather than about the row.
    await openFooter(HUB);
    const first = await pointInGroup(DEEP_GROUP, 0, 0);
    await h.clickAtPoint(first.x, first.y);
    await browser.pause(700);
    expect((await h.getCursor()).line).toBe(0);
    await clearTargets();
  });

  it('opens a new pane on Mod-click, leaving the current one alone', async function () {
    await openFooter(HUB);
    const before = await browser.executeObsidian(
      ({ app }) => app.workspace.getLeavesOfType('markdown').length,
    );
    const count = await groupRowCount(DEEP_GROUP);

    // The same targeting as a plain click — a row's centre lands on its link.
    const spot = await pointInGroup(DEEP_GROUP, count - 1);
    await h.modClickAt(spot.x, spot.y);
    await browser.pause(800);

    const after = await browser.executeObsidian(
      ({ app }) => app.workspace.getLeavesOfType('markdown').length,
    );
    // Without the modifier this same click navigates and REUSES the pane, so the
    // leaf count is what isolates the modifier's effect (checked by dropping the
    // key from the chain: 15 -> 15, and the note still opens).
    expect(after).toBe(before + 1);
    expect(await browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path ?? '')).toBe(
      DEEP_SOURCE,
    );
    await clearTargets();
  });
});
