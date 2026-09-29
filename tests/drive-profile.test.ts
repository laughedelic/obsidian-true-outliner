import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isLauncherProfile } from '../scripts/drive-profile.ts';

// macOS spells its temporary directory through a symlink (/var -> /private/var): the launcher
// records the resolved path and os.tmpdir() the other one. A directory named through `link` below
// is the same directory as one named through `real`.
const base = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'drive-profile-'));
const real = path.join(base, 'real');
const link = path.join(base, 'link');
mkdirSync(real);
symlinkSync(real, link);
const outside = path.join(base, 'elsewhere');
mkdirSync(outside);

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('isLauncherProfile', () => {
  it('accepts a profile directly under the temporary directory', () => {
    expect(isLauncherProfile(path.join(real, 'obsidian-launcher-config-abc123'), real)).toBe(true);
  });

  it('accepts one whichever way the two paths are spelled', () => {
    expect(isLauncherProfile(path.join(real, 'obsidian-launcher-config-abc123'), link)).toBe(true);
    expect(isLauncherProfile(path.join(link, 'obsidian-launcher-config-abc123'), real)).toBe(true);
  });

  it('refuses a directory with another name', () => {
    expect(isLauncherProfile(path.join(real, 'documents'), real)).toBe(false);
  });

  it('refuses a profile-named directory outside the temporary directory', () => {
    expect(isLauncherProfile(path.join(outside, 'obsidian-launcher-config-abc123'), real)).toBe(false);
  });

  it('refuses one nested below the temporary directory', () => {
    expect(isLauncherProfile(path.join(real, 'a', 'obsidian-launcher-config-abc123'), real)).toBe(false);
  });

  it('refuses one whose parent is gone', () => {
    expect(isLauncherProfile(path.join(base, 'missing', 'obsidian-launcher-config-abc123'), real)).toBe(false);
  });
});
