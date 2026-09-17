/**
 * The search palette in a real Obsidian: what it shows, how the keyboard moves
 * through it, and where a reader ends up when they choose a hit.
 *
 * The three things only a live app can answer, and the reason this spec exists
 * rather than more unit tests around `vault-search.ts`:
 *
 * - the rows are drawn by the same renderer the backlinks footer uses, and
 *   whether that renderer produces the right SHAPE here is a DOM question;
 * - the landing opens a note through the workspace and zooms it through the
 *   view registry, neither of which exists outside the app;
 * - the painting is progressive, so what a reader sees mid-sweep is a timing
 *   question a fake vault cannot pose.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import * as p from '../search-palette.js';

/** A note with two hits under one heading, and a third under another. */
const TWO_ARMS = 'Scratch/palette-two-arms.md';
/** A hit with children, and a childless hit under a parent. */
const SHAPES = 'Scratch/palette-shapes.md';
/** A childless hit at the top level, which needs a note with no heading over
 * it: a heading OWNS the list that follows it, so a bullet under one has that
 * heading as its parent and a parent is all the zoom rule needs. */
const ROOTLESS = 'Scratch/palette-rootless.md';
/** A hit inside a code fence, past its first line. */
const FENCE = 'Scratch/palette-fence.md';
/** No hits at all, and the note the narrowed scope is taken from. */
const QUIET = 'Scratch/palette-quiet.md';

const TERM = 'zarquon';

describe('search palette', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();

    await h.createNote(
      TWO_ARMS,
      [
        '# Two arms',
        '',
        '## Planning',
        '',
        '- open questions',
        `    - keep the ${TERM} on hover only`,
        `    - ${TERM}: undecided`,
        '',
        '## Review',
        '',
        `- drag ${TERM} need a bigger target`,
        '',
      ].join('\n'),
    );
    await h.createNote(
      SHAPES,
      [
        '# Shapes',
        '',
        `- ${TERM} parent`,
        '    - a child of it',
        `- ${TERM} leaf under a parent`,
        '',
      ].join('\n'),
    );
    await h.createNote(
      ROOTLESS,
      [`- ${TERM} alone at the top`, '- a sibling that does not match', ''].join('\n'),
    );
    await h.createNote(
      FENCE,
      ['# Fence', '', '```js', 'const a = 1;', 'const b = 2;', `const c = '${TERM}';`, '```', ''].join(
        '\n',
      ),
    );
    await h.createNote(QUIET, ['# Quiet', '', '- nothing to find here', ''].join('\n'));
    await h.waitForMetadataCache();
  });

  afterEach(async function () {
    await p.closePalette();
  });

  describe('opening', function () {
    it('is offered outside outline mode, and from a note that is not in it', async function () {
      await h.openNote(QUIET);
      await h.setOutlineMode(false);
      // Search is navigation, not a structural edit, so the mode gate the
      // structural commands take does not apply to it.
      expect(await h.commandRegistered('search-outline')).toBe(true);
      await p.openPalette();
      expect(await p.paletteOpen()).toBe(true);
    });

    it('takes the caret, so typing edits the query without a click', async function () {
      await h.openNote(QUIET);
      await p.openPalette();
      await browser.keys(['a', 'b']);
      const typed = await browser.executeObsidian(
        () => (document.querySelector('.to-search-palette .prompt-input') as HTMLInputElement)?.value,
      );
      expect(typed).toBe('ab');
    });

    it('says nothing about matches below the query floor', async function () {
      await h.openNote(QUIET);
      await p.openPalette();
      await p.search('z');
      expect(await p.hitTexts()).toEqual([]);
      // Not "No matches.": one character has not been searched for, and saying
      // there are none would be answering a question nobody asked.
      expect(await p.stateLine()).toBe('');
    });

    it('says so once a real query finds nothing', async function () {
      await h.openNote(QUIET);
      await p.openPalette();
      await p.search('quixotically');
      expect(await p.stateLine()).toBe('No matches.');
    });
  });

  describe('what it shows', function () {
    beforeEach(async function () {
      await h.openNote(QUIET);
      await p.openPalette();
      await p.search(TERM);
    });

    it('groups hits by note, under the lineage that leads to them', async function () {
      const rows = await p.rows();
      expect(rows.some((r) => r.startsWith('group-head'))).toBe(true);
      expect(rows.some((r) => r.startsWith('row+is-lineage'))).toBe(true);
      expect(rows.some((r) => r.startsWith('row+is-hit'))).toBe(true);
    });

    it('shares an ancestor between two hits under it', async function () {
      const rows = await p.rows();
      const planning = rows.filter((r) => r.includes('Planning'));
      // One lineage row for the heading, above both of its hits, rather than
      // the heading repeated over each.
      expect(planning).toHaveLength(1);
    });

    it('shows no children of a hit, and no fold control', async function () {
      const rows = await p.rows();
      expect(rows.some((r) => r.includes('a child of it'))).toBe(false);
      const folds = await browser.executeObsidian(
        () => document.querySelectorAll('.to-search-palette .to-lineage-fold').length,
      );
      expect(folds).toBe(0);
    });

    it('marks every occurrence of the term', async function () {
      const marks = await p.marks();
      expect(marks.length).toBeGreaterThan(0);
      for (const mark of marks) expect(mark.toLowerCase()).toContain(TERM);
    });

    it('shows the fence line the term is on, marked', async function () {
      const rows = await p.rows();
      const fenceRow = rows.find((r) => r.includes(TERM) && r.includes('const'));
      // Without the hit carrying its line, the row renders `const a = 1;` — the
      // fence's first non-fence line — and nothing in it is marked.
      expect(fenceRow).toBeDefined();
      expect(fenceRow).toContain(TERM);
    });

    it('orders groups by modification time, most recent first', async function () {
      const names = await p.groupNames();
      expect(names.length).toBeGreaterThan(1);
      // The order is taken before any tree resolves, so what is on screen is
      // already final rather than whatever finished reading first.
      const mtimes = await browser.executeObsidian(
        ({ app }, shown: string[]) =>
          shown.map(
            (name) =>
              app.vault.getMarkdownFiles().find((file) => file.basename === name)?.stat.mtime ?? 0,
          ),
        names,
      );
      const sorted = [...mtimes].sort((a, b) => b - a);
      expect(mtimes).toEqual(sorted);
    });
  });

  describe('the keyboard', function () {
    beforeEach(async function () {
      await h.openNote(QUIET);
      await p.openPalette();
      await p.search(TERM);
    });

    it('starts on the first hit, and announces it', async function () {
      expect(await p.activeIsAnnounced()).toBe(true);
      const hits = await p.hitTexts();
      expect(await p.activeHit()).toBe(hits[0]);
    });

    it('moves between hits, across a group boundary', async function () {
      const hits = await p.hitTexts();
      for (let i = 1; i < hits.length; i += 1) {
        await browser.keys(['ArrowDown']);
        expect(await p.activeHit()).toBe(hits[i]);
      }
    });

    it('stops at the last hit rather than returning to the first', async function () {
      const hits = await p.hitTexts();
      for (let i = 0; i < hits.length + 3; i += 1) await browser.keys(['ArrowDown']);
      expect(await p.activeHit()).toBe(hits[hits.length - 1]);
    });

    it('stops at the first hit going the other way', async function () {
      const hits = await p.hitTexts();
      await browser.keys(['ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp']);
      expect(await p.activeHit()).toBe(hits[0]);
    });

    it('keeps focus in the query field throughout', async function () {
      await browser.keys(['ArrowDown', 'ArrowDown']);
      await browser.keys(['!']);
      const typed = await browser.executeObsidian(
        () => (document.querySelector('.to-search-palette .prompt-input') as HTMLInputElement)?.value,
      );
      expect(typed).toBe(`${TERM}!`);
    });
  });

  describe('the scope', function () {
    it('offers the note it was opened from, in both states', async function () {
      await h.openNote(TWO_ARMS);
      await p.openPalette();
      // An offer rather than a label: the default scope is the vault, and the
      // control says what pressing it would do.
      expect(await p.scopeLabel()).toContain('This note');
      await p.clickScope();
      expect(await p.scopeLabel()).toContain('palette-two-arms');
    });

    it('narrows to that note and back, keeping the query', async function () {
      await h.openNote(TWO_ARMS);
      await p.openPalette();
      await p.search(TERM);
      const everywhere = await p.groupNames();

      await browser.keys(['Tab']);
      await p.settled();
      expect(await p.groupNames()).toEqual(['palette-two-arms']);

      await browser.keys(['Tab']);
      await p.settled();
      expect(await p.groupNames()).toEqual(everywhere);
    });

    it('offers no scope control when it was not opened from a note', async function () {
      await browser.executeObsidian(({ app }) => {
        app.workspace.detachLeavesOfType('markdown');
      });
      await p.openPalette();
      // `getActiveFile()` would have answered with the most recently active
      // file here; the palette asks the active markdown VIEW instead.
      expect(await p.scopeLabel()).toBeNull();
    });
  });

  describe('on a phone', function () {
    // The emulated mobile config is the only place these mean anything: the
    // hints name keys a phone does not have, and the tap is the gesture that
    // replaces every one of them.
    before(function () {
      if (!h.IS_MOBILE_RUN) this.skip();
    });

    it('hides the key hints, which name keys there are none of', async function () {
      await h.openNote(QUIET);
      await p.openPalette();
      await p.search(TERM);
      const hintsShown = await browser.executeObsidian(() => {
        const el = document.querySelector('.to-search-palette .prompt-instructions');
        return el ? getComputedStyle(el).display !== 'none' : false;
      });
      expect(hintsShown).toBe(false);
    });

    it('keeps the scope control, which is the only way to switch without a key', async function () {
      await h.openNote(TWO_ARMS);
      await p.openPalette();
      // The hints are gone, so a chip that appeared only once narrowed would
      // leave no way into the narrowed scope at all.
      expect(await p.scopeLabel()).toContain('This note');
      await p.clickScope();
      expect(await p.scopeLabel()).toContain('palette-two-arms');
    });

    it('opens a hit on tap', async function () {
      await h.openNote(QUIET);
      await p.openPalette();
      await p.search(`${TERM} parent`);
      await browser.executeObsidian(() => {
        (document.querySelector('.to-search-palette .to-lineage-row.is-hit') as HTMLElement)?.click();
      });
      await browser.waitUntil(async () => !(await p.paletteOpen()), {
        timeout: h.waitBudget(6000),
        timeoutMsg: 'the palette stayed open after a tap',
      });
      expect((await p.landing()).path).toBe(SHAPES);
    });
  });

  describe('assistive technology', function () {
    it('is a combobox over a listbox of options', async function () {
      await h.openNote(QUIET);
      await p.openPalette();
      await p.search(TERM);
      const roles = await p.roles();
      expect(roles.combobox).toBe(true);
      expect(roles.listbox).toBe(true);
      expect(roles.options).toBe((await p.hitTexts()).length);
    });
  });

  describe('landing on a hit', function () {
    beforeEach(async function () {
      await h.openNote(QUIET);
      await h.setOutlineMode(true);
    });

    it('opens the note zoomed, with the caret on the hit', async function () {
      await p.openPalette();
      await p.search(`${TERM} parent`);
      await p.confirm();
      const landed = await p.landing();
      expect(landed.path).toBe(SHAPES);
      expect(landed.zoomed).toBe(true);
    });

    it('opens a childless hit zoomed to its parent', async function () {
      await p.openPalette();
      await p.search(`${TERM} leaf`);
      await p.confirm();
      const landed = await p.landing();
      // A zoomed view is never one line: the hit has no children of its own, so
      // the scope is the parent that gives it a place.
      expect(landed.path).toBe(SHAPES);
      expect(landed.zoomed).toBe(true);
    });

    it('opens a childless top-level hit unzoomed', async function () {
      await p.openPalette();
      await p.search(`${TERM} alone`);
      await p.confirm();
      const landed = await p.landing();
      // Nothing to zoom to that is more than the hit's own line, so the rule
      // that sent a leaf to its parent withholds the zoom entirely.
      expect(landed.path).toBe(ROOTLESS);
      expect(landed.zoomed).toBe(false);
    });

    it('opens the whole note when shift is held', async function () {
      await p.openPalette();
      await p.search(`${TERM} parent`);
      await p.confirm(['Shift']);
      const landed = await p.landing();
      expect(landed.path).toBe(SHAPES);
      expect(landed.zoomed).toBe(false);
    });

    it('opens unzoomed when the tab is not in outline mode', async function () {
      // Landed on first, so the tab is already showing this note: a tab's mode
      // dies when it changes notes — CM6 rebuilds the state — so setting it
      // before the note opened would be setting it on a state about to be
      // thrown away.
      await p.openPalette();
      await p.search(`${TERM} parent`);
      await p.confirm();
      await h.setOutlineMode(false);

      await p.openPalette();
      await p.search(`${TERM} leaf`);
      await p.confirm();
      const landed = await p.landing();
      expect(landed.path).toBe(SHAPES);
      expect(landed.zoomed).toBe(false);
    });

    it('opens a new tab under the platform’s modifier', async function () {
      const before = await p.tabCount();
      await p.openPalette();
      await p.search(`${TERM} parent`);
      await p.confirm(['Mod']);
      expect(await p.tabCount()).toBe(before + 1);
      expect((await p.landing()).path).toBe(SHAPES);
    });

    it('closes once a hit is confirmed', async function () {
      await p.openPalette();
      await p.search(`${TERM} parent`);
      await p.confirm();
      expect(await p.paletteOpen()).toBe(false);
    });
  });
});
