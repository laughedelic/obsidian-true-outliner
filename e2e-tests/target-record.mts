/**
 * The build a run resolved, as data: which installer is asked for, what the run
 * recorded about it, and how the banner words it. No launcher and no wdio here,
 * so a unit test can import it.
 *
 * `obsidian-target.mts` fills the record in and writes it; the CI step-summary
 * row and `97-runtime-stamp.e2e.ts` read it back.
 */

import * as path from 'node:path';

/** Where the launching process writes what it resolved. Cleared with the other
 * reports (`resetE2eReports`), so a run that fails before it writes leaves none
 * behind. Read from the repository root, like `e2e-summary.json`. */
export const TARGET_RECORD_FILE = path.join(process.cwd(), '.obsidian-cache', 'e2e-target.json');

/** What an unset `OBSIDIAN_INSTALLER_VERSION` asks for: the oldest installer
 * compatible with the app, which is what the configs always asked for. */
export const DEFAULT_INSTALLER = 'earliest';

/**
 * `OBSIDIAN_INSTALLER_VERSION`, treated as unset when blank, for the reason
 * `pinnedVersion` treats `OBSIDIAN_VERSION` so: an absent `workflow_dispatch`
 * input reaches the environment as the empty string.
 */
export function pinnedInstallerVersion(): string | undefined {
  return process.env.OBSIDIAN_INSTALLER_VERSION?.trim() || undefined;
}

/** What one run resolved. `requested` keeps the words the run was asked for. */
export interface TargetRecord {
  app: string;
  installer: string;
  electron: string;
  chrome: string;
  requested: { app: string; installer: string };
}

export function targetRecord(
  requested: TargetRecord['requested'],
  resolved: { app: string; installer: string },
  installerInfo: { electron: string; chrome: string },
): TargetRecord {
  return {
    app: resolved.app,
    installer: resolved.installer,
    electron: installerInfo.electron,
    chrome: installerInfo.chrome,
    requested: { ...requested },
  };
}

/** The banner's line. `appNote` and `installerNote` say why each version was
 * picked, so a fallback reads as a fallback. */
export function describeTarget(
  record: TargetRecord,
  { appNote, installerNote }: { appNote: string; installerNote: string },
  label = '',
): string {
  return (
    `[e2e${label}] Obsidian target: app ${record.app} — ${appNote}\n` +
    `[e2e${label}]                  installer ${record.installer} (Electron ${record.electron}, ` +
    `Chrome ${record.chrome}) — ${installerNote}`
  );
}
