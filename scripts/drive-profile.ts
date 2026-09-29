/**
 * Whether `dir` is a profile directory `obsidian-launcher` made, and so one `scripts/drive.ts`
 * may delete: named `obsidian-launcher-config-*`, directly under the temporary directory.
 *
 * Paths are compared as real paths. The launcher records the resolved form, and on macOS
 * `os.tmpdir()` is `/var/folders/…` while that resolves to `/private/var/folders/…`.
 */

import { realpathSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function isLauncherProfile(dir: string, tmp: string = os.tmpdir()): boolean {
  if (!path.basename(dir).startsWith('obsidian-launcher-config-')) return false;
  try {
    return realpathSync(path.dirname(dir)) === realpathSync(tmp);
  } catch {
    return false;
  }
}
