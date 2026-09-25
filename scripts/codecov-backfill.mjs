/**
 * Rebuilds e2e test results for Codecov Test Analytics from the logs of CI runs
 * that predate the JUnit upload. `.github/workflows/codecov-backfill.yml` runs
 * it and uploads what it writes.
 *
 *   node scripts/codecov-backfill.mjs collect <out-dir> [--limit <runs>]
 *   node scripts/codecov-backfill.mjs parse <job-log>   # JUnit on stdout, to check a log by hand
 *
 * `collect` walks the CI workflow's runs, newest first, and downloads each
 * attempt's log archive: one request per attempt rather than one per job, since
 * the token's rate limit would not cover 26 jobs a run. Each e2e job's log
 * becomes `<out-dir>/<run>-<attempt>/<job>/junit.xml`, and `<out-dir>/manifest.tsv`
 * lists what to upload it as — commit, branch, pull request, flag. A run whose
 * logs have expired is skipped, and so is a job that already uploaded its own
 * results, so the two sources never count one run twice.
 *
 * The names follow the `junit` reporter's options in `e2e/wdio.shared.mts`:
 * the testsuite is the innermost describe title, the classname every describe
 * title from the outermost joined by `.`, the test name its title with
 * whitespace collapsed. Codecov keys a test's history on those names and the
 * flag, so a rebuilt result and a live one land in the same history.
 *
 * Unit tests are not rebuilt: vitest's CI output names only the failing tests,
 * so a log records no passes to count flakiness against.
 *
 * Needs GITHUB_TOKEN and GITHUB_REPOSITORY, and `unzip` on the path.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const E2E_JOB = /^(desktop|mobile) \((.+)\)$/;
/** The forward upload's step, as its log prints it: such a job has its own results. */
const ALREADY_UPLOADED = /report_type: test_results/;

// ---- Parsing a job log ----------------------------------------------------

const TIMESTAMP = /^\uFEFF?\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z ?/;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
const SECTION_RULE = /^-{20,}$/;
const SPEC = /^» (.+)$/;
const TEST = /^( *)([✓✖\-?]) (.+)$/;
const SUITE = /^( *)(\S.*)$/;
const COUNTS = /^\d+ (passing|failing|skipped|pending)\b/;
const FAILURE_HEADER = /^(\d+)\) /;

/**
 * The spec reporter's block of a job log as test results: one entry per test
 * line, with the describe chain its indentation places it under.
 *
 * The block starts at `"obsidian" Reporter:` and holds one section per spec
 * file. A describe title sits at four spaces per level of nesting, a test line
 * three further in behind its mark: ✓ passed, ✖ failed, - skipped, ? pending.
 * After the counts come the numbered failure details, in the order the ✖ lines
 * appeared.
 */
export function parseJobLog(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(TIMESTAMP, '').replace(ANSI, ''));
  const start = lines.findIndex((l) => l.trim() === '"obsidian" Reporter:');
  if (start < 0) return [];

  const results = [];
  let spec = null;
  let suites = [];
  let inDetails = false;
  let failed = [];
  let detail = null;

  const closeDetail = () => {
    if (detail && failed[detail.index]) failed[detail.index].message = detail.lines.join('\n').trim();
    detail = null;
  };
  const closeSection = () => {
    closeDetail();
    spec = null;
    suites = [];
    inDetails = false;
    failed = [];
  };

  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('Spec Files:')) break;
    if (SECTION_RULE.test(line)) {
      closeSection();
      continue;
    }
    const specMatch = SPEC.exec(line);
    if (specMatch) {
      spec = specMatch[1].trim();
      continue;
    }
    if (!spec) continue;

    if (inDetails) {
      const header = FAILURE_HEADER.exec(line);
      if (header) {
        closeDetail();
        detail = { index: Number(header[1]) - 1, lines: [] };
      } else if (detail) {
        detail.lines.push(line);
      }
      continue;
    }
    if (COUNTS.test(line)) {
      inDetails = true;
      continue;
    }
    if (line.trim() === '') continue;

    const test = TEST.exec(line);
    if (test) {
      const depth = Math.max(0, Math.floor((test[1].length - 3) / 4));
      const chain = suites.slice(0, depth + 1);
      const state = { '✓': 'passed', '✖': 'failed', '-': 'skipped', '?': 'skipped' }[test[2]];
      const entry = { spec, suites: chain, title: test[3], state };
      // A skipped test prints twice, pending then skipped; the second replaces the first.
      const previous = results.at(-1);
      if (previous && previous.spec === spec && previous.title === entry.title && sameChain(previous.suites, chain)) {
        results[results.length - 1] = entry;
        continue;
      }
      results.push(entry);
      if (state === 'failed') failed.push(entry);
      continue;
    }
    const suite = SUITE.exec(line);
    if (suite) {
      const depth = Math.floor(suite[1].length / 4);
      suites = [...suites.slice(0, depth), suite[2]];
    }
  }
  closeSection();
  return results;
}

function sameChain(a, b) {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

// ---- Writing JUnit --------------------------------------------------------

function xml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // XML 1.0 has no escape for most control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

const collapse = (text) => text.split(/\s+/).filter(Boolean).join(' ');

/** JUnit XML for one job's results, named as the live reporter names them. */
export function toJUnit(results) {
  const bySuite = new Map();
  for (const r of results) {
    const classname = r.suites.join('.');
    const key = `${r.spec}\u0000${classname}`;
    if (!bySuite.has(key)) bySuite.set(key, { spec: r.spec, name: collapse(r.suites.at(-1) ?? ''), classname, tests: [] });
    bySuite.get(key).tests.push(r);
  }
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<testsuites>'];
  for (const s of bySuite.values()) {
    const failures = s.tests.filter((t) => t.state === 'failed').length;
    const skipped = s.tests.filter((t) => t.state === 'skipped').length;
    out.push(
      `  <testsuite name="${xml(s.name)}" tests="${s.tests.length}" failures="${failures}" errors="0" skipped="${skipped}">`,
    );
    for (const t of s.tests) {
      const open = `    <testcase classname="${xml(s.classname)}" name="${xml(collapse(t.title))}" file="${xml(s.spec)}" time="0"`;
      if (t.state === 'passed') {
        out.push(`${open}/>`);
      } else if (t.state === 'skipped') {
        out.push(`${open}>`, '      <skipped/>', '    </testcase>');
      } else {
        const message = t.message ?? '';
        const firstLine = message.split('\n').find((l) => l.trim()) ?? 'failed';
        out.push(
          `${open}>`,
          `      <failure message="${xml(firstLine.trim())}">${xml(message)}</failure>`,
          '    </testcase>',
        );
      }
    }
    out.push('  </testsuite>');
  }
  out.push('</testsuites>', '');
  return out.join('\n');
}

// ---- Collecting from the Actions API --------------------------------------

const API = 'https://api.github.com';

async function github(pathname, { raw = false } = {}) {
  for (;;) {
    const res = await fetch(`${API}${pathname}`, {
      headers: {
        authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
    });
    if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const wait = Math.max(reset - Date.now(), 0) + 5_000;
      console.log(`[backfill] rate limited; waiting ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) return { status: res.status };
    return { status: res.status, body: raw ? Buffer.from(await res.arrayBuffer()) : await res.json() };
  }
}

async function* ciRuns() {
  const repo = process.env.GITHUB_REPOSITORY;
  for (let page = 1; ; page++) {
    const { body } = await github(`/repos/${repo}/actions/workflows/ci.yml/runs?per_page=100&page=${page}`);
    const runs = body?.workflow_runs ?? [];
    if (runs.length === 0) return;
    yield* runs;
  }
}

async function collect(outDir, limit) {
  const repo = process.env.GITHUB_REPOSITORY;
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = [];
  let seen = 0;
  for await (const run of ciRuns()) {
    if (seen >= limit) break;
    if (run.status !== 'completed' || !['success', 'failure'].includes(run.conclusion)) continue;
    seen++;
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      const { status, body } = await github(`/repos/${repo}/actions/runs/${run.id}/attempts/${attempt}/logs`, { raw: true });
      if (!body) {
        console.log(`[backfill] run ${run.id} attempt ${attempt}: no logs (${status})`);
        continue;
      }
      const dir = path.join(outDir, `${run.id}-${attempt}`);
      fs.mkdirSync(dir, { recursive: true });
      const zip = path.join(dir, 'logs.zip');
      fs.writeFileSync(zip, body);
      const logs = path.join(dir, 'logs');
      execFileSync('unzip', ['-q', '-o', zip, '-d', logs]);
      fs.rmSync(zip);

      // The archive's top level holds each job's whole log as `<n>_<job name>.txt`.
      for (const file of fs.readdirSync(logs)) {
        const jobName = /^\d+_(.+)\.txt$/.exec(file)?.[1];
        const job = jobName && E2E_JOB.exec(jobName);
        if (!job) continue;
        const [, platform, group] = job;
        const text = fs.readFileSync(path.join(logs, file), 'utf-8');
        if (ALREADY_UPLOADED.test(text)) continue;
        const results = parseJobLog(text);
        if (results.length === 0) continue;
        const jobDir = path.join(dir, `${platform}-${group}`);
        fs.mkdirSync(jobDir, { recursive: true });
        fs.writeFileSync(path.join(jobDir, 'junit.xml'), toJUnit(results));
        manifest.push([
          run.head_sha,
          run.head_branch || '-',
          // `-` rather than blank: a shell `read` over tabs merges empty fields.
          run.pull_requests?.[0]?.number ?? '-',
          `e2e-${platform}`,
          `${platform}-${group}`,
          `${run.id}`,
          `${run.html_url}/attempts/${attempt}`,
          path.join(jobDir, 'junit.xml'),
        ]);
      }
      fs.rmSync(logs, { recursive: true, force: true });
    }
    console.log(`[backfill] ${seen}/${limit} runs; ${manifest.length} job results so far`);
  }
  // Oldest first, so the histories fill in the order the runs happened.
  manifest.reverse();
  fs.writeFileSync(path.join(outDir, 'manifest.tsv'), manifest.map((row) => row.join('\t')).join('\n') + '\n');
  console.log(`[backfill] ${manifest.length} job results from ${seen} runs in ${outDir}/manifest.tsv`);
}

// ---- Entry point ----------------------------------------------------------

const [command, ...args] = process.argv.slice(2);
if (command === 'parse') {
  const [log] = args;
  process.stdout.write(toJUnit(parseJobLog(fs.readFileSync(log, 'utf-8'))));
} else if (command === 'collect') {
  const [outDir] = args;
  const limitAt = args.indexOf('--limit');
  const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
  if (!outDir || !process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    console.error('usage: GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo node scripts/codecov-backfill.mjs collect <out-dir> [--limit <runs>]');
    process.exit(2);
  }
  await collect(outDir, limit);
} else if (command !== undefined) {
  console.error(`[backfill] unknown command ${JSON.stringify(command)}`);
  process.exit(2);
}
