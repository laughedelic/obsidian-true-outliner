/**
 * Resolves an installed CLI's executable by walking the node_modules chain.
 *
 * `<repo>/node_modules/.bin/<name>` is the obvious location and the wrong
 * assumption: a git worktree (`.claude/worktrees/<name>/`) has no
 * `node_modules` of its own, and everything that does work there — node, npm,
 * npx — finds dependencies by walking up the directory chain to the main
 * checkout instead. A path built from the repo root does not exist under a
 * worktree, and `spawnSync` reports that as ENOENT with a null `status`, which
 * the callers' `?? 1` turns into a bare exit 1 with no output — a suite that
 * never started, reported exactly like one that ran and failed.
 *
 * So walk the chain npm walks, and name the missing binary when it runs out.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to `<name>`, from the nearest install that carries it. */
export function binPath(name) {
  const exe = process.platform === 'win32' ? `${name}.cmd` : name;
  for (let dir = here; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', '.bin', exe);
    if (existsSync(candidate)) return candidate;
    if (path.dirname(dir) === dir) break; // filesystem root
  }
  throw new Error(
    `Cannot find the '${name}' executable: no node_modules/.bin/${exe} in ${here} or any parent directory. Run 'npm install'.`,
  );
}
