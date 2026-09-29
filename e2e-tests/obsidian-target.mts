/**
 * Which Obsidian build the e2e suites run against, and where it is cached.
 *
 * Shared by `wdio.conf.mts` and `wdio.mobile-emulation.conf.mts` rather than
 * duplicated: the two configs had drifted, and the mobile one honored neither
 * `OBSIDIAN_VERSION` nor a configurable cache, so pinning a version silently
 * applied to the desktop suite only — the exact "two things that look the same
 * and aren't" failure this module exists to prevent.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import ObsidianLauncher from 'obsidian-launcher';
import { obsidianBetaAvailable } from 'wdio-obsidian-service';
import {
  DEFAULT_INSTALLER,
  TARGET_RECORD_FILE,
  describeTarget,
  pinnedInstallerVersion,
  targetRecord,
} from './target-record.mjs';

/** One cache for the availability probe, the service, and `obsidian:fetch`.
 * `OBSIDIAN_CACHE` (the launcher's own env var) wins, so a shared machine-wide
 * cache still works; otherwise repo-local. */
export function resolveCacheDir(root: string): string {
  return process.env.OBSIDIAN_CACHE
    ? path.resolve(process.env.OBSIDIAN_CACHE)
    : path.join(root, '.obsidian-cache');
}

/**
 * `OBSIDIAN_VERSION`, treated as unset when blank. GitHub Actions expands an
 * absent `workflow_dispatch` input to the EMPTY STRING rather than leaving the
 * variable undefined, so `??` alone would pin `browserVersion` to `''` on every
 * ordinary pull-request run and fail before launch.
 */
export function pinnedVersion(): string | undefined {
  return process.env.OBSIDIAN_VERSION?.trim() || undefined;
}

/**
 * Is this version downloadable without Catalyst credentials? Reads the launcher's
 * own version metadata, which marks insider builds `isBeta` and gives them only
 * the `releases.obsidian.md` endpoint; public releases carry GitHub asset URLs.
 * Unknown or unreadable metadata answers `true`, so an uncertain case is left to
 * the service rather than blocked here.
 */
function isPubliclyDownloadable(version: string, cacheDir: string): boolean {
  try {
    const raw = readFileSync(path.join(cacheDir, 'obsidian-versions.json'), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : ((parsed as { versions?: unknown[] }).versions ?? []);
    const entry = (list as { version?: string; isBeta?: boolean; downloads?: Record<string, string> }[]).find(
      (v) => v.version === version,
    );
    if (!entry) return true;
    const hasPublicAsset = Object.values(entry.downloads ?? {}).some((u) => u.includes('github.com'));
    return !entry.isBeta || hasPublicAsset;
  } catch {
    return true;
  }
}

/**
 * Fails fast, and accurately, when a pinned version cannot be obtained.
 *
 * Deliberately narrow: it fires only for a version that is BOTH absent from the
 * cache AND insider-only. A publicly-downloadable pin is left alone so
 * `wdio-obsidian-service` can fetch it — an earlier version threw on any
 * uncached pin, which made the `workflow_dispatch` version input useless on CI,
 * where the cache starts empty and the whole point is to download the pin.
 *
 * For the insider case it names the real cause, including "BUT it IS cached at
 * <the launcher CLI's default>", because a download that SUCCEEDED into the
 * wrong directory otherwise surfaces as "Insiders account is required" — a cache
 * path problem wearing a credentials costume.
 */
export function assertCached(version: string, cacheDir: string): void {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return; // 'latest'/'latest-beta' resolve later
  const asar = path.join(cacheDir, 'obsidian-app', `obsidian-${version}.asar`);
  if (existsSync(asar) || existsSync(`${asar}.gz`)) return;

  // Checked BEFORE the downloadable test, because the wrong-cache case is the one
  // this diagnostic exists for and it was skipping itself: a user who downloaded
  // into the launcher's default cache has no `obsidian-versions.json` in the
  // repo-local one either, so `isPubliclyDownloadable` fell back to `true`, this
  // returned early, and they got the generic service error the message was
  // written to replace. If the build is sitting in the other cache, say so
  // whatever the metadata does or does not know.
  const elsewhere = path.join(os.homedir(), '.obsidian-cache', 'obsidian-app', `obsidian-${version}.asar`);
  const foundElsewhere = existsSync(elsewhere) || existsSync(`${elsewhere}.gz`);
  if (!foundElsewhere && isPubliclyDownloadable(version, cacheDir)) return; // the service can fetch it

  throw new Error(
    `Obsidian ${version} is not in this harness's cache.\n` +
      `  looked in: ${asar}\n` +
      (foundElsewhere
        ? `  BUT it IS cached at: ${elsewhere}\n` +
          `  That is the obsidian-launcher CLI's default cache, not this harness's. Either:\n` +
          `    OBSIDIAN_CACHE=~/.obsidian-cache OBSIDIAN_VERSION=${version} npm run test:e2e\n` +
          `  or re-fetch into the repo-local cache:\n` +
          `    npm run obsidian:fetch -- -v ${version}\n`
        : `  fetch it with:  npm run obsidian:fetch -- -v ${version}\n` +
          `  (prompts for Catalyst credentials; every 1.13.x is currently insider-only)\n`),
  );
}

/**
 * Resolves the target build, records it and announces it. The banner names the
 * fallback AS a fallback: Q21 lost three rounds to a silent version mismatch and
 * Q27 several more, both times with a harness that was internally consistent and
 * green. It prints in the launcher process only — the config is re-loaded in
 * every worker, and 18 copies is noise that trains you to ignore it.
 *
 * The app and installer are resolved here, once, and handed to the service as
 * exact versions. The service resolves an exact version to itself, so the record
 * and the Obsidian that starts cannot name different builds.
 */
export async function resolveObsidianTarget(
  root: string,
  label: string,
): Promise<{ browserVersion: string; installerVersion: string; cacheDir: string }> {
  const cacheDir = resolveCacheDir(root);
  const pinned = pinnedVersion();
  const pinnedInstaller = pinnedInstallerVersion();
  const betaAvailable = await obsidianBetaAvailable({ cacheDir });
  const requestedApp = pinned ?? (betaAvailable ? 'latest-beta' : 'latest');
  const requestedInstaller = pinnedInstaller ?? DEFAULT_INSTALLER;

  assertCached(requestedApp, cacheDir);

  const launcher = new ObsidianLauncher({ cacheDir });
  let app: string;
  let installer: string;
  let installerInfo: { electron: string; chrome: string };
  try {
    [app, installer] = await launcher.resolveVersion(requestedApp, requestedInstaller);
    installerInfo = await launcher.getInstallerInfo(installer);
  } catch (e) {
    throw new Error(
      `Could not resolve the Obsidian target (OBSIDIAN_VERSION=${JSON.stringify(requestedApp)}, ` +
        `OBSIDIAN_INSTALLER_VERSION=${JSON.stringify(requestedInstaller)}): ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const record = targetRecord(
    { app: requestedApp, installer: requestedInstaller },
    { app, installer },
    installerInfo,
  );

  if (process.env.WDIO_WORKER_ID === undefined) {
    mkdirSync(path.dirname(TARGET_RECORD_FILE), { recursive: true });
    writeFileSync(TARGET_RECORD_FILE, `${JSON.stringify(record, null, 2)}\n`);
    const appNote =
      pinned !== undefined
        ? `pinned via OBSIDIAN_VERSION=${pinned}`
        : betaAvailable
          ? 'current beta (cached or credentialed)'
          : 'FALLBACK to latest stable — no beta cached, so this may NOT match the build a bug was reported on';
    const installerNote =
      pinnedInstaller !== undefined
        ? `pinned via OBSIDIAN_INSTALLER_VERSION=${pinnedInstaller}`
        : `default: ${DEFAULT_INSTALLER} compatible installer`;
    console.log(`\n${describeTarget(record, { appNote, installerNote }, label)}\n`);
  }
  return { browserVersion: app, installerVersion: installer, cacheDir };
}
