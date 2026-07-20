/**
 * Writes a dev-vault-only copy of manifest.json into test-vault, with the
 * version/description stamped with the current commit — so opening
 * Settings → Community plugins in the dev vault tells you at a glance
 * whether you're running the build you think you're running, instead of a
 * stale one left over from an earlier `vault:install`.
 *
 * The real manifest.json (repo root) is never touched — this only ever
 * writes test-vault/.obsidian/plugins/true-outliner/manifest.json, which is
 * gitignored precisely because its content is meant to differ on every run.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realManifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(readFileSync(realManifestPath, 'utf-8'));

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim();
const shortSha = git('rev-parse', '--short', 'HEAD');
const subject = git('log', '-1', '--format=%s');
const dirty = git('status', '--porcelain').length > 0;

const stamped = {
  ...manifest,
  version: `${manifest.version}+${shortSha}${dirty ? '-dirty' : ''}`,
  description: `[dev ${shortSha}${dirty ? '-dirty' : ''}] ${subject}`,
};

const outPath = path.join(root, 'test-vault/.obsidian/plugins/true-outliner/manifest.json');

// Defense in depth against the exact bug this once had: outPath used to be
// a symlink to realManifestPath (an older `vault:install` used `ln -sf` for
// manifest.json too), and `writeFileSync` follows an existing symlink
// instead of replacing it — silently overwriting the REAL manifest with
// dev-stamped content on every run (confirmed live: two runs compounded
// into a doubled version string in the tracked root manifest.json). Never
// write without first confirming the target isn't secretly the real file.
if (path.resolve(outPath) === path.resolve(realManifestPath)) {
  throw new Error(`refusing to write: outPath resolved to the real manifest.json (${realManifestPath})`);
}
rmSync(outPath, { force: true }); // remove any existing file OR symlink at outPath (not its target)
writeFileSync(outPath, JSON.stringify(stamped, null, 2) + '\n');
console.log(`[stamp-vault-manifest] ${stamped.version} — "${subject}"`);
