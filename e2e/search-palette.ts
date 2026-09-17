/**
 * Driving the search palette from a spec.
 *
 * Beside its spec rather than in `helpers.ts`, because everything here is about
 * one surface's own shape: a modal that paints progressively, a keyboard model
 * over hits rather than rows, and a landing that opens a note and may zoom it.
 *
 * The waits below are all consequences of the painting being progressive —
 * groups arrive per note as each tree resolves, so a spec that reads the DOM as
 * soon as it has typed is reading a sweep in flight.
 */

import { browser } from '@wdio/globals';
import { Key } from 'webdriverio';
import * as h from './helpers.js';

export const PALETTE = '.to-search-palette';
const QUERY = `${PALETTE} .prompt-input`;

/** Opens the palette through its command, as a reader would. */
export async function openPalette(): Promise<void> {
  await h.runCommand('search-outline');
  await browser.waitUntil(async () => paletteOpen(), {
    timeout: h.waitBudget(4000),
    timeoutMsg: 'the palette did not open',
  });
}

export async function closePalette(): Promise<void> {
  if (!(await paletteOpen())) return;
  await browser.keys(['Escape']);
  await browser.waitUntil(async () => !(await paletteOpen()), {
    timeout: h.waitBudget(4000),
    timeoutMsg: 'the palette did not close',
  });
}

export function paletteOpen(): Promise<boolean> {
  return browser.executeObsidian(() => document.querySelector('.to-search-palette') !== null);
}

/**
 * Types a query and waits for its sweep to finish.
 *
 * The sweep's end is what the state line reports: it says "Searching…" while a
 * walk is in flight and is either empty or "No matches." once it is done. A
 * spec that waited on the rows instead could not tell "none yet" from "none at
 * all", which is the same ambiguity the palette itself refuses to guess at.
 */
export async function search(query: string): Promise<void> {
  await browser.execute(
    (selector: string, value: string) => {
      const input = document.querySelector(selector) as HTMLInputElement | null;
      if (!input) throw new Error('no query field');
      input.value = value;
      input.dispatchEvent(new Event('input'));
    },
    QUERY,
    query,
  );
  await settled();
}

/** Waits until no sweep is in flight. */
export async function settled(): Promise<void> {
  await browser.waitUntil(
    async () =>
      browser.executeObsidian(
        () =>
          document.querySelector('.to-search-palette-state')?.textContent?.trim() !== 'Searching…',
      ),
    { timeout: h.waitBudget(20000), timeoutMsg: 'the sweep never finished' },
  );
}

/** What the palette says when it has no rows to show. */
export function stateLine(): Promise<string> {
  return browser.executeObsidian(
    () => document.querySelector('.to-search-palette-state')?.textContent?.trim() ?? '',
  );
}

/** The tail's count of notes the cap did not admit. */
export function tailLine(): Promise<string> {
  return browser.executeObsidian(
    () => document.querySelector('.to-search-palette-tail')?.textContent?.trim() ?? '',
  );
}

/** The scope control's label, or null when it is not offered. */
export function scopeLabel(): Promise<string | null> {
  return browser.executeObsidian(() => {
    const el = document.querySelector('.to-search-palette-scope') as HTMLElement | null;
    if (!el || el.hidden || el.style.display === 'none') return null;
    return el.textContent?.trim() ?? '';
  });
}

export async function clickScope(): Promise<void> {
  await browser.executeObsidian(() => {
    (document.querySelector('.to-search-palette-scope') as HTMLElement | null)?.click();
  });
  await settled();
}

/**
 * The results as text, one line per row.
 *
 * A row's own classes say what it is — a hit, a lineage row, the active one —
 * and the group heads are named so a spec can assert the shape without knowing
 * how deep anything is nested.
 */
export function rows(): Promise<string[]> {
  return browser.executeObsidian(() => {
    const out: string[] = [];
    document
      .querySelectorAll('.to-search-palette .to-lineage-group-head, .to-search-palette .to-lineage-row')
      .forEach((el) => {
        const kinds = Array.from(el.classList)
          .filter((c) => c.startsWith('to-lineage-') || c.startsWith('is-'))
          .map((c) => c.replace('to-lineage-', ''))
          .join('+');
        out.push(`${kinds}: ${(el.textContent ?? '').trim().slice(0, 70)}`);
      });
    return out;
  });
}

/** The note names the groups are headed by, in the order they were painted. */
export function groupNames(): Promise<string[]> {
  return browser.executeObsidian(() =>
    Array.from(document.querySelectorAll('.to-search-palette .to-lineage-group-name')).map(
      (el) => el.textContent?.trim() ?? '',
    ),
  );
}

/** The text of the hit the keyboard is on, or null when there is none. */
export function activeHit(): Promise<string | null> {
  return browser.executeObsidian(() => {
    const el = document.querySelector('.to-search-palette .to-lineage-row.is-active');
    return el ? (el.textContent ?? '').trim() : null;
  });
}

/** Whether exactly one hit is active, and the field points at it. */
export function activeIsAnnounced(): Promise<boolean> {
  return browser.executeObsidian(() => {
    const active = document.querySelectorAll('.to-search-palette .to-lineage-row.is-active');
    if (active.length !== 1) return false;
    const field = document.querySelector('.to-search-palette .prompt-input');
    return field?.getAttribute('aria-activedescendant') === active[0]?.id;
  });
}

/** Every hit's text, in display order — what the arrows move through. */
export function hitTexts(): Promise<string[]> {
  return browser.executeObsidian(() =>
    Array.from(document.querySelectorAll('.to-search-palette .to-lineage-row.is-hit')).map(
      (el) => (el.textContent ?? '').trim(),
    ),
  );
}

/** What the marks in the results say — one entry per `<mark>`. */
export function marks(): Promise<string[]> {
  return browser.executeObsidian(() =>
    Array.from(document.querySelectorAll('.to-search-palette mark')).map(
      (el) => el.textContent ?? '',
    ),
  );
}

/** The roles the palette offers assistive technology. */
export function roles(): Promise<{ combobox: boolean; listbox: boolean; options: number }> {
  return browser.executeObsidian(() => ({
    combobox: document.querySelector('.to-search-palette .prompt-input')?.getAttribute('role') === 'combobox',
    listbox: document.querySelector('.to-search-palette .prompt-results')?.getAttribute('role') === 'listbox',
    options: document.querySelectorAll('.to-search-palette [role="option"]').length,
  }));
}

/** Confirms the active hit, with whatever modifiers the landing should see. */
export async function confirm(modifiers: ('Shift' | 'Mod')[] = []): Promise<void> {
  const keys = modifiers.map((m) => (m === 'Mod' ? h.PRIMARY_MOD : Key.Shift));
  await browser.keys([...keys, 'Enter']);
  await browser.waitUntil(async () => !(await paletteOpen()), {
    timeout: h.waitBudget(6000),
    timeoutMsg: 'the palette stayed open after a confirmation',
  });
}

/**
 * Where the reader landed: the note, the caret's line, and whether that view is
 * zoomed.
 *
 * Zoom is read off the DOM rather than off the plugin, the way `80-outline-zoom`
 * reads it: a zoomed view draws the breadcrumb trail, and the first crumb names
 * the root it was zoomed to. What a reader can see is what a spec asserts.
 */
export function landing(): Promise<{ path: string; line: number; zoomed: boolean; root: string }> {
  return browser.executeObsidian(({ app }) => {
    const leaf = app.workspace.getMostRecentLeaf();
    const view = leaf?.view as unknown as {
      file?: { path: string };
      editor?: { getCursor(): { line: number } };
      containerEl?: HTMLElement;
    } | undefined;
    const trail = view?.containerEl?.querySelector('.to-zoom-trail');
    const crumbs = trail?.querySelectorAll('.to-lineage-seg');
    return {
      path: view?.file?.path ?? '',
      line: view?.editor?.getCursor?.()?.line ?? -1,
      zoomed: trail !== null && trail !== undefined,
      root: crumbs?.length ? (crumbs[crumbs.length - 1]?.textContent ?? '').trim() : '',
    };
  });
}

/** How many tabs the workspace has open, for the new-tab case. */
export function tabCount(): Promise<number> {
  return browser.executeObsidian(({ app }) => {
    let count = 0;
    app.workspace.iterateRootLeaves(() => {
      count += 1;
    });
    return count;
  });
}
