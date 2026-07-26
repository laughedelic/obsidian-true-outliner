import esbuild from 'esbuild';
import process from 'node:process';
import builtins from 'builtin-modules';
import { installToVault, buildStamp } from './scripts/install-to-vault.mjs';

const production = process.argv[2] === 'production';

/**
 * Dev-only UI (status bar build stamp, keymap-liveness probe) is OPT-IN via a
 * `--dev` argument, not opt-out via a release flag.
 *
 * Opt-out was wrong: nothing set the release flag, so a plain
 * `npm run build:plugin` — which is what the release pipeline ultimately runs,
 * through an external reusable workflow this repo does not control — produced a
 * distributable bundle with the dev status bar and a mutable keymap probe in
 * it. A default that ships debug UI unless someone remembers a variable is a
 * default that eventually ships debug UI. Inverted, the failure mode is a dev
 * build missing its stamp, which is obvious and harmless.
 *
 * `vault:install`, `dev`, and the e2e runner pass it; they all want the probe.
 */
// An argv flag rather than an env assignment so the npm scripts stay free of
// `VAR=1 ...`, which is POSIX-only and fails on Windows' default cmd.exe shell.
const devBuild = !production || process.argv.includes('--dev');

/**
 * Supplies `virtual:build-stamp` — the build id, clock and changed-file summary
 * as a compile-time constant, recomputed on EVERY build because onLoad runs per
 * build (a plain `define` would freeze at watch-context creation).
 *
 * The stamp is baked into the bundle rather than written into manifest.json
 * because Obsidian caches the manifest at plugin-scan time and never re-reads
 * it on reload: a manifest-borne stamp froze at whatever was on disk when the
 * app started, while the code it claimed to describe kept changing. A constant
 * compiled into the bundle cannot disagree with the bundle it is compiled into.
 */
/** The stamp baked into the current build, handed to the install hook so both
 * report the same one. */
let currentStamp;

const stampPlugin = {
  name: 'build-stamp',
  setup(build) {
    build.onResolve({ filter: /^virtual:build-stamp$/ }, () => ({
      path: 'build-stamp',
      namespace: 'build-stamp',
    }));
    build.onLoad({ filter: /.*/, namespace: 'build-stamp' }, () => {
      currentStamp = buildStamp({ dev: devBuild });
      return {
        contents: `export const BUILD_STAMP = ${JSON.stringify(currentStamp)};`,
        loader: 'js',
      };
    });
  },
};

/**
 * Installs into the dev vault after every successful build, in watch mode as
 * well as one-shot. This is what closes the edit -> running-app loop with no
 * manual `vault:install`: the copy lands INSIDE the vault, its mtime moves,
 * the vendored hot-reload plugin's `vault.on('raw')` watcher fires, and the
 * plugin re-enables itself. Before this, `npm run dev` only rewrote main.js at
 * the repo ROOT, which the vault reached through a symlink — so no
 * vault-visible file ever changed and nothing could reload (measurement in
 * scripts/install-to-vault.mjs).
 *
 * A failed build deliberately installs nothing: leaving the last good build in
 * place beats shipping a half-written bundle into the running app, and esbuild
 * has already printed the error.
 */
const installPlugin = {
  name: 'install-to-vault',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) {
        console.log('[install-to-vault] build failed — vault left on the previous build');
        return;
      }
      try {
        installToVault({ stamp: currentStamp });
      } catch (err) {
        // A watch session must survive a transient install problem — the next
        // save retries. A ONE-SHOT build must not: `vault:install` delegates
        // entirely to this hook, so swallowing here let a missing artifact or
        // unwritable vault exit 0 having installed nothing, which is precisely
        // the "did my build reach the app?" confusion this tooling exists to
        // remove.
        console.error('[install-to-vault] install failed:', err.message);
        if (production) {
          process.exitCode = 1;
          throw err;
        }
      }
    });
  },
};

const context = await esbuild.context({
  entryPoints: ['src/plugin/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtins,
  ],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  // The installer runs for dev/vault/e2e builds only. A release build must not
  // touch the dev vault at all: it would remove and rewrite fixture files, and
  // since a one-shot install failure now fails the build, a release could break
  // merely because test-vault is absent or unwritable on the machine.
  plugins: devBuild ? [stampPlugin, installPlugin] : [stampPlugin],
});

if (production) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
  console.log('[dev] watching src/ — each successful build installs into test-vault and hot-reloads');
}
