import * as path from 'node:path';
import * as url from 'node:url';
import { obsidianBetaAvailable } from 'wdio-obsidian-service';

const e2eDir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(e2eDir, '..');

/**
 * Prefer the current Obsidian BETA when it's available, else the latest
 * stable.
 *
 * Why this matters, concretely (docs/research/04 Q21): a real
 * user-reported redo-cursor bug could not be reproduced in this harness for
 * three rounds, because the behavior that causes it entered
 * `@codemirror/commands` in 6.10.2 and the newest STABLE Obsidian bundles an
 * older CM6, while the reporter was on a 1.13.x beta that bundles a newer
 * one. Automated tests and manual testing were silently running different
 * editor cores — exactly the class of discrepancy that makes a bug look
 * unreproducible rather than version-gated.
 *
 * `obsidianBetaAvailable()` is true only when there IS a current beta AND we
 * can actually get it (Catalyst credentials in `OBSIDIAN_EMAIL`/
 * `OBSIDIAN_PASSWORD`, or the build already sitting in the local cache). So
 * this degrades cleanly to `latest` on CI and for contributors without an
 * Insiders account, rather than failing to launch.
 *
 * To pre-download a beta WITHOUT disabling 2FA on your main account (the env
 * vars require 2FA off), run once per beta:
 *
 *     npx obsidian-launcher download app -v latest-beta
 *
 * It prompts for password and 2FA and populates `.obsidian-cache/`, after
 * which `obsidianBetaAvailable()` reports true from the cache alone.
 */
const browserVersion = (await obsidianBetaAvailable({ cacheDir: path.join(root, '.obsidian-cache') }))
  ? 'latest-beta'
  : 'latest';

export const config: WebdriverIO.Config = {
  runner: 'local',
  framework: 'mocha',
  specs: [path.join(e2eDir, 'specs/**/*.e2e.ts')],
  // Suites share one Obsidian instance/vault; parallelism is a later concern.
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'obsidian',
      browserVersion,
      // Keep Electron rendering at full rate even when the test window is
      // occluded or the machine's display is asleep — without these,
      // Chromium throttles frame production for background windows, and
      // screenshot capture (a renderer round-trip) times out while plain
      // script execution keeps working. This is the exact signature of the
      // "screenshot-heavy tests time out under local load, pass on a fresh
      // CI runner" flake documented in tasks.md 5.7 — reproduced locally
      // during the hardening pass on code that had passed the same spec
      // minutes earlier, with only the machine's session state changed.
      'goog:chromeOptions': {
        args: [
          '--disable-renderer-backgrounding',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
        ],
      },
      'wdio:obsidianOptions': {
        installerVersion: 'earliest',
        plugins: [
          root, // manifest.json + main.js (run `npm run build:plugin` first)
          // Conflicting-plugin stub for the coexistence warning test; starts
          // disabled, enabled by shell.e2e.ts.
          { path: path.join(e2eDir, 'fixtures/obsidian-outliner-stub'), enabled: false },
        ],
        vault: path.join(root, 'test-vault'),
      },
    },
  ],

  services: ['obsidian'],
  reporters: ['obsidian'],

  cacheDir: path.join(root, '.obsidian-cache'),
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
  logLevel: 'warn',
};
