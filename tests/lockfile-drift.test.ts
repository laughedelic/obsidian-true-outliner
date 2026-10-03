import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { drift, type Lockfile } from '../scripts/lockfile-drift.ts';

const lock = (packages: NonNullable<Lockfile['packages']>): Lockfile => ({ packages });

// The lockfile carries the project itself under `""`; an install's hidden lockfile never does.
const LOCK = lock({
  '': { version: '1.0.0' },
  'node_modules/a': { version: '1.0.0' },
  'node_modules/b': { version: '2.0.0' },
  'node_modules/fsevents': { version: '2.3.3', optional: true },
});
const INSTALLED = lock({
  'node_modules/a': { version: '1.0.0' },
  'node_modules/b': { version: '2.0.0' },
});

describe('drift', () => {
  it('finds none when the install matches the lockfile', () => {
    expect(drift(LOCK, INSTALLED)).toEqual([]);
  });

  it('names a lockfile entry the install lacks', () => {
    const installed = lock({ 'node_modules/a': { version: '1.0.0' } });
    expect(drift(LOCK, installed)).toEqual(['node_modules/b@2.0.0 is not installed']);
  });

  it('names an entry installed at another version', () => {
    const installed = lock({ ...INSTALLED.packages, 'node_modules/b': { version: '1.9.0' } });
    expect(drift(LOCK, installed)).toEqual(['node_modules/b is 1.9.0 where the lockfile has 2.0.0']);
  });

  it('names an installed entry the lockfile no longer has', () => {
    const installed = lock({ ...INSTALLED.packages, 'node_modules/gone': { version: '3.0.0' } });
    expect(drift(LOCK, installed)).toEqual(['node_modules/gone is installed and not in the lockfile']);
  });

  it('does not count an absent optional entry', () => {
    expect(drift(LOCK, INSTALLED)).not.toContain('node_modules/fsevents@2.3.3 is not installed');
  });

  it('still compares an optional entry that is installed', () => {
    const installed = lock({ ...INSTALLED.packages, 'node_modules/fsevents': { version: '2.3.0' } });
    expect(drift(LOCK, installed)).toEqual(['node_modules/fsevents is 2.3.0 where the lockfile has 2.3.3']);
  });

  it('does not count the root entry, which only the lockfile has', () => {
    expect(drift(lock({ '': { version: '1.0.0' } }), lock({}))).toEqual([]);
  });

  it('reports a missing hidden lockfile as drift', () => {
    expect(drift(LOCK, null)).toEqual(['node_modules/.package-lock.json is missing']);
  });
});

describe('the command line', () => {
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'lockfile-drift.ts');
  const dirs: string[] = [];

  /** A project directory holding the given lockfile and, when given, an install's hidden one. */
  const project = (lockfile: string | null, hidden: string | null): string => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lockfile-drift-'));
    dirs.push(dir);
    if (lockfile !== null) writeFileSync(path.join(dir, 'package-lock.json'), lockfile);
    if (hidden !== null) {
      mkdirSync(path.join(dir, 'node_modules'));
      writeFileSync(path.join(dir, 'node_modules', '.package-lock.json'), hidden);
    }
    return dir;
  };
  const run = (dir: string) => spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('exits 0 and prints nothing when they agree', () => {
    const result = run(project(JSON.stringify(LOCK), JSON.stringify(INSTALLED)));
    expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 0, stdout: '' });
  });

  it('exits 1 naming the differing entries', () => {
    const result = run(project(JSON.stringify(LOCK), JSON.stringify(lock({}))));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('differs from package-lock.json in 2 place(s)');
    expect(result.stdout).toContain('node_modules/a@1.0.0 is not installed');
    expect(result.stdout).toContain('node_modules/b@2.0.0 is not installed');
  });

  it('names the first five and counts the rest', () => {
    const many = lock(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`node_modules/p${i}`, { version: '1.0.0' }])));
    const result = run(project(JSON.stringify(many), JSON.stringify(lock({}))));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('in 8 place(s)');
    expect(result.stdout).toContain('and 3 more');
  });

  it('exits 1 when there is no install', () => {
    const result = run(project(JSON.stringify(LOCK), null));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('node_modules/.package-lock.json is missing');
  });

  it('exits 1 when a lockfile is not JSON', () => {
    const result = run(project(JSON.stringify(LOCK), '{ not json'));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('cannot read the lockfiles');
  });

  it('exits 1 when the lockfile is missing', () => {
    const result = run(project(null, JSON.stringify(INSTALLED)));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('package-lock.json is missing');
  });
});
