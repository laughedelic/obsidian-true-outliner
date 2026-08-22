/**
 * Runs an e2e suite: build (with dev UI), snapshot the fixture vault, run
 * WebdriverIO, then report and revert whatever the run changed — in a `finally`,
 * so cleanup happens even when the suite throws.
 *
 * A Node script rather than a chain in package.json because that chain needed
 * `VAR=1`, `{ ...; }`, `$?` and `[ ... ]`, all POSIX-only: on Windows' default
 * cmd.exe shell the scripts failed before reaching WebdriverIO. Windows is not a
 * supported dev platform today, so this is mostly for future contributors — but
 * it also buys a real `finally`, which the shell version did not have.
 *
 *   node scripts/run-e2e.mjs [desktop|mobile] [--group <name>]
 *   node scripts/run-e2e.mjs --list-groups          # JSON, for the CI matrix
 *
 * `--group` restricts the run to one group of specs (see `./spec-groups.mjs`);
 * without it every spec runs. `--list-groups` prints the names as JSON, which
 * is how the CI matrix is built.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { specGroups } from './spec-groups.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
if (argv.includes('--list-groups')) {
  console.log(JSON.stringify(Object.keys(specGroups())));
  process.exit(0);
}

// Validated, not treated as "mobile or else": CI names the job, the cache and
// the artifact after this, so a typo would file a desktop run under them.
const platform = argv[0]?.startsWith('--') ? 'desktop' : (argv[0] ?? 'desktop');
if (platform !== 'desktop' && platform !== 'mobile') {
  console.error(`[e2e] unknown platform ${JSON.stringify(platform)}. Expected 'desktop' or 'mobile'.`);
  process.exit(1);
}
const mobile = platform === 'mobile';
const group = argv[argv.indexOf('--group') + 1];

// Resolved here rather than handed to wdio as a glob, so an unknown group
// fails instead of running zero specs and reporting success.
const specArgs = [];
if (argv.includes('--group')) {
  const groups = specGroups();
  const specs = groups[group];
  if (!specs) {
    console.error(
      `[e2e] unknown group ${JSON.stringify(group)}. Known groups: ${Object.keys(groups).join(', ')}`,
    );
    process.exit(1);
  }
  specArgs.push(...specs.flatMap((spec) => ['--spec', spec]));
}
const bin = (name) => path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);

/** Exit status of a step, with output passed straight through. */
const run = (cmd, args, env) =>
  spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;

const build = run(process.execPath, ['esbuild.config.mjs', 'production', '--dev']);
if (build !== 0) process.exit(build);

const drift = (...args) => run(process.execPath, ['scripts/check-vault-drift.mjs', ...args]);
if (drift('--snapshot') !== 0) process.exit(1);

let suite = 1;
try {
  suite = run(
    bin('wdio'),
    ['run', mobile ? 'e2e/wdio.mobile-emulation.conf.mts' : 'e2e/wdio.conf.mts', ...specArgs],
    mobile ? { OBSIDIAN_E2E_MOBILE: '1' } : undefined,
  );
} finally {
  // Keep the suite's status; if it passed but cleanup failed, fail with 1 so a
  // dirty vault is never reported as success.
  const cleanup = drift();
  process.exitCode = suite !== 0 ? suite : cleanup !== 0 ? 1 : 0;
}
