import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_INSTALLER,
  describeTarget,
  pinnedInstallerVersion,
  targetRecord,
} from '../e2e-tests/target-record.mts';

const saved = process.env.OBSIDIAN_INSTALLER_VERSION;
afterEach(() => {
  if (saved === undefined) delete process.env.OBSIDIAN_INSTALLER_VERSION;
  else process.env.OBSIDIAN_INSTALLER_VERSION = saved;
});

describe('pinnedInstallerVersion', () => {
  it('is unset when the variable is absent', () => {
    delete process.env.OBSIDIAN_INSTALLER_VERSION;
    expect(pinnedInstallerVersion()).toBeUndefined();
  });

  it('is unset when the variable is empty, as an absent workflow_dispatch input arrives', () => {
    process.env.OBSIDIAN_INSTALLER_VERSION = '';
    expect(pinnedInstallerVersion()).toBeUndefined();
  });

  it('is unset when the variable is only whitespace', () => {
    process.env.OBSIDIAN_INSTALLER_VERSION = '  \n';
    expect(pinnedInstallerVersion()).toBeUndefined();
  });

  it('returns the value, trimmed', () => {
    process.env.OBSIDIAN_INSTALLER_VERSION = ' earliest ';
    expect(pinnedInstallerVersion()).toBe('earliest');
  });
});

describe('the default installer', () => {
  it('is the oldest compatible one', () => {
    expect(DEFAULT_INSTALLER).toBe('earliest');
  });
});

describe('targetRecord', () => {
  const record = targetRecord(
    { app: 'latest', installer: 'latest' },
    { app: '1.13.7', installer: '1.13.7' },
    { electron: '43.3.0', chrome: '150.0.7871.212' },
  );

  it('holds resolved versions and keeps the words that were asked for', () => {
    expect(record).toEqual({
      app: '1.13.7',
      installer: '1.13.7',
      electron: '43.3.0',
      chrome: '150.0.7871.212',
      requested: { app: 'latest', installer: 'latest' },
    });
  });

  it('is the exact shape the CI summary row and the stamp spec read', () => {
    expect(Object.keys(record).sort()).toEqual(['app', 'chrome', 'electron', 'installer', 'requested']);
  });
});

describe('describeTarget', () => {
  it('names the app, the installer and its Chrome, and says why each was picked', () => {
    const line = describeTarget(
      targetRecord(
        { app: 'latest', installer: 'earliest' },
        { app: '1.13.7', installer: '1.5.8' },
        { electron: '28.2.3', chrome: '120.0.6099.283' },
      ),
      { appNote: 'FALLBACK to latest stable', installerNote: 'pinned via OBSIDIAN_INSTALLER_VERSION=earliest' },
      ' mobile',
    );
    expect(line).toContain('[e2e mobile]');
    expect(line).toContain('app 1.13.7 — FALLBACK to latest stable');
    expect(line).toContain('installer 1.5.8 (Electron 28.2.3, Chrome 120.0.6099.283)');
    expect(line).toContain('pinned via OBSIDIAN_INSTALLER_VERSION=earliest');
  });
});
