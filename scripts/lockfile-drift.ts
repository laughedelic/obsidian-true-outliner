/**
 * Reports whether `node_modules` still matches `package-lock.json`.
 *
 *   node scripts/lockfile-drift.ts [dir]
 *
 * Exits 0 when they agree and 1 when they do not, naming the first differences
 * on stdout. `scripts/agent-setup.sh` reinstalls on a non-zero exit, a crash
 * included, since `npm ci` is the safe direction.
 *
 * npm writes `node_modules/.package-lock.json` on every install, listing each
 * installed package with its version, so the comparison needs no install tree
 * walk. It compares content rather than modification times: a clone stamps the
 * lockfile with the clone time, which is later than any snapshot's
 * `node_modules`, so a time comparison would reinstall in every session.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

/** The part of a lockfile this check reads. */
export interface Lockfile {
  packages?: Record<string, { version?: string; optional?: boolean }>;
}

/** How many differences the CLI names before counting the rest. */
const SHOWN = 5;

/**
 * The differences between a lockfile and the hidden lockfile of the install that
 * should match it; empty when they agree, and one entry when there is no install
 * to compare against.
 *
 * Three things are not differences: the root entry `""`, which is the project
 * and has no counterpart in an install; a lockfile entry flagged optional that
 * is absent, since platform-specific packages are not installed on the other
 * platforms; and entries beyond `packages`.
 */
export function drift(lock: Lockfile, installed: Lockfile | null): string[] {
  if (installed === null) return ['node_modules/.package-lock.json is missing'];

  const wanted = lock.packages ?? {};
  const present = installed.packages ?? {};
  const problems: string[] = [];

  for (const [key, entry] of Object.entries(wanted)) {
    if (key === '') continue;
    const have = present[key];
    if (have === undefined) {
      if (!entry.optional) problems.push(`${key}@${entry.version ?? '?'} is not installed`);
    } else if (have.version !== entry.version) {
      problems.push(`${key} is ${have.version ?? '?'} where the lockfile has ${entry.version ?? '?'}`);
    }
  }
  for (const key of Object.keys(present)) {
    if (wanted[key] === undefined) problems.push(`${key} is installed and not in the lockfile`);
  }
  return problems;
}

function readJson(file: string): Lockfile | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Lockfile;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

function main(dir: string): number {
  const lock = readJson(path.join(dir, 'package-lock.json'));
  if (lock === null) {
    console.log('package-lock.json is missing');
    return 1;
  }
  const problems = drift(lock, readJson(path.join(dir, 'node_modules', '.package-lock.json')));
  if (problems.length === 0) return 0;

  console.log(`node_modules differs from package-lock.json in ${problems.length} place(s):`);
  for (const p of problems.slice(0, SHOWN)) console.log(`  ${p}`);
  if (problems.length > SHOWN) console.log(`  and ${problems.length - SHOWN} more`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    process.exit(main(process.argv[2] ? path.resolve(process.argv[2]) : root));
  } catch (e) {
    console.log(`cannot read the lockfiles: ${(e as Error).message}`);
    process.exit(1);
  }
}
