/**
 * What the dev build's status-bar stamp says about the runtime it is loaded in:
 * the app version and the Chromium version, so a screenshot or a pasted stamp
 * names the build a behaviour was seen on.
 *
 * Pure: `main.ts` reads the platform's answers and hands them here. The Electron
 * version is not among them. `process.versions` is a Node API and the
 * user-agent string is banned by `obsidianmd/platform`
 * (docs/research/e2e-runtime-versions, "What the plugin may read"); the full
 * Chromium version fixes it.
 */

export interface Runtime {
  /** `obsidian.apiVersion`. */
  appVersion: string;
  /** As reported: the full version once known, the major before. Absent when the
   * runtime exposes none. */
  chromium?: string | undefined;
  /** `desktop`, `mobile`, `iOS` or `Android`. */
  platform: string;
}

/** The parts of `Platform` the name is read from. */
export interface PlatformFlags {
  isIosApp: boolean;
  isAndroidApp: boolean;
  isMobile: boolean;
}

export function platformName(flags: PlatformFlags): string {
  if (flags.isIosApp) return 'iOS';
  if (flags.isAndroidApp) return 'Android';
  return flags.isMobile ? 'mobile' : 'desktop';
}

/** The stamp's visible words. A missing Chromium version leaves the platform in
 * its place: what the runtime is, not a placeholder for what it did not say. */
export function runtimeFragment(rt: Runtime): string {
  return `app ${rt.appVersion} · ${rt.chromium !== undefined ? `Chromium ${rt.chromium}` : rt.platform}`;
}

/** The label's line, which always names the platform as well. */
export function runtimeLabel(rt: Runtime): string {
  return rt.chromium !== undefined
    ? `Obsidian ${rt.appVersion} on ${rt.platform} · Chromium ${rt.chromium}`
    : `Obsidian ${rt.appVersion} on ${rt.platform} · Chromium version not exposed`;
}

/** The shape of `navigator.userAgentData` this reads. The DOM library our
 * TypeScript ships does not declare it. */
export interface UserAgentData {
  brands: { brand: string; version: string }[];
  getHighEntropyValues(hints: string[]): Promise<{ fullVersionList?: { brand: string; version: string }[] }>;
}

const brandVersion = (list: { brand: string; version: string }[] | undefined): string | undefined => {
  const version = list?.find((b) => b.brand === 'Chromium')?.version;
  return version === undefined || version === '' ? undefined : version;
};

/** The Chromium major from the brands, which the runtime answers synchronously. */
export function chromiumMajor(data: UserAgentData | undefined): string | undefined {
  return brandVersion(data?.brands);
}

/** The full Chromium version, or `undefined` where the runtime has none to give
 * or refuses the request. */
export async function chromiumFull(data: UserAgentData | undefined): Promise<string | undefined> {
  if (data === undefined) return undefined;
  try {
    return brandVersion((await data.getHighEntropyValues(['fullVersionList'])).fullVersionList);
  } catch {
    return undefined;
  }
}
