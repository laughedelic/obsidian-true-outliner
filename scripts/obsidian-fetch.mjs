/**
 * Downloads an Obsidian build into the cache THIS harness reads.
 *
 *   npm run obsidian:fetch -- -v 1.13.3
 *
 * Exists because the launcher CLI defaults to `~/.obsidian-cache` while the
 * harness resolves `OBSIDIAN_CACHE` or its own repo-local directory: a bare CLI
 * download lands where the harness never looks and then fails as "Insiders
 * account is required" — a download that succeeded, reported as a credentials
 * problem. Node rather than a shell one-liner so the `${VAR:-default}` fallback
 * is not POSIX-only.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = process.env.OBSIDIAN_CACHE ? path.resolve(process.env.OBSIDIAN_CACHE) : path.join(root, '.obsidian-cache');
const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'obsidian-launcher.cmd' : 'obsidian-launcher');

console.log(`[obsidian:fetch] cache: ${cacheDir}`);
process.exitCode = spawnSync(bin, ['download', 'app', '-c', cacheDir, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' }).status ?? 1;
