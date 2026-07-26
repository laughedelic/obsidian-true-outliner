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
 *   node scripts/run-e2e.mjs [desktop|mobile]
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobile = process.argv[2] === 'mobile';
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
    ['run', mobile ? 'e2e/wdio.mobile-emulation.conf.mts' : 'e2e/wdio.conf.mts'],
    mobile ? { OBSIDIAN_E2E_MOBILE: '1' } : undefined,
  );
} finally {
  // Keep the suite's status; if it passed but cleanup failed, fail with 1 so a
  // dirty vault is never reported as success.
  const cleanup = drift();
  process.exitCode = suite !== 0 ? suite : cleanup !== 0 ? 1 : 0;
}
