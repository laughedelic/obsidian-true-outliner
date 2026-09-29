/**
 * Runs drawn case files in the real app, from wherever they are.
 *
 *   node scripts/run-case.ts <file.case>... [--mobile] [--record]
 *
 * A wrapper over the narrow runner: it names the files to the case spec through `TO_CASE_FILES`,
 * so a case file in a scratch directory runs alone and the repository's own are left out. With
 * `--record` nothing fails on a difference; the case file with its result columns filled from the
 * app is written to `.obsidian-cache/cases/`, and printed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { parseCase } from './notation.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const files = args.filter((a) => !a.startsWith('--'));

const known = new Set(['--mobile', '--record']);
const unknown = flags.filter((f) => !known.has(f));
if (unknown.length || files.length === 0) {
  console.error('Usage: node scripts/run-case.ts <file.case>... [--mobile] [--record]');
  process.exit(1);
}
const missing = files.filter((f) => !existsSync(f));
if (missing.length) {
  console.error(`[case] no such file: ${missing.join(', ')}`);
  process.exit(1);
}

// A file that does not parse fails here, and not after a build and an Obsidian launch.
for (const file of files) {
  try {
    parseCase(readFileSync(file, 'utf8'), { record: flags.includes('--record') });
  } catch (e) {
    console.error(`[case] ${file}: ${(e as Error).message}`);
    process.exit(1);
  }
}

const result = spawnSync(
  process.execPath,
  ['scripts/e2e-narrow.ts', 'drawn-cases', ...flags.filter((f) => f === '--mobile')],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      TO_CASE_FILES: files.map((f) => path.resolve(f)).join(path.delimiter),
      ...(flags.includes('--record') ? { TO_CASE_RECORD: '1' } : {}),
    },
  },
);
process.exit(result.status ?? 1);
