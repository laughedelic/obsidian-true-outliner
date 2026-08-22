/** The parts of the two wdio configs that must stay identical — see
 * `./obsidian-target.mts` for what happened last time they drifted. */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { browser } from '@wdio/globals';

/**
 * How many Obsidian instances run at once; 1 unless E2E_MAX_INSTANCES says
 * otherwise. Each is a full Electron renderer, and `waitBudget` in
 * ./helpers.ts widens the harness timeouts off this value, so raising it
 * changes how the suite behaves and not just how fast it finishes.
 */
export function maxInstances(): number {
  const raw = process.env.E2E_MAX_INSTANCES?.trim();
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`E2E_MAX_INSTANCES must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}

/** Where `screenshotOnFailure` writes. CI uploads this only when a job fails. */
export const FAILURE_SCREENSHOT_DIR = path.join(
  process.cwd(),
  '.obsidian-cache',
  'failure-screenshots',
);

/** `a/b: c` -> `a-b-c`, so a test title is safe as a file name. */
function slugify(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/**
 * An `afterTest` hook that captures the screen for a failing test.
 *
 * A capture failure is swallowed: when the session itself has died, the useful
 * error is the test's own, not "could not screenshot".
 */
export function screenshotOnFailure(label: string) {
  return async function (
    test: { title: string; parent: string },
    _context: unknown,
    { passed }: { passed: boolean },
  ): Promise<void> {
    if (passed) return;
    try {
      await fsp.mkdir(FAILURE_SCREENSHOT_DIR, { recursive: true });
      const name = slugify(`${label}-${test.parent}-${test.title}`);
      await browser.saveScreenshot(path.join(FAILURE_SCREENSHOT_DIR, `${name}.png`));
    } catch (e) {
      console.warn(`[e2e] could not capture a failure screenshot for "${test.title}": ${String(e)}`);
    }
  };
}
