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
    await (await $(`${FOOTER} .to-backlinks-title`)).click();
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
      await (await $(`${FOOTER} .to-backlinks-title`)).click();
      await browser.pause(300);
      await (await $(`${FOOTER} .to-backlinks-title`)).click();
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
    const link = await $(`${FOOTER} .to-backlinks-row.is-reference a.internal-link`);
    const href = await link.getAttribute('data-href');
    expect(href).toBeTruthy();

    await link.click();
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
    const fold = await $(`${FOOTER} .to-backlinks-fold`);
    expect(await fold.isExisting()).toBe(true);

    const before = (await rows()).length;
    await fold.click();
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
});
