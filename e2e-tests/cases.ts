/**
 * Running a drawn case file: finding the files, and pressing the keys a parsed `keys` line names.
 * The notation, the file format and the report are pure and live elsewhere; this is the part
 * that drives the real app.
 */

import { browser } from '@wdio/globals';
import { Key } from 'webdriverio';
import { readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KeyStep } from '../scripts/notation.ts';
import { PRIMARY_MOD, pasteText } from './helpers.js';

export const CASES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases');

/** Case files under `e2e-tests/cases/`, or exactly those named in `TO_CASE_FILES` (paths joined
 * by the platform's path delimiter), which is how `npm run case` runs a file from anywhere. */
export function caseFiles(): string[] {
  const named = process.env.TO_CASE_FILES?.trim();
  if (named) return named.split(path.delimiter).map((f) => path.resolve(f));
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.case')) found.push(full);
    }
  };
  walk(CASES_DIR);
  return found;
}

const MODIFIERS = { mod: PRIMARY_MOD, ctrl: Key.Control, alt: Key.Alt, shift: Key.Shift } as const;

const NAMED: Record<string, string> = {
  Tab: Key.Tab,
  Enter: Key.Enter,
  Backspace: Key.Backspace,
  Delete: Key.Delete,
  ArrowUp: Key.ArrowUp,
  ArrowDown: Key.ArrowDown,
  ArrowLeft: Key.ArrowLeft,
  ArrowRight: Key.ArrowRight,
  Escape: Key.Escape,
  Home: Key.Home,
  End: Key.End,
  PageUp: Key.PageUp,
  PageDown: Key.PageDown,
  ' ': Key.Space,
};

/** The keys `browser.keys` takes for a chord: its modifiers held, then the key. */
export function chordKeys(step: Extract<KeyStep, { kind: 'chord' }>): string[] {
  return [...step.mods.map((m) => MODIFIERS[m]), NAMED[step.key] ?? step.key];
}

/** Presses one phase. ⌘V with a clipboard column is a real paste of that text. */
export async function pressPhase(phase: readonly KeyStep[], clipboard: string | undefined): Promise<void> {
  for (const step of phase) {
    if (step.kind === 'text') {
      await browser.keys([...step.text]);
      continue;
    }
    const paste = step.mods.length === 1 && step.mods[0] === 'mod' && step.key === 'v';
    for (let i = 0; i < step.times; i++) {
      if (paste && clipboard !== undefined) await pasteText(clipboard);
      else await browser.keys(chordKeys(step));
    }
  }
}
