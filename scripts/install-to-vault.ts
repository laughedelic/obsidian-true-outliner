/**
 * Installs the current build into the dev vault: COPIES main.js/styles.css and
 * manifest.json into test-vault/.obsidian/plugins/true-outliner/. All three are
 * gitignored.
 *
 * The manifest is copied VERBATIM — it used to be written with a stamped version
 * and description, which Obsidian then cached at plugin-scan time and never
 * re-read on reload, so the stamp froze while the code changed. The stamp lives in
 * main.js now (see esbuild.config.mjs's `virtual:build-stamp`), where it cannot
 * disagree with the bundle it describes.
 *
 * Copies rather than symlinks, deliberately. `vault:install` used to
 * `ln -sf` these, and that quietly broke the whole reload loop: Obsidian's
 * `vault.on('raw')` watcher only sees paths INSIDE the vault, a symlink's own
 * mtime does not change when its target is rewritten, and the real build
 * lives outside the vault. So a rebuild produced no vault-visible event at
 * all and hot reload could never fire — measured directly:
 *
 *     symlink lstat mtime before rebuild: 1785071538073.726
 *     symlink lstat mtime after  rebuild: 1785071538073.726   (unchanged)
 *     target  stat  mtime after  rebuild: 1785072059891.767   (changed)
 *
 * A copy is a real file in the vault whose mtime moves on every install, so
 * the watcher fires and hot reload works as designed. The cost — an extra
 * ~150KB write per build — is irrelevant next to a reload loop you can trust.
 *
 * Exported as a function so esbuild's watch mode can call it on every
 * successful rebuild (see esbuild.config.mjs), which is what makes editing a
 * source file reach the running app with no manual command at all.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_DIR = path.join(root, 'test-vault/.obsidian/plugins/true-outliner');
const realManifestPath = path.join(root, 'manifest.json');

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim();
// NOT trimmed: `git status --porcelain` encodes status in the first two
// COLUMNS, so a leading space is significant. Trimming ate it on the first
// line only, shifting that one filename by a character ("src/x" -> "rc/x")
// which then failed the path filter below and silently vanished from the
// stamp — the exact "looks fine, quietly wrong" failure this stamp exists to
// catch, found by checking the output against `git status` rather than
// assuming.
const gitRaw = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf-8' });
const pad = (n) => String(n).padStart(2, '0');

/**
 * The build stamp. Carries a TIMESTAMP, not just `git describe`-style commit
 * info: a sha plus `-dirty` cannot distinguish two builds of two different
 * edits to the same working tree, which is exactly the situation during an
 * iteration loop — every build reads `<sha>-dirty` and looks identical while
 * the code underneath changes completely. The timestamp is the only component
 * guaranteed to differ between any two builds, so it is what makes "did my
 * rebuild actually reach the app?" answerable at a glance.
 */
export function buildStamp({ dev = true } = {}) {
  const shortSha = git('rev-parse', '--short', 'HEAD');
  const subject = git('log', '-1', '--format=%s');
  const porcelain = gitRaw('status', '--porcelain');
  const dirty = porcelain.trim().length > 0;

  // Uncommitted source files, most-recently-modified first — the closest
  // thing to "what this iteration changed" that can be derived reliably.
  // Deliberately NOT a hand-maintained summary or a commit hook: anything
  // needing a human to keep it current goes stale silently, which is the
  // exact failure mode this stamp exists to catch.
  const changed = porcelain
    .split('\n')
    .filter((l) => l.length > 3)
    .map((l) => l.slice(3))
    .map((f) => (f.includes(' -> ') ? f.slice(f.indexOf(' -> ') + 4) : f)) // renames
    .map((f) => f.replace(/^"|"$/g, '')) // git quotes paths with odd characters
    .filter((f) => /^(src|tests|e2e)\//.test(f))
    .map((f) => {
      let mtime = 0;
      try {
        mtime = statSync(path.join(root, f)).mtimeMs;
      } catch {
        /* deleted in the working tree — sorts last */
      }
      return { f, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .map((e) => e.f);

  const NAMED = 3;
  const changedSummary = changed.length
    ? `${changed.slice(0, NAMED).join(', ')}${changed.length > NAMED ? ` (+${changed.length - NAMED} more)` : ''}`
    : 'no uncommitted source changes';

  const now = new Date();
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  // Milliseconds included deliberately: watch-mode rebuilds land well inside
  // one second, so second precision would give two different builds the same
  // identifier — the exact ambiguity this stamp exists to remove.
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${ms}`;
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${ms}`;
  const buildId = `${shortSha}${dirty ? '-dirty' : ''}`;

  return { dev, buildId, subject, changedSummary, clock, versionSuffix: `${buildId}.${date}-${time}` };
}

export function installToVault({ quiet = false, stamp = buildStamp() } = {}) {
  // `stamp` is passed in by esbuild.config.mjs so the value BAKED into main.js
  // and the value reported here are the same one. Generating a second stamp at
  // install time made the logged clock always differ from the bundle's, and a
  // save arriving mid-build could even change `changedSummary` — recreating the
  // misleading identifier this whole mechanism exists to eliminate.
  const manifest = JSON.parse(readFileSync(realManifestPath, 'utf-8'));
  const outManifest = path.join(PLUGIN_DIR, 'manifest.json');

  // Defense in depth against the exact bug this once had: outManifest used to
  // be a symlink to the real manifest.json, and writeFileSync FOLLOWS an
  // existing symlink instead of replacing it — silently overwriting the
  // tracked root manifest with dev-stamped content on every run (confirmed
  // live: two runs compounded into a doubled version string). Never write
  // without first confirming the target isn't secretly the real file.
  if (path.resolve(outManifest) === path.resolve(realManifestPath)) {
    throw new Error(`refusing to write: resolved to the real manifest.json (${realManifestPath})`);
  }

  mkdirSync(PLUGIN_DIR, { recursive: true });
  for (const name of ['main.js', 'styles.css']) {
    const dest = path.join(PLUGIN_DIR, name);
    rmSync(dest, { force: true }); // drop any leftover SYMLINK from an older vault:install
    copyFileSync(path.join(root, name), dest);
  }
  // Copied VERBATIM — the build stamp is no longer written here. It is baked
  // into main.js as a compile-time constant instead (esbuild.config.mjs's
  // `virtual:build-stamp`), for a reason found the hard way: Obsidian caches
  // manifest.json at plugin-scan time and does NOT re-read it on reload, so a
  // stamp living in the manifest froze at whatever was on disk when the app
  // started while the code underneath kept changing — a stamp that lies is
  // worse than no stamp. A constant compiled into the bundle cannot disagree
  // with the bundle it is compiled into.
  rmSync(outManifest, { force: true });
  writeFileSync(outManifest, JSON.stringify(manifest, null, 2) + '\n');

  if (!quiet) {
    console.log(`[install-to-vault] ${stamp.buildId} built ${stamp.clock} · changed: ${stamp.changedSummary}`);
  }
  return stamp;
}

/**
 * Reads the stamp already compiled into `main.js`, for a direct invocation that
 * copies an existing bundle rather than producing one.
 *
 * Without this the default `buildStamp()` generated a fresh current-time stamp
 * and reported it as though it identified the copied bundle — recreating exactly
 * the mismatch the esbuild hook was changed to avoid, in the one code path that
 * does not go through it. A stamp that describes a build other than the one
 * installed is worse than none, so an unreadable bundle reports "unknown"
 * instead of inventing a value.
 */
function stampFromBundle() {
  try {
    const bundle = readFileSync(path.join(root, 'main.js'), 'utf-8');
    const match = /BUILD_STAMP = (\{[\s\S]*?\});/.exec(bundle);
    return match ? JSON.parse(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

// Also runnable directly (`node scripts/install-to-vault.mjs`) — copies whatever
// main.js is already there, so the stamp must come from that file.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baked = stampFromBundle();
  if (baked) {
    installToVault({ stamp: baked });
  } else {
    installToVault({ quiet: true });
    console.log('[install-to-vault] copied main.js; build stamp unknown (not built by this script)');
  }
}
