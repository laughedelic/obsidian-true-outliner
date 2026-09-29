/**
 * The footer while zoomed (`zoom-scoped-backlinks`): which references each
 * answer admits, the header control that chooses one, the empty answer, and
 * the anchors read from the document the editor holds.
 *
 * `Backlinks/Zoom target.md` carries the zoom scenarios at its top and the
 * block-id shapes of `docs/research/zoom-scoped-backlinks` below them; five
 * notes hold its twelve references, four of them to `## Current sprint` or an
 * id beneath it.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { anchorsOf } from '../../src/anchors';
import { parse } from '../../src/parse';
import {
  FOOTER,
  chooseFacetValue,
  clearFilters,
  clickIn,
  facetOptions,
  groupNames,
  openFilters,
  openFooter,
  pinBacklinksCapOff,
  readStable,
  resizeLeafForFooter,
  scrollToFooter,
  settle,
  waitForBacklinkIndexReady,
} from '../footer.js';

const TARGET = 'Backlinks/Zoom target.md';

/** Zoom into the node whose line holds `needle` — its `nth` occurrence,
 * counting from 0 — from no zoom. */
async function zoomInto(needle: string, nth = 0): Promise<void> {
  await h.runCommand('zoom-clear');
  const line = await browser.executeObsidian(
    ({ app, obsidian }, wanted: string, which: number) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      const hits = view.editor
        .getValue()
        .split('\n')
        .flatMap((text, i) => (text.includes(wanted) ? [i] : []));
      return hits[which] ?? -1;
    },
    needle,
    nth,
  );
  if (line < 0) throw new Error(`no line holds ${JSON.stringify(needle)}`);
  await h.setCursorSettled(line, 0);
  await h.runCommand('zoom-in');
  await browser.pause(200);
  await scrollToFooter();
}

async function zoomOut(): Promise<void> {
  await h.runCommand('zoom-clear');
  await browser.pause(200);
  await scrollToFooter();
}

interface Header {
  readonly title: string;
  readonly zoomed: boolean;
  /** The chip's answer and its words, or null with no chip. */
  readonly chip: { answer: string; label: string; name: string; expanded: string } | null;
  readonly totals: string;
}

function header(): Promise<Header> {
  return browser.executeObsidian(() => {
    const head = document.querySelector<HTMLElement>(
      '.workspace-leaf.mod-active .to-backlinks .to-backlinks-head',
    );
    const chip = head?.querySelector<HTMLElement>('.to-backlinks-scope-chip');
    return {
      title: head?.querySelector('.to-backlinks-title-full')?.textContent ?? '',
      zoomed: head?.classList.contains('is-zoomed') ?? false,
      chip: chip
        ? {
            answer: chip.dataset.answer ?? '',
            label: chip.querySelector('.to-backlinks-scope-label')?.textContent ?? '',
            name: chip.getAttribute('aria-label') ?? '',
            expanded: chip.getAttribute('aria-expanded') ?? '',
          }
        : null,
      totals: head?.querySelector('.to-backlinks-totals-full')?.textContent ?? '',
    };
  });
}

/** The header's totals, as numbers. */
async function totals(): Promise<{ references: number; notes: number }> {
  const text = (await header()).totals;
  const refs = /(\d+)\s+references?/.exec(text);
  const notes = /(\d+)\s+notes?/.exec(text);
  return { references: Number(refs?.[1] ?? NaN), notes: notes ? Number(notes[1]) : 0 };
}

interface Entry {
  readonly answer: string;
  readonly name: string;
  readonly count: string;
  readonly checked: string;
  readonly disabled: boolean;
  readonly reason: string;
}

function menuEntries(): Promise<Entry[]> {
  return browser.executeObsidian(() =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '.workspace-leaf.mod-active .to-backlinks-scope-option',
      ),
    ).map((o) => ({
      answer: o.dataset.answer ?? '',
      name: o.querySelector('.to-backlinks-facet-label')?.textContent ?? '',
      count: o.querySelector('.to-backlinks-scope-count')?.textContent ?? '',
      checked: o.getAttribute('aria-checked') ?? '',
      disabled: o.disabled,
      reason: o.querySelector('.to-backlinks-scope-reason')?.textContent ?? '',
    })),
  );
}

async function openScopeMenu(): Promise<void> {
  if ((await header()).chip?.expanded === 'true') return;
  await clickIn(`${FOOTER} .to-backlinks-scope-chip`);
  await settle();
}

/** Whether the chip is the form on screen: not on a phone, and not in a
 * footer narrower than its header's words, where the segments stand in. */
function chipShown(): Promise<boolean> {
  return browser.executeObsidian(() => {
    const chip = document.querySelector<HTMLElement>(
      '.workspace-leaf.mod-active .to-backlinks-scope-chip',
    );
    return !!chip && chip.getBoundingClientRect().width > 0;
  });
}

/** Choose an answer from whichever form of the control is on screen. */
async function chooseAnswer(answer: 'node' | 'branch' | 'note'): Promise<void> {
  if (await chipShown()) {
    await openScopeMenu();
    await clickIn(`${FOOTER} .to-backlinks-scope-option[data-answer="${answer}"]`);
  } else {
    await clickIn(`${FOOTER} .to-backlinks-scope-segment[data-answer="${answer}"]`);
  }
  await settle();
}

const stableGroups = (): Promise<string[]> => readStable(async () => (await groupNames()).sort());

/** Each answer's count as the control on screen offers it. */
async function answerCounts(): Promise<Record<string, string>> {
  if (!(await chipShown())) {
    return Object.fromEntries((await segments()).map((s) => [s.answer, s.count]));
  }
  await openScopeMenu();
  const entries = await menuEntries();
  await clickIn(`${FOOTER} .to-backlinks-scope-chip`);
  await settle();
  return Object.fromEntries(entries.map((e) => [e.answer, e.count]));
}

interface Segment {
  readonly answer: string;
  readonly checked: string;
  readonly disabled: boolean;
  readonly count: string;
  readonly name: string;
  readonly tabIndex: number;
}

function segments(): Promise<Segment[]> {
  return browser.executeObsidian(() =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '.workspace-leaf.mod-active .to-backlinks-scope-segment',
      ),
    ).map((b) => ({
      answer: b.dataset.answer ?? '',
      checked: b.getAttribute('aria-checked') ?? '',
      disabled: b.disabled,
      count: b.querySelector('.to-backlinks-scope-count')?.textContent ?? '',
      name: b.getAttribute('aria-label') ?? '',
      tabIndex: b.tabIndex,
    })),
  );
}

/** Whether each form of the control, and each form of the totals, is drawn. */
function visibleForms(): Promise<{
  chip: boolean;
  segments: boolean;
  totalsFull: boolean;
  totalsCompact: boolean;
}> {
  return browser.executeObsidian(() => {
    const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
    const shown = (sel: string): boolean => {
      const el = root?.querySelector<HTMLElement>(sel);
      return !!el && el.getBoundingClientRect().width > 0;
    };
    return {
      chip: shown('.to-backlinks-scope-chip'),
      segments: shown('.to-backlinks-scope-segments'),
      totalsFull: shown('.to-backlinks-head .to-backlinks-totals-full'),
      totalsCompact: shown('.to-backlinks-head .to-backlinks-totals-compact'),
    };
  });
}

/** Whether every child of the header sits on one row. */
function headerIsOneRow(): Promise<boolean> {
  return browser.executeObsidian(() => {
    const head = document.querySelector<HTMLElement>(
      '.workspace-leaf.mod-active .to-backlinks .to-backlinks-head',
    );
    if (!head) return false;
    const rects = Array.from(head.children)
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const tallest = Math.max(...rects.map((r) => r.height));
    return bottom - top <= tallest + 2;
  });
}

/** The line index of the first line holding `needle` in the active note. */
function lineOf(needle: string): Promise<number> {
  return browser.executeObsidian(({ app, obsidian }, wanted: string) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    return view?.editor.getValue().split('\n').findIndex((t) => t.includes(wanted)) ?? -1;
  }, needle);
}

describe('the footer while zoomed', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await pinBacklinksCapOff();
    await waitForBacklinkIndexReady(TARGET, 5);
    await openFooter(TARGET);
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  after(async function () {
    await h.runCommand('zoom-clear');
  });

  describe('which references each answer admits', function () {
    afterEach(async function () {
      await zoomOut();
    });

    it('answers for the zoomed view by default', async function () {
      await zoomInto('## Current sprint');
      expect(await stableGroups()).toEqual(['Atoms', 'Priya 1-1', 'Sprint log', 'Weekly review']);
      expect(await totals()).toEqual({ references: 4, notes: 4 });
    });

    it('leaves out what is below the node under This node', async function () {
      await zoomInto('## Current sprint');
      await chooseAnswer('node');
      expect(await stableGroups()).toEqual(['Atoms', 'Weekly review']);
      expect(await totals()).toEqual({ references: 2, notes: 2 });
      await chooseAnswer('branch');
    });

    it('answers for the note under Whole note, as with no zoom', async function () {
      const unzoomed = { groups: await stableGroups(), totals: await totals() };
      expect(unzoomed.totals).toEqual({ references: 12, notes: 5 });
      await zoomInto('## Current sprint');
      await chooseAnswer('note');
      expect(await stableGroups()).toEqual(unzoomed.groups);
      expect(await totals()).toEqual(unzoomed.totals);
      await chooseAnswer('branch');
    });

    it('admits an embed and a property by what they address', async function () {
      // `Priya 1-1` reaches the view only through an embed of `^mobile-triage`,
      // and `Atoms` only through a property naming `#Top#Current sprint`.
      await zoomInto('## Current sprint');
      const groups = await stableGroups();
      expect(groups).toContain('Priya 1-1');
      expect(groups).toContain('Atoms');
    });

    it('answers for the note where nothing in view can be linked to', async function () {
      await zoomInto('- Retro notes');
      expect((await header()).chip?.answer).toBe('note');
      expect(await totals()).toEqual({ references: 12, notes: 5 });
    });

    it('falls back to a wider answer without forgetting the narrower choice', async function () {
      await zoomInto('## Current sprint');
      await chooseAnswer('node');
      // No anchor on `Later ideas`, one on its child.
      await zoomInto('- Later ideas');
      expect((await header()).chip?.answer).toBe('branch');
      await zoomInto('- Alarm list ships');
      expect((await header()).chip?.answer).toBe('node');
      await chooseAnswer('branch');
    });

    it('keeps the choice across zooms into the same note', async function () {
      await zoomInto('## Current sprint');
      await chooseAnswer('note');
      await zoomOut();
      await zoomInto('- Alarm list ships');
      expect((await header()).chip?.answer).toBe('note');
      await chooseAnswer('branch');
    });

    it('answers for the note once the zoom is cleared', async function () {
      await zoomInto('## Current sprint');
      expect(await totals()).toEqual({ references: 4, notes: 4 });
      await zoomOut();
      expect(await totals()).toEqual({ references: 12, notes: 5 });
      expect((await header()).chip).toBeNull();
    });
  });

  describe('where an anchor belongs', function () {
    afterEach(async function () {
      await zoomOut();
    });

    it('matches a heading subpath as Obsidian does: case, alias and a nested path', async function () {
      // `#current sprint|the sprint` in Weekly review, `#Top#Current sprint` in Atoms.
      await zoomInto('## Current sprint');
      await chooseAnswer('node');
      expect(await stableGroups()).toEqual(['Atoms', 'Weekly review']);
      await chooseAnswer('branch');
    });

    it('resolves a duplicate heading to the first', async function () {
      await zoomInto('## Duplicate', 1);
      expect(await answerCounts()).toEqual({ node: '0', branch: '0', note: '12' });
      await zoomInto('## Duplicate', 0);
      expect((await answerCounts()).node).toBe('1');
    });

    it('gives an id under a table to the table', async function () {
      // From the id's own line: it is a line of the table, and the caret does
      // not stand on a table's rows.
      await zoomInto('^zt-table');
      expect((await answerCounts()).node).toBe('1');
    });

    it('gives an id under a list to its first item', async function () {
      await zoomInto('- second of list');
      expect((await header()).chip?.answer).toBe('note');
      await zoomInto('- first of list');
      expect((await answerCounts()).node).toBe('1');
    });

    it('gives an id inside a list item to the item', async function () {
      await zoomInto('- holder item');
      expect((await answerCounts()).node).toBe('1');
      await zoomInto('inner prose ^zt-inner');
      expect((await header()).chip?.answer).toBe('note');
    });

    it('names a block by the last of two ids', async function () {
      // Atoms links to both `^zt-k3` and `^zt-k4`; only the second is registered.
      await zoomInto('Lead. ^zt-k3');
      expect((await answerCounts()).node).toBe('1');
    });
  });

  describe('the answer comes before every filter', function () {
    afterEach(async function () {
      await clearFilters();
      await zoomOut();
    });

    it('offers only what the answer holds on the kind axis', async function () {
      await zoomInto('## Current sprint');
      await openFilters();
      const kinds = (await facetOptions('kind')).map((o) => o.label);
      expect(kinds).not.toContain('Note');
      expect(kinds).toContain('Anchor');
      await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="kind"]`);
    });

    it('does not read as a filter', async function () {
      await zoomInto('## Current sprint');
      const toggle = await browser.executeObsidian(() => {
        const el = document.querySelector('.workspace-leaf.mod-active .to-backlinks-filter-toggle');
        return { active: el?.classList.contains('is-active'), label: el?.getAttribute('aria-label') };
      });
      expect(toggle.active).toBe(false);
      expect(toggle.label).not.toContain('active');
    });

    it('is left alone by Reset', async function () {
      await zoomInto('## Current sprint');
      await openFilters();
      await facetOptions('kind');
      await chooseFacetValue('Embed');
      await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="kind"]`);
      await settle();
      expect(await totals()).toEqual({ references: 1, notes: 1 });
      await clearFilters();
      await settle();
      expect((await header()).chip?.answer).toBe('branch');
      expect(await totals()).toEqual({ references: 4, notes: 4 });
    });

    it('keeps a selection the answer does not carry, and applies it again unzoomed', async function () {
      await openFilters();
      await facetOptions('folder');
      await chooseFacetValue('Archive');
      await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="folder"]`);
      await settle();
      expect(await stableGroups()).toEqual(['Zoom archive']);

      await zoomInto('## Current sprint');
      await openFilters();
      const archive = (await facetOptions('folder')).find((o) => o.label === 'Archive');
      expect(archive).toMatchObject({ selected: true });
      await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="folder"]`);
      await zoomOut();
      expect(await stableGroups()).toEqual(['Zoom archive']);
    });
  });

  describe('the header', function () {
    afterEach(async function () {
      await resizeLeafForFooter(null);
      await zoomOut();
    });

    it('says what it counts', async function () {
      await zoomInto('## Current sprint');
      const head = await header();
      expect(head.title).toBe('Backlinks to');
      expect(head.chip).toMatchObject({ answer: 'branch', label: 'this branch' });
      expect(head.chip?.name).toBe('Backlinks to this branch');
      expect(head.totals).toBe('4 references · 4 notes');
    });

    it('offers all three with their counts, the one in force chosen', async function () {
      // A phone's footer shows the segments, never the chip and its menu.
      if (h.IS_MOBILE_RUN) this.skip();
      await zoomInto('## Current sprint');
      await openScopeMenu();
      expect(await menuEntries()).toEqual([
        { answer: 'node', name: 'This node', count: '2', checked: 'false', disabled: false, reason: '' },
        { answer: 'branch', name: 'This branch', count: '4', checked: 'true', disabled: false, reason: '' },
        { answer: 'note', name: 'Whole note', count: '12', checked: 'false', disabled: false, reason: '' },
      ]);
      expect((await header()).chip?.expanded).toBe('true');
      // No caption: the words before the chip say what it chooses.
      const caption = await browser.executeObsidian(
        () =>
          document.querySelector('.workspace-leaf.mod-active .to-backlinks-scope-menu .to-backlinks-facet-cap') !==
          null,
      );
      expect(caption).toBe(false);
    });

    it('applies a chosen answer and closes the menu', async function () {
      // A phone's footer shows the segments, never the chip and its menu.
      if (h.IS_MOBILE_RUN) this.skip();
      await zoomInto('## Current sprint');
      await chooseAnswer('note');
      const head = await header();
      expect(head.chip).toMatchObject({ answer: 'note', label: 'the whole note', expanded: 'false' });
      expect(await totals()).toEqual({ references: 12, notes: 5 });
      await chooseAnswer('branch');
    });

    it('says why an answer is unavailable', async function () {
      await zoomInto('- Retro notes');
      if (!(await chipShown())) {
        const why = await browser.executeObsidian(() =>
          Array.from(
            document.querySelectorAll<HTMLButtonElement>('.workspace-leaf.mod-active .to-backlinks-scope-segment'),
          ).map((b) => [b.dataset.answer, b.disabled, b.title, b.getAttribute('aria-checked')]),
        );
        const reason = 'Nothing here has a heading or block id to link to';
        expect(why).toEqual([
          ['node', true, reason, 'false'],
          ['branch', true, reason, 'false'],
          ['note', false, '', 'true'],
        ]);
        return;
      }
      await openScopeMenu();
      const entries = await menuEntries();
      const reason = 'Nothing here has a heading or block id to link to';
      expect(entries.map((e) => [e.answer, e.disabled, e.reason, e.checked])).toEqual([
        ['node', true, reason, 'false'],
        ['branch', true, reason, 'false'],
        ['note', false, '', 'true'],
      ]);
    });

    it('closes another popover when the menu opens', async function () {
      // A phone's footer shows the segments, never the chip and its menu.
      if (h.IS_MOBILE_RUN) this.skip();
      await zoomInto('## Current sprint');
      await clickIn(`${FOOTER} .to-backlinks-sort`);
      await settle();
      await clickIn(`${FOOTER} .to-backlinks-scope-chip`);
      await settle();
      const open = await browser.executeObsidian(() => ({
        sort:
          document.querySelector('.workspace-leaf.mod-active .to-backlinks-sort')?.getAttribute('aria-expanded') ===
          'true',
        scope: document.querySelector('.workspace-leaf.mod-active .to-backlinks-scope-menu') !== null,
      }));
      expect(open).toEqual({ sort: false, scope: true });
      await clickIn(`${FOOTER} .to-backlinks-scope-chip`);
    });

    it('is operable from the keyboard', async function () {
      // A phone's footer shows the segments, never the chip and its menu.
      if (h.IS_MOBILE_RUN) this.skip();
      await zoomInto('## Current sprint');
      await browser.executeObsidian(() => {
        document.querySelector<HTMLElement>('.workspace-leaf.mod-active .to-backlinks-scope-chip')?.focus();
      });
      await browser.keys('Enter');
      await settle();
      expect((await header()).chip?.expanded).toBe('true');
      await browser.keys(['Tab', 'Tab', 'Tab']);
      const focused = await browser.executeObsidian(
        () => (document.activeElement as HTMLElement | null)?.dataset.answer ?? '',
      );
      expect(focused).toBe('note');
      await browser.keys('Enter');
      await settle();
      const head = await header();
      expect(head.chip).toMatchObject({ answer: 'note', expanded: 'false' });
      await chooseAnswer('branch');
    });

    it('gives way to segments where the footer is narrow', async function () {
      await zoomInto('## Current sprint');
      await resizeLeafForFooter(330);
      await settle();
      expect(await visibleForms()).toEqual({
        chip: false,
        segments: true,
        totalsFull: false,
        totalsCompact: false,
      });
      expect(await headerIsOneRow()).toBe(true);
      expect(await segments()).toEqual([
        { answer: 'node', checked: 'false', disabled: false, count: '2', name: 'This node, 2 references', tabIndex: -1 },
        { answer: 'branch', checked: 'true', disabled: false, count: '4', name: 'This branch, 4 references', tabIndex: 0 },
        { answer: 'note', checked: 'false', disabled: false, count: '12', name: 'Whole note, 12 references', tabIndex: -1 },
      ]);
      const colours = await browser.executeObsidian(() => {
        const [node, branch] = Array.from(
          document.querySelectorAll<HTMLElement>('.workspace-leaf.mod-active .to-backlinks-scope-segment'),
        );
        const probe = document.createElement('span');
        probe.style.color = 'var(--to-decor-accent, var(--text-accent))';
        branch!.appendChild(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return { chosen: getComputedStyle(branch!).color, other: getComputedStyle(node!).color, accent };
      });
      expect(colours.chosen).toBe(colours.accent);
      expect(colours.other).not.toBe(colours.accent);

      await clickIn(`${FOOTER} .to-backlinks-scope-segment[data-answer="node"]`);
      await settle();
      expect((await segments()).map((s) => s.checked)).toEqual(['true', 'false', 'false']);
      expect(await totals()).toEqual({ references: 2, notes: 2 });
      await clickIn(`${FOOTER} .to-backlinks-scope-segment[data-answer="branch"]`);
      await settle();
    });

    it('moves between segments with the arrow keys', async function () {
      await zoomInto('## Current sprint');
      await resizeLeafForFooter(330);
      await settle();
      await browser.executeObsidian(() => {
        document
          .querySelector<HTMLElement>('.workspace-leaf.mod-active .to-backlinks-scope-segment[tabindex="0"]')
          ?.focus();
      });
      await browser.keys('ArrowRight');
      await settle();
      const after = await segments();
      expect(after.filter((s) => s.checked === 'true').map((s) => s.answer)).toEqual(['note']);
      const focused = await browser.executeObsidian(
        () => (document.activeElement as HTMLElement | null)?.dataset.answer ?? '',
      );
      expect(focused).toBe('note');
      await clickIn(`${FOOTER} .to-backlinks-scope-segment[data-answer="branch"]`);
      await settle();
    });

    it('draws each answer with one glyph, at one size, in every form', async function () {
      // A phone's footer shows the segments, never the chip and its menu.
      if (h.IS_MOBILE_RUN) this.skip();
      await zoomInto('## Current sprint');
      await openScopeMenu();
      const read = (): Promise<Record<string, { d: string; size: number }[]>> =>
        browser.executeObsidian(() => {
          const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks')!;
          const out: Record<string, { d: string; size: number }[]> = {};
          const add = (answer: string, svg: SVGSVGElement | null): void => {
            if (!svg) return;
            const d = Array.from(svg.querySelectorAll('path'))
              .map((p) => p.getAttribute('d'))
              .join(' ');
            const rect = svg.getBoundingClientRect();
            (out[answer] ??= []).push({ d, size: Math.round(rect.width * 10) / 10 });
          };
          const chip = root.querySelector<HTMLElement>('.to-backlinks-scope-chip')!;
          add(chip.dataset.answer!, chip.querySelector('.to-backlinks-scope-mark svg'));
          for (const o of Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-scope-option'))) {
            add(o.dataset.answer!, o.querySelector('.to-backlinks-scope-mark svg'));
          }
          return out;
        });
      const wide = await read();
      await clickIn(`${FOOTER} .to-backlinks-scope-chip`);
      await resizeLeafForFooter(330);
      await settle();
      const narrow = await browser.executeObsidian(() =>
        Object.fromEntries(
          Array.from(
            document.querySelectorAll<HTMLElement>('.workspace-leaf.mod-active .to-backlinks-scope-segment'),
          ).map((b) => {
            const svg = b.querySelector('svg')!;
            const d = Array.from(svg.querySelectorAll('path'))
              .map((p) => p.getAttribute('d'))
              .join(' ');
            return [b.dataset.answer!, { d, size: Math.round(svg.getBoundingClientRect().width * 10) / 10 }];
          }),
        ),
      );
      for (const answer of ['node', 'branch', 'note']) {
        const forms = [...(wide[answer] ?? []), narrow[answer]!];
        expect(new Set(forms.map((f) => f.d)).size).toBe(1);
        const sizes = forms.map((f) => f.size);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(0.5);
      }
      expect(new Set(['node', 'branch', 'note'].map((a) => narrow[a]!.d)).size).toBe(3);
    });

    it('carries no scope control with no zoom', async function () {
      const head = await header();
      expect(head.zoomed).toBe(false);
      expect(head.chip).toBeNull();
      expect(head.title).toBe('Structured backlinks');
    });
  });

  describe('an answer with nothing in it', function () {
    afterEach(async function () {
      await zoomOut();
    });

    it('says so and offers the note, rather than reading as a note nothing links to', async function () {
      await zoomInto('- lonely item ^nobody');
      const state = await browser.executeObsidian(() => {
        const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
        return {
          dormant: root?.classList.contains('is-dormant') ?? false,
          line: root?.querySelector('.to-backlinks-empty-line')?.textContent ?? '',
          action: root?.querySelector('.to-backlinks-empty-widen')?.textContent ?? '',
          groups: root?.querySelectorAll('.to-backlinks-group').length ?? -1,
        };
      });
      expect(state).toEqual({
        dormant: false,
        line: 'Nothing links to this part of the note.',
        action: 'Show the 12 references to the whole note',
        groups: 0,
      });
      expect((await totals()).references).toBe(0);
    });

    it('widens to the note from its action', async function () {
      await zoomInto('- lonely item ^nobody');
      await clickIn(`${FOOTER} .to-backlinks-empty-widen`);
      await settle();
      expect((await header()).chip?.answer).toBe('note');
      expect(await totals()).toEqual({ references: 12, notes: 5 });
      await chooseAnswer('branch');
    });
  });

  describe('agreement with Obsidian', function () {
    /**
     * What stands between the attribution rule and a shape nobody probed
     * (design D9): for every note in the vault carrying a heading or a block
     * id, each one Obsidian's metadata reports starts on the line our anchors
     * give it. `Zoom target` carries the probe corpus for exactly this.
     */
    it("gives every heading and block id Obsidian's line, in every fixture note", async function () {
      await waitForBacklinkIndexReady('Projects/Aurora Dashboard.md', 40);
      const notes = await browser.executeObsidian(async ({ app }) => {
        const out: { path: string; text: string; headings: [string, number][]; blocks: [string, number][] }[] =
          [];
        for (const file of app.vault.getMarkdownFiles()) {
          const cache = app.metadataCache.getFileCache(file);
          const headings = (cache?.headings ?? []).map(
            (heading): [string, number] => [heading.heading, heading.position.start.line],
          );
          const blocks = Object.entries(cache?.blocks ?? {}).map(
            ([key, block]): [string, number] => [key, block.position.start.line],
          );
          if (headings.length === 0 && blocks.length === 0) continue;
          out.push({ path: file.path, text: await app.vault.cachedRead(file), headings, blocks });
        }
        return out;
      });
      expect(notes.map((n) => n.path)).toContain(TARGET);

      const disagreements: string[] = [];
      for (const note of notes) {
        const anchors = anchorsOf(parse(note.text));
        const ours = anchors.flatMap((a) => (a.kind === 'heading' ? [[a.text, a.line]] : []));
        if (JSON.stringify(ours) !== JSON.stringify(note.headings)) {
          disagreements.push(`${note.path}: headings ${JSON.stringify(note.headings)} vs ${JSON.stringify(ours)}`);
        }
        const blockLine = new Map<string, number>();
        for (const a of anchors) if (a.kind === 'block' && !blockLine.has(a.key)) blockLine.set(a.key, a.line);
        for (const [key, line] of note.blocks) {
          if (blockLine.get(key) !== line) {
            disagreements.push(`${note.path}: ^${key} at ${line}, ours ${blockLine.get(key) ?? 'none'}`);
          }
        }
      }
      expect(disagreements).toEqual([]);
    });
  });

  describe('the cap', function () {
    const HUB = 'Projects/Aurora Dashboard.md';

    after(async function () {
      await h.runCommand('zoom-clear');
      await pinBacklinksCapOff();
      await openFooter(TARGET);
    });

    it('still bounds the reads under an answer', async function () {
      await waitForBacklinkIndexReady(HUB, 40);
      await openFooter(HUB);
      await zoomInto('## Current sprint');
      await browser.executeObsidian(async ({ plugins }) => {
        await (plugins.trueOutliner as any).setBacklinksOverallCap('25');
      });
      await settle();
      const counted = await browser.executeObsidian(async ({ plugins }, target: string) => {
        const plugin = plugins.trueOutliner as any;
        const index = plugin.backlinks;
        const original = index.place.bind(index);
        const placed: string[] = [];
        index.place = (t: string, s: string) => {
          if (t === target) placed.push(s);
          return original(t, s);
        };
        try {
          await plugin.setBacklinksGroupHeight('compact');
          await new Promise((resolve) => setTimeout(resolve, 6000));
          const shown = Array.from(
            document.querySelectorAll<HTMLElement>('.workspace-leaf.mod-active .to-backlinks-group-head'),
          ).map((head) => {
            const name = head.querySelector('.to-backlinks-group-name')?.textContent ?? '';
            const folder = head.querySelector('.to-backlinks-group-folder')?.textContent ?? '';
            return folder ? `${folder}/${name}.md` : `${name}.md`;
          });
          const answered = document.querySelector('.workspace-leaf.mod-active .to-backlinks-totals-full')
            ?.textContent;
          return { placed: Array.from(new Set(placed)), shown, answered };
        } finally {
          index.place = original;
          await plugin.setBacklinksGroupHeight('standard');
        }
      }, HUB);
      // The answer holds far more than the cap: this case's own control.
      expect(Number(/(\d+) notes/.exec(counted.answered ?? '')?.[1])).toBeGreaterThan(counted.shown.length);
      expect(counted.shown.length).toBeGreaterThan(0);
      expect([...counted.placed].sort()).toEqual([...counted.shown].sort());
    });
  });

  describe('the anchors of the live document', function () {
    const LIVE = 'Scratch/Zoom live.md';
    const LIVE_SOURCE = 'Scratch/Zoom live source.md';

    before(async function () {
      await h.createNote(LIVE, '# Live\n\n- first ^live-first\n- second\n');
      await h.createNote(LIVE_SOURCE, 'Later: [[Zoom live#^later]]. First: [[Zoom live#^live-first]].\n');
      await waitForBacklinkIndexReady(LIVE, 1);
      await openFooter(LIVE);
    });

    after(async function () {
      await h.runCommand('zoom-clear');
      await openFooter(TARGET);
    });

    // A note short enough that its footer never leaves the viewport: a block
    // widget scrolled out of view is dropped and rebuilt, which is not what
    // this asks about.
    it('keeps its element across zooming in, switching answers and zooming out', async function () {
      await browser.executeObsidian(() => {
        const el = document.querySelector<HTMLElement>('.workspace-leaf.mod-active .to-backlinks');
        if (el) el.dataset.probe = 'kept';
      });
      const probed = (): Promise<string> =>
        browser.executeObsidian(
          () =>
            document.querySelector<HTMLElement>('.workspace-leaf.mod-active .to-backlinks')?.dataset.probe ??
            '',
        );
      await zoomInto('- first');
      expect(await probed()).toBe('kept');
      await chooseAnswer('node');
      expect(await probed()).toBe('kept');
      await chooseAnswer('branch');
      await zoomOut();
      expect(await probed()).toBe('kept');
    });

    it('counts an edit before the note is saved, and its undoing too', async function () {
      await zoomInto('- second');
      expect((await header()).chip?.answer).toBe('note');
      const line = await lineOf('- second');
      const readNode = async (): Promise<string> => {
        const entries = await browser.executeObsidian(() =>
          Array.from(
            document.querySelectorAll<HTMLButtonElement>('.workspace-leaf.mod-active .to-backlinks-scope-segment'),
          ).map((b) => [b.dataset.answer, b.querySelector('.to-backlinks-scope-count')?.textContent, b.disabled]),
        );
        const node = entries.find((e) => e[0] === 'node');
        return node && !node[2] ? String(node[1]) : 'unavailable';
      };

      await browser.executeObsidian(
        ({ app, obsidian }, at: number) => {
          const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
          view.editor.replaceRange(' ^later', { line: at, ch: view.editor.getLine(at).length });
        },
        line,
      );
      // Well inside the ~2 s the metadata cache takes to follow an edit.
      await browser.waitUntil(async () => (await readNode()) === '1', {
        timeout: 500,
        interval: 50,
        timeoutMsg: 'the typed id did not count within 500 ms',
      });

      await browser.executeObsidian(
        ({ app, obsidian }, at: number) => {
          const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
          const text = view.editor.getLine(at);
          view.editor.replaceRange('', { line: at, ch: text.length - ' ^later'.length }, { line: at, ch: text.length });
        },
        line,
      );
      await browser.waitUntil(async () => (await readNode()) === 'unavailable', {
        timeout: 500,
        interval: 50,
        timeoutMsg: 'the deleted id still counted after 500 ms',
      });
    });
  });
});
