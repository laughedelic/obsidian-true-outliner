import * as path from 'node:path';
import * as url from 'node:url';
import { resolveObsidianTarget } from './obsidian-target.mjs';
import { maxInstances, screenshotOnFailure } from './wdio.shared.mjs';

const e2eDir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(e2eDir, '..');

/**
 * Which Obsidian to run, and where it is cached — resolved by
 * `./obsidian-target.mts`, shared with the mobile config so the two cannot
 * drift apart again.
 *
 * Why the version matters (docs/research/04 Q21, Q27): a user-reported
 * redo-cursor bug went unreproducible for three rounds because the behavior
 * causing it entered `@codemirror/commands` 6.10.2 and the newest STABLE
 * Obsidian bundles an older CM6 while the reporter was on a 1.13.x beta. Later,
 * a keymap investigation cost several more sessions with the harness on 1.12.7
 * and the reporter on 1.13.3. Both times the harness was internally consistent
 * and green.
 *
 * To pre-download a beta WITHOUT disabling 2FA (the env vars require 2FA off):
 *
 *     npm run obsidian:fetch -- -v 1.13.3
 *
 * Use that script rather than `npx obsidian-launcher download` directly: the
 * CLI defaults to `~/.obsidian-cache` while this harness has its own, so a bare
 * CLI download lands where the harness never looks and then fails as "Insiders
 * account is required" — a download that SUCCEEDED, reported as a credentials
 * problem.
 */
const { browserVersion, cacheDir } = await resolveObsidianTarget(root, '');

export const config: WebdriverIO.Config = {
  runner: 'local',
  framework: 'mocha',
  specs: [path.join(e2eDir, 'specs/**/*.e2e.ts')],
  // Safe to raise: the service gives every session its own COPY of the vault
  // (`copy` defaults to true) and its own --user-data-dir, so parallel workers
  // cannot observe each other's writes whatever the specs do. Most specs also
  // call `resetVault()` in `before`, but not all — 00-smoke and
  // 67-node-selection-extension do not — so that is a per-spec convention, not
  // the isolation guarantee. See `maxInstances` in ./wdio.shared.mts for why
  // the default is still 1.
  maxInstances: maxInstances(),

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

  /**
   * Arm the notice recorder before any spec acts. Notices live ~1500ms and
   * `waitForNotice` polls over WebDriver, so a notice produced by the very
   * action a spec is waiting on can vanish between polls; recording from
   * session start removes that race even for specs that produce a notice
   * before touching any note helper (see `armNoticeRecorder`).
   */
  before: async function () {
    const { armNoticeRecorder } = await import('./helpers.js');
    await armNoticeRecorder();
  },

  afterTest: screenshotOnFailure('desktop'),

  services: ['obsidian'],
  reporters: ['obsidian'],

  cacheDir,
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
  logLevel: 'warn',
};
