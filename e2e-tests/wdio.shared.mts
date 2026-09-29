/** The parts of the two wdio configs that must stay identical — see
 * `./obsidian-target.mts` for what happened last time they drifted. */

import * as fsp from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser } from '@wdio/globals';
import { TARGET_RECORD_FILE } from './target-record.mjs';
import {
  afterCase,
  beforeCase,
  MONITOR_RECORD_DIR,
  MONITOR_REPORT_FILE,
  type CaseRecord,
} from './monitors.js';

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

/**
 * An `afterTest` hook that prints what the active editor holds, drawn as the notation a case is
 * written in, for a failing test. Best effort, as the screenshot is: a session with no markdown
 * view open has nothing to draw, and the test's own error is the one worth reading.
 */
export function drawOnFailure() {
  return async function (
    test: { title: string },
    _context: unknown,
    { passed }: { passed: boolean },
  ): Promise<void> {
    if (passed) return;
    try {
      const { drawEditor } = await import('./drawing.js');
      console.log(`[e2e] the editor after "${test.title}":\n${await drawEditor('at failure')}`);
    } catch (e) {
      console.warn(`[e2e] could not draw the editor for "${test.title}": ${String(e).split('\n')[0]}`);
    }
  };
}

/** The `afterTest` both configs use: the screenshot, then the drawing. */
export function onTestFailure(label: string) {
  const screenshot = screenshotOnFailure(label);
  const draw = drawOnFailure();
  return async function (
    test: { title: string; parent: string },
    context: unknown,
    result: { passed: boolean },
  ): Promise<void> {
    await screenshot(test, context, result);
    await draw(test, context, result);
  };
}

/**
 * The per-case hooks both configs share: the ambient monitors around each body (see
 * `./monitors.ts`), and the failure screenshot and drawing after it.
 *
 * `beforeTest` runs after the spec's own `beforeEach`, so what a case arranges there is not read
 * as something the monitors saw; `afterTest` runs before its `afterEach`.
 */
export function caseHooks(label: string) {
  const onFailure = onTestFailure(label);
  return {
    beforeTest: async function (test: { title: string; parent?: string; file?: string }): Promise<void> {
      await beforeCase(test);
    },
    afterTest: async function (
      test: { title: string; parent: string; file?: string },
      context: unknown,
      result: { passed: boolean },
    ): Promise<void> {
      await onFailure(test, context, result);
      await afterCase(test, result.passed);
    },
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

/** Where each worker's JUnit XML lands, for Codecov Test Analytics. CI
 * uploads the directory with the platform as its flag
 * (`.github/actions/e2e/action.yml`). */
export const JUNIT_REPORT_DIR = path.join(process.cwd(), '.obsidian-cache', 'junit');

/** The two configs' `reporters` array — `obsidian` for the human-readable
 * stdout run, `json` feeding `writeFailureSummary`'s condensed file, `junit`
 * for Codecov.
 *
 * The JUnit names are the mocha titles as written: the reporter's default
 * format strips every non-alphanumeric character and prefixes the classname
 * with the capabilities, which carry the Obsidian version — a new release
 * would then start every test's history over. Codecov tells desktop from
 * mobile by the upload's flag instead. */
export const reporters: NonNullable<WebdriverIO.Config['reporters']> = [
  'obsidian',
  ['json', { outputDir: JSON_REPORT_DIR }],
  [
    'junit',
    {
      outputDir: JUNIT_REPORT_DIR,
      outputFileFormat: ({ cid }: { cid: string }) => `wdio-${cid}-junit.xml`,
      suiteNameFormat: /\s+/,
      classNameFormat: ({ suite }: { suite?: { fullTitle?: string; title: string } }) =>
        suite?.fullTitle ?? suite?.title ?? '',
      addFileAttribute: true,
    },
  ],
];

/**
 * Clears `JSON_REPORT_DIR`, `JUNIT_REPORT_DIR`, the monitors' records and report, and any leftover
 * `FAILURE_SUMMARY_FILE` and `TARGET_RECORD_FILE` before a new invocation writes into them.
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
  await fsp.rm(JUNIT_REPORT_DIR, { recursive: true, force: true });
  await fsp.rm(FAILURE_SUMMARY_FILE, { force: true });
  await fsp.rm(TARGET_RECORD_FILE, { force: true });
  await fsp.rm(MONITOR_RECORD_DIR, { recursive: true, force: true });
  await fsp.rm(MONITOR_REPORT_FILE, { force: true });
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

// ---- Ambient monitor report --------------------------------------------
//
// Each worker appends one `CaseRecord` per case to its own file (`./monitors.ts`). The launcher's
// `onComplete` collapses them into `MONITOR_REPORT_FILE`, beside `e2e-summary.json`, and CI's
// step summary renders that file (`scripts/e2e-monitors-summary.ts`). Nothing here fails a run.

export interface MonitorFinding {
  monitor: string;
  rule: string;
  /** Cases that produced it, and how many observations in all. */
  cases: number;
  observations: number;
  examples: { spec: string; test: string; detail: string }[];
}

export interface MonitorReport {
  ranAt: string;
  cases: number;
  /** Per monitor: cases it read, and why it did not read the rest, by reason. */
  coverage: Record<string, { checked: number; skipped: Record<string, number> }>;
  findings: MonitorFinding[];
  /** What installing and reading cost, summed over the cases, in ms. */
  overheadMs: number;
  /** Every exemption a case took, with its reason. */
  exemptions: { spec: string; test: string; monitor: string; reason: string }[];
}

/** Reasons that carry a per-case detail are grouped under their prefix. */
function skipGroup(reason: string): string {
  return reason.startsWith('exempt: ') ? 'exempt' : reason.replace(/^unreadable: .*/, 'unreadable');
}

export async function writeMonitorReport(): Promise<void> {
  if (!existsSync(MONITOR_RECORD_DIR)) return;
  const records: CaseRecord[] = [];
  for (const file of (await fsp.readdir(MONITOR_RECORD_DIR)).filter((f) => f.endsWith('.jsonl'))) {
    const text = await fsp.readFile(path.join(MONITOR_RECORD_DIR, file), 'utf-8');
    for (const line of text.split('\n')) if (line.trim()) records.push(JSON.parse(line) as CaseRecord);
  }

  const coverage: MonitorReport['coverage'] = {};
  const grouped = new Map<string, MonitorFinding>();
  const exemptions: MonitorReport['exemptions'] = [];
  for (const rec of records) {
    for (const monitor of rec.checked) {
      (coverage[monitor] ??= { checked: 0, skipped: {} }).checked++;
    }
    for (const [monitor, why] of Object.entries(rec.skipped as Record<string, string>)) {
      const c = (coverage[monitor] ??= { checked: 0, skipped: {} });
      const group = skipGroup(why);
      c.skipped[group] = (c.skipped[group] ?? 0) + 1;
      if (why.startsWith('exempt: ')) {
        exemptions.push({ spec: rec.spec, test: rec.test, monitor, reason: why.slice('exempt: '.length) });
      }
    }
    const seenHere = new Set<string>();
    for (const o of rec.observations) {
      const key = `${o.monitor}/${o.rule}`;
      let f = grouped.get(key);
      if (!f) grouped.set(key, (f = { monitor: o.monitor, rule: o.rule, cases: 0, observations: 0, examples: [] }));
      f.observations++;
      if (!seenHere.has(key)) {
        seenHere.add(key);
        f.cases++;
      }
      if (f.examples.length < 5) f.examples.push({ spec: rec.spec, test: rec.test, detail: o.detail });
    }
  }

  const report: MonitorReport = {
    ranAt: new Date().toISOString(),
    cases: records.length,
    coverage,
    findings: [...grouped.values()].sort((a, b) => b.cases - a.cases),
    overheadMs: records.reduce((n, r) => n + r.overheadMs, 0),
    exemptions,
  };
  await fsp.mkdir(path.dirname(MONITOR_REPORT_FILE), { recursive: true });
  await fsp.writeFile(MONITOR_REPORT_FILE, JSON.stringify(report, null, 2));

  const total = report.findings.reduce((n, f) => n + f.observations, 0);
  console.log(
    `\n[e2e] monitors: ${total} observation(s) in ${report.findings.length} rule(s) across ${records.length} case(s) — see ${path.relative(process.cwd(), MONITOR_REPORT_FILE)}`,
  );
  for (const f of report.findings) {
    console.log(`  ${f.monitor}/${f.rule}: ${f.observations} in ${f.cases} case(s), e.g. ${f.examples[0]?.spec} > ${f.examples[0]?.test}: ${f.examples[0]?.detail}`);
  }
}
