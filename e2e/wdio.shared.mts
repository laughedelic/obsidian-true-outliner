/**
 * The parts of the two wdio configs that must stay identical.
 *
 * Shared rather than copied for the reason `./obsidian-target.mts` gives: the
 * desktop and mobile configs HAVE silently drifted before, and a difference
 * between them is invisible until a suite measures something other than what it
 * claims to.
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { browser } from '@wdio/globals';

/**
 * How many Obsidian instances run at once.
 *
 * Defaults to 1 — sequential, the behavior every existing spec was written and
 * stabilized under. Obsidian is Electron, so N instances is N renderers
 * competing for the runner's cores, and this harness has already paid for that
 * once: the anti-throttling chrome flags in `wdio.conf.mts` exist because
 * screenshot capture times out on a LOADED machine while plain script execution
 * keeps working. Raising this is therefore a measured change, not a default —
 * see the `max-instances` comment in .github/workflows/ci.yml for the numbers
 * behind the value CI uses, and `waitBudget` in ./helpers.ts for the harness
 * timeouts that scale off it.
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
 * An `afterTest` hook that captures the screen for a FAILING test only.
 *
 * Failure screenshots rather than the corpus ones specs 50/51/52 take: those
 * are ~100 images per run that CI has nowhere to put and nobody reads, while
 * the one image anybody actually wants is of the moment a test broke. A capture
 * failure is swallowed on purpose — when the session is the thing that died,
 * the useful error is the test's own, not "could not screenshot".
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
