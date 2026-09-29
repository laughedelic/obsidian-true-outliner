import { describe, expect, it } from 'vitest';
import {
  chromiumFull,
  chromiumMajor,
  platformName,
  runtimeFragment,
  runtimeLabel,
  type UserAgentData,
} from '../src/plugin/runtime-stamp.ts';

const data = (brands: UserAgentData['brands'], full?: () => Promise<{ fullVersionList?: UserAgentData['brands'] }>): UserAgentData => ({
  brands,
  getHighEntropyValues: full ?? (() => Promise.resolve({})),
});

describe('runtimeFragment', () => {
  it('names the app and the full Chromium version', () => {
    expect(runtimeFragment({ appVersion: '1.13.7', chromium: '150.0.7871.212', platform: 'desktop' })).toBe(
      'app 1.13.7 · Chromium 150.0.7871.212',
    );
  });

  it('names a major alone as reported', () => {
    expect(runtimeFragment({ appVersion: '1.13.7', chromium: '150', platform: 'desktop' })).toBe(
      'app 1.13.7 · Chromium 150',
    );
  });

  it('names the platform in place of a version the runtime did not give, and prints no placeholder', () => {
    const text = runtimeFragment({ appVersion: '1.13.7', platform: 'iOS' });
    expect(text).toBe('app 1.13.7 · iOS');
    expect(text).not.toMatch(/undefined|unknown|n\/a|\?/i);
  });
});

describe('runtimeLabel', () => {
  it('names the platform with the version', () => {
    expect(runtimeLabel({ appVersion: '1.13.7', chromium: '150.0.7871.212', platform: 'Android' })).toBe(
      'Obsidian 1.13.7 on Android · Chromium 150.0.7871.212',
    );
  });

  it('says the version is not exposed rather than leaving it out silently', () => {
    expect(runtimeLabel({ appVersion: '1.13.7', platform: 'iOS' })).toBe(
      'Obsidian 1.13.7 on iOS · Chromium version not exposed',
    );
  });
});

describe('platformName', () => {
  const flags = { isIosApp: false, isAndroidApp: false, isMobile: false };
  it.each([
    [{ ...flags }, 'desktop'],
    [{ ...flags, isMobile: true }, 'mobile'],
    [{ ...flags, isMobile: true, isIosApp: true }, 'iOS'],
    [{ ...flags, isMobile: true, isAndroidApp: true }, 'Android'],
  ])('%j -> %s', (f, name) => {
    expect(platformName(f)).toBe(name);
  });
});

describe('reading Chromium from userAgentData', () => {
  const brands = [
    { brand: 'Not;A=Brand', version: '8' },
    { brand: 'Chromium', version: '150' },
  ];

  it('reads the major from the brands, and the full version from the high-entropy list', async () => {
    const d = data(brands, () =>
      Promise.resolve({ fullVersionList: [{ brand: 'Chromium', version: '150.0.7871.212' }] }),
    );
    expect(chromiumMajor(d)).toBe('150');
    expect(await chromiumFull(d)).toBe('150.0.7871.212');
  });

  it('answers nothing where the runtime has no userAgentData', async () => {
    expect(chromiumMajor(undefined)).toBeUndefined();
    expect(await chromiumFull(undefined)).toBeUndefined();
  });

  it('answers nothing for the full version when the request is rejected', async () => {
    const d = data(brands, () => Promise.reject(new Error('NotAllowedError')));
    expect(await chromiumFull(d)).toBeUndefined();
    expect(chromiumMajor(d)).toBe('150');
  });

  it('answers nothing when no brand is Chromium', async () => {
    const d = data([{ brand: 'Not;A=Brand', version: '8' }]);
    expect(chromiumMajor(d)).toBeUndefined();
    expect(await chromiumFull(d)).toBeUndefined();
  });
});
