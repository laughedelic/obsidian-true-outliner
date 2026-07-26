import * as path from 'node:path';
import * as url from 'node:url';
import { resolveObsidianTarget } from './obsidian-target.mjs';

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

  cacheDir,
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
  logLevel: 'warn',
};
