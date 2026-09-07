/** The parts of the two wdio configs that must stay identical — see
 * `./obsidian-target.mts` for what happened last time they drifted. */

import * as fsp from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
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

// ---- Structured failure reporting --------------------------------------
//
// `reporters: ['obsidian']` prints to stdout only: after a full-group run
// fails, finding which of the (up to ten) spec files it was and what the
// error actually said meant scrolling raw output or re-running narrower.
// Adding `@wdio/json-reporter` gives each worker a per-spec JSON dump; the
// launcher's `onComplete` (see `writeFailureSummary`) collapses those into
// one small, stable-path file that `cat`/`jq` can read after ANY run —
// narrow or full-group, passing or failing — with no re-run needed.

/** Where each worker's raw JSON dump lands. Reset per invocation (see
 * `resetE2eReports`) so a run never reports on a previous run's leftovers. */
export const JSON_REPORT_DIR = path.join(process.cwd(), '.obsidian-cache', 'e2e-reports');

/** The one file worth `cat`ing after a run — see `writeFailureSummary`. */
export const FAILURE_SUMMARY_FILE = path.join(process.cwd(), '.obsidian-cache', 'e2e-summary.json');

const JSON_REPORT_FILE_PATTERN = /^wdio-.*-json-reporter\.json$/;

/** The two configs' `reporters` array — `obsidian` for the human-readable
 * stdout run, `json` feeding `writeFailureSummary`'s condensed file. */
export const reporters: NonNullable<WebdriverIO.Config['reporters']> = [
  'obsidian',
  ['json', { outputDir: JSON_REPORT_DIR }],
];

/**
 * Clears `JSON_REPORT_DIR` and any leftover `FAILURE_SUMMARY_FILE` before a
 * new invocation writes into them.
 *
 * The summary is removed here, not just the report dir: `writeFailureSummary`
 * only runs from `onComplete`, so if this invocation's wdio config or service
 * startup fails before that (a bad Obsidian download, a config error), a
 * stale summary from a PREVIOUS successful run would otherwise remain and
 * read as if it described this one.
 *
 * Only the launcher process should do this: the config module is re-loaded
 * in every worker too (see the `WDIO_WORKER_ID` guard on the banner above),
 * and a worker clearing the directory mid-run would race its siblings and
 * delete their output.
 */
export async function resetE2eReports(): Promise<void> {
  if (process.env.WDIO_WORKER_ID !== undefined) return;
  await fsp.rm(JSON_REPORT_DIR, { recursive: true, force: true });
  await fsp.mkdir(JSON_REPORT_DIR, { recursive: true });
  await fsp.rm(FAILURE_SUMMARY_FILE, { force: true });
}

interface RawTest {
  name: string;
  state: string;
  duration: number;
  error?: { message?: string; stack?: string };
}
interface RawHook {
  title: string;
  state: string;
  duration: number;
  associatedTest?: string;
  error?: { message?: string; stack?: string };
}
interface RawSuite {
  name: string;
  tests: RawTest[];
  hooks: RawHook[];
}
interface RawResultSet {
  specs: string[];
  state: { passed: number; failed: number; skipped: number };
  suites: RawSuite[];
}

/** WDIO records specs as `file://` URLs; render as a repo-relative path. */
function specDisplayPath(spec: string): string {
  const abs = spec.startsWith('file://') ? fileURLToPath(spec) : spec;
  return path.relative(process.cwd(), abs);
}

export interface FailureEntry {
  spec: string;
  suite: string;
  test: string;
  /** Set when the failure is a hook (e.g. `before each`), not the test body. */
  hook?: string | undefined;
  error?: string | undefined;
  stack?: string | undefined;
  durationMs: number;
}

export interface FailureSummary {
  ranAt: string;
  specs: string[];
  passed: number;
  failed: number;
  skipped: number;
  failures: FailureEntry[];
}

/**
 * Collapses every per-worker JSON dump from this invocation into one summary
 * at `FAILURE_SUMMARY_FILE`: which spec, which test, what the error said.
 *
 * Reads the raw dumps directly rather than `@wdio/json-reporter`'s own
 * `mergeResults` utility — that flattens every worker's `suites` into one
 * array, which loses which spec file each suite came from, the exact
 * association this summary exists to keep.
 *
 * Call from `onComplete`, which WDIO runs once in the launcher process after
 * every worker has finished — so every dump this invocation will produce
 * already exists on disk by the time this reads the directory.
 */
export async function writeFailureSummary(): Promise<void> {
  if (!existsSync(JSON_REPORT_DIR)) return;

  const files = (await fsp.readdir(JSON_REPORT_DIR)).filter((f) => JSON_REPORT_FILE_PATTERN.test(f));
  const failures: FailureEntry[] = [];
  const specs = new Set<string>();
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const file of files) {
    const raw: RawResultSet = JSON.parse(await fsp.readFile(path.join(JSON_REPORT_DIR, file), 'utf-8'));
    for (const spec of raw.specs ?? []) specs.add(specDisplayPath(spec));
    passed += raw.state?.passed ?? 0;
    failed += raw.state?.failed ?? 0;
    skipped += raw.state?.skipped ?? 0;
    const specLabel = (raw.specs ?? []).map((s) => specDisplayPath(s)).join(', ') || file;

    for (const suite of raw.suites ?? []) {
      for (const test of suite.tests ?? []) {
        if (test.state !== 'failed') continue;
        failures.push({
          spec: specLabel,
          suite: suite.name,
          test: test.name,
          error: test.error?.message,
          stack: test.error?.stack,
          durationMs: test.duration,
        });
      }
      for (const hook of suite.hooks ?? []) {
        if (!hook.error) continue;
        failures.push({
          spec: specLabel,
          suite: suite.name,
          test: hook.associatedTest ?? hook.title,
          hook: hook.title,
          error: hook.error?.message,
          stack: hook.error?.stack,
          durationMs: hook.duration,
        });
      }
    }
  }

  const summary: FailureSummary = {
    ranAt: new Date().toISOString(),
    specs: [...specs].sort(),
    passed,
    failed,
    skipped,
    failures,
  };
  await fsp.mkdir(path.dirname(FAILURE_SUMMARY_FILE), { recursive: true });
  await fsp.writeFile(FAILURE_SUMMARY_FILE, JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    console.log(
      `\n[e2e] ${failures.length} failure(s) — see ${path.relative(process.cwd(), FAILURE_SUMMARY_FILE)}`,
    );
    for (const f of failures) {
      console.log(`  FAIL ${f.spec} > ${f.suite} > ${f.test}${f.hook ? ` (${f.hook})` : ''}`);
      if (f.error) console.log(`       ${f.error.split('\n')[0]}`);
    }
  }
}
